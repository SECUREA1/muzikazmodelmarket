import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {restoreResidentContinuity, saveResidentContinuity} from '../server-resident-progress.mjs';

const alice = 'account:alice', bob = 'account:bob';
const player = extra => ({actorId: alice, lastSeen: 1, input: {}, ...extra});
const room = players => ({revision: 0, objects: {}, simulation: {players, actors: {}}});
const scope = (roomIds = []) => ({playerScope: {playerId: alice, roomIds}});
async function fixture(t, data = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'room-player-scope-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const file = join(dir, 'rooms.json'), store = new SharedRoomStore(file);
  await store.save(data);
  return {store, file};
}

test('new players receive only the destination and explicit travel-proof rooms', async t => {
  const {store, file} = await fixture(t, {unrelated: room({[bob]: {actorId: bob}}), proofSource: room({})});
  await store.update('destination', (target, rooms) => {
    assert.deepEqual(Object.keys(rooms), ['proofSource']);
    target.simulation = {players: {[alice]: player({lastSeen: 10})}, actors: {}};
    assert.equal(rooms.unrelated, undefined);
  }, scope(['proofSource']));
  const saved = await new SharedRoomStore(file).read();
  assert.ok(saved.unrelated.simulation.players[bob]);
  assert.ok(saved.destination.simulation.players[alice]);
});

test('scopes include stale presence and replaced historical worlds but exclude other accounts', async t => {
  const {store} = await fixture(t, {
    stale: room({[alice]: player({lastSeen: 0})}),
    historical: room({[alice]: player({replacedByRoom: 'stale'})}),
    destination: room({[bob]: {actorId: bob}}),
    unrelated: room({[bob]: {actorId: bob}})
  });
  await store.update('destination', (_target, rooms) => {
    assert.deepEqual(Object.keys(rooms).sort(), ['destination', 'historical', 'stale']);
  }, scope());
});

test('concurrent moves choose their scopes inside the serialized transaction', async t => {
  const {store, file} = await fixture(t, {first: room({[alice]: player({})}), unrelated: room({[bob]: {actorId: bob}})});
  const move = id => store.update(id, (target, rooms) => {
    target.simulation ||= {players: {}, actors: {}};
    for (const [otherId, other] of Object.entries(rooms)) if (otherId !== id) other.simulation.players[alice].replacedByRoom = id;
    target.simulation.players[alice] = player({lastSeen: 20, replacedByRoom: null});
  }, scope());
  await Promise.all([move('second'), move('third')]);
  const saved = await new SharedRoomStore(file).read();
  assert.equal(saved.first.simulation.players[alice].replacedByRoom, 'third');
  assert.equal(saved.second.simulation.players[alice].replacedByRoom, 'third');
  assert.equal(saved.third.simulation.players[alice].replacedByRoom, null);
  assert.ok(saved.unrelated.simulation.players[bob]);
});

test('callback rollback does not create indexed presence or publish detached references', async t => {
  const {store} = await fixture(t, {old: room({[alice]: player({})})});
  await assert.rejects(store.update('failed', target => {
    target.simulation = {players: {[alice]: player({})}};
    throw Error('permission denied');
  }, scope()), /permission denied/);
  let retained;
  const returned = await store.update('target', (target, rooms) => {
    assert.deepEqual(Object.keys(rooms), ['old']);
    retained = rooms; target.simulation = {players: {[alice]: player({lastSeen: 30})}};
    return target;
  }, scope());
  retained.old.simulation.players[alice].lastSeen = 999;
  returned.simulation.players[alice].lastSeen = 888;
  assert.equal((await store.get('old')).simulation.players[alice].lastSeen, 1);
  assert.equal((await store.get('target')).simulation.players[alice].lastSeen, 30);
});

test('scopes track all mutation paths and a bulk save invalidates the old index', async t => {
  const {store} = await fixture(t, {first: room({[alice]: player({})}), next: room({})});
  await store.update('first', () => {}, scope()); // Build the lazy index.
  await store.update('next', value => {value.simulation.players[alice] = player({});}, {roomOnly: true});
  await store.updateMany(['first'], value => {delete value.simulation.players[alice];});
  await store.update('destination', (_target, rooms) => assert.deepEqual(Object.keys(rooms), ['next']), scope());
  await store.update('unscoped', (target, rooms) => {rooms.additional = room({[alice]: player({})});});
  await store.update('destination', (_target, rooms) => assert.deepEqual(Object.keys(rooms).sort(), ['additional', 'destination', 'next']), scope());
  await store.save({replaced: room({[alice]: player({})})});
  await store.update('fresh', (_target, rooms) => assert.deepEqual(Object.keys(rooms), ['replaced']), scope());
});

test('reopening journal state and restoring an external checkpoint rebuild presence indexes', async t => {
  const {store, file} = await fixture(t, {first: room({[alice]: player({})})});
  await store.update('first', () => {}, scope());
  await store.update('second', target => {target.simulation = {players: {[alice]: player({replacedByRoom: 'first'})}};}, scope());
  const reopened = new SharedRoomStore(file);
  await reopened.update('target', (_target, rooms) => assert.deepEqual(Object.keys(rooms).sort(), ['first', 'second']), scope());
  await writeFile(file + '.replacement', JSON.stringify({restored: room({[alice]: player({})})}));
  await rename(file + '.replacement', file);
  store.data = null;
  await store.update('target', (_target, rooms) => assert.deepEqual(Object.keys(rooms), ['restored']), scope());
});

test('historical legacy contacts and progress remain available for join-time restoration', async t => {
  const historical = player({replacedByRoom: 'current', residentPreferences: {interest: 'music'},
    residentSocial: {'historical|host': {visits: 2, affinity: 6, preferences: {activity: 'music'}, turns: [], lastAt: 100}},
    residentProgress: {reputation: 9, skills: {social: 14}, completedTasks: 1}});
  saveResidentContinuity(historical, 'historical', 100);
  const {store} = await fixture(t, {historical: room({[alice]: historical}), current: room({[alice]: player({})}), unrelated: room({[bob]: {residentProgress: {reputation: 999999}}})});
  await store.update('destination', (target, rooms) => {
    const arriving = player({}); target.simulation = {players: {[alice]: arriving}};
    restoreResidentContinuity(arriving, rooms, alice, 'destination', 200);
    assert.equal(arriving.residentProgress.reputation, 9);
    assert.equal(arriving.residentProgress.skills.social, 14);
    assert.equal(arriving.residentSocial['historical|host'].preferences.activity, 'music');
  }, scope());
});

test('scoped joins avoid cloning unrelated geometry and reject out-of-scope inserts', async t => {
  const {store} = await fixture(t, {old: room({[alice]: player({})}), unrelated: room({[bob]: {actorId: bob}})});
  Object.defineProperty(store.data.unrelated, 'geometry', {enumerable: true, get() {throw Error('unrelated geometry cloned');}});
  await store.update('destination', (target, rooms) => {
    assert.deepEqual(Object.keys(rooms), ['old']);
    target.simulation = {players: {[alice]: player({})}};
  }, scope());
  await assert.rejects(store.update('destination', (_target, rooms) => {rooms.outside = room({});}, scope()), /outside its scope/);
  assert.deepEqual((await store.get('outside')).objects, {});
});
