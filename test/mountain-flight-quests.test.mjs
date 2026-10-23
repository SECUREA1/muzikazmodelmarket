import test from 'node:test';
import assert from 'node:assert/strict';
import {airportWorld} from '../airport-world.mjs';
import {questCatalog,questPoint} from '../public/js/quest-catalog.js';
import {airportRunways,runwayParking} from '../public/js/airport-navigation.js';
import {startExpandedQuest,stepExpandedQuests,expandedQuestAction} from '../server-expanded-quests.mjs';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';

function fixture(){
 const world=airportWorld(),craft={id:'camp-flight',modelId:'diamond-da40',active:true,health:400,maxHealth:400,holderId:'pilot',position:{x:-18,y:.4,z:62},rotation:{x:0,y:0,z:0},flight:{airborne:false,speed:0,airspeed:0}};
 const player={actorId:'pilot',username:'Camp pilot',health:100,lastSeen:100000,vehicleId:craft.id,position:{...craft.position},score:0},sim={actors:{[craft.id]:craft},players:{pilot:player},airport:{runwayHolder:null,expires:0},events:[]};let now=100000;
 return {world,craft,player,sim,get now(){return now;},get mission(){return player.vehicleMission;},get target(){return questPoint(player.vehicleMission,sim.actors);},start(id){return startExpandedQuest(sim,player,world,id,now);},act(){return expandedQuestAction(sim,player,now);},tick(count=1){for(let i=0;i<count;i++){now+=250;player.lastSeen=now;stepExpandedQuests(sim,world,now,.25);}},move(position,airborne=false,speed=0){craft.position={x:position.x,y:position.y??.4,z:position.z};player.position={...craft.position};craft.flight={...craft.flight,airborne,speed,airspeed:speed,altitude:airborne?craft.position.y:0};},flyTo(destination){
  startAircraftAssist(sim,player,world,'navigate',now,null,{},destination);let steps=0;
  while(craft.flight.assist&&steps++<4800){now+=50;player.lastSeen=now;const input=aircraftAssistedInput(craft,{},world,now),pose=stepAircraftFlight(craft,input,.05,{ground:.4,half:world.builderScene.mapSize/2,ceiling:world.airport.ceiling});assert.equal(pose.flight.impactDamage,0);Object.assign(craft,pose);player.position={...pose.position};stepExpandedQuests(sim,world,now,.05);assert.equal(player.vehicleMission.status,'active');}
  assert.ok(steps<4800,'automatic flight parks before its clearance expires');assert.equal(craft.flight.airborne,false);assert.ok(craft.flight.speed<.5);
 }};
}

test('mountain flights are offered only with the mountain airfield and derive their route from its metadata',()=>{
 const f=fixture(),mountain=airportRunways(f.world).find(strip=>strip.id==='mountain-runway');assert.ok(mountain);
 assert.ok(questCatalog(f.world).some(q=>q.id==='air-mountain-supply'));
 assert.ok(questCatalog(f.world).some(q=>q.id==='air-mountain-rescue'));
 const without={...f.world,airport:{...f.world.airport,runways:f.world.airport.runways.filter(strip=>strip.id!==mountain.id)}};
 assert.equal(questCatalog(without).some(q=>q.id.startsWith('air-mountain-')),false);
 mountain.x+=40;mountain.z-=30;f.start('air-mountain-supply');
 assert.equal(f.mission.checkpoints[2].x,mountain.x);assert.equal(f.mission.checkpoints[2].z,mountain.z+mountain.length/2+100);
 assert.equal(f.mission.checkpoints[3].x,runwayParking(mountain).x);
});

test('mountain dispatch requires a stopped aircraft at the main airport',()=>{
 for(const id of ['air-mountain-supply','air-mountain-rescue']){
  const f=fixture();f.move(f.craft.position,true,15);assert.throws(()=>f.start(id),/Park your aircraft/);
  f.move(f.craft.position,false,1);assert.throws(()=>f.start(id),/Park your aircraft/);
  const mountain=airportRunways(f.world).find(strip=>strip.id==='mountain-runway');f.move({...runwayParking(mountain),y:.4});assert.throws(()=>f.start(id),/Return to the main airport/);
  assert.equal(f.player.vehicleMission,undefined);assert.equal(f.player.score,0);
 }
});

test('camp supplies require loading, ordered airborne beacons and a stopped mountain apron unload',()=>{
 const f=fixture();f.start('air-mountain-supply');const q=f.mission;
 assert.throws(()=>f.act(),/hold position/);f.tick(7);assert.throws(()=>f.act(),/hold position/);f.tick();f.act();assert.equal(q.cargo,1);
 f.move(q.checkpoints[2],true,18);f.tick();assert.equal(q.index,1,'approach cannot skip the departure beacon');
 f.move(f.target,false);f.tick();assert.equal(q.index,1,'departure requires flight');f.move(f.target,true,18);f.tick();assert.equal(q.index,2);
 f.move(f.target,true,18);f.tick();assert.equal(q.index,3);
 const finish={...f.target};f.move(finish,true,18);f.tick(12);assert.throws(()=>f.act(),/hold position/,'flying over the apron cannot unload');
 f.move({...runwayParking(airportRunways(f.world)[0]),y:.4});f.tick(12);assert.throws(()=>f.act(),/hold position/,'main airport is not the destination');
 f.move(finish,false,2);f.tick(12);assert.throws(()=>f.act(),/hold position/,'rolling aircraft cannot unload');
 f.move(finish);f.tick(11);assert.throws(()=>f.act(),/hold position/);f.tick();f.act();assert.equal(q.status,'completed');assert.equal(q.cargo,0);assert.equal(f.player.score,1000);assert.equal(f.sim.questResults.length,1);
 assert.throws(()=>f.act(),/Accept an assignment/);f.tick();assert.equal(f.player.score,1000);
});

test('camper evacuation requires mountain boarding and a second flight before main-airport delivery',()=>{
 const f=fixture();f.start('air-mountain-rescue');const q=f.mission,camper=f.sim.actors[q.npcIds[0]];assert.equal(camper.questRole,'rescue');assert.equal(camper.crew.passengers,2);
 for(let i=0;i<2;i++){f.move(f.target,true,18);f.tick();}assert.equal(q.index,2);
 const mountain=airportRunways(f.world).find(strip=>strip.id==='mountain-runway');f.move({...runwayParking(mountain),y:30},true,18);f.tick(12);assert.throws(()=>f.act(),/hold position/);
 f.move({...runwayParking(mountain),y:.4});f.tick(12);f.act();assert.equal(q.cargo,1);assert.equal(camper.crewRecovered,true);assert.equal(camper.active,false);assert.equal(f.player.score,0);
 f.move(q.checkpoints[4]);f.tick(12);assert.equal(q.index,3,'return flight beacon cannot be skipped');assert.throws(()=>f.act(),/hold position/);
 f.move(f.target,true,18);f.tick();assert.equal(q.index,4);f.move(f.target);f.tick(12);f.act();assert.equal(q.status,'completed');assert.equal(f.player.score,1250);assert.equal(f.sim.actors[camper.id],undefined);assert.equal(f.sim.questResults.length,1);
});

test('assisted mountain departures preserve the active quest while relocation still cancels it',()=>{
 const f=fixture();f.start('air-mountain-supply');f.tick(8);f.act();const q=f.mission;
 startAircraftAssist(f.sim,f.player,f.world,'navigate',f.now,undefined,{},'mountain-runway');assert.ok(f.player.movementRevision>0);f.tick();assert.equal(q.status,'active');assert.equal(q.revision,f.player.movementRevision);assert.equal(q.team.pilot.revision,f.player.movementRevision);assert.equal(q.cargo,1);
 f.player.movementRevision++;f.tick();assert.equal(q.status,'cancelled');assert.equal(f.player.score,0);
});

for(const questId of ['air-mountain-supply','air-mountain-rescue'])test(questId+' follows real automatic flight paths through every objective',()=>{
 const f=fixture();f.start(questId);
 if(f.mission.kind==='delivery'){f.tick(8);f.act();}
 f.flyTo('mountain-runway');assert.equal(f.mission.index,f.mission.kind==='delivery'?3:2,'automatic route crosses the ordered departure and approach beacons');f.tick(12);f.act();
 if(f.mission.kind==='recovery'){f.flyTo('runway');assert.equal(f.mission.index,4,'return route crosses the main airport beacon');f.tick(12);f.act();}
 assert.equal(f.mission.status,'completed');assert.equal(f.player.score,f.mission.reward);assert.equal(f.sim.questResults.length,1);assert.ok(f.now<f.mission.deadline);
});
