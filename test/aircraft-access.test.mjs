import test from 'node:test';
import assert from 'node:assert/strict';
import {airportWorld} from '../airport-world.mjs';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {startAircraftAssist,aircraftAssistedInput,aircraftExitPosition} from '../server-aircraft-access.mjs';
function fixture(position={x:-18,y:.4,z:62},rotationY=0,flight={}){const aircraft={id:'plane',modelId:'corsair-aircraft',active:true,health:400,holderId:'pilot',position:{...position},rotation:{x:0,y:rotationY,z:0},flight:{...flight}},player={actorId:'pilot',vehicleId:'plane',position:{...position},input:{}},sim={actors:{plane:aircraft},players:{pilot:player},airport:{runwayHolder:null,expires:0}};return {aircraft,player,sim,environment:airportWorld()};}
function simulate(state,max=120,dt=.05){let time=1000;for(let i=0;i<max/dt&&state.aircraft.flight.assist;i++){time+=dt*1000;const input=aircraftAssistedInput(state.aircraft,{},state.environment,time);Object.assign(state.aircraft,stepAircraftFlight(state.aircraft,input,dt,{ground:.4,cleared:true,half:128}));}return state.aircraft;}
test('assisted takeoff reserves a clear runway, stages only on the ground and releases manual control after climbing',()=>{
 const state=fixture(),collision=new ServerBuilderCollision();assert.match(startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1000,collision),/runway clear/);assert.equal(state.aircraft.position.x,40);assert.equal(state.aircraft.position.z,79);assert.equal(state.sim.airport.runwayHolder,'pilot');assert.equal(state.player.movementRevision,1);simulate(state,10);assert.equal(state.aircraft.flight.assist,null);assert.ok(state.aircraft.flight.altitude>=14);assert.ok(state.aircraft.flight.airspeed>7);assert.equal(state.aircraft.flight.throttleCommand,.7);
});
test('runway leases and low aircraft block assisted starts without moving another pilot',()=>{
 const state=fixture();state.sim.airport={runwayHolder:'other',expires:90000};assert.throws(()=>startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1000),/Another pilot/);assert.equal(state.aircraft.position.x,-18);
 state.sim.airport.runwayHolder=null;state.sim.actors.other={id:'other',modelId:'corsair-aircraft',active:true,position:{x:40,y:.4,z:10},flight:{airborne:false,altitude:0}};assert.throws(()=>startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1000),/runway is occupied/);
 state.sim.actors.other.position.y=25;state.sim.actors.other.flight={airborne:true,altitude:25};assert.doesNotThrow(()=>startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1000));
});
test('manual flight stick and explicit cancel safely release assistance',()=>{
 const state=fixture();startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1000);const manual={side:.4,lift:.2};assert.equal(aircraftAssistedInput(state.aircraft,manual,state.environment,1100),manual);assert.equal(state.aircraft.flight.assist,null);
 startAircraftAssist(state.sim,state.player,state.environment,'takeoff',1200);assert.match(startAircraftAssist(state.sim,state.player,state.environment,'cancel',1300),/Manual/);assert.equal(state.aircraft.flight.assist,null);
});
for(const [x,y,z,yaw]of [[40,30,0,0],[-45,45,-50,1.2],[70,20,80,-.7]])test('landing assistance guides from '+[x,y,z]+' without airborne relocation',()=>{
 const state=fixture({x,y,z},yaw,{airborne:true,altitude:y-.4,speed:16,airspeed:16,throttle:.7,throttleCommand:.7});const before={...state.aircraft.position};startAircraftAssist(state.sim,state.player,state.environment,'land',1000);assert.deepEqual(state.aircraft.position,before);const plane=simulate(state,120);assert.equal(plane.flight.assist,null,JSON.stringify(plane));assert.equal(plane.flight.airborne,false);assert.ok(plane.flight.speed<.5);assert.ok(Math.abs(plane.position.x-21)<3);assert.ok(Math.abs(plane.position.z)<101);
});
test('cockpit exit chooses real ground beyond the wing and rejects an airborne exit',()=>{
 const state=fixture(),collision=new ServerBuilderCollision();const exit=aircraftExitPosition(state.environment,state.aircraft,collision,state.sim.actors,{});assert.ok(exit.y>=0);assert.ok(Math.abs(exit.x-state.aircraft.position.x)>=6);state.aircraft.flight.airborne=true;assert.throws(()=>aircraftExitPosition(state.environment,state.aircraft,collision,state.sim.actors,{}),/Land/);
});
test('landing selects an unoccupied parking bay and an expired runway reservation does not lock flight forever',()=>{
 const state=fixture({x:40,y:30,z:0},0,{airborne:true,altitude:29.6,speed:15,airspeed:15});state.sim.airport={runwayHolder:'departed',expires:900};state.sim.actors.parked={id:'parked',modelId:'corsair-aircraft',active:true,position:{x:21,y:.4,z:0},flight:{airborne:false,altitude:0}};startAircraftAssist(state.sim,state.player,state.environment,'land',1000);assert.equal(state.sim.airport.runwayHolder,'pilot');assert.equal(state.aircraft.flight.assistParkingPoint.z,-30);
});
test('rolling climb preserves the actual runway position and requires exclusive clearance',()=>{
 const state=fixture({x:40,y:.4,z:65},0,{airborne:false,altitude:0,speed:8,airspeed:8,throttle:.8,throttleCommand:.8}),before={...state.aircraft.position};
 state.sim.airport={runwayHolder:'other',expires:90000};assert.throws(()=>startAircraftAssist(state.sim,state.player,state.environment,'climb',1000),/Another pilot/);assert.deepEqual(state.aircraft.position,before);
 state.sim.airport.runwayHolder=null;startAircraftAssist(state.sim,state.player,state.environment,'climb',1000);assert.deepEqual(state.aircraft.position,before);assert.equal(state.player.movementRevision,undefined);assert.equal(state.sim.airport.runwayHolder,'pilot');
 const plane=simulate(state,15);assert.equal(plane.flight.assist,null);assert.ok(plane.flight.altitude>=23.6,JSON.stringify(plane));assert.equal(plane.flight.throttleCommand,.7);
 const offRunway=fixture({x:20,y:.4,z:65},0,{speed:8,airspeed:8});assert.throws(()=>startAircraftAssist(offRunway.sim,offRunway.player,offRunway.environment,'climb',1000),/onto the runway/);
 const slow=fixture({x:40,y:.4,z:65},0,{speed:.8,airspeed:.8}),slowPosition={...slow.aircraft.position};startAircraftAssist(slow.sim,slow.player,slow.environment,'climb',1000);assert.deepEqual(slow.aircraft.position,slowPosition);assert.equal(slow.player.movementRevision,undefined);const rolling=aircraftAssistedInput(slow.aircraft,{},slow.environment,1050);assert.equal(rolling.lift,0);assert.equal(rolling.throttle,1);Object.assign(slow.aircraft,stepAircraftFlight(slow.aircraft,rolling,.25,{ground:.4,cleared:true,half:128}));assert.ok(slow.aircraft.flight.airspeed>.8);assert.equal(slow.aircraft.flight.airborne,false);simulate(slow,15);assert.equal(slow.aircraft.flight.assist,null);assert.ok(slow.aircraft.flight.altitude>=23.6);assert.equal(slow.player.movementRevision,undefined);
});
for(const operation of ['climb','recover'])test(operation+' stabilizes and reaches safe cruise height without taking another pilot runway lease',()=>{
 const state=fixture({x:0,y:9,z:65},0,{airborne:true,altitude:8.6,speed:operation==='recover'?4:13,airspeed:operation==='recover'?4:13,throttle:.3,throttleCommand:.3,verticalSpeed:-2});
 state.sim.airport={runwayHolder:'other',expires:90000};const before={...state.aircraft.position};startAircraftAssist(state.sim,state.player,state.environment,operation,1000);assert.deepEqual(state.aircraft.position,before);assert.equal(state.sim.airport.runwayHolder,'other');
 const plane=simulate(state,20);assert.equal(plane.flight.assist,null,JSON.stringify(plane));assert.ok(plane.flight.altitude>=23.6);assert.equal(plane.flight.airborne,true);assert.ok(plane.flight.airspeed>9);assert.equal(plane.flight.throttleCommand,.7);
});
test('airborne assists work without an airport and honor a lower configured ceiling',()=>{
 const state=fixture({x:0,y:5,z:50},0,{airborne:true,altitude:4.6,speed:12,airspeed:12,throttle:.7});state.environment={ceiling:12,builderScene:{mapSize:256}};state.sim.airport=null;
 startAircraftAssist(state.sim,state.player,state.environment,'climb',1000);assert.ok(state.aircraft.flight.assistTargetAltitude<=9.6);simulate(state,10);assert.equal(state.aircraft.flight.assist,null);assert.ok(state.aircraft.position.y<12);
});
test('cruise holds altitude beyond the ordinary assist timeout and turns clear of map edges',()=>{
 const state=fixture({x:0,y:30.4,z:0},0,{airborne:true,altitude:30,speed:16,airspeed:16,throttle:.65,throttleCommand:.65});startAircraftAssist(state.sim,state.player,state.environment,'cruise',1000);
 let minimum=Infinity,maximum=0;
 for(let tick=1;tick<=3000;tick++){
  const input=aircraftAssistedInput(state.aircraft,{},state.environment,1000+tick*50);assert.ok(Object.values(input).every(value=>typeof value!=='number'||Number.isFinite(value)));
  Object.assign(state.aircraft,stepAircraftFlight(state.aircraft,input,.05,{ground:.4,ceiling:80,half:128,cleared:true}));
  minimum=Math.min(minimum,state.aircraft.flight.altitude);maximum=Math.max(maximum,state.aircraft.flight.altitude);assert.notEqual(state.aircraft.flight.phase,'hold',JSON.stringify(state.aircraft));assert.equal(state.aircraft.flight.airborne,true);
 }
 assert.equal(state.aircraft.flight.assist,'cruise');assert.ok(minimum>28&&maximum<32,{minimum,maximum});assert.ok(Math.abs(state.aircraft.position.x)<120&&Math.abs(state.aircraft.position.z)<120);
});
test('continue preserves an ongoing assist and explicit flight power, brake or stick inputs cancel it',()=>{
 const state=fixture({x:0,y:30.4,z:0},0,{airborne:true,altitude:30,speed:16,airspeed:16});startAircraftAssist(state.sim,state.player,state.environment,'cruise',1000);const before=structuredClone(state);
 assert.match(startAircraftAssist(state.sim,state.player,state.environment,'continue',1500),/continues/);assert.deepEqual(state,before);
 for(const manual of [{throttle:0},{throttle:.8},{brake:true},{forward:.4},{side:.3},{lift:-.3}]){
  startAircraftAssist(state.sim,state.player,state.environment,'cruise',2000);assert.equal(aircraftAssistedInput(state.aircraft,manual,state.environment,2100),manual);assert.equal(state.aircraft.flight.assist,null);
 }
});
