import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeWalker, lookArcadeWalker, stepArcadeWalker, nearestArcadeInteraction} from '../public/js/arcade-navigation.js';

test('walking uses eye height, facing direction, normalized diagonals and real metres', () => {
  const walker = createArcadeWalker();
  assert.equal(walker.eyeHeight, 1.68);
  stepArcadeWalker(walker, .2, {forward: 1});
  assert.ok(Math.abs(walker.z - 14.38) < 1e-10);
  const diagonal = createArcadeWalker();
  stepArcadeWalker(diagonal, .2, {forward: 1, right: 1});
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z - 15) - .62) < 1e-10);
  const turned = createArcadeWalker({yaw: Math.PI / 2});
  stepArcadeWalker(turned, .2, {forward: 1});
  assert.ok(Math.abs(turned.x - .62) < 1e-10);
});

test('slow-frame movement cannot cross furniture and slides along edges', () => {
  const walker = createArcadeWalker({x: 0, z: 1});
  const colliders = [{minX: -.5, maxX: .5, minZ: -.1, maxZ: .1}];
  for (let frame = 0; frame < 15; frame++) stepArcadeWalker(walker, .25, {forward: 1, colliders});
  assert.ok(walker.z >= .4, 'the visitor stops before the narrow barrier');
  for (let frame = 0; frame < 15; frame++) stepArcadeWalker(walker, .25, {forward: 1, right: 1, colliders});
  assert.ok(walker.x > 1 && walker.z < 0, 'the visitor can move around the furniture');
});

test('boundaries, invalid deltas and vertical look remain safe', () => {
  const walker = createArcadeWalker({x: 25.6});
  stepArcadeWalker(walker, 999, {right: 1});
  assert.ok(walker.x <= 25.7);
  const before = {...walker};
  stepArcadeWalker(walker, NaN, {forward: 1});
  assert.deepEqual(walker, before);
  lookArcadeWalker(walker, 10, -10000);
  assert.equal(walker.pitch, .95);
});

test('nearby interactions respect disabled attractions and choose nearest', () => {
  const walker = createArcadeWalker({x: 0, z: 0});
  const interactions = [{id: 'closed', x: .1, z: 0, enabled: false}, {id: 'court', x: 2, z: 0}, {id: 'table', x: 1, z: 0}, {id: 'far', x: 20, z: 0}];
  assert.equal(nearestArcadeInteraction(walker, interactions).id, 'table');
  assert.equal(nearestArcadeInteraction(walker, interactions, .5), null);
});


test('fine analog walking keeps its requested strength and reverses without momentum',()=>{
 const fine=createArcadeWalker({x:0,z:0}),full=createArcadeWalker({x:0,z:0});
 stepArcadeWalker(fine,.1,{forward:.06,right:.04});stepArcadeWalker(full,.1,{forward:.6,right:.4});
 assert.ok(Math.abs(fine.x-full.x*.1)<1e-12);assert.ok(Math.abs(fine.z-full.z*.1)<1e-12);assert.ok(fine.x>0&&fine.z<0);
 stepArcadeWalker(fine,.1,{forward:-.06,right:-.04});assert.ok(Math.hypot(fine.x,fine.z)<1e-12);
 const stopped={...fine};stepArcadeWalker(fine,.2,{});assert.deepEqual(fine,stopped);
});
