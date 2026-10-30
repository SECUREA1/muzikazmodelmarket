import test from 'node:test';
import assert from 'node:assert/strict';
import {airportRadio} from '../public/js/aircraft-flight.js';
const plane=(id,patch={})=>({id,modelId:'corsair-aircraft',active:true,health:400,position:{x:40,y:20,z:120},rotation:{y:0},flight:{airborne:true,altitude:20,speed:12},...patch});
function fixture(){const own=plane('own',{holderId:'pilot'}),other=plane('other',{holderId:'guest',position:{x:40,y:30,z:70},rotation:{y:-Math.PI/2},flight:{airborne:true,altitude:30,speed:12}});return {sim:{airport:{},actors:{own,other},players:{guest:{username:'Guest pilot'}}},player:{username:'Pilot',vehicleId:'own',fuel:30,ammo:5},environment:{airport:{ceiling:65,runway:{x:40,z:0,width:16,length:202}}}};}
test('live traffic and approach vectors describe actual aircraft without granting clearance',()=>{
 const {sim,player,environment}=fixture(),before=JSON.stringify(sim.airport);
 const traffic=airportRadio(sim,player,'pilot','traffic',1000,environment);assert.match(traffic,/Guest pilot/);assert.match(traffic,/heading 090/);assert.match(traffic,/30 metres above ground/);
 const vectors=airportRadio(sim,player,'pilot','vectors',1000,environment);assert.match(vectors,/heading 000/);assert.match(vectors,/55 metres/);assert.match(vectors,/Request landing clearance/);assert.equal(JSON.stringify(sim.airport),before);
 sim.actors.other.active=false;assert.match(airportRadio(sim,player,'pilot','traffic',1000,environment),/No other occupied aircraft/);
});
test('tower respects the world ceiling and another live runway holder',()=>{
 const {sim,player,environment}=fixture();sim.airport={runwayHolder:'guest',expires:10000};
 assert.match(airportRadio(sim,player,'pilot','status',1000,environment),/65 metres/);
 assert.match(airportRadio(sim,player,'pilot','vectors',1000,environment),/Runway occupied/);
 assert.match(airportRadio(sim,player,'pilot','takeoff',1000,environment),/Hold position/);assert.equal(sim.airport.runwayHolder,'guest');
 assert.match(airportRadio(sim,player,'pilot','landing',10001,environment),/Cleared to land/);assert.equal(sim.airport.runwayHolder,'pilot');assert.equal(sim.actors.own.flight.clearance,'landing');
});
test('flight services require a cockpit and ground service requires parking',()=>{
 const {sim,player,environment}=fixture();player.vehicleId=null;
 assert.throws(()=>airportRadio(sim,player,'pilot','vectors',0,environment),/Board an aircraft/);assert.match(airportRadio(sim,player,'pilot','status',0,environment),/Tower/);
 player.vehicleId='own';assert.throws(()=>airportRadio(sim,player,'pilot','service',0,environment),/Park the aircraft/);
 sim.actors.own.flight={airborne:false,speed:0};sim.actors.own.health=80;assert.match(airportRadio(sim,player,'pilot','service',0,environment),/repaired/);assert.equal(sim.actors.own.health,400);assert.equal(player.fuel,100);assert.equal(player.ammo,120);
 assert.throws(()=>airportRadio(sim,player,'pilot','invalid',0,environment),/Choose a tower/);
});

test('remote runway guidance names the actual airfield and holds for physical traffic without inventing a reservation',()=>{
 const {sim,player,environment}=fixture();environment.airport.enabled=true;
 environment.airport.runways=[{id:'alpine',name:'Alpine Ridge Mountain Airfield',x:620,z:-500,width:20,length:240}];
 sim.actors.own.flight.runwayId='alpine';
 assert.match(airportRadio(sim,player,'pilot','status',1000,environment),/Alpine Ridge Mountain Airfield/);
 assert.match(airportRadio(sim,player,'pilot','vectors',1000,environment),/entering Alpine Ridge Mountain Airfield/);
 sim.actors.other.position={x:620,y:.4,z:-450};sim.actors.other.flight={airborne:false,altitude:0};
 const lease=sim.airport.runwayClearances.alpine;
 assert.match(airportRadio(sim,player,'pilot','status',1000,environment),/Runway occupied/);
 assert.match(airportRadio(sim,player,'pilot','takeoff',1000,environment),/runway is occupied/);assert.equal(lease.runwayHolder,null);
 sim.actors.other.position.x=590;
 assert.match(airportRadio(sim,player,'pilot','takeoff',1000,environment),/Cleared for takeoff, Alpine Ridge Mountain Airfield/);assert.equal(lease.runwayHolder,'pilot');
});
