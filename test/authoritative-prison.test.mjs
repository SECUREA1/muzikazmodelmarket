import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {PRISON_ID,PRISON_CELLS,PRISON_STATIONS,PRISON_NPCS} from '../public/js/prison-config.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {ensurePrison,syncPrisonDoors} from '../server-prison.mjs';

const station=id=>PRISON_STATIONS.find(value=>value.id===id);
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'authoritative-prison-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'rooms.json'),catalog=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const world=catalog.find(value=>value.id===PRISON_ID);assert.ok(world);
 let now=1_000_000,sequence=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});
 const identity={accountId:'prison-player',username:'Prison Player',walletId:'account:prison-player'};
 const send=(action,fields={},who=identity)=>{now+=500;return runtime.command(PRISON_ID,world,who,{action,requestId:'prison-'+ ++sequence,...fields});};
 const move=async(id,who=identity)=>runtime.store.update(PRISON_ID,room=>{const p=room.simulation.players['account:'+who.accountId];p.position={...station(id).position,y:.02};p.floor=.02;p.grounded=true;p.velocityY=0;p.input={};p.lastSeen=now;});
 const change=fn=>runtime.store.update(PRISON_ID,room=>fn(room.simulation));
 return {runtime,world,identity,file,send,move,change,get now(){return now;},advance:ms=>now+=ms};
}

test('prison joins the shared room with real door states, isolated challenges and protected travel rules',async t=>{
 const f=await fixture(t),joined=await f.send('join');
 assert.equal(joined.radTox,null);assert.equal(joined.match,null);assert.equal(joined.players[joined.selfId].radToxEnabled,false);
 assert.equal(Object.keys(joined.prison.cells).length,24);assert.equal(Object.keys(joined.prison.npcs).length,PRISON_NPCS.length);assert.equal(joined.population.aiCount,PRISON_NPCS.length);
 assert.equal(joined.building.enabled,false);
 assert.ok(!Object.values(joined.actors).some(actor=>actor.radTox||actor.loot||actor.runtimeMachine||actor.roadFleet||actor.trafficAI));
 await assert.rejects(f.send('prison-action',{operation:'meal',stationId:'meal',position:station('meal').position,tokens:9999}),/Walk closer/);
 await assert.rejects(f.send('teleport-floor',{position:station('escape').position}),/walking routes/);
 await assert.rejects(f.send('map-access',{position:station('escape').position}),/walking routes/);
 await assert.rejects(f.send('fire',{tool:'jetpack'}),/walking routes/);
 await assert.rejects(f.send('building-settings',{enabled:true}),/walking routes/);
 assert.equal((await f.runtime.snapshot(PRISON_ID,f.world)).prison.players[joined.selfId].tokens,0);
});

test('prison meals validate server position, reward once and persist across rejoin and process restart',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId;await f.move('meal');
 const fields={operation:'meal',stationId:'meal',requestId:'same-meal',tokens:99999,inventory:['keycard']};
 const meal=await f.send('prison-action',fields),tokens=meal.prison.players[id].tokens;
 assert.equal(tokens,5);assert.deepEqual(meal.prison.players[id].inventory,[]);assert.ok(meal.prison.players[id].completed.includes('meal'));
 const replay=await f.send('prison-action',fields);assert.equal(replay.prison.players[id].tokens,tokens);
 await assert.rejects(f.send('prison-action',{operation:'meal',stationId:'meal'}),/next hot tray/);
 await f.runtime.store.flush();f.advance(2000);
 const restarted=new AuthoritativeRooms({store:new SharedRoomStore(f.file),now:()=>f.now});
 const restored=await restarted.command(PRISON_ID,f.world,f.identity,{action:'join',requestId:'restarted-prison'});
 assert.equal(restored.prison.players[id].tokens,tokens);assert.ok(restored.prison.players[id].completed.includes('meal'));
});

test('guard lockdown is shared, prisoner permissions hold and lock changes update native collision actors',async t=>{
 const f=await fixture(t),first=await f.send('join'),id=first.selfId,other={accountId:'prison-second',username:'Second',walletId:'account:prison-second'};
 await f.send('join',{},other);await f.move('intake');
 await f.send('prison-action',{operation:'role-guard',stationId:'intake'});await f.move('security');
 const locked=await f.send('prison-action',{operation:'lockdown',stationId:'security'});
 assert.ok(Object.values(locked.prison.cells).every(cell=>cell.locked));
 assert.equal(locked.actors['prison-door-'+PRISON_CELLS[0].id].open,false);
 await f.move('security',other);await assert.rejects(f.send('prison-action',{operation:'all-unlock',stationId:'security'},other),/Only the guard/);
 const released=await f.send('prison-action',{operation:'all-unlock',stationId:'security'});
 assert.ok(Object.values(released.prison.cells).every(cell=>!cell.locked));assert.equal(released.prison.players[id].role,'guard');
 assert.equal(released.actors['prison-door-'+PRISON_CELLS[0].id].open,true);
});

test('escape requires contraband puzzles, a timed physical gate and reaching the finish',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId;await f.move('gate');
 await assert.rejects(f.send('prison-action',{operation:'escape',stationId:'gate',inventory:['pass']}),/maintenance pass/);
 await f.move('stash');await f.send('prison-action',{operation:'theft',stationId:'stash'});
 await f.change(sim=>{for(const npc of Object.values(sim.prison.npcs))if(npc.role==='guard')npc.position={x:0,y:.02,z:-100};});
 await f.move('security');await assert.rejects(f.send('prison-action',{operation:'keycard',stationId:'security',input:'000'}),/three-digit code/);
 await f.send('prison-action',{operation:'keycard',stationId:'security',input:'314'});
 await f.move('vent');await f.send('prison-action',{operation:'vent',stationId:'vent'});
 await f.move('gate');const opened=await f.send('prison-action',{operation:'escape',stationId:'gate'});
 assert.equal(opened.prison.players[id].escaped,false);assert.equal(opened.actors['prison-gate-service'].open,true);
 await f.move('escape');const finished=await f.send('prison-action',{operation:'escape',stationId:'escape'});
 assert.equal(finished.prison.players[id].escaped,true);assert.ok(finished.prison.players[id].completed.includes('escape'));
 assert.ok(finished.players[id].position.z>109);
});

test('locked authored cell bars and service gate stop walking, open states allow passage',async t=>{
 const f=await fixture(t),collision=new ServerBuilderCollision(),sim={players:{},actors:{}};ensurePrison(sim,f.world,f.now);
 const cell=PRISON_CELLS[0],start={x:cell.door.x,y:.02,z:cell.door.z+2},end={...start,z:cell.door.z-2};
 sim.prison.cells[cell.id].locked=true;syncPrisonDoors(sim,f.now);
 const closed=collision.resolve(f.world,start,end,sim.actors);assert.ok(closed.z>cell.door.z+.25,'locked cell blocks crossing its bars');
 sim.prison.cells[cell.id].locked=false;syncPrisonDoors(sim,f.now);
 const open=collision.resolve(f.world,start,end,sim.actors);assert.ok(open.z<cell.door.z-1,'unlocked bars allow crossing');
 const gateStart={x:0,y:.02,z:107},gateEnd={x:0,y:.02,z:111};
 assert.ok(collision.resolve(f.world,gateStart,gateEnd,sim.actors).z<109,'closed service gate blocks escape');
 sim.prison.gateOpen=true;sim.prison.gateOpenUntil=f.now+15000;syncPrisonDoors(sim,f.now);
 assert.ok(collision.resolve(f.world,gateStart,gateEnd,sim.actors).z>110,'timed release opens the physical gate');
});

test('guards respect solid bars and detention clears contraband with a timed cell consequence',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId,cell=PRISON_CELLS[0];
 await f.change(sim=>{
  const player=sim.players[id];player.position={x:cell.door.x,y:.02,z:cell.door.z-1};player.grounded=true;
  Object.assign(sim.prison.players[id],{cellId:cell.id,heat:80,tokens:10,inventory:['wire','map']});
  sim.prison.cells[cell.id].locked=true;
  for(const npc of Object.values(sim.prison.npcs))if(npc.role==='guard')npc.position={x:0,y:.02,z:-100};
  const guard=Object.values(sim.prison.npcs).find(npc=>npc.role==='guard');guard.position={x:cell.door.x,y:.02,z:cell.door.z+1};
 });
 f.advance(500);const protectedView=await f.runtime.snapshot(PRISON_ID,f.world);
 assert.equal(protectedView.prison.players[id].caughtUntil,0,'bars prevent detention through a closed door');
 await f.change(sim=>{sim.prison.cells[cell.id].locked=false;});f.advance(500);
 const caught=await f.runtime.snapshot(PRISON_ID,f.world),progress=caught.prison.players[id];
 assert.ok(progress.caughtUntil>f.now);assert.equal(progress.tokens,5);assert.deepEqual(progress.inventory,[]);
 assert.equal(caught.prison.cells[cell.id].locked,true);assert.ok(Math.abs(caught.players[id].position.z-cell.position.z)<.1);
 f.advance(16000);await f.send('input',{input:{forward:0,yaw:0},inputEpoch:joined.inputEpoch,inputSequence:1});
 const released=await f.runtime.snapshot(PRISON_ID,f.world);
 assert.equal(released.prison.players[id].caughtUntil,0);assert.equal(released.prison.cells[cell.id].locked,false);
});
