import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('starting RAD-TOX in a GLB house creates one shared encounter with enemies, combat and progressing waves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-server-'));let now=100000,request=0;
 try {
  const file=join(dir,'rooms.json'),store=new SharedRoomStore(file),rewards=[];
  const runtime=new AuthoritativeRooms({store,now:()=>now,reward:async(...args)=>rewards.push(args)});
  const environment={id:'muzikaz-main',name:'House',modelUrl:'/house.glb',playable:true,spawn:{x:0,y:1,z:2}};
  const alice={accountId:'alice',walletId:'alice',username:'Alice',stats:{health:100}};
  const bob={...alice,accountId:'bob',walletId:'bob',username:'Bob'};
  const send=(action,fields={},identity=alice)=>runtime.command(environment.id,environment,identity,{action,requestId:'campaign-'+ ++request,...fields});
  let state=await send('join');assert.equal(state.radTox,null,'joining a map alone is not a started game');
  state=await send('start-rad-tox');assert.equal(state.radTox.level,1);assert.equal(state.radTox.wave,1);
  const enemies=Object.values(state.actors).filter(actor=>actor.radTox);
  assert.equal(enemies.length,8);assert.ok(enemies.every(actor=>actor.active&&actor.health>0));
  assert.deepEqual(new Set(enemies.map(actor=>actor.kind)),new Set(['toxic','ghost','snake','brain']));
  await send('join',{},bob);state=await send('start-rad-tox',{},bob);
  assert.equal(Object.keys(state.actors).length,8,'a second player shares the existing wave');
  const first=state.actors[enemies[0].id],before=first.position.z;
  now+=250;state=await runtime.snapshot(environment.id,environment);
  assert.ok(state.actors[first.id].position.z>before,'enemies actively chase the player');
  const initialHealth=state.players['account:alice'].health;
  for(let tick=0;tick<28;tick++){now+=250;state=await send('input',{input:{}});}
  assert.ok(state.players['account:alice'].health<initialHealth,'nearby enemies damage the player on the server');
  for(let wave=1;wave<=4;wave++) {
   state=await runtime.snapshot(environment.id,environment);
   assert.equal(state.radTox.wave,wave);
   if(wave===4)assert.equal(Object.values(state.actors).find(actor=>actor.active).kind,'boss');
   // Fire actual authoritative laser commands; never submit a client hit ID or damage.
   for(const id of Object.keys(state.actors))while(state.actors[id]?.active) {
    if(state.players['account:alice'].health<=0)state=await send('respawn');
    const target=state.actors[id],player=state.players['account:alice'];
    const direction=[target.position.x-player.position.x,target.position.y+1-(player.position.y+1.5),target.position.z-player.position.z];
    now+=250;state=await send('fire',{tool:'laser',direction});
   }
   now+=1;state=await send('input',{input:{}});assert.equal(state.radTox.state,'cleared');
   now+=1600;await send('input',{input:{}});state=await runtime.snapshot(environment.id,environment);
  }
  assert.equal(state.radTox.level,2);assert.equal(state.radTox.wave,1);assert.ok(state.radTox.remaining>0);
  assert.ok(state.players['account:alice'].score>0);assert.ok(rewards.some(args=>args[1]==='defeat'));
  const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});
  // Input snapshots are intentionally transient; persist the current encounter with a start command.
  await send('start-rad-tox');
  const restored=await reloaded.snapshot(environment.id,environment);
  assert.equal(restored.radTox.level,2);assert.equal(restored.radTox.targetCount,state.radTox.targetCount);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('Builder rooms keep their authored gameplay instead of receiving a house campaign',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-builder-'));
 try {
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
  const map={id:'builder',builderScene:{objects:[]}},identity={accountId:'alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  const state=await runtime.command(map.id,map,identity,{action:'start-rad-tox',requestId:'start'});
  assert.equal(state.radTox,null);assert.deepEqual(state.actors,{});
 }finally{await rm(dir,{recursive:true,force:true});}
});
