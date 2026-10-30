import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {airportWorld} from '../airport-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {DOOMSDAY_TIMING as T} from '../public/js/doomsday-rules.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'sporadic-doomsday-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(directory,'rooms.json'));let clock=1000000,sequence=0,samples=0;
 const runtime=new AuthoritativeRooms({store,now:()=>clock,doomsdayRandom:()=>{samples++;return 0;}}),world=airportWorld(),user={accountId:'responder',username:'Responder',stats:{health:100}},id='account:responder';
 const send=(action,fields={})=>{clock+=100;return runtime.command(world.id,world,user,{action,requestId:'sporadic-'+ ++sequence,...fields});};
 // Keep the established connection alive while moving the injected clock.
 const at=async target=>{while(clock<target){clock=Math.min(target,clock+10000);await runtime.command(world.id,world,user,{action:'input',input:{},requestId:'heartbeat-'+ ++sequence});}return runtime.snapshot(world.id,world);};
 return {runtime,world,user,id,send,at,get now(){return clock;},get samples(){return samples;}};
}

test('authoritative rooms schedule once, preserve vehicle/movement, and repeat independently after bounded clearing',async t=>{
 const f=await fixture(t),{runtime,world,id}=f;
 let state=await runtime.snapshot(world.id,world);assert.equal(state.doomsday.phase,'idle');assert.equal(state.doomsday.nextEventAt,null);assert.equal(f.samples,0);
 state=await f.send('join');const due=state.doomsday.nextEventAt;assert.equal(state.doomsday.phase,'idle');assert.equal(due-f.now,T.initialMinMs);assert.equal(f.samples,1);
 state=await f.send('map-access',{entityId:'airport-flight-1'});assert.equal(state.players[id].vehicleId,'airport-flight-1');assert.equal(state.doomsday.nextEventAt,due);assert.equal(f.samples,1);
 for(const operation of ['start','advance','stop'])await assert.rejects(f.send('doomsday',{operation}),/automatically/);
 state=await f.at(due);assert.equal(state.doomsday.phase,'warning');assert.equal(f.samples,2);assert.equal(state.players[id].vehicleId,'airport-flight-1');
 const next=state.doomsday.nextEventAt,first=state.doomsday.startedAt,score=state.players[id].score;
 state=await f.at(state.doomsday.detonationAt);assert.equal(state.doomsday.phase,'detonation');state=await f.at(state.doomsday.falloutAt);assert.equal(state.doomsday.phase,'fallout');
 state=await f.at(state.doomsday.recoveryAt);assert.equal(state.doomsday.phase,'recovery');state=await f.at(state.doomsday.clearingAt);assert.equal(state.doomsday.phase,'clearing');
 state=await f.at(state.doomsday.clearAt);assert.equal(state.doomsday.phase,'all-clear');assert.equal(state.doomsday.completedCount,0,'ignored quests never leave the whole map in fallout');
 assert.equal(state.players[id].score,score);assert.equal(state.players[id].vehicleId,'airport-flight-1');assert.equal(state.doomsday.nextEventAt,next);assert.equal(next-first,T.repeatMinMs);
 state=await f.send('map-access',{position:{x:-78,y:0,z:72}});const before={...state.players[id].position};await f.send('input',{input:{forward:1,yaw:0}});state=await f.send('input',{input:{forward:1,yaw:0}});
 assert.ok(Math.hypot(state.players[id].position.x-before.x,state.players[id].position.z-before.z)>.01);
 state=await f.at(next);assert.equal(state.doomsday.phase,'warning');assert.equal(state.doomsday.cycle,2);assert.equal(state.doomsday.completedCount,0);assert.equal(f.samples,3);
});

test('proximity quests accelerate clearing without resampling; fresh empty destinations arm their own first window',async t=>{
 const f=await fixture(t);let state=await f.send('join');state=await f.at(state.doomsday.nextEventAt);const previousId=state.doomsday.id,next=state.doomsday.nextEventAt;
 state=await f.at(state.doomsday.suppliesReadyAt);
 for(const objectiveId of ['shelter','supplies','recovery']){
  const objective=state.doomsday.objectives.find(item=>item.id===objectiveId);state=await f.send('map-access',{position:objective.position});
  assert.equal(state.doomsday.objectives.find(item=>item.id===objectiveId).completed,true);
 }
 assert.equal(state.doomsday.phase,'clearing');assert.equal(state.doomsday.nextEventAt,next);assert.equal(f.samples,2);state=await f.at(state.doomsday.clearAt);assert.equal(state.doomsday.phase,'all-clear');
 const gym=fitnessWorld();const joined=await f.runtime.command(gym.id,gym,f.user,{action:'join',requestId:'other-destination'});
 assert.equal(joined.doomsday.phase,'idle');assert.equal(joined.doomsday.nextEventAt-f.now,T.initialMinMs);assert.equal(joined.doomsday.startedAt,null);
 state=await f.runtime.snapshot(f.world.id,f.world);assert.equal(state.doomsday.phase,'all-clear','another room does not restart this one');
 // Snapshot without this account's heartbeat expires the empty room schedule.
 const expiredNow=f.now+16000;const nowBefore=f.runtime.now;f.runtime.now=()=>expiredNow;
 state=await f.runtime.snapshot(f.world.id,f.world);assert.equal(state.doomsday.nextEventAt,null);
 const visitor={accountId:'fresh',username:'Fresh',stats:{health:100}};state=await f.runtime.command(f.world.id,f.world,visitor,{action:'join',requestId:'fresh-arrival'});
 assert.equal(state.doomsday.phase,'all-clear');assert.equal(state.doomsday.nextEventAt,expiredNow+T.initialMinMs);assert.equal(state.doomsday.id,previousId,'arming never instantly replays the old catastrophe');f.runtime.now=nowBefore;
});
