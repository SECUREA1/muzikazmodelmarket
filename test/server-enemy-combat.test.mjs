import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {createSharedEnemyEffects} from '../public/js/shared-enemy-effects.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('stale server enemies and projectiles are removed before RAD-TOX room simulation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'local-enemies-'));let now=100000;
 try{
  const map={id:'local-house',modelUrl:'/fixture.glb',spawn:{x:0,y:0,z:0}},store=new SharedRoomStore(join(dir,'rooms.json'));
  const runtime=new AuthoritativeRooms({store,now:()=>now});runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const identity={accountId:'alice',username:'Alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  await store.update(map.id,room=>{
   const sim=room.simulation;
   for(const kind of ['toxic','snake','ghost','brain','boss'])sim.actors[kind]={id:kind,kind,radTox:true,active:true,health:100,position:{x:0,y:0,z:0},definition:{objectId:kind,gameplay:{behavior:'hostile',damage:10},movement:{speed:3},ai:{detectionRange:40}}};
   sim.projectiles={old:{id:'old',kind:'ghost',actorId:'ghost',position:{x:0,y:.9,z:0},velocity:[0,0,6],expiresAt:now+10000}};
   sim.events.push({id:'old-attack',action:'enemy-attack',kind:'ghost',actorId:'ghost',at:now});
  });
  for(let index=0;index<20;index++){now+=100;await runtime.tickActive();}
  const state=await runtime.snapshot(map.id,map);
  assert.deepEqual(state.actors,{});assert.deepEqual(state.projectiles,{});assert.equal(state.players['account:alice'].health,100);
  assert.equal(state.players['account:alice'].combat.hitsTaken,0);assert.ok(!state.events.some(event=>['enemy-attack','enemy-hit'].includes(event.action)));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('authored Builder enemies retain their own server gameplay outside the local campaign',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builder-enemies-'));let now=100000;
 try{
  const map={id:'builder',builderScene:{objects:[]},spawn:{x:0,y:0,z:0}},store=new SharedRoomStore(join(dir,'rooms.json'));
  const runtime=new AuthoritativeRooms({store,now:()=>now});runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const identity={accountId:'alice',username:'Alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  await store.update(map.id,room=>{
   const player=room.simulation.players['account:alice'];player.spawnProtectedUntil=0;
   room.simulation.actors.hostile={id:'hostile',spawned:true,active:true,health:100,position:{x:0,y:0,z:.5},rotation:{y:0},definition:{objectId:'hostile',position:{x:0,y:0,z:.5},gameplay:{behavior:'hostile',damage:10},movement:{speed:2},ai:{detectionRange:10}}};
  });
  now+=100;await runtime.tickActive();const state=await runtime.snapshot(map.id,map);
  assert.equal(state.radTox,null);assert.ok(state.actors.hostile.position.z<.5);assert.ok(state.players['account:alice'].health<100);assert.equal(state.players['account:alice'].combat.hitsTaken,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('shared projectile visuals interpolate and remove expired effects without deciding damage',()=>{
 const scene=new THREE.Scene();let now=0;const effects=createSharedEnemyEffects({THREE,scene,resources:()=>({}),now:()=>now});
 const snapshot={projectiles:{gas:{id:'gas',kind:'ghost',position:{x:0,y:1,z:0},velocity:[0,0,6]}}};effects.sync(snapshot);assert.equal(scene.children.length,1);now=100;effects.update(.1);assert.ok(scene.children[0].position.z>0);effects.sync({projectiles:{}});assert.equal(scene.children.length,0);effects.clear();
});
