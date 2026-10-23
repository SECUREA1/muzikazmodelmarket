import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'open-map-travel-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=airportWorld(),store=new SharedRoomStore(join(directory,'rooms.json'));let now=100000,sequence=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now}),user={accountId:'explorer',username:'Explorer',stats:{health:100}},id='account:explorer';
 const send=(action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'open-travel-'+ ++sequence,...fields});await send('join');
 return {world,store,runtime,id,send,advance(){now+=100;}};
}
test('map selections switch vehicles immediately and reopening your own cockpit preserves its job',async t=>{
 const f=await fixture(t);await f.send('map-access',{entityId:'airport-flight-1'});
 await f.send('vehicle-mission',{operation:'start',questId:'air-mountain-supply'});
 let state=await f.send('map-access',{entityId:'airport-flight-1'});assert.equal(state.players[f.id].vehicleMission.status,'active');
 const quest=state.players[f.id].vehicleMission;
 state=await f.send('map-access',{entityId:'airport-flight-2'});
 assert.equal(state.players[f.id].vehicleId,'airport-flight-2');assert.equal(state.actors['airport-flight-1'].holderId,null);
 assert.equal(state.players[f.id].vehicleMission.status,'cancelled');assert.equal(state.players[f.id].score,0);
 for(const id of quest.npcIds)assert.equal(state.actors[id],undefined,'cancelled jobs leave no stranded objective actors');
});
test('map travel from an airborne aircraft parks the old craft, releases ATC and restores walking',async t=>{
 const f=await fixture(t);await f.send('map-access',{entityId:'airport-flight-1'});
 await f.store.update(f.world.id,room=>{const sim=room.simulation,plane=sim.actors['airport-flight-1'];plane.position={x:80,y:35,z:30};plane.flight={airborne:true,altitude:35,speed:15};sim.players[f.id].position={...plane.position};sim.airport.runwayHolder=f.id;sim.airport.expires=999999;});
 let state=await f.send('map-access',{locationId:'alpine-camp'}),player=state.players[f.id];
 assert.equal(player.vehicleId,null);assert.equal(state.actors['airport-flight-1'].holderId,null);assert.equal(state.actors['airport-flight-1'].flight.airborne,false);assert.equal(state.airport.runwayHolder,null);
 assert.ok(Math.hypot(player.position.x-504,player.position.z+434)<13);
 const before={...player.position};await f.send('input',{input:{forward:1,yaw:0},inputEpoch:state.inputEpoch,inputSequence:1});f.advance();state=await f.send('input',{input:{forward:1,yaw:0},inputEpoch:state.inputEpoch,inputSequence:2});
 assert.ok(state.players[f.id].position.z<before.z,'movement resumes after map travel');
});
test('seats and lifts do not lock map travel, including after a level ends',async t=>{
 const f=await fixture(t),seatId='airport-alpine-fire-seat-north';
 await f.store.update(f.world.id,room=>{const sim=room.simulation;sim.players[f.id].seatedId=seatId;sim.actors[seatId].holderId=f.id;sim.players[f.id].skiLift={id:'test-lift',progress:.2};sim.match={state:'finished',participants:{}};});
 const state=await f.send('map-access',{locationId:'alpine-lodge'});
 assert.equal(state.players[f.id].seatedId,null);assert.equal(state.players[f.id].skiLift,null);assert.equal(state.actors[seatId].holderId,null);
});
test('invalid and occupied selections preserve the current vehicle; server-created player craft are selectable',async t=>{
 const f=await fixture(t);await f.send('map-access',{entityId:'airport-flight-1'});
 await f.store.update(f.world.id,room=>{const sim=room.simulation;sim.actors['airport-flight-2'].holderId='account:other';const base=structuredClone(sim.actors['airport-flight-3']);sim.actors['new-public-craft']={...base,id:'new-public-craft',name:'Public camp shuttle',holderId:null,spawned:true,position:{x:599,y:.4,z:-530}};});
 await assert.rejects(f.send('map-access',{entityId:'missing'}),/unavailable/);await assert.rejects(f.send('map-access',{entityId:'airport-flight-2'}),/Another player/);
 let state=await f.runtime.snapshot(f.world.id,f.world);assert.equal(state.players[f.id].vehicleId,'airport-flight-1');
 state=await f.send('map-access',{entityId:'new-public-craft'});assert.equal(state.players[f.id].vehicleId,'new-public-craft');assert.equal(state.actors['airport-flight-1'].holderId,null);
 await f.store.update(f.world.id,room=>{const plane=room.simulation.actors['new-public-craft'];plane.definition={...plane.definition,objectId:plane.id,transform:{position:{x:599,y:.4,z:-530},rotation:{x:0,y:0,z:0}}};plane.position={x:620,y:35,z:-480};plane.flight={airborne:true,speed:15};});
 state=await f.send('map-access',{locationId:'alpine-lodge'});assert.equal(state.actors['new-public-craft'].flight.airborne,false);assert.equal(state.actors['new-public-craft'].position.y,.4,'spawned aircraft return to their spawn rather than becoming stranded airborne');
});
test('a valid map selection respawns a defeated player without clearing score or saved discoveries',async t=>{
 const f=await fixture(t);await f.store.update(f.world.id,room=>{const player=room.simulation.players[f.id];player.health=0;player.score=123;player.quests={discovery:'complete'};});
 const state=await f.send('map-access',{entityId:'airport-flight-2'}),player=state.players[f.id];
 assert.equal(player.health,100);assert.equal(player.vehicleId,'airport-flight-2');assert.equal(player.score,123);assert.equal(player.quests.discovery,'complete');assert.ok(player.spawnProtectedUntil>state.serverTime);
});
