import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {spawnRadToxWave} from '../rad-tox-campaign.mjs';

// No collision stubs: exercise the same main-house GLB used by the public URL.
test('real house multiplayer shares players, timed stages and tournament scores without server enemies',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'real-house-'));let now=100000,request=0;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  const map={id:'muzikaz-main',modelUrl:'/public/models/environments/muzimakzmain.glb',playableSize:32,spawn:{x:0,y:1,z:2}};
  const send=(name,action,fields={})=>runtime.command(map.id,map,{accountId:name,username:name,stats:{health:100}},{action,requestId:`real-house-${++request}`,...fields});
  await send('alice','join');let snapshot=await send('bob','join');
  const phase=snapshot.radTox.phaseId,deadline=snapshot.radTox.endsAt,matchId=snapshot.match.id;
  assert.equal(snapshot.radTox.combatMode,'local');assert.equal(deadline-now,120000);assert.equal(Object.keys(snapshot.players).length,2);
  assert.deepEqual(snapshot.actors,{},'local enemies and pickups never become server actors');
  assert.ok(runtime.collision.world(map).floors.length>0,'the actual GLB collision world is loaded');
  for(const player of Object.values(snapshot.players))assert.ok(Object.values(player.position).every(Number.isFinite),'both players spawn at valid positions');
  for(let index=0;index<65;index++){now+=100;await runtime.tickActive();}
  snapshot=await runtime.snapshot(map.id,map);
  assert.equal(snapshot.radTox.phaseId,phase);assert.deepEqual(snapshot.projectiles,{});assert.deepEqual(snapshot.actors,{});
  assert.ok(Object.values(snapshot.players).every(player=>player.health===100),'the server does not replay local enemy attacks');
  assert.ok(!snapshot.events.some(event=>['enemy-attack','enemy-hit'].includes(event.action)));
  await assert.rejects(send('alice','fire',{tool:'laser',direction:[0,0,-1]}),{statusCode:409},'local combat does not incur a server raycast command');
  snapshot=await send('alice','rad-tox-progress',{matchId,phaseId:phase,sequence:1,stats:{shots:3,hits:2,misses:1,enemyHits:2,enemyKills:1,score:10,damageDealt:100},health:100});
  assert.equal(snapshot.players['account:alice'].score,10);assert.equal(snapshot.tournament.results[0].score,10);
  const second=await send('bob','input',{input:{}});assert.equal(second.radTox.phaseId,phase);assert.deepEqual(second.tournament,snapshot.tournament,'each client sees the same accepted standings');
  now=deadline-1000;await send('alice','join');await send('bob','join');now=deadline;snapshot=await send('alice','input',{input:{}});
  assert.equal(snapshot.radTox.state,'cleared');assert.equal(snapshot.radTox.transition.at,now+10000);
  now+=10000;snapshot=await send('alice','input',{input:{}});assert.equal(snapshot.radTox.wave,2);assert.equal(snapshot.radTox.endsAt-now,120000);
  await store.update(map.id,room=>{const sim=room.simulation;sim.radTox.wave=5;spawnRadToxWave(sim,now,sim.players['account:alice'].position);});
  snapshot=await runtime.snapshot(map.id,map);assert.equal(snapshot.radTox.phaseKind,'boss');assert.equal(snapshot.radTox.bossKind,'bee');assert.deepEqual(snapshot.actors,{});assert.deepEqual(snapshot.projectiles,{});
  const bossPhase=snapshot.radTox.phaseId;
  await store.flush();const restored=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});
  const reloaded=await restored.snapshot(map.id,map);assert.equal(reloaded.radTox.wave,5);assert.equal(reloaded.radTox.phaseId,bossPhase);assert.equal(reloaded.tournament.results[0].score,10);assert.deepEqual(reloaded.actors,{});
 }finally{await rm(dir,{recursive:true,force:true});}
});
