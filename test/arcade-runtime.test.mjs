import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeClock, advanceArcadeClock, arcadePhysicsSteps, arcadePointer,
  basketballPosition, basketballRelease, arcadeAnimationSpeed} from '../public/js/arcade-runtime.js';

test('active arcade time matches wall time at low frame rates', () => {
  const clock = createArcadeClock(1000);
  let elapsed = 0;
  for (let frame = 1; frame <= 30; frame++) elapsed += advanceArcadeClock(clock, 1000 + frame * 500);
  assert.equal(elapsed, 15, 'a 15-second round lasts 15 seconds at two frames/sec');
});

test('paused and hidden intervals never catch up on resume', () => {
  const clock = createArcadeClock(0);
  assert.equal(advanceArcadeClock(clock, 1000), 1);
  assert.equal(advanceArcadeClock(clock, 61000, {paused: true}), 0);
  assert.equal(advanceArcadeClock(clock, 61100), .1);
  assert.equal(advanceArcadeClock(clock, NaN), 0);
  assert.equal(advanceArcadeClock(clock, 61000), 0);
});

test('collision updates cover ordinary slow frames with bounded safe steps', () => {
  const steps = arcadePhysicsSteps(.3);
  assert.equal(steps.length, 36);
  assert.ok(steps.every(step => step <= 1 / 120));
  assert.ok(Math.abs(steps.reduce((sum, step) => sum + step, 0) - .3) < 1e-9);
  assert.equal(arcadePhysicsSteps(60).length, 60, 'a process stall cannot create a catch-up spiral');
  assert.deepEqual(arcadePhysicsSteps(NaN), []);
  assert.deepEqual(arcadePhysicsSteps(-1), []);
});

test('pointer movement remains inside the playable canvas', () => {
  assert.deepEqual(arcadePointer(-400, 990), {x:20,y:440});
  assert.deepEqual(arcadePointer(Infinity, NaN), {x:400,y:370});
});

test('basketball shots use the ball position shown at release and relaxed scoring', () => {
  assert.equal(basketballPosition(0), 400);
  assert.ok(Math.abs(basketballPosition(Math.PI * .65 / 2) - 660) < 1e-9);
  assert.deepEqual(basketballRelease(400), {scored:true,endX:400});
  assert.equal(basketballRelease(460, 'easy').scored, true);
  assert.equal(basketballRelease(460, 'normal').scored, false);
  assert.equal(basketballRelease(600).endX, 480, 'a miss visibly reaches the edge of the rim');
});

test('saved ride animation flags and speed share one bounded time multiplier', () => {
  assert.equal(arcadeAnimationSpeed(), 1);
  assert.equal(arcadeAnimationSpeed(true, 2), 2);
  assert.equal(arcadeAnimationSpeed(false, 2), 0);
  assert.equal(arcadeAnimationSpeed(true, 0), 0);
  assert.equal(arcadeAnimationSpeed(true, -10), 0);
  assert.equal(arcadeAnimationSpeed(true, 30), 3);
  assert.equal(arcadeAnimationSpeed(true, NaN), 1);
});
