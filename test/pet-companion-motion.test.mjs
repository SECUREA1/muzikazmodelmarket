import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PET_COMPANION_DEFAULTS,
  companionDistanceState,
  nearestCompanionInterest,
  randomCompanionOffset,
} from '../public/js/pet-companion-motion.js';

test('random pet destinations stay in an arm-distance companion ring', () => {
  const values = [0, 0, .25, .5, .75, 1];
  for (let index = 0; index < values.length; index += 2) {
    let call = index;
    const offset = randomCompanionOffset(() => values[call++]);
    assert.ok(offset.distance >= PET_COMPANION_DEFAULTS.minPlayerDistance);
    assert.ok(offset.distance <= PET_COMPANION_DEFAULTS.maxPlayerDistance);
    assert.ok(Math.abs(Math.hypot(offset.x, offset.z) - offset.distance) < 1e-9);
  }
});

test('pet distance state identifies crowding and straying', () => {
  assert.equal(companionDistanceState(1), 'too-close');
  assert.equal(companionDistanceState(2), 'comfortable');
  assert.equal(companionDistanceState(5), 'too-far');
});

test('pet looks at the nearest visible interest inside its awareness radius', () => {
  const pet = { position: { x: 0, z: 0 } };
  const hidden = { position: { x: .25, z: 0 }, visible: false };
  const player = { position: { x: 2, z: 0 }, visible: true };
  const visitor = { position: { x: 1.5, z: 0 }, visible: true };
  assert.equal(nearestCompanionInterest(pet, [hidden, player, visitor]), visitor);
  assert.equal(nearestCompanionInterest(pet, [{ position: { x: 10, z: 10 } }]), null);
});
