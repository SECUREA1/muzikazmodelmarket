import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_ROUTES,SHIPPING_PORTS} from '../public/js/shipping-config.js';
import {shippingCommand,stepShipping} from '../server-shipping.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {boatMovementBlocked,boatAssistedInput} from '../server-boat-assist.mjs';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {isWatercraft,watercraftFootprint,harborWaterAt} from '../public/js/harbor-water.js';

const world=shippingWorld(),collision=new ServerBuilderCollision();
function voyage(route){
 const origin=SHIPPING_PORTS.find(port=>port.id===route.from),boat={id:'voyage-feeder',modelId:route.requiredVessel,name:'Quality test cargo ship',active:true,health:650,maxHealth:650,holderId:'pilot',position:{x:origin.x,y:0,z:origin.z},rotation:{x:0,y:origin.berth.yaw,z:0},boating:{speed:0,throttle:0,throttleCommand:0,anchor:true}};
 // Keep the production fleet active, including vessels occupying receiving
 // ports. The piloted fixture replaces only the exact origin berth vessel.
 const actors=Object.fromEntries(world.builderScene.objects.filter(isWatercraft).map(actor=>[actor.id,{...structuredClone(actor),active:Math.hypot(actor.position.x-origin.x,actor.position.z-origin.z)>1,health:1200,boating:{speed:0,anchor:true}}]));actors[boat.id]=boat;
 let now=100000;
 const player={actorId:'pilot',username:'Pilot',vehicleId:boat.id,health:100,position:{...boat.position,y:.35},input:{},grounded:true,lastSeen:now,movementRevision:0,shipping:{job:null,unlocks:['shipping-feeder','shipping-container','shipping-tanker'],stats:{},supplies:{}}},sim={actors,players:{pilot:player},events:[]},blocked=boatMovementBlocked(world,boat,actors,collision,{});
 // This geometry/physics fixture begins with an authorized cargo handoff.
 // Durable certification, staging and reward binding run end-to-end separately
 // in factory-shipping-chain.test.mjs.
 if(route.factoryExport)player.shipping.factoryExport={manifestId:'staged-physics-fixture',status:'staged'};
 const send=(operation,fields={})=>shippingCommand(sim,player,world,{operation,...fields},now);
 send('accept',{contractId:route.id});
 for(let unit=0;unit<player.shipping.job.units;unit++){send('load',{side:unit%2?'starboard':'port'});now+=2000;player.lastSeen=now;}
 send('secure');const start={...boat.position};send('depart');assert.deepEqual(boat.position,start,'departure clearance never teleports a ship');
 let held=0,frames=0,idle=0;
 for(;frames<15000&&boat.boating.assist;frames++){
  now+=100;player.lastSeen=now;
  const previous={...boat.position},input=boatAssistedInput(boat,{},world,now,actors,blocked),pose=stepBoatSimulation(boat,input,.1,{environment:world,now,blocked});
  if(pose.boating.phase==='hold'){held++;assert.fail(route.id+' collided at '+JSON.stringify({position:boat.position,heading:boat.rotation.y,next:boat.boating.assistRoute?.[boat.boating.routeIndex],input}));}
  assert.equal(pose.boating.impactDamage,0,route.id+' must not ram a real quay or coast');
  idle=Math.hypot(pose.position.x-previous.x,pose.position.z-previous.z)<.001?idle+1:0;if(idle>600)assert.fail('stalled '+route.id+' '+JSON.stringify({position:boat.position,rotation:boat.rotation,boating:boat.boating,input,activeActors:Object.values(actors).filter(a=>a.active!==false).map(a=>({id:a.id,position:a.position,modelId:a.modelId}))}));Object.assign(boat,pose);player.position={...boat.position,y:.35};
  assert.ok(Math.hypot(boat.position.x-previous.x,boat.position.z-previous.z)<=1.1,'motion follows physical speed, without checkpoint relocation');
  stepShipping(sim,world,now);
  if(player.shipping.job.hazard&&!player.shipping.job.hazard.resolved)send(player.shipping.job.hazard.type==='pirates'?'escort':'radio');
  if(player.shipping.job.phase!=='sailing')break;
 }
 const job=player.shipping.job;
 assert.ok(frames<15000,route.id+' must finish instead of waiting indefinitely: '+JSON.stringify({position:boat.position,stage:boat.boating.assistStage,index:boat.boating.routeIndex,checkpoint:job.checkpointIndex,held}));
 assert.equal(job.phase,'sailing',JSON.stringify({position:boat.position,checkpoint:job.checkpointIndex,message:job.message,held}));assert.equal(boat.boating.assist,null);assert.equal(boat.boating.anchor,true);assert.ok(Math.abs(boat.boating.speed)<.15);
 assert.equal(job.checkpointIndex,job.waypoints.length,'the server confirms every sea gate');
 assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(point=>harborWaterAt(world,point,.25)));
 send('dock');assert.equal(job.phase,'unloading');
 let result;for(let index=0;index<job.units;index++){result=send('unload');now+=2000;player.lastSeen=now;}
 assert.equal(result.settlement.type,'delivery');assert.equal(result.settlement.contractId,route.id);assert.equal(result.settlement.quality,100);
 return {seconds:Math.round((now-job.departedAt)/1000),held,distance:Math.round(job.distanceSailed)};
}
for(const route of SHIPPING_ROUTES)test('authoritative freight voyage follows every '+route.id+' gate using real loaded-vessel physics',t=>{const result=voyage(route);t.diagnostic(JSON.stringify(result));});
