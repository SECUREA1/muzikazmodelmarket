import test from 'node:test';
import assert from 'node:assert/strict';
import { FlameContactClock, flamePressure, FLAME_CONFIG } from '../public/js/flamethrower.js';

test('full tank reaches full range, low pressure drips, and empty pressure cannot extend range', () => {
  assert.equal(flamePressure(100).range, FLAME_CONFIG.range);
  assert.equal(flamePressure(100).dripping, false);
  assert.equal(flamePressure(20).dripping, true);
  assert.ok(flamePressure(10).speed < flamePressure(50).speed);
  assert.ok(flamePressure(10).range < flamePressure(50).range);
  assert.equal(flamePressure(-10).range, flamePressure(0).range);
});

test('a flame applies exactly ten damage ticks then expires, independent of frame rate', () => {
  for (const step of [1 / 60, .1, .7, 3]) {
    const clock = new FlameContactClock(), target = {}, hits = [];
    for (let elapsed = 0; elapsed < 12; elapsed += step) clock.update(step, [target], (object, damage) => hits.push(damage));
    assert.equal(hits.reduce((sum, damage) => sum + damage, 0), 10);
    assert.equal(clock.update(1, [target], () => assert.fail('expired fire damaged target')), 0);
  }
});

test('burning fades during the last second and contact stops when a character leaves', () => {
  const clock = new FlameContactClock(), target = {}, hits = [];
  const damage = (_, amount) => hits.push(amount);
  clock.update(.8, [target], damage);
  clock.update(.2, [], damage);
  clock.update(.4, [target], damage);
  assert.deepEqual(hits, []);
  clock.update(.6, [target], damage);
  assert.deepEqual(hits, [1]);
  clock.update(7, [], damage);
  assert.equal(clock.update(.5, [], damage), .5);
  assert.equal(clock.update(.5, [], damage), 0);
});

test('separate flame connections stack, while duplicate meshes of one target do not', () => {
  const target = {}, other = {}, damage = new Map();
  const apply = (object, amount) => damage.set(object, (damage.get(object) || 0) + amount);
  new FlameContactClock().update(1, [target, target, other], apply);
  new FlameContactClock().update(1, [target], apply);
  assert.equal(damage.get(target), 2);
  assert.equal(damage.get(other), 1);
});
