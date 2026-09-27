import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DROPPED_MODEL_SCALE, MIN_DROPPED_MODEL_SCALE, pinchScaleFactor, pinchZoomFov, pointerAngle, pointerDistance, shortestAngleDelta } from '../public/js/pinch-scale.js';

test('pointerDistance measures a two-finger gesture', () => {
  assert.equal(pointerDistance({ x:0, y:0 }, { x:3, y:4 }), 5);
});

test('pinchScaleFactor grows and shrinks from the initial finger distance', () => {
  assert.equal(pinchScaleFactor({ startDistance:100, currentDistance:150, baseLargestAxis:1 }), 1.5);
  assert.equal(pinchScaleFactor({ startDistance:100, currentDistance:50, baseLargestAxis:1 }), 0.5);
});

test('pinchScaleFactor keeps dropped models within safe visible limits', () => {
  assert.equal(pinchScaleFactor({ startDistance:100, currentDistance:10000, baseLargestAxis:2 }), MAX_DROPPED_MODEL_SCALE / 2);
  assert.equal(pinchScaleFactor({ startDistance:100, currentDistance:1, baseLargestAxis:2 }), MIN_DROPPED_MODEL_SCALE / 2);
});

test('game-screen pinch zoom expands and shrinks the camera view within safe limits', () => {
  assert.equal(pinchZoomFov({ startDistance:100, currentDistance:200, startFov:80 }), 40);
  assert.equal(pinchZoomFov({ startDistance:100, currentDistance:50, startFov:80 }), 92);
  assert.equal(pinchZoomFov({ startDistance:100, currentDistance:1000, startFov:80 }), 32);
});

test('two-finger twist uses the shortest turn across the angle boundary', () => {
  assert.equal(pointerAngle({ x:0, y:0 }, { x:0, y:1 }), Math.PI / 2);
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - .1, -Math.PI + .1) - .2) < 1e-10);
});

test('cancelled or incomplete touch data stays finite', () => {
  assert.equal(pointerDistance(null, { x:1, y:1 }), 0);
  assert.equal(pointerAngle({ x:1, y:1 }, null), 0);
  assert.ok(Number.isFinite(pinchZoomFov({ startDistance:0, currentDistance:0, startFov:0 })));
});
