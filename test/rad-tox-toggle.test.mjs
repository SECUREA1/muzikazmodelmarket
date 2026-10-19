import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('RAD-TOX opt-out protects an explorer while another player keeps the encounter running',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-toggle-'));let now=100000,request=0;
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now});
  runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.blocksShot=()=>false;runtime.collision.resolve=(_,previous,next)=>next;runtime.collision.resolvePlaced=(_,previous,next)=>next;
  const map={id:'toggle-house',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:0,z:0}};
  const alice={accountId:'alice',walletId:'alice',username:'Alice',stats:{health:100}};
  const bob={...alice,accountId:'bob',walletId:'bob',username:'Bob'};
  const send=(identity,action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'toggle-'+ ++request,...fields});
  await send(alice,'join');await send(alice,'rad-tox-toggle',{enabled:false});await send(bob,'join');await send(bob,'start-rad-tox');
  await runtime.store.update(map.id,room=>{const bob=room.simulation.players['account:bob'];bob.spawnProtectedUntil=0;const snake=Object.values(room.simulation.actors).find(actor=>actor.radTox&&actor.kind==='snake');snake.position={...bob.position,z:bob.position.z+.5};});
  let state;
  for(let tick=0;tick<32;tick++){now+=250;state=await send(alice,'input',{input:{}});await send(bob,'input',{input:{}});}
  assert.equal(state.players['account:alice'].health,100,'disabled players are excluded from enemy targets');
  assert.ok(state.players['account:bob'].health<100,'enabled players still receive real enemy attacks');
  assert.ok(Object.values(state.actors).some(actor=>actor.radTox&&actor.active),'the shared encounter continues');
  state=await send(alice,'rad-tox-toggle',{enabled:true});assert.equal(state.players['account:alice'].radToxEnabled,true);
  state=await send(alice,'rad-tox-toggle',{enabled:false});assert.equal(state.players['account:alice'].radToxEnabled,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
