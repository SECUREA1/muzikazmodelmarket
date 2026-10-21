import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainFiringRangePlayer,rangeLocalToWorld,rangeWorldToLocal} from '../public/js/firing-range.js';
import {constrainFiringRangePlayer as serverConstraint} from '../server-firing-range.mjs';
const location={id:'main',transform:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}};
const simulation=(state='live',locations=[location])=>({firingRange:{state,locations,participants:{shooter:{role:'player'},watcher:{role:'spectator'}}}});
test('server and local range movement share one safety constraint and inactive ranges remain open',()=>{
 assert.equal(serverConstraint,constrainFiringRangePlayer);const next={x:0,y:0,z:0};for(const state of ['ready','finished'])assert.equal(constrainFiringRangePlayer(next,next,simulation(state),{id:'shooter'}),next);assert.equal(constrainFiringRangePlayer(next,next,{},{}),next);
});
test('active range participants and projected spectators stop at their correct safety line',()=>{
 const next={x:0,y:0,z:0};for(const state of ['countdown','live','intermission']){
  assert.equal(constrainFiringRangePlayer(next,next,simulation(state),{actorId:'shooter'}).z,11.3);
  assert.equal(constrainFiringRangePlayer(next,next,simulation(state),{id:'shooter'}).z,11.3);
  assert.equal(constrainFiringRangePlayer(next,next,simulation(state),{id:'watcher'}).z,14.2);
  assert.equal(constrainFiringRangePlayer(next,next,simulation(state),{id:'new-player'}).z,14.2);
 }
 const outside={x:22,y:0,z:0};assert.deepEqual(constrainFiringRangePlayer(outside,outside,simulation(),{id:'shooter'}),outside);assert.deepEqual(next,{x:0,y:0,z:0},'constraint never mutates the input vector');
});
test('translated rotated scaled range safety stays in local lane coordinates',()=>{
 const rotated={id:'remote',transform:{position:{x:80,y:2,z:-20},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:1,z:2}}},next=rangeLocalToWorld(rotated,{x:3,y:.02,z:4});
 const result=constrainFiringRangePlayer(next,next,simulation('live',[rotated]),{id:'shooter'}),local=rangeWorldToLocal(rotated,result);assert.ok(Math.abs(local.x-3)<1e-8);assert.ok(Math.abs(local.z-11.3)<1e-8);assert.ok(Math.abs(local.y-.02)<1e-8);assert.equal(result.y,next.y);
});
