import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

async function fixture(){
 // Keep the actual room transaction and cloning boundaries, without testing
 // the disk journal again for every physics input frame.
 const store=new SharedRoomStore(join(tmpdir(),'emergency-departure-'+randomUUID()+'.json'));store.data={};store.persist=async()=>{};
 let now=1000000,sequence=0;
 const world=airportWorld(),identity={accountId:'response-pilot',username:'Response pilot'},id='account:response-pilot';
 const runtime=new AuthoritativeRooms({store,now:()=>now,doomsdayRandom:()=>0});
 const send=(action,fields={},elapsed=100)=>{now+=elapsed;return runtime.command(world.id,world,identity,{action,requestId:'departure-'+ ++sequence,...fields});};
 await send('join');
 return {runtime,store,world,id,identity,send,get now(){return now;},advance:elapsed=>{now+=elapsed;}};
}

for(const aircraftId of ['airport-command-flight','airport-evacuation-flight'])test(aircraftId+' starts once, animates physical taxi and keeps the emergency schedule and controls',async()=>{
 const f=await fixture();let snapshot=await f.send('map-access',{entityId:aircraftId});
 const before={...snapshot.actors[aircraftId].position},revision=snapshot.players[f.id].movementRevision,due=snapshot.doomsday.nextEventAt,score=snapshot.players[f.id].score;
 snapshot=await f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:aircraftId});
 const departure=snapshot.actors[aircraftId].flight.emergencyDeparture;
 assert.equal(departure.stage,'preflight');assert.equal(snapshot.actors[aircraftId].position.x,before.x);assert.equal(snapshot.actors[aircraftId].position.z,before.z,'departure never relocates an aircraft to the runway');assert.ok(Math.abs(snapshot.actors[aircraftId].position.y-before.y)<.15,'only ordinary floor settling is allowed');
 assert.equal(snapshot.players[f.id].movementRevision,revision);assert.equal(snapshot.players[f.id].vehicleId,aircraftId);assert.equal(snapshot.doomsday.nextEventAt,due);
 snapshot=await f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:aircraftId});
 assert.equal(snapshot.actors[aircraftId].flight.emergencyDeparture.id,departure.id,'a repeat tap cannot restart preflight');
 const yaw=snapshot.actors[aircraftId].rotation.y;
 for(let index=0;index<16;index++)snapshot=await f.send('input',{input:{}},250);
 const aircraft=snapshot.actors[aircraftId];
 assert.equal(aircraft.flight.assist,'emergency-departure');assert.equal(aircraft.flight.assistStage,'taxi');
 assert.ok(Math.hypot(aircraft.position.x-before.x,aircraft.position.z-before.z)>.05||Math.abs(aircraft.rotation.y-yaw)>.05,'the actual room physics drives taxi movement or steering');
 assert.equal(snapshot.players[f.id].health,100);assert.equal(snapshot.players[f.id].score,score);assert.equal(snapshot.doomsday.nextEventAt,due);
 snapshot=await f.send('input',{input:{side:.7,yaw:0}});
 f.advance(100);snapshot=await f.runtime.snapshot(f.world.id,f.world);
 assert.equal(snapshot.actors[aircraftId].flight.assist,null);assert.equal(snapshot.actors[aircraftId].flight.emergencyDeparture.status,'cancelled');
 assert.equal(snapshot.players[f.id].vehicleId,aircraftId,'manual override keeps the pilot in their own aircraft');
});

test('a holding departure respects the existing runway lease and cancels cleanly after acquiring its own',async()=>{
 const f=await fixture(),aircraftId='airport-command-flight';await f.send('map-access',{entityId:aircraftId});await f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:aircraftId});
 await f.store.update(f.world.id,room=>{
  const sim=room.simulation,aircraft=sim.actors[aircraftId];aircraft.position={x:20,y:.4,z:79};sim.players[f.id].position={...aircraft.position};
  aircraft.flight.assistStage='hold-short';aircraft.flight.emergencyDeparture.stage='hold-short';sim.airport.runwayHolder='other-pilot';sim.airport.expires=f.now+90000;
 });
 let snapshot=await f.send('input',{input:{}});assert.equal(snapshot.airport.runwayHolder,'other-pilot');assert.equal(snapshot.actors[aircraftId].flight.emergencyDeparture.status,'waiting');
 await f.store.update(f.world.id,room=>{room.simulation.airport.expires=f.now-1;});
 snapshot=await f.send('input',{input:{}});assert.equal(snapshot.airport.runwayHolder,f.id);assert.equal(snapshot.actors[aircraftId].flight.assistStage,'lineup');
 snapshot=await f.send('aircraft-assist',{operation:'cancel',vehicleId:aircraftId});assert.equal(snapshot.airport.runwayHolder,null);assert.equal(snapshot.actors[aircraftId].flight.assist,null);
});

test('boarding another craft cancels the old departure and rejects an in-flight request for the previous cockpit',async()=>{
 const f=await fixture(),previous='airport-command-flight',next='airport-evacuation-flight';await f.send('map-access',{entityId:previous});await f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:previous});
 await f.store.update(f.world.id,room=>{room.simulation.airport.runwayHolder=f.id;room.simulation.airport.expires=f.now+45000;});
 let snapshot=await f.send('map-access',{entityId:next});
 assert.equal(snapshot.players[f.id].vehicleId,next);assert.equal(snapshot.actors[previous].flight.assist,null);assert.equal(snapshot.actors[previous].flight.emergencyDeparture.status,'cancelled');
 assert.equal(snapshot.airport.runwayHolder,null,'changing craft releases the old departure clearance');
 await assert.rejects(f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:previous}),/selected aircraft changed/);
 snapshot=await f.runtime.snapshot(f.world.id,f.world);assert.notEqual(snapshot.actors[next].flight.assist,'emergency-departure');
});

test('expired connections and empty fuel stop a departure without retaining a runway lock',async()=>{
 const f=await fixture(),aircraftId='airport-command-flight';await f.send('map-access',{entityId:aircraftId});await f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:aircraftId});
 await f.store.update(f.world.id,room=>{const sim=room.simulation;sim.airport.runwayHolder=f.id;sim.airport.expires=f.now+45000;sim.actors[aircraftId].flight.assistStage='hold-short';});
 f.advance(16000);let snapshot=await f.runtime.snapshot(f.world.id,f.world);
 assert.equal(snapshot.airport.runwayHolder,null);assert.equal(snapshot.actors[aircraftId].flight.assist,null);assert.match(snapshot.actors[aircraftId].flight.emergencyDeparture.reason,/connection expired/);
 await f.send('join');await f.send('map-access',{entityId:aircraftId});
 await f.store.update(f.world.id,room=>{room.simulation.players[f.id].fuel=0;});
 await assert.rejects(f.send('aircraft-assist',{operation:'emergency-departure',vehicleId:aircraftId}),/Fuel is empty/);
 snapshot=await f.runtime.snapshot(f.world.id,f.world);assert.notEqual(snapshot.actors[aircraftId].flight.assist,'emergency-departure');
});
