import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {spawnRadToxWave} from '../rad-tox-campaign.mjs';

// No collision stubs: exercise the same main-house GLB used by the public URL.
test('real house multiplayer enemies spawn in sight, move, shoot, damage and survive room reload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'real-house-'));let now=100000;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  const map={id:'muzikaz-main',modelUrl:'/public/models/environments/muzimakzmain.glb',playableSize:32,spawn:{x:0,y:1,z:2}};
  const send=(name,action,fields={})=>runtime.command(map.id,map,{accountId:name,username:name,stats:{health:100}},{action,requestId:`${name}-${action}-${now}`,...fields});
  await send('alice','join');let snapshot=await send('bob','join');
  const initial=structuredClone(snapshot.actors),player=snapshot.players['account:alice'];
  assert.ok(runtime.collision.hasBodyClearance(map,player.position,.8),'startup leaves space beside walls');
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,p=player.position,next=runtime.collision.resolve(map,p,{x:p.x+Math.cos(angle)*.5,y:p.y-.04,z:p.z+Math.sin(angle)*.5});assert.ok(Math.hypot(next.x-p.x,next.z-p.z)>.45,'startup permits walking in every direction');}
  const floor=runtime.collision.groundAt(map,player.position);assert.ok(floor&&Math.abs(floor.y-player.position.y)<.03,'player feet remain on the calibrated floor');
  for(const actor of Object.values(initial).filter(actor=>actor.radTox)){
   const origin={...actor.position,y:actor.position.y+.9},delta=[player.position.x-origin.x,player.position.y+.9-origin.y,player.position.z-origin.z],length=Math.hypot(...delta);
   assert.equal(runtime.collision.blocksShot(map,origin,delta.map(n=>n/length),length),false,`${actor.kind} spawns in the same visible room`);
   assert.equal(actor.spawnVersion,2);
   assert.equal(actor.pendingSpawn,false);assert.ok(Math.hypot(actor.position.x-player.position.x,actor.position.z-player.position.z)>=4,'enemies begin outside the entry area');
   assert.ok(Math.abs(actor.position.y-player.position.y)<.6,'enemies start on the same playable storey');
  }
  const attacks=new Set(),projectiles=new Set();
  for(let index=0;index<65;index++){
   now+=100;await runtime.tickActive();const sim=(await store.get(map.id)).simulation;
   for(const event of sim.events)if(event.action==='enemy-attack')attacks.add(event.kind);
   for(const projectile of Object.values(sim.projectiles||{}))projectiles.add(projectile.kind);
  }
  snapshot=await runtime.snapshot(map.id,map);
  for(const actor of Object.values(snapshot.actors).filter(actor=>actor.radTox))assert.ok(Math.hypot(actor.position.x-initial[actor.id].position.x,actor.position.z-initial[actor.id].position.z)>.1,`${actor.kind} moves on autonomous server ticks`);
  for(const kind of ['ghost','brain']){assert.ok(attacks.has(kind));assert.ok(projectiles.has(kind));}
  assert.ok(Object.values(snapshot.players).some(player=>player.health<100),'actual server projectiles/contact attacks cause damage');
  const second=await send('bob','input',{input:{}});assert.deepEqual(second.actors,snapshot.actors,'both clients observe the same enemies');
  await store.update(map.id,room=>{const sim=room.simulation;sim.radTox.wave=4;spawnRadToxWave(sim,now,sim.players['account:alice'].position);});
  now+=100;await runtime.tickActive();const bossStart=Object.values((await store.get(map.id)).simulation.actors).find(actor=>actor.radTox).position;
  for(let index=0;index<20;index++){now+=100;await runtime.tickActive();}
  const sim=(await store.get(map.id)).simulation,boss=Object.values(sim.actors).find(actor=>actor.radTox);
  assert.ok(Math.hypot(boss.position.x-bossStart.x,boss.position.z-bossStart.z)>.1,'boss moves');
  assert.ok(sim.events.some(event=>event.action==='enemy-attack'&&event.kind==='boss'),'boss fires');
  await store.flush();const restored=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});
  const reloaded=await restored.snapshot(map.id,map);assert.equal(reloaded.radTox.wave,4);assert.deepEqual(reloaded.actors[boss.id].position,boss.position);
 }finally{await rm(dir,{recursive:true,force:true});}
});
