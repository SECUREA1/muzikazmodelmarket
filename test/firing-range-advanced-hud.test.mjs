import test from 'node:test';
import assert from 'node:assert/strict';
import { firingRangeControlState } from '../public/js/firing-range-hud.js';

const game = (state, mode = 'precision') => ({
  state, settings: { mode }, hostId: 'host',
  participants: { host: { id: 'host', role: 'player' }, player: { id: 'player', role: 'player' }, viewer: { id: 'viewer', role: 'spectator' } }
});

test('only the idle or finished host can configure a tournament', () => {
  for (const state of ['ready', 'finished']) {
    assert.equal(firingRangeControlState(game(state), 'host').canSetup, true);
    assert.equal(firingRangeControlState(game(state), 'player').canSetup, false);
    assert.equal(firingRangeControlState(game(state), 'viewer').canSetup, false);
    assert.equal(firingRangeControlState(game(state), 'host', false).canSetup, false);
  }
  for (const state of ['countdown', 'live', 'intermission']) {
    assert.equal(firingRangeControlState(game(state), 'host').canSetup, false);
  }
  assert.equal(firingRangeControlState(game('live', 'freeplay'), 'host').canSetup, false);
});

test('practice loans remain available to participants until a competitive event locks its weapon', () => {
  for (const state of ['ready', 'finished']) {
    assert.equal(firingRangeControlState(game(state), 'player').canChooseWeapon, true);
    assert.equal(firingRangeControlState(game(state), 'viewer').canChooseWeapon, false);
    assert.equal(firingRangeControlState(game(state), 'player', false).canChooseWeapon, false);
  }
  assert.equal(firingRangeControlState(game('live', 'freeplay'), 'player').canChooseWeapon, true);
  assert.equal(firingRangeControlState(game('live', 'freeplay'), 'player').tournamentWeaponLocked, false);
  for (const state of ['countdown', 'live', 'intermission']) {
    const controls = firingRangeControlState(game(state), 'player');
    assert.equal(controls.canChooseWeapon, false);
    assert.equal(controls.tournamentWeaponLocked, true);
  }
});
