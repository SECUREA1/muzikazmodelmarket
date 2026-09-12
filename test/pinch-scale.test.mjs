import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DROPPED_MODEL_SCALE, MIN_DROPPED_MODEL_SCALE, pinchScaleFactor, pointerDistance } from '../public/js/pinch-scale.js';

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
