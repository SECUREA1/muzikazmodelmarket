import test from 'node:test';
import assert from 'node:assert/strict';
import {airportWorld} from '../airport-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {cancelEmergencyDeparture} from '../public/js/aircraft-assist.js';
import {isAircraft,stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {aircraftRunway,runwayClearance} from '../public/js/airport-navigation.js';

function fixture(id='airport-command-flight'){
 const environment=airportWorld(),actors={};
 for(const object of environment.builderScene.objects.filter(isAircraft))actors[object.id]={id:object.id,modelId:object.modelId,active:true,health:400,position:{...object.position},rotation:{...object.rotation},flight:{speed:0,airspeed:0,altitude:0,airborne:false}};
 const aircraft=actors[id],player={actorId:'pilot',health:100,fuel:100,vehicleId:id,position:{...aircraft.position},input:{},movementRevision:7};
 aircraft.holderId=player.actorId;
 const sim={actors,players:{pilot:player},airport:{runwayHolder:null,expires:0}},collision=new ServerBuilderCollision();
 return {aircraft,player,sim,environment,collision,context:{actors,airport:sim.airport,holderId:player.actorId,collision,objects:{},fuel:player.fuel},now:1000,stages:new Set()};
}

function step(f,dt=.05){
 f.now+=dt*1000;
 const previous={...f.aircraft.position},input=aircraftAssistedInput(f.aircraft,{},f.environment,f.now,f.context);
 f.stages.add(f.aircraft.flight.assistStage);
 const runway=aircraftRunway(f.environment,f.aircraft),lease=runwayClearance(f.sim.airport,runway),onRunway=!runway||Math.abs(previous.x-runway.x)<runway.width/2-1&&Math.abs(previous.z-runway.z)<runway.length/2;
 const floor=f.collision.groundAt(f.environment,previous,{actors:f.sim.actors,objects:{}}),ground=(floor?.y||0)+.4;
 const pose=stepAircraftFlight(f.aircraft,input,dt,{ground,ceiling:f.environment.airport.ceiling,half:f.environment.builderScene.mapSize/2,cleared:onRunway&&lease?.runwayHolder===f.player.actorId&&lease.expires>f.now,blocked:(from,to,yaw)=>{
  const delta=[to.x-from.x,to.y-from.y,to.z-from.z],distance=Math.hypot(...delta);if(distance<.001)return false;
  return [-4.8,0,4.8].some(side=>f.collision.blocksShot(f.environment,{x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*2.8,y:from.y+.9,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*2.8},delta.map(value=>value/distance),distance+.1,f.sim.actors));
 }});
 assert.ok(Math.hypot(pose.position.x-previous.x,pose.position.y-previous.y,pose.position.z-previous.z)<=1.6,'departure uses physical movement instead of a pose jump');
 assert.equal(pose.flight.impactDamage,0,'a guided departure must not damage the aircraft');
 Object.assign(f.aircraft,pose);f.player.position={...pose.position};return input;
}

function until(f,predicate,seconds=230){
 for(let tick=0;tick<seconds/.05&&!predicate();tick++)step(f);
 assert.ok(predicate(),JSON.stringify({pose:f.aircraft.position,flight:f.aircraft.flight,stages:[...f.stages]}));
}

for(const id of ['airport-command-flight','airport-evacuation-flight']){
 test(id+' starts one emergency departure from its actual stand without moving the pilot',()=>{
  const f=fixture(id),position={...f.aircraft.position},playerPosition={...f.player.position};
  startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
  assert.deepEqual(f.aircraft.position,position);assert.deepEqual(f.player.position,playerPosition);assert.equal(f.player.movementRevision,7);
  assert.equal(f.aircraft.flight.assist,'emergency-departure');assert.equal(f.aircraft.flight.assistStage,'preflight');
  const departure=structuredClone(f.aircraft.flight.emergencyDeparture),since=f.aircraft.flight.assistSince;
  startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now+100,f.collision);
  assert.deepEqual(f.aircraft.flight.emergencyDeparture,departure,'a repeated tap must not restart the script');assert.equal(f.aircraft.flight.assistSince,since);
  assert.equal(f.sim.airport.runwayHolder,null,'the apron preparation does not reserve the runway');
 });

 test(id+' physically taxis, lines up, departs and reaches cruise without damaging or moving other aircraft',()=>{
  const f=fixture(id),others=Object.fromEntries(Object.entries(f.sim.actors).filter(([key])=>key!==id).map(([key,craft])=>[key,structuredClone(craft)]));
  startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
  f.stages.add(f.aircraft.flight.assistStage);
  until(f,()=>!f.aircraft.flight.assist);
  assert.equal(f.aircraft.flight.emergencyDeparture.status,'complete');assert.equal(f.aircraft.flight.airborne,true);assert.ok(f.aircraft.flight.altitude>=23);
  for(const stage of ['preflight','taxi','roll','climb'])assert.ok(f.stages.has(stage),'missing physical departure stage '+stage);
  assert.equal(f.aircraft.holderId,'pilot');assert.equal(f.player.vehicleId,id);assert.equal(f.player.movementRevision,7);
  assert.equal(f.sim.airport.runwayHolder,null,'clearance is released after departure');
  for(const [key,before]of Object.entries(others))assert.deepEqual(f.sim.actors[key],before,'another public craft remains available at its own stand');
 });
}

test('emergency departure validates the selected cockpit and gives clear fallback guidance without a runway',()=>{
 for(const [change,expected]of [
  [f=>{f.aircraft.holderId='another-pilot';},/cockpit|pilot|occupied|holder|owner/i],
  [f=>{f.player.health=0;},/respawn|health|pilot/i],
  [f=>{f.player.fuel=0;},/fuel|service/i],
  [f=>{f.aircraft.active=false;},/aircraft|cockpit/i],
  [f=>{f.aircraft.modelId='corsair-aircraft';},/emergency|Nightfall|Daybreak/i],
  [f=>{f.aircraft.flight.airborne=true;f.aircraft.flight.altitude=12;f.aircraft.position.y=12.4;},/airborne|climb|cruise|land/i],
  [f=>{f.environment={id:'no-runway',builderScene:{mapSize:256}};f.sim.airport=null;f.context.airport=null;},/manual|runway|airport/i]
 ]){
  const f=fixture();change(f);const before=structuredClone(f.aircraft.position);
  assert.throws(()=>startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision),expected);
  assert.deepEqual(f.aircraft.position,before);assert.notEqual(f.aircraft.flight.assist,'emergency-departure');
 }
});

test('a busy runway holds the aircraft short and resumes after the existing lease and traffic clear',()=>{
 const f=fixture();f.sim.airport.runwayHolder='another-pilot';f.sim.airport.expires=f.now+600000;
 f.sim.actors.blocker={id:'blocker',modelId:'diamond-da40',active:true,health:400,holderId:'another-pilot',position:{x:40,y:.4,z:0},rotation:{x:0,y:0,z:0},flight:{airborne:false,altitude:0}};
 startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 until(f,()=>f.aircraft.flight.assistStage==='hold-short'&&f.aircraft.flight.emergencyDeparture.status==='waiting',150);
 assert.equal(f.sim.airport.runwayHolder,'another-pilot');assert.ok(Math.abs(f.aircraft.position.x-40)>8,'waiting occurs outside the runway');
 const waiting={...f.aircraft.position};for(let tick=0;tick<200;tick++)step(f);
 assert.ok(Math.hypot(f.aircraft.position.x-waiting.x,f.aircraft.position.z-waiting.z)<.2,'holding does not creep onto the active runway');
 assert.equal(f.sim.airport.runwayHolder,'another-pilot');assert.equal(f.aircraft.flight.airborne,false);
 delete f.sim.actors.blocker;f.sim.airport.expires=f.now-1;
 until(f,()=>!f.aircraft.flight.assist,120);
 assert.equal(f.aircraft.flight.emergencyDeparture.status,'complete');assert.equal(f.sim.airport.runwayHolder,null);
});

test('traffic at the runway entry queues after preflight and old navigation cannot redirect the departure',()=>{
 const f=fixture(),position={...f.aircraft.position};
 Object.assign(f.aircraft.flight,{assist:'navigate',assistParkingPoint:{x:21,z:0},assistTargetAltitude:30,navigationDestinationId:'mountain-runway',navigationName:'Previous mountain trip',navigationParkingPoint:{x:599,z:-500},navigationLeg:1,remainingDistance:900,arrivalDestinationId:'coastal-runway'});
 const entryTraffic=f.sim.actors.entryTraffic={id:'entryTraffic',modelId:'diamond-da40',active:true,health:400,position:{x:40,y:.52,z:79},rotation:{x:0,y:0,z:0},flight:{airborne:false,altitude:0}};
 startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 assert.deepEqual(f.aircraft.position,position);assert.equal(f.aircraft.flight.assistStage,'preflight');
 for(const key of ['assistParkingPoint','assistTargetAltitude','navigationDestinationId','navigationName','navigationParkingPoint','navigationLeg','remainingDistance','arrivalDestinationId'])assert.equal(f.aircraft.flight[key],undefined,'stale '+key+' must not affect this departure');
 until(f,()=>f.aircraft.flight.assistStage==='hold-short'&&f.aircraft.flight.emergencyDeparture.status==='waiting',150);
 assert.equal(f.sim.airport.runwayHolder,null,'entry traffic must not be granted over');
 assert.match(f.aircraft.flight.emergencyDeparture.reason,/runway/i);assert.ok(Math.abs(f.aircraft.position.x-40)>8);
 assert.deepEqual(entryTraffic.position,{x:40,y:.52,z:79});
});

test('manual flight input and explicit cleanup release only the departure owner reservation',()=>{
 for(const manual of [{side:.4},{lift:.4},{throttle:0},{brake:true}]){
  const f=fixture();startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
  f.sim.airport.runwayHolder='pilot';f.sim.airport.expires=f.now+60000;
  assert.equal(aircraftAssistedInput(f.aircraft,manual,f.environment,f.now+100,f.context),manual);
  assert.equal(f.aircraft.flight.assist,null);assert.equal(f.aircraft.flight.emergencyDeparture.status,'cancelled');assert.equal(f.sim.airport.runwayHolder,null);
 }
 const f=fixture();f.sim.airport.runwayHolder='another-pilot';f.sim.airport.expires=f.now+60000;
 startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 assert.equal(cancelEmergencyDeparture(f.aircraft,f.environment,f.context,{reason:'Pilot disconnected.',now:f.now+100}),true);
 assert.equal(f.aircraft.flight.emergencyDeparture.status,'cancelled');assert.match(f.aircraft.flight.emergencyDeparture.reason,/disconnected/i);
 assert.equal(f.aircraft.flight.throttleCommand,0);assert.equal(f.sim.airport.runwayHolder,'another-pilot','cleanup cannot release another pilot clearance');
 assert.equal(cancelEmergencyDeparture(f.aircraft,f.environment,f.context,{now:f.now+200}),false,'cleanup is idempotent');
});

test('an expired departure stops on the ground and leaves manual controls and public access available',()=>{
 const f=fixture();startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 f.sim.airport.runwayHolder='pilot';f.sim.airport.expires=f.now+1000000;
 const before={...f.aircraft.position},controls=aircraftAssistedInput(f.aircraft,{},f.environment,f.now+600001,f.context);
 assert.equal(f.aircraft.flight.assist,null);assert.equal(f.aircraft.flight.emergencyDeparture.status,'timed-out');assert.equal(f.sim.airport.runwayHolder,null);
 assert.equal(controls.throttle,0);assert.ok(controls.brake);assert.deepEqual(f.aircraft.position,before);
 assert.equal(f.aircraft.holderId,'pilot');assert.equal(f.player.vehicleId,f.aircraft.id);
});

test('incomplete saved departure data releases its own runway and returns safe manual controls',()=>{
 const f=fixture();startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now);
 f.sim.airport.runwayHolder='pilot';f.sim.airport.expires=f.now+60000;delete f.aircraft.flight.emergencyDeparture;
 const controls=aircraftAssistedInput(f.aircraft,{},f.environment,f.now+100,f.context);
 assert.equal(f.aircraft.flight.assist,null);assert.equal(f.aircraft.flight.emergencyDeparture.status,'blocked');
 assert.equal(f.sim.airport.runwayHolder,null);assert.equal(controls.throttle,0);assert.equal(controls.brake,true);
});

test('legacy airborne poses cannot start ground taxi or obstruct a low departure queue',()=>{
 const f=fixture();f.aircraft.position.y=30;
 assert.throws(()=>startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision),/airborne/);
 f.aircraft.position.y=.4;startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now);
 f.aircraft.flight.assistStage='hold-short';f.aircraft.position={x:20,y:.4,z:79};
 f.context.collision=null;f.sim.actors.overflight={id:'overflight',modelId:'diamond-da40',active:true,position:{x:40,y:30,z:79},flight:{}};
 aircraftAssistedInput(f.aircraft,{},f.environment,f.now+100,f.context);
 assert.equal(f.aircraft.flight.assistStage,'lineup');assert.equal(f.sim.airport.runwayHolder,'pilot');
});

test('a remote airfield departure acquires its own runway without touching another pilot main clearance',()=>{
 const f=fixture();f.aircraft.position={x:-301,y:.4,z:-250};f.player.position={...f.aircraft.position};f.aircraft.flight.runwayId='north-runway';
 f.sim.airport.runwayHolder='main-runway-pilot';f.sim.airport.expires=f.now+600000;
 startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 assert.equal(f.aircraft.flight.emergencyDeparture.runwayId,'north-runway');
 until(f,()=>f.aircraft.flight.assistStage==='roll',150);
 assert.equal(f.sim.airport.runwayHolder,'main-runway-pilot');assert.equal(f.sim.airport.runwayClearances['north-runway'].runwayHolder,'pilot');
 cancelEmergencyDeparture(f.aircraft,f.environment,f.context,{reason:'Pilot requested manual taxi.',now:f.now});
 assert.equal(f.sim.airport.runwayClearances['north-runway'].runwayHolder,null);assert.equal(f.sim.airport.runwayHolder,'main-runway-pilot');
});

test('fuel exhaustion stops an active ground departure and static obstructions reject a new route without relocation',()=>{
 const f=fixture();startAircraftAssist(f.sim,f.player,f.environment,'emergency-departure',f.now,f.collision);
 f.sim.airport.runwayHolder='pilot';f.sim.airport.expires=f.now+60000;f.context.fuel=0;
 const controls=aircraftAssistedInput(f.aircraft,{},f.environment,f.now+100,f.context);
 assert.equal(f.aircraft.flight.assist,null);assert.equal(f.aircraft.flight.emergencyDeparture.status,'blocked');assert.match(f.aircraft.flight.emergencyDeparture.reason,/fuel/i);
 assert.equal(controls.throttle,0);assert.ok(controls.brake);assert.equal(f.sim.airport.runwayHolder,null);
 const blocked=fixture(),before={...blocked.aircraft.position};
 assert.throws(()=>startAircraftAssist(blocked.sim,blocked.player,blocked.environment,'emergency-departure',blocked.now,{groundAt:()=>({x:0,y:0,z:0}),hasBodyClearance:()=>false}),/blocked|route|apron/i);
 assert.deepEqual(blocked.aircraft.position,before);assert.notEqual(blocked.aircraft.flight.assist,'emergency-departure');
});
