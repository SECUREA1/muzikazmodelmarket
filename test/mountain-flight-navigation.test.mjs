import test from 'node:test';
import assert from 'node:assert/strict';
import {airportWorld} from '../airport-world.mjs';
import {airportRunways,aircraftRunway,runwayClearance,runwayParking} from '../public/js/airport-navigation.js';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {startAircraftAssist,aircraftAssistedInput,aircraftExitPosition} from '../server-aircraft-access.mjs';

// Use the same runway lease, ground queries and wingtip sweep as the live room.
// This catches scenery that a flight-only simulation would pass through.
test('mountain fly-in supports collision-checked round trips and clear cockpit exits',()=>{
 const environment=airportWorld(),runways=airportRunways(environment),mountain=runways.find(row=>row.id==='mountain-runway');
 assert.ok(mountain,'mountain airfield is offered as a flight destination');
 const collision=new ServerBuilderCollision();
 try{
  for(const modelId of ['corsair-aircraft','diamond-da40','piper-cub']){
   const plane={id:'airport-flight-1',modelId,active:true,health:400,holderId:'pilot',position:{...runwayParking(runways[0]),y:.4},rotation:{x:0,y:0,z:0},flight:{}},player={actorId:'pilot',vehicleId:plane.id,position:{...plane.position},input:{}},sim={actors:{[plane.id]:plane},players:{pilot:player},airport:{runwayHolder:null,expires:0}};
   let now=100000;
   for(const destination of [mountain,runways[0]]){
    startAircraftAssist(sim,player,environment,'navigate',now,collision,{},destination.id);
    const started=now;let steps=0;
    for(;steps<4800&&plane.flight.assist;steps++){
     now+=50;
     const ground=(collision.groundAt(environment,plane.position,{actors:sim.actors,objects:{}})?.y||0)+.4,runway=aircraftRunway(environment,plane),lease=runwayClearance(sim.airport,runway),onRunway=Math.abs(plane.position.x-runway.x)<runway.width/2-1&&Math.abs(plane.position.z-runway.z)<runway.length/2;
     const input=aircraftAssistedInput(plane,{},environment,now),pose=stepAircraftFlight(plane,input,.05,{ground,ceiling:environment.airport.ceiling,half:environment.builderScene.mapSize/2,cleared:onRunway&&lease.runwayHolder===player.actorId&&lease.expires>now,blocked:(from,to,yaw)=>{
      const delta=[to.x-from.x,to.y-from.y,to.z-from.z],span=Math.hypot(...delta);if(span<.001)return false;
      return [-4.8,0,4.8].some(side=>collision.blocksShot(environment,{x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*2.8,y:from.y+.9,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*2.8},delta.map(value=>value/span),span+.1,sim.actors));
     }});
     assert.equal(pose.flight.impactDamage,0,modelId+' flight to '+destination.id+' must avoid scenery at '+JSON.stringify(pose.position));
     assert.notEqual(pose.flight.phase,'hold',modelId+' blocked at '+JSON.stringify(pose.position));
     Object.assign(plane,pose);player.position={...pose.position};
    }
    assert.ok(now-started<240000,modelId+' completes before the runway lease expires');
    assert.equal(plane.flight.assist,null);assert.equal(plane.flight.arrivalDestinationId,destination.id);assert.equal(plane.flight.airborne,false);assert.ok(plane.flight.speed<.5);
    const parking=runwayParking(destination);assert.ok(Math.hypot(plane.position.x-parking.x,plane.position.z-parking.z)<2.1);
    const exit=aircraftExitPosition(environment,plane,collision,sim.actors,{});assert.ok(Number.isFinite(exit.y));assert.ok(Math.hypot(exit.x-plane.position.x,exit.z-plane.position.z)>=5.9,modelId+' exits beyond its wing onto walkable ground');
   }
  }
 }finally{collision.clearPlacedWorlds();}
});
