import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeWalker,relocateArcadeWalker,stepArcadeWalker} from '../public/js/arcade-navigation.js';

test('arcade relocation immediately arrives at the precise floor point and walking continues there',()=>{
 const walker=createArcadeWalker({yaw:.7}),point={x:7.125,y:.42,z:-3.875};
 assert.equal(relocateArcadeWalker(walker,point),true);
 assert.deepEqual({x:walker.x,y:walker.ground,z:walker.z},point);
 assert.equal(walker.yaw,.7);
 stepArcadeWalker(walker,.2);
 assert.deepEqual({x:walker.x,y:walker.ground,z:walker.z},point,'an arrival is stationary without fresh movement');
 stepArcadeWalker(walker,.2,{forward:1});
 assert.ok(Math.abs(Math.hypot(walker.x-point.x,walker.z-point.z)-.62)<1e-10);
 assert.equal(walker.ground,point.y);
});

test('arcade relocation rejects furniture, insufficient body clearance and out-of-bounds points without shifting the selected position',()=>{
 const walker=createArcadeWalker(),before={...walker},bounds={minX:-10,maxX:10,minZ:-10,maxZ:10},colliders=[{minX:1,maxX:2,minZ:1,maxZ:2}];
 for(const point of [null,{x:NaN,y:0,z:0},{x:0,y:Infinity,z:0},{x:0,y:0,z:NaN},{x:9.8,y:0,z:0},{x:-9.8,y:0,z:0},{x:0,y:0,z:9.8},{x:1.5,y:0,z:1.5},{x:.8,y:0,z:1.5}]){
  assert.equal(relocateArcadeWalker(walker,point,{bounds,colliders}),false);
  assert.deepEqual(walker,before,'a rejected destination does not move the visitor to a nearby point');
 }
 assert.equal(relocateArcadeWalker(walker,{x:.69,y:.08,z:1.5},{bounds,colliders}),true);
 assert.equal(walker.x,.69);
});
