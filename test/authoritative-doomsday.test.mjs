import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {airportWorld} from '../airport-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';

test('authoritative emergency is shared per room, validates checkpoints, and preserves aircraft, walking and scores',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'doomsday-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(directory,'rooms.json'));let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now}),world=airportWorld(),user={accountId:'responder',username:'Responder',stats:{health:100}},id='account:responder';
 const send=(action,fields={})=>{now+=100;return runtime.command(world.id,world,user,{action,requestId:'emergency-'+ ++sequence,...fields});};
 let state=await send('join');assert.equal(state.doomsday.phase,'idle');
 await send('map-access',{entityId:'airport-flight-1'});state=await send('doomsday',{operation:'start'});
 assert.equal(state.players[id].vehicleId,'airport-flight-1');assert.equal(state.doomsday.phase,'warning');
 const failedRevision=state.doomsday.revision;await assert.rejects(send('doomsday',{operation:'advance'}),/Complete this phase/);
 state=await runtime.snapshot(world.id,world);assert.equal(state.doomsday.revision,failedRevision);
 const startScore=state.players[id].score;
 for(const phase of ['warning','fallout','recovery']){
  const objective=state.doomsday.objectives.find(item=>item.phase===phase);
  await send('map-access',{position:objective.position});
  state=await send('doomsday',{operation:'objective',objectiveId:objective.id});assert.equal(state.doomsday.canAdvance,true);
  const other=await runtime.snapshot(world.id,world);assert.equal(other.doomsday.completedCount,state.doomsday.completedCount);
  state=await send('doomsday',{operation:'advance'});
 }
 assert.equal(state.doomsday.phase,'all-clear');assert.equal(state.players[id].score,startScore);
 const before={...state.players[id].position};await send('input',{input:{forward:1,yaw:0}});now+=150;state=await send('input',{input:{forward:1,yaw:0}});
 assert.ok(Math.hypot(state.players[id].position.x-before.x,state.players[id].position.z-before.z)>.01,'walking remains enabled after scenario');
 const gym=fitnessWorld(),joined=await runtime.command(gym.id,gym,user,{action:'join',requestId:'another-map'});
 assert.equal(joined.doomsday.phase,'idle','each destination has its own response state');
 state=await runtime.command(gym.id,gym,user,{action:'doomsday',operation:'start',requestId:'gym-emergency'});assert.equal(state.doomsday.phase,'warning');
 assert.equal((await runtime.snapshot(world.id,world)).doomsday.phase,'all-clear');
});
