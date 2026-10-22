import test from 'node:test';
import assert from 'node:assert/strict';
import {airportWorld} from '../airport-world.mjs';
import {neonMarina} from '../neon-marina.mjs';
import {vehicleDestinations} from '../public/js/vehicle-destinations.js';
import {airportRunways,runwayClearance} from '../public/js/airport-navigation.js';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {planBoatNavigation,harborApproach} from '../public/js/boat-navigation.js';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
const airport=airportWorld(),marina=neonMarina(),harbor={builderScene:{objects:marina.objects,layoutMeta:{harbor:marina.harbor}}};
test('expanded worlds expose three landing strips, six harbour docks, and relevant vehicle routes',()=>{
 assert.equal(airportRunways(airport).length,3);assert.ok(airport.builderScene.mapSize>=1024);assert.equal(marina.harbor.docks.length,6);assert.ok(marina.harbor.extent>=512);
 assert.equal(vehicleDestinations(airport,{modelId:'corsair-aircraft'}).length,3);assert.deepEqual(vehicleDestinations(airport,{modelId:'harbor-skiff'}),[]);
 assert.ok(vehicleDestinations(harbor,{modelId:'harbor-yacht'}).every(place=>!marina.harbor.islands.some(island=>island.id===place.id)));assert.equal(vehicleDestinations(harbor,{modelId:'harbor-yacht'}).length,8);
});
for(const origin of airportRunways(airport))for(const destination of airportRunways(airport))test('automatic flight '+origin.id+' to '+destination.id+' lands and parks without damage',()=>{
 const plane={id:'plane',modelId:'corsair-aircraft',active:true,position:{x:origin.x-21,y:.4,z:origin.z},rotation:{y:0},flight:{}},player={actorId:'pilot',vehicleId:plane.id,input:{}},sim={actors:{plane},players:{pilot:player},airport:{runwayHolder:null,expires:0}};
 startAircraftAssist(sim,player,airport,'navigate',100000,null,{},destination.id);
 let steps=0;for(;steps<4800&&plane.flight.assist;steps++){
  const input=aircraftAssistedInput(plane,{},airport,100000+steps*50),pose=stepAircraftFlight(plane,input,.05,{ground:.4,half:512,ceiling:140});assert.equal(pose.flight.impactDamage,0);assert.notEqual(pose.flight.phase,'hold');Object.assign(plane,pose);
 }
 assert.ok(steps<4800,'route completes before clearance expiry');assert.equal(plane.flight.airborne,false);assert.ok(plane.flight.speed<.5);assert.equal(plane.flight.arrivalDestinationId,destination.id);assert.ok(Math.hypot(plane.position.x-(destination.x-destination.width/2-11),plane.position.z-destination.z)<2.1);
});
test('landing strips have independent reservations and reject occupied or unknown destinations',()=>{
 const plane={id:'plane',modelId:'corsair-aircraft',active:true,position:{x:0,y:30,z:0},rotation:{y:0},flight:{airborne:true,altitude:29.6,speed:16}},player={actorId:'pilot',vehicleId:plane.id},sim={actors:{plane},players:{pilot:player},airport:{runwayHolder:'other',expires:200000}};
 assert.throws(()=>startAircraftAssist(sim,player,airport,'navigate',100000,null,{},'missing'),/Choose/);
 assert.throws(()=>startAircraftAssist(sim,player,airport,'navigate',100000,null,{},'runway'),/reserved/);
 startAircraftAssist(sim,player,airport,'navigate',100000,null,{},'north-runway');assert.equal(sim.airport.runwayHolder,'other');assert.equal(runwayClearance(sim.airport,airport.airport.runways[1]).runwayHolder,'pilot');
 const manual={side:.5};assert.equal(aircraftAssistedInput(plane,manual,airport,100100),manual);assert.equal(plane.flight.assist,null);
});
for(const modelId of ['harbor-skiff','harbor-sailboat','harbor-yacht'])for(const dock of marina.harbor.docks)test(modelId+' automatically sails to '+dock.id+' and anchors safely',()=>{
 const boat={...structuredClone(marina.objects.find(o=>o.modelId===modelId)),active:true};if(modelId!=='harbor-yacht'){boat.position={x:184,y:0,z:80};boat.rotation={y:-Math.PI/2};}
 const plan=planBoatNavigation(boat,harbor,{destinationId:dock.id,depart:true});assert.ok(plan);boat.boating={assist:'navigate',assistRoute:plan.points,anchor:false};
 let steps=0;for(;steps<14000&&boat.boating.assist;steps++){const input=boatAssistedInput(boat,{},harbor,100000+steps*50,{}),pose=stepBoatSimulation(boat,input,.05,{environment:harbor});assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold');Object.assign(boat,pose);}
 const goal=harborApproach(harbor,dock.id,boat);assert.ok(steps<14000);assert.equal(boat.boating.assistStage,'arrived');assert.equal(boat.boating.anchor,true);assert.ok(Math.hypot(boat.position.x-goal.x,boat.position.z-goal.z)<2.3);assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(p=>harborWaterAt(harbor,p,.25)));
});
test('map navigation commands start and preserve a live server flight route',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{AuthoritativeRooms}=await import('../authoritative-room.mjs'),{SharedRoomStore}=await import('../shared-room-store.mjs');
 const directory=await mkdtemp(join(tmpdir(),'destination-flight-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=100000,request=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'room.json')),now:()=>now}),pilot={accountId:'route-pilot',username:'Route Pilot',stats:{health:100}},send=(action,fields={})=>runtime.command(airport.id,airport,pilot,{action,requestId:'route-'+ ++request,...fields});
 await send('join');await assert.rejects(send('vehicle-navigate',{destinationId:'north-runway'}),/Board/);await send('map-access',{entityId:'airport-flight-1'});
 let state=await send('vehicle-navigate',{destinationId:'north-runway'});assert.equal(state.actors['airport-flight-1'].flight.navigationDestinationId,'north-runway');
 for(let i=0;i<15;i++){now+=100;state=await send('input',{input:{}});}
 assert.ok(state.actors['airport-flight-1'].flight.speed>0);assert.equal(state.actors['airport-flight-1'].flight.navigationDestinationId,'north-runway');
});
