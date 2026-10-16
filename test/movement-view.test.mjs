import test from 'node:test';
import assert from 'node:assert/strict';
import {movementViewOffset} from '../public/js/movement-view.js';

test('movement view follows camera direction and preserves analog control',()=>{
  assert.deepEqual(movementViewOffset({forward:1},.1),{x:0,z:-.4});
  assert.deepEqual(movementViewOffset({side:.5},.1),{x:.2,z:0});
  const turn=movementViewOffset({forward:1,yaw:Math.PI/2},.1);
  assert.ok(Math.abs(turn.x+.4)<1e-10);assert.ok(Math.abs(turn.z)<1e-10);
});
test('prediction normalizes diagonals and stops growing during stalled snapshots',()=>{
  const diagonal=movementViewOffset({side:1,forward:1},.1);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-.4)<1e-10);
  assert.deepEqual(movementViewOffset({forward:1},10),movementViewOffset({forward:1},.15));
  assert.deepEqual(movementViewOffset({},.1),{x:0,z:0});
  assert.deepEqual(movementViewOffset({forward:1},.1,0),{x:0,z:0});
});
