import {RAD_TOX_RESULTS_PAUSE_MS} from '../public/js/rad-tox-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
test('server ticks chase and attack without client commands and retire empty rooms',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'simulation-timer-'));let now=100000;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  runtime.collision.blocksShot=()=>false;runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const map={id:'house',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:-3.5,z:0}},identity={accountId:'alice',username:'Alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  const before=await store.get(map.id),first=Object.values(before.simulation.actors).find(actor=>actor.radTox),start=first.position.z;
  for(let i=0;i<60;i++){now+=100;await runtime.tickActive();}
  const after=await store.get(map.id);assert.ok(after.simulation.actors[first.id].position.z>start);assert.ok(after.simulation.players['account:alice'].health<100,'AI attacks continue while the client is not sending controls');
  await store.update(map.id,room=>{room.simulation.radTox.wave=4;for(const actor of Object.values(room.simulation.actors))actor.active=false;const player=room.simulation.players['account:alice'];player.health=100;player.lastSeen=now;});
  now+=100;await runtime.tickActive();let state=(await store.get(map.id)).simulation;const completed=state.match.id;assert.equal(state.match.state,'finished');
  now+=RAD_TOX_RESULTS_PAUSE_MS-1;await runtime.tickActive();assert.equal((await store.get(map.id)).simulation.match.id,completed);
  now++;await runtime.tickActive();state=(await store.get(map.id)).simulation;assert.notEqual(state.match.id,completed);assert.equal(state.radTox.level,2);assert.ok(Object.values(state.actors).filter(actor=>actor.radTox).every(actor=>actor.position.y===-3.5),'new enemies stay at the authoritative floor height');
  now+=16000;await runtime.tickActive();assert.equal(runtime.activeWorlds.size,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

