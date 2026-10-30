import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {airportWorld} from '../airport-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {DOOMSDAY_TIMING} from '../public/js/doomsday-rules.js';

test('room arrival automatically starts warning; timed impacts, quests and all-clear preserve vehicles and movement',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'doomsday-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(directory,'rooms.json'));let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now}),world=airportWorld(),user={accountId:'responder',username:'Responder',stats:{health:100}},id='account:responder';
 const send=(action,fields={})=>{now+=100;return runtime.command(world.id,world,user,{action,requestId:'emergency-'+ ++sequence,...fields});};
 assert.equal((await runtime.snapshot(world.id,world)).doomsday.phase,'idle','directory/prefetch cannot trigger an empty map');
 let state=await send('join');assert.equal(state.doomsday.phase,'warning');const started=state.doomsday.startedAt;
 state=await send('map-access',{entityId:'airport-flight-1'});assert.equal(state.players[id].vehicleId,'airport-flight-1');
 for(const operation of ['start','advance','stop'])await assert.rejects(send('doomsday',{operation}),/automatically/);
 const score=state.players[id].score;
 now=started+10000;await send('input',{input:{}});
 now=started+DOOMSDAY_TIMING.warningMs;state=await send('input',{input:{}});assert.equal(state.doomsday.phase,'detonation');assert.equal(state.players[id].vehicleId,'airport-flight-1');
 now=started+DOOMSDAY_TIMING.warningMs+DOOMSDAY_TIMING.detonationMs;state=await send('input',{input:{}});assert.equal(state.doomsday.phase,'fallout');
 assert.equal(state.doomsday.objectives[0].completed,false,'blast timeline never waits for shelter');
 now+=DOOMSDAY_TIMING.falloutSettleMs;
 for(const objectiveId of ['shelter','supplies','recovery']){
  const objective=state.doomsday.objectives.find(item=>item.id===objectiveId);
  state=await send('map-access',{position:objective.position});assert.equal(state.doomsday.objectives.find(item=>item.id===objectiveId).completed,true,'proximity works with no guide/button command');
 }
 assert.equal(state.doomsday.phase,'all-clear');assert.equal(state.players[id].score,score);
 const before={...state.players[id].position};await send('input',{input:{forward:1,yaw:0}});now+=150;state=await send('input',{input:{forward:1,yaw:0}});
 assert.ok(Math.hypot(state.players[id].position.x-before.x,state.players[id].position.z-before.z)>.01);
 const gym=fitnessWorld(),joined=await runtime.command(gym.id,gym,user,{action:'join',requestId:'another-map'});
 assert.equal(joined.doomsday.phase,'warning');assert.notEqual(joined.doomsday.id,state.doomsday.id);
 assert.equal((await runtime.snapshot(world.id,world)).doomsday.phase,'all-clear');
 now+=16000;assert.equal((await runtime.snapshot(world.id,world)).doomsday.phase,'all-clear','empty expired room remains quiet');
 const newVisitor={accountId:'next-visitor',username:'Next visitor',stats:{health:100}};
 const next=await runtime.command(world.id,world,newVisitor,{action:'join',requestId:'fresh-occupied-room'});
 assert.equal(next.doomsday.phase,'warning');assert.equal(next.doomsday.completedCount,0);assert.notEqual(next.doomsday.id,state.doomsday.id);
});
