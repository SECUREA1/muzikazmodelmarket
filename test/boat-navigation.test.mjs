import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina} from '../neon-marina.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {startBoatAssist,boatAssistedInput,boatMovementBlocked} from '../server-boat-assist.mjs';
import {harborApproach,planBoatNavigation} from '../public/js/boat-navigation.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap} from '../public/js/harbor-water.js';

const marina=neonMarina(),world={id:'navigation-marina',updatedAt:'1',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor,locations:marina.locations},objects:marina.objects}};
const authored=marina.objects.filter(isWatercraft),collision=new ServerBuilderCollision();
function fixture(source=authored[0]){
 const actors=Object.fromEntries(authored.map(value=>[value.id,{...structuredClone(value),active:true,health:200,boating:{speed:0,throttle:0,throttleCommand:0,anchor:true}}]));
 const boat=actors[source.id],player={actorId:'pilot',vehicleId:boat.id,input:{}};boat.holderId='pilot';
 return {boat,player,sim:{actors,players:{pilot:player}}};
}
for(const source of authored.slice(0,3))test(source.name+' follows the real slip/pier passage to open water without collision damage',()=>{
 const {boat,player,sim}=fixture(source),origin={...boat.position};
 startBoatAssist(sim,player,world,'launch',100000,{collision});
 assert.deepEqual(boat.position,origin,'planning never teleports the boat');
 assert.equal(boat.boating.navigationDestinationId,'open-water');assert.ok(boat.boating.assistRoute.length>=3);
 const blocked=boatMovementBlocked(world,boat,sim.actors,collision,{});
 let frames=0;
 for(;frames<4000&&boat.boating.assist;frames++){
  const input=boatAssistedInput(boat,{},world,100000+frames*50,sim.actors,blocked),pose=stepBoatSimulation(boat,input,.05,{environment:world,now:100000+frames*50,blocked});
  assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold');Object.assign(boat,pose);
  assert.equal(boat.position.y,0);
  assert.ok(watercraftFootprint(boat.position,boat.rotation.y).every(point=>harborWaterAt(world,point,.25)));
  for(const other of Object.values(sim.actors))if(other.id!==boat.id)assert.equal(watercraftOverlap(boat.position,boat.rotation.y,other.position,other.rotation.y),false);
 }
 assert.ok(frames<4000,'the route completes instead of holding at Beacon Island');
 assert.equal(boat.boating.assistStage,'arrived');assert.equal(boat.boating.assist,null);assert.equal(boat.boating.anchor,true);
 assert.ok(Math.hypot(boat.position.x-184,boat.position.z-80)<3);assert.ok(Math.abs(boat.boating.speed)<.15);
});
test('water-side landmark approaches remain water and unknown destinations are rejected',()=>{
 const {boat,player,sim}=fixture();
 for(const id of ['open-water','marina','beacon-island','palm-key','north-haven']){
  const point=harborApproach(world,id);assert.ok(point);assert.equal(point.id,id);assert.equal(harborWaterAt(world,point,.5),true);
  const plan=planBoatNavigation(boat,world,{destinationId:id,actors:sim.actors,blocked:boatMovementBlocked(world,boat,sim.actors,collision,{})});
  assert.ok(plan,'a passage exists to '+id);assert.equal(plan.destinationId,id);assert.ok(plan.points.length>0);
 }
 assert.equal(harborApproach(world,'invented-island'),null);
 assert.throws(()=>startBoatAssist(sim,player,world,'navigate',100000,{destinationId:'invented-island',collision}),/No clear water passage/);
});
test('manual input cancels a saved route immediately and occupied passages wait then resume',()=>{
 const {boat,sim}=fixture();boat.position={x:184,y:0,z:80};boat.rotation.y=-Math.PI/2;
 const route=()=>({assist:'navigate',assistRoute:[{x:205,z:80,radius:2.3,gear:1}],navigationDestinationId:'open-water',navigationName:'Open water',speed:2,throttle:.2,throttleCommand:.2,anchor:false});
 for(const manual of [{side:.3},{rudder:-.4},{forward:.2},{throttle:0},{anchor:true},{sailTrim:.4},{brake:true}]){
  boat.boating=route();assert.equal(boatAssistedInput(boat,manual,world,100000,sim.actors),manual);
  assert.equal(boat.boating.assist,null);assert.equal(boat.boating.assistRoute,undefined);
 }
 boat.boating=route();const traffic={id:'traffic',modelId:'harbor-skiff',active:true,holderId:'another-player',position:{x:190,y:0,z:80},rotation:{y:-Math.PI/2}};
 sim.actors.traffic=traffic;
 let input=boatAssistedInput(boat,{},world,100000,sim.actors);assert.equal(input.brake,true);assert.equal(input.throttle,0);assert.equal(boat.boating.assistStage,'waiting');assert.ok(boat.boating.assistRoute);
 traffic.position.z=100;input=boatAssistedInput(boat,{},world,100050,sim.actors);assert.ok(input.throttle>0);assert.equal(boat.boating.assistStage,'passage');
});
test('the shared movement blocker includes real player-built walls as well as authored piers',()=>{
 const {boat,sim}=fixture();boat.position={x:160,y:0,z:-50};boat.rotation.y=-Math.PI/2;
 const objects={wall:{id:'wall',ownerId:'builder',materialId:'wall',position:[170,1.2,-50],rotation:[0,Math.PI/2,0],scale:[1,1,1],paint:[]}};
 const blocked=boatMovementBlocked(world,boat,sim.actors,collision,objects);
 assert.equal(blocked(boat.position,{x:175,y:0,z:-50},boat.rotation.y),true);
 assert.equal(blocked(boat.position,{x:162,y:0,z:-50},boat.rotation.y),false);
});

for(const modelId of ['harbor-skiff','harbor-sailboat'])for(const destinationId of ['marina','beacon-island','palm-key','north-haven'])test(modelId+' completes the water passage to '+destinationId,()=>{
 const {boat,player,sim}=fixture(authored.find(source=>source.modelId===modelId));
 boat.position={x:184,y:0,z:80};boat.rotation={x:0,y:-Math.PI/2,z:0};boat.boating.anchor=false;
 startBoatAssist(sim,player,world,'navigate',100000,{destinationId,collision});
 const blocked=boatMovementBlocked(world,boat,sim.actors,collision,{}),goal=harborApproach(world,destinationId);
 let frames=0;
 for(;frames<6000&&boat.boating.assist;frames++){
  const input=boatAssistedInput(boat,{},world,100000+frames*50,sim.actors,blocked),pose=stepBoatSimulation(boat,input,.05,{environment:world,now:100000+frames*50,blocked});
  assert.equal(pose.boating.impactDamage,0);assert.notEqual(pose.boating.phase,'hold');Object.assign(boat,pose);
  assert.ok(watercraftFootprint(boat.position,boat.rotation.y).every(point=>harborWaterAt(world,point,.25)));
 }
 assert.ok(frames<6000,'a selected landmark remains reachable');
 assert.equal(boat.boating.assistStage,'arrived');assert.equal(boat.boating.assist,null);assert.equal(boat.boating.anchor,true);
 assert.ok(Math.hypot(boat.position.x-goal.x,boat.position.z-goal.z)<2.3);
});
