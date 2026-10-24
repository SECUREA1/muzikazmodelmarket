import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const environment={id:'floor-teleport',proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
test('floor teleport verifies geometry and rejects void, invalid heights and blocked spots',()=>{
 const collision=new ServerBuilderCollision(),origin={x:0,y:0,z:0};
 const point=collision.teleportPosition(environment,origin,{x:5,y:0,z:5});assert.equal(point.x,5);assert.equal(point.z,5);
 for(const point of [{x:500,y:0,z:0},{x:4,y:20,z:3},{x:NaN,y:0,z:0},{x:30,y:0,z:30}])assert.throws(()=>collision.teleportPosition(environment,origin,point));
 const objects={block:{position:[5,1,5],scale:[1,1,1],materialId:'brick'}};
 assert.throws(()=>collision.teleportPosition(environment,origin,{x:5,y:0,z:5},{},objects));
});
test('shared floor teleport is durable, replay-safe and resets walking motion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'floor-teleport-'));let now=100000;
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now});
  const identity={accountId:'alice',username:'Alice',stats:{health:100}};
  const joined=await runtime.command(environment.id,environment,identity,{action:'join',requestId:'join'});
  const previousEpoch=joined.inputEpoch||joined.result.inputEpoch;
  const command={action:'teleport-floor',requestId:'teleport',position:{x:5,y:0,z:5}};
  let state=await runtime.command(environment.id,environment,identity,command);
  const player=state.players['account:alice'];assert.equal(player.position.x,5);assert.equal(player.position.z,5);assert.equal(player.movementRevision,1);assert.deepEqual(player.input,{yaw:0});
  assert.notEqual(state.inputEpoch||state.result.inputEpoch,previousEpoch);
  state=await runtime.command(environment.id,environment,identity,command);assert.equal(state.players['account:alice'].movementRevision,1);
  state=await runtime.command(environment.id,environment,identity,{action:'input',requestId:'late-input',inputEpoch:previousEpoch,inputSequence:100,input:{side:1,forward:1,jump:true}});
  assert.deepEqual(state.players['account:alice'].input,{yaw:0},'in-flight controls from before arrival must stay released');
  now+=50;state=await runtime.snapshot(environment.id,environment);assert.equal(state.players['account:alice'].position.x,5);
 }finally{await rm(dir,{recursive:true,force:true});}
});
