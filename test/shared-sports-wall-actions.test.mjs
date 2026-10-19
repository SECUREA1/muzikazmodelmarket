import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {BASKETBALL_BALL_ID} from '../public/js/basketball-rules.js';
import {FIRING_RANGE_TARGETS,firingRangeTargetPosition} from '../public/js/firing-range.js';

async function fixture(t,kind='basketball'){
 const dir=await mkdtemp(join(tmpdir(),'shared-sport-walls-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let now=100000,sequence=0;
 const map=kind==='range'?{id:'firing-range',spawn:{x:0,y:0,z:16.2},builderScene:{layout:'firing-range',mapSize:64,objects:[]}}:{id:'basketball-arena',spawn:{x:0,y:0,z:0},builderScene:{layout:'basketball-stadium',mapSize:64,objects:[]}};
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const send=(who,action,fields={})=>runtime.command(map.id,map,{accountId:who,username:who,stats:{health:100}},{action,requestId:'wall-action-'+ ++sequence,...fields});
 await send('alice','join');
 if(kind==='basketball'){
  await send('bob','join');await send('alice','basketball-settings',{settings:{teamSize:1,homeHumans:1,awayHumans:1}});await send('alice','basketball-start');
 }
 const edit=change=>store.update(map.id,room=>change(room,room.simulation,room.simulation.actors[BASKETBALL_BALL_ID]));
 const wall=(position=[0,1.2,0],rotation=[0,Math.PI/2,0])=>({id:'shared-wall',materialId:'wall',position,rotation,scale:[1,1,1],revision:1});
 return {map,store,runtime,send,edit,wall,advance:ms=>(now+=ms),now:()=>now};
}

test('shared placed walls block both automatic and forced catches until opened',async t=>{
 const f=await fixture(t);
 await f.edit((room,sim,ball)=>{
  room.objects.wall=f.wall();
  const alice=sim.players['account:alice'],bob=sim.players['account:bob'];
  alice.position={x:-.6,y:.02,z:0};bob.position={x:6,y:.02,z:6};alice.heldId=bob.heldId=null;
  ball.holderId=null;ball.position={x:.6,y:.9,z:0};delete ball.ballVelocity;delete ball.ballCatchSegment;
 });
 let state=await f.send('alice','basketball-auto',{direction:[1,0,0]});
 assert.equal(state.result.resolvedAction,null);assert.equal(state.players['account:alice'].heldId,null);
 await assert.rejects(f.send('alice','catch'),/visible basketball/);
 await f.edit(room=>{room.objects.wall.open=true;room.objects.wall.revision++;});
 state=await f.send('alice','catch');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
});

test('shared placed walls protect a carrier from automatic and forced steals until opened',async t=>{
 const f=await fixture(t);
 await f.edit((room,sim,ball)=>{
  room.objects.wall=f.wall();
  const alice=sim.players['account:alice'],bob=sim.players['account:bob'];
  alice.position={x:-.6,y:.02,z:0};bob.position={x:.6,y:.02,z:0};alice.heldId=null;bob.heldId=ball.id;
  ball.holderId=bob.actorId;ball.position={x:.6,y:1.02,z:0};delete ball.ballVelocity;
 });
 let state=await f.send('alice','basketball-auto',{direction:[1,0,0]});
 assert.equal(state.result.resolvedAction,null);assert.equal(state.actors[BASKETBALL_BALL_ID].holderId,'account:bob');
 await assert.rejects(f.send('alice','basketball-steal'),/visible ball carrier/);
 await f.edit(room=>{room.objects.wall.open=true;room.objects.wall.revision++;});
 state=await f.send('alice','basketball-steal');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
});

test('range scores cannot pass through a shared placed wall, and opening it restores the target',async t=>{
 const f=await fixture(t,'range');await f.send('alice','range-practice');
 await f.edit(room=>{room.objects.wall=f.wall([-14,1.2,0],[0,0,0]);});
 const aim=async()=>{
  const state=await f.runtime.snapshot(f.map.id,f.map),player=state.players['account:alice'],location=state.firingRange.locations[0];
  const target=firingRangeTargetPosition(location,FIRING_RANGE_TARGETS.find(target=>target.id==='paper-0'),f.now(),state.firingRange.settings);
  return [target.x-player.position.x,target.y-player.position.y-1.65,target.z-player.position.z];
 };
 let state=await f.send('alice','fire',{tool:'marksman',direction:await aim()});
 assert.equal(state.result.rangeShot.score,0);assert.equal(state.firingRange.participants['account:alice'].hits,0);
 await f.edit(room=>{room.objects.wall.open=true;room.objects.wall.revision++;});f.advance(1000);
 state=await f.send('alice','fire',{tool:'marksman',direction:await aim()});
 assert.equal(state.result.rangeShot.score,100);assert.equal(state.firingRange.participants['account:alice'].hits,1);
});

test('shared held and flying basketballs stop at placed walls without moving their player',async t=>{
 const f=await fixture(t);
 await f.edit((room,sim,ball)=>{
  room.objects.wall=f.wall([0,1.2,0],[0,0,0]);
  const alice=sim.players['account:alice'],bob=sim.players['account:bob'];
  alice.position={x:0,y:.02,z:.5};alice.yaw=0;bob.position={x:6,y:.02,z:6};alice.heldId=bob.heldId=null;
  ball.holderId=null;ball.position={x:0,y:1.02,z:.5};delete ball.ballVelocity;
 });
 let state=await f.send('alice','catch');
 assert.ok(state.actors[BASKETBALL_BALL_ID].position.z>=.22,'held ball stays in front of the wall');
 assert.deepEqual(state.players['account:alice'].position,{x:0,y:.02,z:.5});
 await f.edit((_room,sim,ball)=>{
  sim.players['account:alice'].heldId=null;sim.players['account:alice'].position={x:5,y:.02,z:6};
  ball.holderId=null;ball.position={x:0,y:1,z:.5};ball.ballVelocity={x:0,y:0,z:-20};ball.ballFloor=0;
 });
 f.advance(100);state=await f.runtime.snapshot(f.map.id,f.map);
 assert.ok(state.actors[BASKETBALL_BALL_ID].position.z>.22,'flying ball bounces on the player side of the wall');
 assert.ok(state.actors[BASKETBALL_BALL_ID].ballVelocity.z>0);
 const player=state.players['account:alice'];
 assert.equal(player.position.x,5);assert.equal(player.position.z,6);assert.ok(Math.abs(player.position.y-.02)<1e-7);
});

test('occlusion checks may exclude the struck shared piece while retaining nearer solid walls',()=>{
 const collision=new ServerBuilderCollision(),map={id:'wall-target-test',builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
 const wall={id:'target-wall',materialId:'wall',position:[0,1.2,0],rotation:[0,0,0],scale:[1,1,1],revision:1};
 const objects={target:wall},origin={x:0,y:1.5,z:3};
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],3,{},objects),true);
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],3,{},objects,wall.id),false,'the target itself must not occlude its own damage check');
 objects.front={...wall,id:'front-wall',position:[0,1.2,1.5]};
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],3,{},objects,wall.id),true,'a separate intervening wall still protects the target');
});
