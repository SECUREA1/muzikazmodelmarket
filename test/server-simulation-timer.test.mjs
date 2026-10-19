import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

test('server ticks advance player movement and shared wave clocks without enemy simulation, then retire empty rooms',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'simulation-timer-'));let now=100000;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const map={id:'house',modelUrl:'/fixture.glb',spawn:{x:0,y:-3.5,z:0}},identity={accountId:'alice',username:'Alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  await runtime.command(map.id,map,identity,{action:'input',requestId:'move',input:{forward:1,yaw:0}});
  const before=(await store.get(map.id)).simulation,start=before.players['account:alice'].position.z;
  for(let i=0;i<5;i++){now+=100;await runtime.tickActive();}
  let state=(await store.get(map.id)).simulation;
  assert.ok(state.players['account:alice'].position.z<start-1,'autonomous room ticks apply the last accepted movement input');
  assert.equal(state.players['account:alice'].health,100);assert.deepEqual(state.actors,{});assert.deepEqual(state.projectiles,{});
  const keepPresence=()=>store.update(map.id,room=>{const player=room.simulation.players['account:alice'];player.lastSeen=now;player.input={};},{persist:false});
  for(let wave=1;wave<=4;wave++){
   state=(await store.get(map.id)).simulation;assert.equal(state.radTox.wave,wave);const phase=state.radTox.phaseId;
   now=state.radTox.endsAt-1;await keepPresence();await runtime.tickActive();assert.equal((await store.get(map.id)).simulation.radTox.state,'active');
   now++;await runtime.tickActive();state=(await store.get(map.id)).simulation;assert.equal(state.radTox.state,'cleared');assert.equal(state.radTox.transition.at,now+10000);
   now+=9999;await keepPresence();await runtime.tickActive();assert.equal((await store.get(map.id)).simulation.radTox.phaseId,phase,'the results countdown cannot be skipped');
   now++;await runtime.tickActive();state=(await store.get(map.id)).simulation;assert.notEqual(state.radTox.phaseId,phase);
   assert.deepEqual(state.actors,{});assert.deepEqual(state.projectiles,{});assert.equal(state.players['account:alice'].health,100);
  }
  assert.equal(state.radTox.wave,5);assert.equal(state.radTox.phaseKind,'boss');assert.equal(state.radTox.endsAt,null);
  await store.update(map.id,room=>{const sim=room.simulation;sim.radTox.localProgress['account:alice']={phaseId:sim.radTox.phaseId,bossDefeated:true};});
  now+=100;await runtime.tickActive();state=(await store.get(map.id)).simulation;const completed=state.match.id;assert.equal(state.match.outcome,'victory');
  now+=9999;await keepPresence();await runtime.tickActive();assert.equal((await store.get(map.id)).simulation.match.id,completed);
  now++;await runtime.tickActive();state=(await store.get(map.id)).simulation;assert.notEqual(state.match.id,completed);assert.equal(state.radTox.level,2);assert.equal(state.radTox.environmentId,'muzikaz-upper');
  assert.ok(state.radTox.transferId,'the room directs every participant to the next authored map');assert.deepEqual(state.actors,{});
  now+=16000;await runtime.tickActive();assert.equal(runtime.activeWorlds.size,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
