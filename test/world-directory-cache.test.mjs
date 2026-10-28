import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';

const owner = {accountId: 'alice', username: 'Alice', walletId: 'account:alice'};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'directory-cache-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const atlas = new WorldAtlas(join(dir, 'atlas.json')), original = atlas.synchronize.bind(atlas);
  let calls = 0;
  atlas.synchronize = (...args) => {calls++; return original(...args);};
  const maps = [{id: 'cache-design', name: 'Saved design', source: 'custom-builder', visibility: 'public', ownerId: 'account:alice', ownerName: 'Alice',
    builderScene: {layout: 'grand-floor', mapSize: 40, objects: [{id: 'bench', modelId: 'camp-log-bench', position: {x: 1, y: 0, z: 2}}], gameplay: {multiplayer: true}}}];
  const deeds = [{id: 'deed-cache', name: 'Saved estate', worldId: 'echo-gardens', status: 'active', ownerId: 'account:alice', ownerName: 'Alice',
    hostedSpace: {environmentId: 'cache-design', name: 'Saved estate'}, placements: [{id: 'placed', assetId: 'owned', name: 'Owned seat', buildAssetId: 'camp-log-bench',
      transform: {position: [4, 0, 5], rotation: [0, 0, 0], scale: [1, 1, 1]}, functionalSettings: {behavior: 'seat'}}]}];
  return {atlas, maps, deeds, calls: () => calls};
}
const find = (result, id = 'cache-design') => result.environments.find(map => map.id === id);
const read = (atlas, maps, deeds) => synchronizeWorldDirectory(atlas, maps, deeds, {readonly: true});

test('unchanged directory refreshes skip atlas mutation work and readonly outputs cannot poison inputs', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t);
  const first = await read(atlas, maps, deeds), count = calls();
  assert.equal(count, 2);
  const second = await read(atlas, structuredClone(maps), structuredClone(deeds));
  assert.equal(calls(), count, 'an unchanged complete registry requires no atlas transactions');
  assert.equal(first, second);
  assert.ok(Object.isFrozen(find(second).builderScene.objects[0].position));
  assert.throws(() => {find(second).builderScene.objects[0].position.x = 99;}, TypeError);
  assert.equal(Object.isFrozen(maps[0].builderScene.objects[0].position), false, 'the cache owns its snapshot, not caller objects');
  const detached = await synchronizeWorldDirectory(atlas, maps, deeds);
  find(detached).builderScene.objects[0].position.x = 88;
  assert.equal(find(await read(atlas, maps, deeds)).builderScene.objects[0].position.x, 1);
});

test('layout, visibility, solo rules and placement changes invalidate without timestamp changes', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t);
  await read(atlas, maps, deeds);
  maps[0].builderScene.objects[0].position.x = 7;
  maps[0].builderScene.gameplay.multiplayer = false;
  deeds[0].placements[0].transform.position = [9, 0, 12];
  deeds[0].placements[0].functionalSettings.behavior = 'decor';
  const changed = await read(atlas, maps, deeds);
  assert.equal(calls(), 4);
  assert.equal(find(changed).builderScene.objects[0].position.x, 7);
  assert.equal(find(changed).sharedWorld, false);
  assert.match(find(changed).playUrl, /mode=solo/);
  const placement = find(changed, 'plot-deed-cache').builderScene.objects.find(item => item.id === 'placed');
  assert.deepEqual(placement.position, {x: 9, y: 0, z: 12});
  assert.equal(placement.functionalSettings.behavior, 'decor');
  maps[0].visibility = 'private';
  assert.equal(find(await read(atlas, maps, deeds)), undefined);
});

test('deed and map ownership transfers update live metadata and preserve permission enforcement', async t => {
  const {atlas, maps, deeds} = await fixture(t);
  const before = await read(atlas, maps, deeds);
  assert.equal(find(before, 'plot-deed-cache').ownerId, 'account:alice');
  deeds[0].ownerId = 'account:bob'; deeds[0].ownerName = 'Bob';
  maps[0].ownerId = 'account:bob'; maps[0].ownerName = 'Bob';
  const changed = await read(atlas, maps, deeds);
  assert.equal(find(changed, 'plot-deed-cache').ownerId, 'account:bob');
  assert.equal(find(changed, 'plot-deed-cache').ownerName, 'Bob');
  assert.equal(find(changed).ownerId, 'account:bob');
  await assert.rejects(atlas.addStreet('plot-deed-cache', {from: {x: -4, z: 0}, to: {x: 4, z: 0}}, owner), {statusCode: 403});
  await atlas.addStreet('plot-deed-cache', {from: {x: -4, z: 0}, to: {x: 4, z: 0}}, {accountId: 'bob', username: 'Bob', walletId: 'account:bob'});
  assert.equal(find(await read(atlas, maps, deeds), 'plot-deed-cache').streets[0].createdBy, 'Bob');
});

test('atlas street and pin transactions invalidate cached revisions without changing source maps', async t => {
  const {atlas, maps, deeds} = await fixture(t), before = await read(atlas, maps, deeds);
  await atlas.addStreet('cache-design', {from: {x: -5, z: 3}, to: {x: 5, z: 3}}, owner);
  const changed = await read(atlas, maps, deeds);
  assert.ok(changed.atlas.revision > before.atlas.revision);
  assert.equal(find(changed).streets[0].createdBy, 'Alice');
  const pinning = atlas.pin('cache-design', null, owner, {x: 40, y: 40});
  const pending = read(atlas, maps, deeds);
  await pinning;
  const pinned = await pending;
  assert.ok(pinned.atlas.revision > changed.atlas.revision);
  assert.equal(Object.keys(pinned.atlas.pins['account:alice']).length, 1);
});

test('external checkpoint replacement and explicit master invalidation reload restored atlas state', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t);
  await read(atlas, maps, deeds);
  const restored = JSON.parse(await readFile(atlas.file, 'utf8'));
  const cell = Object.values(restored.cells).find(cell => cell.mapId === 'cache-design');
  cell.meetings.push({id: 'restored-meeting', name: 'Restored meeting', position: {x: 2, y: 0, z: 3}});
  await writeFile(atlas.file + '.restored', JSON.stringify(restored)); await rename(atlas.file + '.restored', atlas.file);
  const result = await read(atlas, maps, deeds);
  assert.ok(find(result).meetingPoints.some(point => point.id === 'restored-meeting'));
  const count = calls(); atlas.data = null;
  const reloaded = await read(atlas, maps, deeds);
  assert.equal(calls(), count + 2);
  assert.ok(find(reloaded).meetingPoints.some(point => point.id === 'restored-meeting'));
});

test('a corrupt replacement fails rather than serving a stale cached directory', async t => {
  const {atlas, maps, deeds} = await fixture(t);
  await read(atlas, maps, deeds);
  const valid = await readFile(atlas.file);
  await writeFile(atlas.file, '{invalid');
  await assert.rejects(read(atlas, maps, deeds), SyntaxError);
  await writeFile(atlas.file, valid);
  assert.equal(find(await read(atlas, maps, deeds)).name, 'Saved design');
});

test('concurrent identical refreshes share work and each call snapshots mutable source values', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t);
  const [first, second] = await Promise.all([read(atlas, maps, deeds), read(atlas, maps, deeds)]);
  assert.equal(first, second); assert.equal(calls(), 2);
  maps[0].name = 'Queued name';
  const pending = read(atlas, maps, deeds);
  maps[0].name = 'Later name';
  assert.equal(find(await pending).name, 'Queued name');
  assert.equal(find(await read(atlas, maps, deeds)).name, 'Later name');
});

test('an external restore between the last atlas transaction and cache publication is loaded before caching', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t), synchronize = atlas.synchronize.bind(atlas);
  let transactions = 0;
  atlas.synchronize = async (...args) => {
    const result = await synchronize(...args);
    if (++transactions === 2) {
      const restored = JSON.parse(await readFile(atlas.file, 'utf8'));
      Object.values(restored.cells).find(cell => cell.mapId === 'cache-design').meetings.push({id: 'publication-restore', name: 'Restored during refresh', position: {x: 2, y: 0, z: 3}});
      await writeFile(atlas.file + '.restored', JSON.stringify(restored));
      await rename(atlas.file + '.restored', atlas.file);
    }
    return result;
  };
  const result = await read(atlas, maps, deeds);
  assert.ok(find(result).meetingPoints.some(point => point.id === 'publication-restore'));
  assert.equal(calls(), 4, 'the restored generation is loaded in one bounded rebuild');
  assert.equal(await read(atlas, maps, deeds), result);
  assert.equal(calls(), 4, 'the verified restored result is cached');
});

test('a corrupt restore during cold cache publication fails instead of being cached behind an old in-memory atlas', async t => {
  const {atlas, maps, deeds} = await fixture(t), synchronize = atlas.synchronize.bind(atlas);
  let transactions = 0, valid;
  atlas.synchronize = async (...args) => {
    const result = await synchronize(...args);
    if (++transactions === 2) {
      valid = await readFile(atlas.file);
      await writeFile(atlas.file + '.restored', '{corrupt');
      await rename(atlas.file + '.restored', atlas.file);
    }
    return result;
  };
  await assert.rejects(read(atlas, maps, deeds), SyntaxError);
  await assert.rejects(read(atlas, maps, deeds), SyntaxError, 'a second call cannot hit a stale cache');
  await writeFile(atlas.file, valid);
  assert.equal(find(await read(atlas, maps, deeds)).name, 'Saved design');
});

test('a newer in-process atlas transaction is retained while a directory snapshot finishes', async t => {
  const {atlas, maps, deeds} = await fixture(t), synchronize = atlas.synchronize.bind(atlas);
  let transactions = 0, newer;
  atlas.synchronize = async (...args) => {
    const result = await synchronize(...args);
    if (++transactions === 2) {
      await atlas.addStreet('cache-design', {from: {x: -5, z: 3}, to: {x: 5, z: 3}}, owner);
      newer = atlas.data;
    }
    return result;
  };
  await read(atlas, maps, deeds);
  assert.equal(atlas.data, newer, 'directory refresh never clears a newer in-memory owner');
  assert.equal(find(await read(atlas, maps, deeds)).streets[0].createdBy, 'Alice');
});

test('continuously replaced atlas generations fail after bounded rebuilds', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t), synchronize = atlas.synchronize.bind(atlas);
  let transactions = 0;
  atlas.synchronize = async (...args) => {
    const result = await synchronize(...args);
    if (++transactions % 2 === 0) {
      const restored = JSON.parse(await readFile(atlas.file, 'utf8'));
      Object.values(restored.cells).find(cell => cell.mapId === 'cache-design').meetings.push({id: 'replacement-' + transactions, name: 'Concurrent replacement', position: {x: 2, y: 0, z: 3}});
      await writeFile(atlas.file + '.restored', JSON.stringify(restored));
      await rename(atlas.file + '.restored', atlas.file);
    }
    return result;
  };
  await assert.rejects(read(atlas, maps, deeds), {statusCode: 503});
  assert.equal(calls(), 6, 'three complete refresh attempts cap external replacement work');
});

test('a reordered but equivalent persisted atlas can be cached without a rebuild', async t => {
  const {atlas, maps, deeds, calls} = await fixture(t), synchronize = atlas.synchronize.bind(atlas);
  let transactions = 0;
  atlas.synchronize = async (...args) => {
    const result = await synchronize(...args);
    if (++transactions === 2) {
      const restored = JSON.parse(await readFile(atlas.file, 'utf8'));
      await writeFile(atlas.file + '.restored', JSON.stringify(Object.fromEntries(Object.entries(restored).reverse()), null, 2));
      await rename(atlas.file + '.restored', atlas.file);
    }
    return result;
  };
  const result = await read(atlas, maps, deeds);
  assert.equal(calls(), 2);
  assert.equal(await read(atlas, maps, deeds), result);
  assert.equal(calls(), 2);
});
