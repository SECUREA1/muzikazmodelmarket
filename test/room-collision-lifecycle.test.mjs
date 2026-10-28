import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

test('inactive rooms release collision geometry while live rooms and saved player recovery remain intact',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'room-collision-lifecycle-'));
 let now=100000;
 try{
  const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>now});
  const map=id=>({id,updatedAt:'v1',spawn:{x:0,y:0,z:3},builderScene:{layout:'grand-floor',mapSize:32,objects:[{id:'door',modelId:'portal-door',position:{x:0,y:0,z:0}}]}});
  const a=map('collision-room-a'),b=map('collision-room-b');
  const alice={accountId:'alice',walletId:'alice-wallet',username:'Alice'},bob={accountId:'bob',walletId:'bob-wallet',username:'Bob'};
  const joinRoom=(environment,identity)=>rooms.command(environment.id,environment,identity,{action:'join',requestId:'join-'+identity.accountId,radToxEnabled:false});
  const first=await joinRoom(a,alice),second=await joinRoom(b,bob);
  const oldWorld=rooms.collision.world(a),liveWorld=rooms.collision.world(b);
  let disposed=0;oldWorld.root.traverse(mesh=>mesh.geometry?.addEventListener('dispose',()=>{disposed++;}));
  now+=14000;
  await rooms.command(b.id,b,bob,{action:'input',requestId:'bob-alive',input:{},inputEpoch:second.inputEpoch,inputSequence:1});
  now+=1001;await rooms.tickActive();
  assert.ok(disposed>0,'Idle geometry is disposed instead of retained across map visits.');
  assert.equal(rooms.activeWorlds.has(a.id),false);assert.equal(rooms.activeWorlds.has(b.id),true);
  assert.equal(rooms.collision.world(b),liveWorld,'A live room keeps its collision world without rebuilding.');
  const saved=(await store.get(a.id)).simulation.players['account:alice'];assert.ok(saved);
  const recovered=await rooms.command(a.id,a,alice,{action:'input',requestId:'alice-resume',input:{},inputEpoch:first.inputEpoch,inputSequence:1});
  assert.ok(recovered.players['account:alice']);
  const position=recovered.players['account:alice'].position;
  assert.ok(Math.hypot(position.x-saved.position.x,position.y-saved.position.y,position.z-saved.position.z)<1e-7,'Recovery keeps the saved floor position.');
  assert.notEqual(rooms.collision.world(a),oldWorld,'Returning players rebuild released collision geometry.');
  const stopped=rooms.collision.resolve(a,{x:0,y:.02,z:2},{x:0,y:.02,z:-2});
  assert.ok(stopped.z>0,'Rebuilt geometry still blocks the authored door.');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('snapshot-only rooms release unoccupied collision resources without deleting saved state',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'snapshot-collision-lifecycle-'));
 try{
  const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>100000});
  const environment={id:'unoccupied-preview',updatedAt:'v1',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:32,objects:[]}};
  const snapshot=await rooms.snapshot(environment.id,environment),world=rooms.collision.world(environment);
  let disposed=0;world.root.traverse(mesh=>mesh.geometry?.addEventListener('dispose',()=>{disposed++;}));
  await rooms.tickActive();
  assert.ok(disposed>0,'A preview without players must participate in idle cache cleanup.');
  assert.equal(rooms.activeWorlds.has(environment.id),false);
  assert.deepEqual((await store.get(environment.id)).simulation.actors,snapshot.actors,'Cleanup preserves the saved simulation.');
  assert.notEqual(rooms.collision.world(environment),world);
 }finally{await rm(directory,{recursive:true,force:true});}
});
