import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {neonMarina} from '../neon-marina.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {harborWaterAt,watercraftFootprint,watercraftOverlap} from '../public/js/harbor-water.js';

const alice={accountId:'auto-alice',username:'Auto Alice',stats:{health:100}},bob={accountId:'auto-bob',username:'Auto Bob',stats:{health:100}};
const aliceId='account:auto-alice',bobId='account:auto-bob';
async function session(t,world){
 const directory=await mkdtemp(join(tmpdir(),'vehicle-auto-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'auto-'+ ++request,...fields});
 const tick=async(user=alice,input={},milliseconds=100)=>{now+=milliseconds;return send(user,'input',{input});};
 await send(alice,'join');await send(bob,'join');return {store,runtime,send,tick};
}
function marinaWorld(){const marina=neonMarina();return {id:'vehicle-auto-marina',name:'Auto Neon Marina',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor,locations:marina.locations},objects:marina.objects}};}

test('shared aircraft Auto performs takeoff, climb and cruise, and replays a request without restarting it',async t=>{
 const world=airportWorld(),{runtime,send,tick}=await session(t,world),planeId='airport-flight-1';
 await assert.rejects(send(alice,'vehicle-action',{mode:'auto'}),/Enter an aircraft or boat/);
 await send(alice,'map-access',{entityId:planeId});await send(bob,'map-access',{entityId:'airport-flight-2'});
 await assert.rejects(send(alice,'vehicle-action',{mode:'warp'}),/Choose/);
 let state=await send(alice,'vehicle-action',{mode:'auto',requestId:'auto-takeoff-replay'});
 assert.equal(state.result.vehicleAction.action,'takeoff');assert.equal(state.actors[planeId].flight.assist,'takeoff');assert.equal(state.players[aliceId].vehicleSeat,'cockpit');assert.equal(state.actors[planeId].position.x,40);
 const initialRevision=state.players[aliceId].movementRevision,stagedPosition={...state.actors[planeId].position};
 state=await send(alice,'vehicle-action',{mode:'auto',requestId:'auto-takeoff-replay'});assert.equal(state.result.vehicleAction.action,'takeoff');assert.equal(state.players[aliceId].movementRevision,initialRevision);assert.deepEqual(state.actors[planeId].position,stagedPosition);assert.equal(state.events.filter(event=>event.id==='auto-takeoff-replay').length,1);
 await assert.rejects(send(bob,'vehicle-action',{mode:'auto'}),/Another pilot/);
 state=await send(alice,'vehicle-action',{mode:'auto'});assert.equal(state.result.vehicleAction.action,'continue');
 for(let step=0;step<160&&state.actors[planeId].flight.assist;step++)state=await tick(alice,{forward:0,side:0,lift:0});
 assert.ok(state.actors[planeId].flight.altitude>=14);assert.equal(state.actors[planeId].flight.assist,null);assert.equal(state.actors[planeId].active,true);
 const beforeClimb={...state.actors[planeId].position};state=await send(alice,'vehicle-action',{mode:'auto'});assert.equal(state.result.vehicleAction.action,'climb');assert.deepEqual(state.actors[planeId].position,beforeClimb);
 for(let step=0;step<160&&state.actors[planeId].flight.assist;step++)state=await tick(alice,{forward:0,side:0,lift:0});
 assert.equal(state.actors[planeId].flight.assist,null);assert.ok(state.actors[planeId].flight.altitude>=23.6);
 state=await tick(alice,{forward:0,side:0,lift:0},250);
 const beforeCruise={...state.actors[planeId].position};state=await send(alice,'vehicle-action',{mode:'auto'});assert.equal(state.result.vehicleAction.action,'cruise');assert.deepEqual(state.actors[planeId].position,beforeCruise);
 const cruiseAltitude=state.actors[planeId].flight.altitude;
 for(let step=0;step<45;step++)state=await tick(alice,{forward:0,side:0,lift:0});
 assert.equal(state.actors[planeId].flight.assist,'cruise');assert.ok(Math.abs(state.actors[planeId].flight.altitude-cruiseAltitude)<2);assert.equal(state.actors[planeId].health,400);
 const currentPosition={...state.actors[planeId].position};state=await send(alice,'vehicle-action',{mode:'auto',requestId:'auto-takeoff-replay'});assert.equal(state.result.vehicleAction.action,'takeoff');assert.equal(state.actors[planeId].flight.assist,'cruise');assert.deepEqual(state.actors[planeId].position,currentPosition);
 state=await send(alice,'vehicle-action',{mode:'cancel'});assert.equal(state.actors[planeId].flight.assist,null);
 const snapshot=await runtime.snapshot(world.id,world);assert.equal(snapshot.players[aliceId].vehicleId,planeId);assert.equal(snapshot.actors['airport-flight-2'].holderId,bobId);
});

test('Auto continues a low-speed runway roll without staging or bypassing another pilot clearance',async t=>{
 const world=airportWorld(),{store,send,tick}=await session(t,world),planeId='airport-flight-1';await send(alice,'map-access',{entityId:planeId});
 const position={x:40,y:.4,z:65};await store.update(world.id,room=>{const sim=room.simulation,plane=sim.actors[planeId],player=sim.players[aliceId];plane.position={...position};plane.rotation={x:0,y:0,z:0};plane.flight={speed:.8,airspeed:.8,altitude:0,airborne:false,throttle:.15,throttleCommand:.15};player.position={...position};player.input={};sim.airport.runwayHolder=bobId;sim.airport.expires=190000;});
 await assert.rejects(send(alice,'vehicle-action',{mode:'auto'}),/Another pilot/);
 await store.update(world.id,room=>{room.simulation.airport.runwayHolder=null;});
 let state=await send(alice,'vehicle-action',{mode:'auto'});assert.equal(state.result.vehicleAction.action,'climb');assert.deepEqual(state.actors[planeId].position,position);const revision=state.players[aliceId].movementRevision;
 state=await tick();assert.equal(state.actors[planeId].flight.airborne,false);assert.ok(state.actors[planeId].flight.airspeed>.8);assert.equal(state.players[aliceId].movementRevision,revision);
 for(let step=0;step<160&&state.actors[planeId].flight.assist;step++)state=await tick();
 assert.equal(state.actors[planeId].flight.assist,null);assert.ok(state.actors[planeId].flight.altitude>=23.6);assert.equal(state.actors[planeId].health,400);assert.equal(state.players[aliceId].movementRevision,revision);
});

test('shared marina Auto follows the departure passage, keeps both pilots live and supports manual override',async t=>{
 const world=marinaWorld(),{runtime,send,tick}=await session(t,world),boats=world.builderScene.objects.filter(object=>['harbor-skiff','harbor-sailboat'].includes(object.modelId)),boatId=boats[0].id;
 await send(alice,'map-access',{entityId:boatId});await send(bob,'map-access',{entityId:boats[1].id});
 await assert.rejects(send(bob,'map-access',{entityId:boatId}),/leave your vehicle|Another player/);
 await assert.rejects(send(alice,'vehicle-action',{mode:'takeoff'}),/Choose/);
 let state=await send(alice,'vehicle-action',{mode:'auto',requestId:'auto-boat-replay'});
 assert.equal(state.result.vehicleAction.action,'launch');assert.equal(state.actors[boatId].boating.assist,'launch');assert.equal(state.players[aliceId].vehicleSeat,'helm');assert.equal(state.actors[boatId].boating.anchor,false);
 assert.equal(state.actors[boatId].boating.navigationDestinationId,'open-water');assert.ok(state.actors[boatId].boating.assistRoute.length>=3);
 const initialPosition={...state.actors[boatId].position};state=await send(alice,'vehicle-action',{mode:'auto',requestId:'auto-boat-replay'});
 assert.deepEqual(state.actors[boatId].position,initialPosition);assert.equal(state.events.filter(event=>event.id==='auto-boat-replay').length,1);
 let completed=false;
 for(let step=0;step<2400;step++){
  state=await tick(alice,{},50);
  if(step%80===0)state=await send(bob,'input',{input:{}});
  const boat=state.actors[boatId];assert.equal(boat.active,true);assert.equal(boat.health,200);assert.equal(boat.boating.impactDamage,0);assert.notEqual(boat.boating.phase,'hold');
  assert.ok(watercraftFootprint(boat.position,boat.rotation.y).every(point=>harborWaterAt(world,point,.25)));
  for(const other of boats.slice(1))assert.equal(watercraftOverlap(boat.position,boat.rotation.y,state.actors[other.id].position,state.actors[other.id].rotation.y),false);
  if(boat.boating.assistStage==='arrived'&&!boat.boating.assist){completed=true;break;}
 }
 const boat=state.actors[boatId];assert.equal(completed,true,'Auto reaches open water instead of stopping at the eastern island');
 assert.ok(Math.hypot(boat.position.x-184,boat.position.z-80)<3);assert.equal(boat.boating.anchor,true);assert.ok(Math.abs(boat.boating.speed)<.15);
 const snapshot=await runtime.snapshot(world.id,world);assert.equal(snapshot.players[aliceId].vehicleId,boatId);assert.equal(snapshot.players[bobId].vehicleId,boats[1].id);assert.equal(Object.keys(snapshot.players).length,2);
 state=await send(alice,'vehicle-action',{mode:'cruise'});assert.equal(state.actors[boatId].boating.assist,'cruise');
 await send(alice,'input',{input:{side:.4,forward:0}});state=await tick(alice,{side:.4,forward:0},50);
 assert.equal(state.actors[boatId].boating.assist,null,'a manual rudder takes control on the next physical step');
 await assert.rejects(send(alice,'vehicle-action',{mode:'moor'}),/Approach a marina or island landing/,'open water cannot be teleported to a distant berth');
});
