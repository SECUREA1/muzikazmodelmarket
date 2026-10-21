import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleAction,boatWaterwayClear,boatBerthDistance} from '../public/js/vehicle-actions.js';
import {startBoatAssist,boatAssistedInput} from '../server-boat-assist.mjs';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {watercraftOverlap} from '../public/js/harbor-water.js';

const runway={x:40,z:0,width:16,length:202};
const airport={airport:{runway,ceiling:80}};
const plane=(flight={},position={x:-18,y:.4,z:62})=>({id:'plane',modelId:'corsair-aircraft',active:true,health:400,position,rotation:{x:0,y:0,z:0},flight:{speed:0,airspeed:0,airborne:false,...flight}});
const boat=(position={x:144,y:0,z:-50},boating={})=>({id:'boat',modelId:'harbor-skiff',active:true,health:200,position:{...position},rotation:{x:0,y:-Math.PI/2,z:0},boating:{speed:0,throttle:0,throttleCommand:0,...boating}});
function fixture(position,boating){
 const vessel=boat(position,boating),berth=boat(),environment={builderScene:{objects:[berth],layoutMeta:{harbor:{extent:256,islands:[]}}}};
 const player={actorId:'pilot',vehicleId:vessel.id,position:{...vessel.position},input:{}};
 return {boat:vessel,environment,player,sim:{actors:{boat:vessel},players:{pilot:player}}};
}
function advance(state,seconds,{blocked=()=>false}={}){
 const phases=new Set(),assists=new Set();let damage=0;
 for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.05){
  const input=boatAssistedInput(state.boat,{},state.environment,1000+elapsed*1000,state.sim.actors,blocked);
  const pose=stepBoatSimulation(state.boat,input,.05,{environment:state.environment,now:1000+elapsed*1000,blocked});
  damage+=pose.boating.impactDamage;phases.add(pose.boating.phase);assists.add(pose.boating.assist);Object.assign(state.boat,pose);
 }
 return {phases,assists,damage};
}

test('aircraft Auto follows parked departure, rolling takeoff, recovery, approach and level-flight context',()=>{
 const resolve=(flight,position)=>resolveVehicleAction({vehicle:plane(flight,position),environment:airport});
 assert.equal(resolve({}).action,'takeoff');
 assert.equal(resolve({speed:.8,airspeed:.8},{x:40,y:.4,z:65}).action,'climb');
 assert.equal(resolve({speed:8,airspeed:8},{x:-18,y:.4,z:62}).action,'park');
 assert.equal(resolve({airborne:true,altitude:30,speed:5,airspeed:5}).action,'recover');
 assert.equal(resolve({airborne:true,altitude:30,speed:16,airspeed:16,stall:true,assist:'cruise'}).action,'recover');
 assert.equal(resolve({airborne:true,altitude:12,speed:14,airspeed:14,phase:'approach',verticalSpeed:-2}).action,'land');
 assert.equal(resolve({airborne:true,altitude:12,speed:14,airspeed:14,phase:'climb',verticalSpeed:2}).action,'climb');
 assert.equal(resolve({airborne:true,altitude:30,speed:16,airspeed:16}).action,'cruise');
 for(const assist of ['takeoff','climb','cruise','land'])assert.equal(resolve({airborne:true,altitude:30,speed:16,airspeed:16,assist}).action,'continue');
 assert.equal(resolveVehicleAction({vehicle:plane(),environment:{}}).enabled,false);
 assert.equal(resolveVehicleAction({}).enabled,false);
 assert.equal(resolveVehicleAction({vehicle:{...plane(),health:0},environment:airport}).enabled,false);
});

test('boat Auto distinguishes an authored departure berth, open water and a nearby mooring',()=>{
 const state=fixture(),resolve=()=>resolveVehicleAction({vehicle:state.boat,environment:state.environment,actors:state.sim.actors});
 assert.equal(boatBerthDistance(state.environment,state.boat),0);assert.equal(resolve().action,'launch');
 state.boat.position.x=180;state.boat.boating.anchor=true;assert.equal(resolve().action,'launch');
 state.boat.boating.anchor=false;assert.equal(resolve().action,'cruise');
 state.boat.position.x=149;state.boat.boating.speed=1;assert.equal(resolve().action,'moor');
 state.boat.boating.speed=3;assert.equal(resolve().action,'slow');
 state.boat.boating.speed=1;state.boat.boating.assist='launch';assert.equal(resolve().action,'continue');
});

test('waterway forecasting accounts for the complete hull, reverse direction, shore and occupied traffic',()=>{
 const state=fixture({x:240,y:0,z:-50},{speed:8});
 assert.equal(boatWaterwayClear(state.environment,state.boat,state.sim.actors,6),true);
 state.boat.position.x=250;assert.equal(boatWaterwayClear(state.environment,state.boat,state.sim.actors,6),false);
 assert.equal(resolveVehicleAction({vehicle:state.boat,environment:state.environment,actors:state.sim.actors}).action,'slow');
 state.boat.position.x=135;state.boat.boating.speed=-2;assert.equal(boatWaterwayClear(state.environment,state.boat,state.sim.actors,6),false);
 state.boat.position.x=170;state.boat.boating.speed=6;const other=boat({x:180,y:0,z:-50});other.id='occupied';other.holderId='other-pilot';state.sim.actors.occupied=other;
 assert.equal(boatWaterwayClear(state.environment,state.boat,state.sim.actors,6),false);assert.equal(resolveVehicleAction({vehicle:state.boat,environment:state.environment,actors:state.sim.actors}).action,'slow');
 other.position.z=-65;assert.equal(boatWaterwayClear(state.environment,state.boat,state.sim.actors,6),true);
 state.boat.position={x:131,y:0,z:-50};state.boat.rotation.y=Math.PI/2;state.boat.boating.speed=0;assert.equal(resolveVehicleAction({vehicle:state.boat,environment:state.environment,actors:state.sim.actors}).enabled,false);
});

test('launch assistance raises the anchor and becomes steady cruise under actual boat simulation',()=>{
 const state=fixture(undefined,{anchor:true});const position={...state.boat.position};
 assert.match(startBoatAssist(state.sim,state.player,state.environment,'launch',1000),/anchor raised/);assert.deepEqual(state.boat.position,position);assert.equal(state.boat.boating.anchor,false);
 const result=advance(state,6);assert.equal(result.damage,0);assert.ok(result.assists.has('launch'));assert.ok(result.assists.has('cruise'));assert.equal(state.boat.boating.assist,'cruise');assert.ok(state.boat.position.x>position.x+15);assert.ok(state.boat.boating.speed>4);assert.equal(state.boat.position.y,0);
});

for(const obstacle of ['boundary','shore','traffic','builder'])test('assisted cruise brakes before '+obstacle+' without collision damage',()=>{
 const position=obstacle==='boundary'?{x:238,y:0,z:-50}:obstacle==='shore'?{x:147,y:0,z:-50}:{x:164,y:0,z:-50};
 const state=fixture(position,{speed:8,throttle:.55,throttleCommand:.55});
 if(obstacle==='shore')state.boat.rotation.y=Math.PI/2;
 if(obstacle==='traffic'){const other=boat({x:190,y:0,z:-50});other.id='traffic';other.holderId='another-player';state.sim.actors.traffic=other;}
 const blocked=obstacle==='builder'?(_from,to)=>to.x>=185:()=>false;
 startBoatAssist(state.sim,state.player,state.environment,'cruise',1000);const result=advance(state,10,{blocked});
 assert.equal(result.damage,0);assert.equal(result.phases.has('hold'),false);assert.ok(result.assists.has('slow'));assert.equal(state.boat.boating.assist,null);assert.ok(Math.abs(state.boat.boating.speed)<.15);assert.equal(state.boat.boating.throttleCommand,0);
 if(obstacle==='boundary')assert.ok(state.boat.position.x<253);
 if(obstacle==='shore')assert.ok(state.boat.position.x>131);
 if(obstacle==='builder')assert.ok(state.boat.position.x<185);
 if(obstacle==='traffic')assert.equal(watercraftOverlap(state.boat.position,state.boat.rotation.y,state.sim.actors.traffic.position,state.sim.actors.traffic.rotation.y),false);
});

test('manual throttle, rudder, anchor, sail trim and brake immediately release helm assistance',()=>{
 for(const manual of [{throttle:0},{throttle:.8},{side:.3},{rudder:-.4},{forward:.2},{anchor:true},{anchor:false},{sailTrim:.4},{brake:true}]){
  const state=fixture();startBoatAssist(state.sim,state.player,state.environment,'launch',1000);assert.equal(boatAssistedInput(state.boat,manual,state.environment,1100,state.sim.actors),manual);assert.equal(state.boat.boating.assist,null);assert.equal(state.boat.boating.assistOrigin,undefined);
 }
});

test('continue preserves the active voyage while mooring stops the boat and clears assistance',()=>{
 const state=fixture({x:149,y:0,z:-50},{speed:1,throttle:.2,throttleCommand:.2});startBoatAssist(state.sim,state.player,state.environment,'cruise',1000);const before=structuredClone(state);
 assert.match(startBoatAssist(state.sim,state.player,state.environment,'continue',1200),/continues/);assert.deepEqual(state,before);
 assert.match(startBoatAssist(state.sim,state.player,state.environment,'moor',1300),/Moored safely/);assert.equal(state.boat.boating.assist,null);assert.equal(state.boat.boating.anchor,true);assert.equal(state.boat.boating.speed,0);assert.equal(state.boat.boating.throttleCommand,0);assert.equal(state.boat.boating.rpm,0);assert.deepEqual(state.boat.position,{x:144,y:0,z:-50});assert.equal(state.player.movementRevision,1);
});
