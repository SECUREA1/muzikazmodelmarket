import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

async function fixture(t, {basketballCourt = false, jerseyBehavior = 'pickup'} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'basketball-builder-runtime-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  let now = 100000;
  let sequence = 0;
  const objects = [
    {
      id: 'catalog-ball', modelId: 'catalog-basketball', position: {x: 0, y: 0, z: 0},
      asset: {buildAssetId: 'basketball', id: 'basketball', name: 'Basketball'},
      functionalSettings: {behavior: 'pickup', interactionDistance: 3},
    },
    {
      id: 'canonical-ball', modelId: 'basketball', position: {x: 8, y: 0, z: 0},
      functionalSettings: {behavior: 'pickup', interactionDistance: 3},
    },
    ...['home', 'away'].map((team, index) => ({
      id: `catalog-${team}`, modelId: `catalog-basketball-jersey-${team}`,
      position: {x: 16 + index * 8, y: 0, z: 0},
      asset: {buildAssetId: `basketball-jersey-${team}`, basketballTeam: team},
      functionalSettings: {behavior: jerseyBehavior, interactionDistance: 3, cooldown: 0},
    })),
  ];
  const map = {
    id: 'authored-basketball-items', name: 'Builder Basketball Items', basketballCourt,
    spawn: {x: 0, y: 0, z: 0},
    builderScene: {layout: 'grand-floor', mapSize: 96, objects},
  };
  const store = new SharedRoomStore(join(dir, 'rooms.json'));
  const runtime = new AuthoritativeRooms({store, now: () => now});
  return {
    store, runtime, map, objects,
    advance(milliseconds) { now += milliseconds; },
    send(who, action, fields = {}) {
      return runtime.command(map.id, map, {
        accountId: who, username: who, walletId: who, stats: {health: 100},
      }, {action, requestId: `authored-${++sequence}`, ...fields});
    },
    // Fixture placement chooses a nearby authored item without depending on
    // unrelated map movement or accepting a client supplied position.
    relocate(who, objectId) {
      const position = objects.find(object => object.id === objectId).position;
      return store.update(map.id, room => {
        const player = room.simulation.players[`account:${who}`];
        player.position = {...position};
        player.floor = position.y;
        player.velocityY = 0;
        player.grounded = true;
        player.input = {};
      });
    },
  };
}

for (const objectId of ['catalog-ball', 'canonical-ball']) {
  test(`an authored ${objectId} can be caught, tossed with shared physics and caught again`, async t => {
    const f = await fixture(t);
    let state = await f.send('alice', 'join');
    const authored = f.objects.find(object => object.id === objectId);
    assert.equal(state.actors[objectId].modelId, authored.modelId);
    if (authored.asset) assert.deepEqual(state.actors[objectId].asset, authored.asset);

    await f.relocate('alice', objectId);
    state = await f.send('alice', 'catch');
    assert.equal(state.players['account:alice'].heldId, objectId);
    assert.equal(state.actors[objectId].holderId, 'account:alice');

    state = await f.send('alice', 'toss', {pitch: .2});
    assert.equal(state.players['account:alice'].heldId, null);
    assert.equal(state.actors[objectId].holderId, null);
    assert.ok(state.actors[objectId].ballVelocity.y > 0);
    assert.ok(state.actors[objectId].ballVelocity.z < 0);
    const releasedPosition = {...state.actors[objectId].position};
    f.advance(200);
    state = await f.runtime.snapshot(f.map.id, f.map);
    assert.ok(state.actors[objectId].position.z < releasedPosition.z);
    assert.ok(state.actors[objectId].position.y > releasedPosition.y);
    assert.equal(state.actors[objectId].active, true);

    const peer = await f.send('bob', 'join');
    assert.deepEqual(peer.actors[objectId].position, state.actors[objectId].position);
    assert.deepEqual(peer.actors[objectId].ballVelocity, state.actors[objectId].ballVelocity);
    state = await f.send('alice', 'catch');
    assert.equal(state.players['account:alice'].heldId, objectId);
    assert.equal(state.actors[objectId].ballVelocity, undefined);
    if (authored.asset) assert.deepEqual(state.actors[objectId].asset, authored.asset);
  });
}

for (const jerseyBehavior of ['pickup', 'interact']) {
  test(`authored ${jerseyBehavior} jerseys attach for every player and allow team changes before tip-off`, async t => {
    const f = await fixture(t, {basketballCourt: true, jerseyBehavior});
    await f.send('alice', 'join');
    await f.send('bob', 'join');
    await f.relocate('alice', 'catalog-home');
    let state = await f.send('alice', 'interact', {entityId: 'catalog-home'});
    assert.equal(state.basketball.state, 'ready');
    assert.equal(state.players['account:alice'].basketballJersey, 'home');
    assert.equal(state.players['account:alice'].basketballTeam, 'home');
    assert.equal(state.players['account:alice'].heldId ?? null, null);
    assert.equal(state.actors['catalog-home'].holderId ?? null, null);
    assert.equal(state.actors['catalog-home'].active, true);
    assert.deepEqual(state.actors['catalog-home'].position, f.objects[2].position);
    assert.ok(!state.players['account:alice'].inventory.includes('catalog-basketball-jersey-home'));

    // Another player's public response sees the equipped attachment, and the
    // same authored jersey remains available for that player to equip.
    const peer = await f.send('bob', 'input', {input: {}});
    assert.equal(peer.players['account:alice'].basketballJersey, 'home');
    await f.relocate('bob', 'catalog-home');
    state = await f.send('bob', 'interact', {entityId: 'catalog-home'});
    assert.equal(state.players['account:bob'].basketballJersey, 'home');
    assert.equal(state.players['account:bob'].heldId ?? null, null);
    assert.equal(state.actors['catalog-home'].active, true);
    assert.equal(state.actors['catalog-home'].holderId ?? null, null);

    await f.relocate('alice', 'catalog-away');
    state = await f.send('alice', 'interact', {entityId: 'catalog-away'});
    assert.equal(state.players['account:alice'].basketballJersey, 'away');
    assert.equal(state.players['account:alice'].basketballTeam, 'away');
    assert.equal(state.players['account:bob'].basketballJersey, 'home');
    assert.equal(state.players['account:alice'].heldId ?? null, null);
    assert.equal(state.actors['catalog-away'].active, true);
    assert.equal(state.actors['catalog-away'].holderId ?? null, null);

    await f.send('bob', 'basketball-start');
    await f.relocate('alice', 'catalog-home');
    await assert.rejects(f.send('alice', 'interact', {entityId: 'catalog-home'}), /Change teams/);
  });
}

test('an authored basketball jersey also equips as an attachment outside a basketball arena', async t => {
  const f = await fixture(t);
  await f.send('alice', 'join');
  await f.relocate('alice', 'catalog-away');
  const state = await f.send('alice', 'interact', {entityId: 'catalog-away'});
  assert.equal(state.basketball ?? null, null);
  assert.equal(state.players['account:alice'].basketballJersey, 'away');
  assert.equal(state.players['account:alice'].heldId ?? null, null);
  assert.equal(state.actors['catalog-away'].active, true);
  assert.equal(state.actors['catalog-away'].holderId ?? null, null);
});

test('a custom Builder stadium uses its authored basketball for tip-off, scoring and inbound possession', async t => {
  const f = await fixture(t);
  f.map.builderScene.layout = 'basketball-stadium';
  f.objects[0].modelId = 'catalog-generated-basketball-123';
  const ballId = f.objects[0].id;
  let state = await f.send('alice', 'join');
  await f.send('bob', 'join');
  assert.equal(state.basketball.state, 'ready');
  assert.equal(state.basketball.ballId, ballId);
  assert.equal(state.actors[ballId].modelId, 'catalog-generated-basketball-123');
  assert.equal(state.actors[ballId].basketballMatchBall, true);
  assert.equal(state.actors['basketball-game-ball'], undefined);
  assert.equal(Object.values(state.actors).filter(actor => actor.basketballMatchBall).length, 1);

  await f.relocate('alice', ballId);
  state = await f.send('alice', 'catch');
  assert.equal(state.players['account:alice'].heldId, ballId);
  state = await f.send('bob', 'basketball-start');
  assert.equal(state.basketball.ballId, ballId);
  assert.equal(state.players['account:alice'].heldId, null);
  assert.equal(state.actors[ballId].holderId, null);
  assert.deepEqual(state.actors[ballId].position, {x: 0, y: 0, z: 0});

  await f.store.update(f.map.id, room => {
    room.simulation.players['account:alice'].position = {x: 0, y: 0, z: -8};
    room.simulation.actors[ballId].position = {x: 0, y: 0, z: -8};
  });
  state = await f.send('alice', 'catch');
  assert.equal(state.players['account:alice'].heldId, ballId);
  state = await f.send('alice', 'basketball-shoot');
  assert.ok(state.actors[ballId].ballVelocity);
  for (let frame = 0; frame < 120 && !state.basketball.lastScore; frame++) {
    f.advance(33);
    state = await f.runtime.snapshot(f.map.id, f.map);
  }

  assert.equal(state.basketball.homeScore, 2);
  assert.equal(state.basketball.awayScore, 0);
  assert.equal(state.basketball.lastScore.playerId, 'account:alice');
  assert.equal(state.basketball.possession, 'away');
  assert.equal(state.basketball.ballId, ballId);
  assert.equal(state.players['account:bob'].heldId, ballId);
  assert.equal(state.actors[ballId].holderId, 'account:bob');
  assert.equal(state.actors[ballId].ballVelocity, undefined);
  assert.equal(state.actors['basketball-game-ball'], undefined);
  assert.equal(Object.values(state.actors).filter(actor => actor.basketballMatchBall).length, 1);
  assert.equal(state.events.filter(event => event.action === 'basketball-score').length, 1);
});
