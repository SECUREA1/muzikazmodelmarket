import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {worldPopulation} from '../public/js/world-population.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'room-population-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const store = new SharedRoomStore(join(dir, 'rooms.json'));
  const simulation = {
    players: {
      alice: {username: 'Alice', lastSeen: 99000, position: {x: 1, y: 0, z: 2}, inventory: ['private'], inputEpoch: 'private-epoch'},
      stale: {username: 'Stale', lastSeen: 84000},
      replaced: {username: 'Replaced', lastSeen: 99000, replacedByRoom: 'elsewhere'},
      basketball: {username: 'Team AI', lastSeen: 99000, basketballAI: true},
      bot: {username: 'Bot', lastSeen: 99000, isAI: true}
    },
    actors: {
      resident: {id: 'resident', active: true, resident: {name: 'Resident', role: 'Guide'}, geometry: {large: [1, 2, 3]}},
      traffic: {id: 'traffic', active: true, trafficAI: true, name: 'Driver'},
      sleeping: {id: 'sleeping', active: false, resident: {name: 'Inactive'}}
    },
    construction: {crew: {workers: [{id: 'worker', name: 'Worker', role: 'Builder'}]}},
    prison: {npcs: {guard: {id: 'guard', name: 'Guard', role: 'guard'}, prisoner: {id: 'prisoner', name: 'Prisoner', role: 'inmate'}}},
    receipts: {private: {secret: 'not presence'}}
  };
  await store.save({room: {revision: 0, objects: {}, simulation}, empty: {revision: 0, objects: {}}});
  return {store, simulation};
}

test('population projection preserves full population counts and presence flags without private state', async t => {
  const {store, simulation} = await fixture(t), snapshot = await store.populationSnapshot(100000);
  assert.deepEqual(snapshot.room.population, worldPopulation(simulation, 100000));
  assert.equal(snapshot.room.population.humanCount, 1);
  assert.equal(snapshot.room.population.aiCount, 7);
  assert.equal(snapshot.room.simulation.players.stale.lastSeen, 84000, 'callers retain the stale-presence decision');
  assert.equal(snapshot.room.simulation.players.replaced.replacedByRoom, 'elsewhere');
  assert.equal(snapshot.room.simulation.players.basketball.basketballAI, true);
  assert.equal(snapshot.room.simulation.players.bot.isAI, true);
  assert.equal(snapshot.room.simulation.players.alice.inventory, undefined);
  assert.equal(snapshot.room.simulation.players.alice.position, undefined);
  assert.equal(snapshot.room.simulation.players.alice.inputEpoch, undefined);
  assert.equal(snapshot.room.simulation.actors, undefined);
  assert.equal(snapshot.room.simulation.receipts, undefined);
  assert.deepEqual(snapshot.empty.population, worldPopulation({}, 100000));
});

test('projection results are detached and never traverse geometry, inventory or receipt histories', async t => {
  const {store} = await fixture(t), simulation = store.data.room.simulation;
  for (const [owner, key] of [[simulation.players.alice, 'inventory'], [simulation.actors.resident, 'geometry'], [simulation, 'receipts']]) {
    Object.defineProperty(owner, key, {enumerable: true, get() {throw Error('private payload traversed');}});
  }
  const snapshot = await store.populationSnapshot(100000);
  snapshot.room.simulation.players.alice.username = 'Forged'; snapshot.room.population.ai[0].name = 'Forged';
  const next = await store.populationSnapshot(100000);
  assert.equal(next.room.simulation.players.alice.username, 'Alice');
  assert.notEqual(next.room.population.ai[0].name, 'Forged');
});

test('population projection supports committed reentrant reads in async validation', {timeout: 5000}, async t => {
  const {store} = await fixture(t);
  await store.update('room', async current => {
    current.simulation.players.alice.username = 'Pending';
    const snapshot = await store.populationSnapshot(100000);
    assert.equal(snapshot.room.simulation.players.alice.username, 'Alice');
    assert.equal(snapshot.room.population.humanCount, 1);
  }, {persist: false, roomOnly: true});
  assert.equal((await store.populationSnapshot(100000)).room.simulation.players.alice.username, 'Pending');
});
