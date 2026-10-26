import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina} from '../neon-marina.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {startBoatAssist,boatAssistedInput,boatMovementBlocked} from '../server-boat-assist.mjs';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {harborApproach} from '../public/js/boat-navigation.js';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import {isWatercraft,harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {fishingZones} from '../public/js/fishing-config.js';
import {stopBoat,harborRadio} from '../server-harbor-operations.mjs';
import {releaseForMapTravel} from '../server-map-travel.mjs';
import {fishingCommand} from '../server-fishing.mjs';

const marina=neonMarina(),world={id:'fishing-navigation',proceduralLand:true,builderScene:{layout:'community-park',mapSize:256,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
const authored=marina.objects.filter(isWatercraft),collision=new ServerBuilderCollision();
function fixture(source){
 const actors=Object.fromEntries(authored.map(value=>[value.id,{...structuredClone(value),active:true,health:300,boating:{speed:0,throttle:0,throttleCommand:0,anchor:true}}]));
 const boat=actors[source.id],player={actorId:'pilot',vehicleId:boat.id,position:{...boat.position,y:.35},input:{},health:100,grounded:true,lastSeen:100000};boat.holderId='pilot';
 return {boat,player,sim:{actors,players:{pilot:player}},blocked:boatMovementBlocked(world,boat,actors,collision,{})};
}
const launches=authored.filter(boat=>boat.modelId==='harbor-fishing-boat');
for(const source of launches){const eligible=harborDestinations(world,source).filter(destination=>destination.water);for(const zone of eligible)test(source.name+' sails to the selected '+zone.name+' and can cast off both sides',()=>{
 const f=fixture(source),origin={...f.boat.position};startBoatAssist(f.sim,f.player,world,'navigate',100000,{destinationId:zone.id,collision});
 const routeId=f.boat.boating.navigationRouteId;assert.ok(routeId);assert.equal(f.boat.boating.navigationType,'fishing');assert.equal(f.boat.boating.navigationZoneId,zone.id);assert.deepEqual(f.boat.position,origin,'routing never teleports the vessel');
 let frames=0,now=100000;
 for(;frames<6000&&f.boat.boating.assist;frames++){
  now+=100;const input=boatAssistedInput(f.boat,{},world,now,f.sim.actors,f.blocked),pose=stepBoatSimulation(f.boat,input,.1,{environment:world,now,blocked:f.blocked});
  assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold','the hull never clips shore or a pier');Object.assign(f.boat,pose);
 }
 assert.ok(frames<6000,'the route must arrive instead of waiting or orbiting indefinitely');
 assert.equal(f.boat.boating.assist,null);assert.equal(f.boat.boating.anchor,true);assert.ok(Math.abs(f.boat.boating.speed)<.15);
 assert.ok(Math.hypot(f.boat.position.x-zone.x,f.boat.position.z-zone.z)<1.6,'the actual hull stops at the selected zone, not another nearby landmark');
 assert.deepEqual(f.boat.boating.arrival,{id:routeId,destinationId:zone.id,kind:'fishing',at:now});assert.equal(f.boat.boating.navigationDestinationId,zone.id);
 assert.ok(watercraftFootprint(f.boat.position,f.boat.rotation.y,f.boat).every(point=>harborWaterAt(world,point,.25)));
 f.player.position={...f.boat.position,y:.35};f.player.lastSeen=now;
 for(const side of ['port','starboard']){
  const result=fishingCommand(f.sim,f.player,world,{operation:'cast',side,zoneId:zone.id},now,{visible:(from,to,boatId)=>{const span=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z),actors={...f.sim.actors,[boatId]:{...f.boat,holderId:'pilot'}};return !collision.blocksShot(world,from,[(to.x-from.x)/span,(to.y-from.y)/span,(to.z-from.z)/span],span,actors);}});
  assert.match(result.message,/cast/i);assert.equal(f.player.fishing.session.zoneId,zone.id);assert.equal(f.player.fishing.session.side,side);
  fishingCommand(f.sim,f.player,world,{operation:'cancel',sessionId:f.player.fishing.session.id},now);
 }
});}

test('waterways reject disconnected lakes and exact destination lookup checks both lake axes',()=>{
 const sea=launches.find(boat=>boat.id.endsWith('angler-boat')),crescent=launches.find(boat=>boat.id.includes('crescent')),silver=launches.find(boat=>boat.id.includes('silver'));
 for(const [boat,id]of [[sea,'crescent-lake-fishing'],[crescent,'silver-lake-fishing'],[silver,'beacon-reef']])assert.equal(harborApproach(world,id,boat),null);
 const wrongLake={...world,builderScene:{...world.builderScene,layoutMeta:{...world.builderScene.layoutMeta,harbor:{...marina.harbor,fishingZones:[{id:'wrong-z',name:'Disconnected lake',water:'fresh',x:-390,z:600,radius:20}]}}}};
 assert.equal(harborApproach(wrongLake,'wrong-z',crescent),null);
});

test('completed arrival identity survives neutral modal input and clears on manual departure',()=>{
 const boat={modelId:'harbor-fishing-boat',position:{x:151,y:0,z:-37},rotation:{y:0},boating:{anchor:true,assist:null,assistStage:'arrived',navigationDestinationId:'marina-fishing',navigationZoneId:'marina-fishing',navigationType:'fishing',navigationRouteId:'arrival-1',arrival:{id:'arrival-1',destinationId:'marina-fishing',kind:'fishing',at:100000}}};
 boatAssistedInput(boat,{throttle:0,anchor:true},world,100100);assert.equal(boat.boating.arrival.id,'arrival-1');
 boatAssistedInput(boat,{anchor:false},world,100200);assert.equal(boat.boating.arrival,undefined);assert.equal(boat.boating.navigationDestinationId,undefined);
});


test('mooring and map travel clear old fishing destinations while explicit fishing stops preserve them',()=>{
 const source=launches[0],f=fixture(source),setArrival=()=>Object.assign(f.boat.boating,{assist:null,assistStage:'arrived',navigationDestinationId:'beacon-reef',navigationZoneId:'beacon-reef',navigationType:'fishing',navigationRouteId:'old-route',arrival:{id:'old-route',destinationId:'beacon-reef',kind:'fishing',at:100000}});
 setArrival();stopBoat(f.boat,{preserveNavigation:true});assert.equal(f.boat.boating.navigationZoneId,'beacon-reef');
 harborRadio(f.sim,f.player,world,'moor');assert.equal(f.boat.boating.navigationZoneId,undefined);assert.equal(f.boat.boating.arrival,undefined);
 setArrival();releaseForMapTravel(f.sim,f.player,{objects:[]},100500);assert.equal(f.boat.boating.navigationZoneId,undefined);assert.equal(f.boat.boating.arrival,undefined);assert.equal(f.boat.holderId,null);assert.equal(f.player.vehicleId,null);
});

for(const occupiesAfterPlanning of [false,true])test('a second angler finds a clear stop in the selected zone when its center fills '+(occupiesAfterPlanning?'during the voyage':'before routing'),()=>{
 const f=fixture(launches[0]);f.boat.position={x:160,y:0,z:-60};f.boat.rotation.y=0;
 const other={id:'competing-angler',modelId:'harbor-fishing-boat',active:true,holderId:'another-player',position:{x:151,y:0,z:-37},rotation:{y:0},boating:{speed:0,anchor:true}};
 if(!occupiesAfterPlanning)f.sim.actors[other.id]=other;
 startBoatAssist(f.sim,f.player,world,'navigate',100000,{destinationId:'marina-fishing',collision});
 if(occupiesAfterPlanning){assert.deepEqual(f.boat.boating.navigationTarget,{x:151,z:-37});f.sim.actors[other.id]=other;}
 let frames=0;
 for(;frames<6000&&f.boat.boating.assist;frames++){
  const now=100000+frames*100,input=boatAssistedInput(f.boat,{},world,now,f.sim.actors,f.blocked),pose=stepBoatSimulation(f.boat,input,.1,{environment:world,now,blocked:f.blocked});
  assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold');Object.assign(f.boat,pose);
 }
 assert.ok(frames<6000);assert.equal(f.boat.boating.anchor,true);assert.equal(f.boat.boating.arrival.destinationId,'marina-fishing');assert.equal(f.boat.boating.navigationZoneId,'marina-fishing');assert.notDeepEqual(f.boat.boating.navigationTarget,{x:151,z:-37});
 const zone=fishingZones(world).find(value=>value.id==='marina-fishing');assert.ok(Math.hypot(f.boat.position.x-zone.x,f.boat.position.z-zone.z)<zone.radius-7);
 f.player.position={...f.boat.position,y:.35};f.player.lastSeen=100000+frames*100;
 assert.match(fishingCommand(f.sim,f.player,world,{operation:'cast',zoneId:zone.id},f.player.lastSeen).message,/cast/i);
});

test('a full fishing area rejects routing safely instead of selecting another destination',()=>{
 const f=fixture(launches[0]),zone=fishingZones(world).find(value=>value.id==='marina-fishing'),points=[{x:zone.x,z:zone.z}];
 for(const radius of [8,14,22,32])for(let index=0;index<8;index++){const angle=index*Math.PI/4;points.push({x:zone.x+Math.cos(angle)*radius,z:zone.z+Math.sin(angle)*radius});}
 for(const [index,point]of points.entries())f.sim.actors['waiting-'+index]={id:'waiting-'+index,modelId:'harbor-fishing-boat',active:true,position:{...point,y:0},rotation:{y:0}};
 const position={...f.boat.position};assert.throws(()=>startBoatAssist(f.sim,f.player,world,'navigate',100000,{destinationId:zone.id,collision}),/No clear water passage/);assert.deepEqual(f.boat.position,position);assert.equal(f.boat.boating.anchor,true);assert.equal(f.boat.boating.navigationDestinationId,undefined);
});

test('two simultaneous anglers reserve different stops and both arrive without blocking each other',()=>{
 const f=fixture(launches[0]),first=f.boat,second={...structuredClone(f.boat),id:'second-angler',position:{x:160,y:0,z:-9},rotation:{x:0,y:0,z:0},holderId:'second'};
 first.position={x:160,y:0,z:-65};first.rotation.y=Math.PI;f.sim.actors[second.id]=second;
 const secondPlayer={actorId:'second',vehicleId:second.id,input:{},position:{...second.position,y:.35},health:100,grounded:true,lastSeen:100000};f.sim.players.second=secondPlayer;
 startBoatAssist(f.sim,f.player,world,'navigate',100000,{destinationId:'marina-fishing',collision});
 startBoatAssist(f.sim,secondPlayer,world,'navigate',100000,{destinationId:'marina-fishing',collision});
 assert.notDeepEqual(first.boating.navigationTarget,second.boating.navigationTarget,'an active route reserves its fishing stop');
 const blockers=new Map([first,second].map(boat=>[boat.id,boatMovementBlocked(world,boat,f.sim.actors,collision,{})]));let frames=0;
 for(;frames<6000&&[first,second].some(boat=>boat.boating.assist);frames++)for(const boat of [first,second])if(boat.boating.assist){
  const now=100000+frames*100,blocked=blockers.get(boat.id),input=boatAssistedInput(boat,{},world,now,f.sim.actors,blocked),pose=stepBoatSimulation(boat,input,.1,{environment:world,now,blocked});assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold');Object.assign(boat,pose);
 }
 assert.ok(frames<6000,'both anglers must finish routing instead of waiting forever');
 for(const boat of [first,second]){assert.equal(boat.boating.anchor,true);assert.equal(boat.boating.arrival.destinationId,'marina-fishing');assert.ok(Math.abs(boat.boating.speed)<.15);}
});

test('holderless and cancelled boats cannot retain a phantom fishing reservation',()=>{
 for(const [holderId,assist]of [[null,'navigate'],['old-pilot',null]]){
  const f=fixture(launches[0]);f.sim.actors.stale={id:'stale',modelId:'harbor-fishing-boat',active:true,holderId,position:{x:300,y:0,z:0},rotation:{y:0},boating:{assist,navigationType:'fishing',navigationZoneId:'marina-fishing',navigationTarget:{x:151,z:-37}}};
  startBoatAssist(f.sim,f.player,world,'navigate',100000,{destinationId:'marina-fishing',collision});assert.deepEqual(f.boat.boating.navigationTarget,{x:151,z:-37});
 }
});
