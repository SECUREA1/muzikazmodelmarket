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

test('walking continues through delayed snapshots and reconciles without a position jump',async()=>{
 const {WalkingFollower}=await import('../public/js/movement-view.js');
 const view=new WalkingFollower(),target={};view.push({x:0,y:0,z:0},1000);
 for(let i=1;i<=15;i++)view.sample({forward:1},.02,1000+i*20,4,target);
 assert.ok(target.z< -1.19,'walking does not freeze at the old 150 ms prediction limit');
 const before=target.z;view.push({x:0,y:0,z:-1},1300);
 assert.equal(view.position.z,before,'snapshot receipt does not snap the view');
 view.sample({forward:1},.02,1320,4,target);
 assert.ok(target.z<before,'walking continues while correction is applied');
 for(let i=0;i<100;i++)view.sample({},.02,2000+i*20,4,target);
 const stopped=target.z;view.sample({forward:1},.02,5000,4,target);
 assert.ok(Math.abs(target.z-stopped)<.001,'stale connection cannot predict indefinitely');
 view.push({x:30,y:0,z:0},5100);assert.equal(view.position.x,30,'respawn resets prediction');
});

test('left joystick prevents drift, preserves diagonals and has no sprint threshold jump',async()=>{
 const {joystickMovement}=await import('../public/js/movement-view.js');
 assert.deepEqual(joystickMovement(.03,.03),{x:0,y:0});
 const slow=joystickMovement(0,-.2),fast=joystickMovement(0,-1);
 assert.ok(-slow.y>0&&-slow.y<.2);assert.equal(fast.y,-1);
 const below=joystickMovement(0,-.749),above=joystickMovement(0,-.751);
 assert.ok(Math.abs(above.y-below.y)<.003,'crossing the old threshold changes speed gradually');
 const diagonal=joystickMovement(1,1);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);
 assert.deepEqual(joystickMovement(NaN,0),{x:0,y:0});
});
