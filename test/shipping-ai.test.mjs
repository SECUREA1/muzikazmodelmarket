import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingWorld} from '../shipping-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {stepShippingRivals,shippingRivalsView,shippingPortEconomyView,shippingDispatchView,recordShippingPortDelivery} from '../server-shipping-ai.mjs';
import {SHIPPING_RIVAL_PROFILES,SHIPPING_RIVAL_RULES,shippingCommercialBerth,shippingRivalRoute} from '../public/js/shipping-ai-config.js';
import {SHIPPING_PORTS} from '../public/js/shipping-config.js';
import {isWatercraft,harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';

function fixture({physical=false}={}){
 const environment=shippingWorld(),actors=Object.fromEntries(environment.builderScene.objects.filter(isWatercraft).map(actor=>[actor.id,{...structuredClone(actor),active:true,health:1200,boating:{anchor:true,speed:0}}])),sim={actors,players:{}},deliveries=[];
 const collision=physical?new ServerBuilderCollision():null;let now=100000;
 const step=(milliseconds=250)=>{now+=milliseconds;stepShippingRivals(sim,environment,now,{collision,onDelivery:event=>deliveries.push(structuredClone(event))});};
 stepShippingRivals(sim,environment,now,{collision,onDelivery:event=>deliveries.push(event)});
 return {environment,sim,collision,deliveries,step,get now(){return now;}};
}

test('three named companies visibly load, secure and sail owned AI hulls without stealing public vessels',()=>{
 const f=fixture(),publicIds=f.environment.builderScene.objects.filter(isWatercraft).map(actor=>actor.id);
 assert.equal(shippingRivalsView(f.sim).length,3);
 for(const rival of shippingRivalsView(f.sim)){
  const boat=f.sim.actors[rival.shipId];assert.equal(rival.phase,'loading');assert.equal(rival.job.loaded.length,0);assert.equal(boat.shippingRival,true);assert.equal(boat.trafficAI,true);assert.equal(boat.destructible,false);assert.equal(boat.holderId,null);assert.equal(boat.ownerId,undefined);assert.ok(rival.captainName);assert.ok(rival.companyName);assert.ok(!publicIds.includes(boat.id));
 }
 for(let ticks=0;ticks<120;ticks++)f.step();
 for(const rival of shippingRivalsView(f.sim)){
  const boat=f.sim.actors[rival.shipId];assert.equal(rival.phase,'sailing');assert.equal(rival.job.loaded.length,rival.job.units);assert.equal(rival.job.loaded.filter(unit=>unit.side==='port').length,rival.job.units/2);assert.equal(boat.boating.cargoCount,rival.job.units);assert.equal(boat.boating.cargoMass,rival.job.loaded.reduce((mass,unit)=>mass+unit.mass,0));assert.ok(rival.lastTransfer.endsAt>rival.lastTransfer.at);assert.ok(rival.job.departedAt>=rival.job.startedAt+7000);
 }
 assert.equal(shippingDispatchView(f.sim).filter(event=>event.type==='departed').length,3);
});

test('same-time polls, a stale reload and a missing actor cannot mint lifts, movement or delivery scores',()=>{
 const f=fixture();f.step(2000);const before=structuredClone(f.sim);
 for(let index=0;index<10;index++)stepShippingRivals(f.sim,f.environment,f.now,{onDelivery:event=>f.deliveries.push(event)});
 assert.deepEqual(f.sim,before);f.step(180000);assert.deepEqual(Object.values(f.sim.shipping.rivals).map(rival=>rival.job.loaded.length),Object.values(before.shipping.rivals).map(rival=>rival.job.loaded.length));assert.equal(f.deliveries.length,0);
 const saved=JSON.parse(JSON.stringify(f.sim)),rival=saved.shipping.rivals['gulf-link'],jobId=rival.job.id;rival.stats.deliveries=7;delete saved.actors[rival.shipId];stepShippingRivals(saved,f.environment,f.now+250);
 assert.equal(saved.shipping.rivals['gulf-link'].job.id,jobId);assert.equal(saved.shipping.rivals['gulf-link'].stats.deliveries,7);assert.equal(saved.shipping.rivals['gulf-link'].recoveryRequired,true);assert.equal(saved.actors[rival.shipId],undefined);
});

test('commercial berths and reverse backhauls retain the full channel geometry',()=>{
 const world=shippingWorld();
 for(const profile of SHIPPING_RIVAL_PROFILES)for(const routeId of profile.routeIds){const route=shippingRivalRoute(routeId);assert.ok(route);for(const portId of [route.from,route.to]){const berth=shippingCommercialBerth(portId),boat={modelId:profile.modelId};assert.ok(watercraftFootprint(berth,berth.yaw,boat).every(point=>harborWaterAt(world,point,.35)),routeId+' berth');assert.ok(harborWaterAt(world,berth.entry,.35));}}
 assert.equal(shippingCommercialBerth('bandar-abbas').side,-1,'the eastern Iran coast requires the western commercial wing');
 const backhaul=shippingRivalRoute('ai-northern-return');assert.equal(backhaul.coreOnly,true);assert.ok(backhaul.waypoints.some(point=>point.x===470&&point.z===-370),'return route keeps the island clearance bend');
});

test('real imports remain in warehouses above the replenishment target and duplicate manifests count once',()=>{
 const f=fixture(),event={deliveryId:'private-delivery-1',destinationId:'fujairah',cargoId:'energy-equipment',units:12,deliveredAt:f.now};
 assert.equal(recordShippingPortDelivery(f.sim,event),true);assert.equal(recordShippingPortDelivery(f.sim,event),false);
 let port=shippingPortEconomyView(f.sim).find(port=>port.portId==='fujairah');assert.equal(port.stock['energy-equipment'],60);assert.equal(port.receivedUnits,12);assert.equal(port.arrivals,1);assert.equal(port.demand['energy-equipment'],0);
 f.step(SHIPPING_RIVAL_RULES.warehouseProductionMs);port=shippingPortEconomyView(f.sim).find(port=>port.portId==='fujairah');assert.equal(port.stock['energy-equipment'],60,'warehouse production cannot destroy imported cargo');
});

test('an active human helm receives passage priority without teleports or cargo progress',()=>{
 const f=fixture();for(let i=0;i<70;i++)f.step();const rival=f.sim.shipping.rivals['gulf-link'],boat=f.sim.actors[rival.shipId];
 // The feeder is pulling astern eastward from its commercial wing. A human
 // vessel crossing ahead owns the channel until it clears the physical path.
 const human={id:'human',modelId:'harbor-skiff',position:{x:boat.position.x+30,y:0,z:boat.position.z},rotation:{y:0},active:true,health:200,holderId:'pilot',boating:{speed:0,anchor:true}};f.sim.actors.human=human;f.sim.players.pilot={health:100,vehicleId:'human',position:{...human.position},lastSeen:f.now};
 const start={...boat.position},gate=rival.job.checkpointIndex;for(let i=0;i<12;i++){f.sim.players.pilot.lastSeen=f.now+250;f.step();}
 assert.equal(rival.waitingFor,'player passage');assert.ok(Math.hypot(boat.position.x-start.x,boat.position.z-start.z)<4);assert.equal(rival.job.checkpointIndex,gate);assert.equal(f.deliveries.length,0);
 human.position.x+=150;for(let i=0;i<20;i++){f.sim.players.pilot.lastSeen=f.now+250;f.step();}assert.ok(Math.hypot(boat.position.x-start.x,boat.position.z-start.z)>5,'the rival resumes real motion after the human clears');
});

test('approaching commercial rivals give way before contact and physically pass in clear water',()=>{
 const f=fixture(),first=f.sim.shipping.rivals['gulf-link'],second=f.sim.shipping.rivals['strait-relief'];delete f.sim.shipping.rivals['oman-freight'];delete f.sim.actors['shipping-rival-oman-freight'];
 for(const [rival,x,direction]of [[first,-70,1],[second,70,-1]]){const boat=f.sim.actors[rival.shipId],target={x:-x,z:0,radius:2,gear:1};boat.position={x,y:0,z:0};boat.rotation={x:0,y:direction>0?-Math.PI/2:Math.PI/2,z:0};boat.boating={speed:0,throttle:0,anchor:false,assist:'navigate',assistRoute:[target],routeIndex:0,routeLength:1};rival.phase=rival.job.phase='sailing';rival.job.departedAt=f.now;rival.job.waypoints=[target];rival.job.checkpointIndex=0;rival.job.loaded=Array.from({length:rival.job.units},(_,index)=>({side:index%2?'port':'starboard',mass:1}));}
 let yielded=false;for(let index=0;index<280;index++){f.step();yielded||=second.waitingFor==='commercial crossing';for(const rival of [first,second])assert.equal(f.sim.actors[rival.shipId].boating.impactDamage||0,0,'shared right of way prevents a hull impact');}
 assert.equal(yielded,true);assert.equal(f.deliveries.length,0);assert.ok(first.job.distanceSailed>70,'priority vessel continues after the passing ship clears '+JSON.stringify([first,second].map(r=>({id:r.id,position:f.sim.actors[r.shipId].position,wait:r.waitingFor,stage:f.sim.actors[r.shipId].boating.assistStage,detourAt:r.detourAt,distance:r.job.distanceSailed,route:f.sim.actors[r.shipId].boating.assistRoute,index:f.sim.actors[r.shipId].boating.routeIndex}))));assert.ok(second.detourAt>0,'yielding ship selects and physically sails a clear passing channel');
});

test('all rivals complete physical cargo deliveries and a backhaul with the active public fleet and real quays',t=>{
 const f=fixture({physical:true}),seen=new Set(),initial=structuredClone(f.sim.actors);let ticks=0;
 for(;ticks<5200;ticks++){
  f.step();
  for(const rival of shippingRivalsView(f.sim)){
   const boat=f.sim.actors[rival.shipId];assert.equal(boat.boating.impactDamage||0,0,rival.id+' does not ram the quay '+JSON.stringify({now:f.now,position:boat.position,heading:boat.rotation.y,target:boat.boating.assistRoute?.[boat.boating.routeIndex],phase:rival.phase,job:rival.job.contractId,wait:rival.waitingFor,actors:Object.values(f.sim.actors).filter(isWatercraft).map(a=>({id:a.id,position:a.position}))}));assert.equal(rival.job.quality,100);assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(point=>harborWaterAt(f.environment,point,.25)));seen.add(rival.id+':'+rival.phase);
  }
  if(f.deliveries.some(event=>event.contractId==='ai-qeshm-return')&&SHIPPING_RIVAL_PROFILES.every(profile=>f.deliveries.some(event=>event.companyId===profile.id)))break;
 }
 assert.ok(ticks<5200,'live rivals finish their route and backhaul instead of waiting indefinitely: '+JSON.stringify(shippingRivalsView(f.sim).map(rival=>({id:rival.id,phase:rival.phase,point:rival.position,wait:rival.waitingFor,gate:rival.job.checkpointIndex}))));
 assert.equal(new Set(f.deliveries.map(event=>event.deliveryId)).size,f.deliveries.length);
 for(const profile of SHIPPING_RIVAL_PROFILES){assert.ok(f.deliveries.some(event=>event.companyId===profile.id));for(const phase of ['loading','securing','sailing','unloading','dispatching'])assert.ok(seen.has(profile.id+':'+phase),profile.id+' performs '+phase);}
 for(const event of f.deliveries){assert.equal(event.quality,100);assert.ok(event.distanceSailed>400);assert.ok(event.deliveredAt>event.departedAt+30000);assert.ok(event.departedAt>event.startedAt);}
 for(const id of f.environment.builderScene.objects.filter(isWatercraft).map(actor=>actor.id))assert.deepEqual(f.sim.actors[id].position,initial[id].position,'public hull '+id+' remains available');
 const callbackCount=f.deliveries.length;stepShippingRivals(f.sim,f.environment,f.now,{collision:f.collision,onDelivery:event=>f.deliveries.push(event)});assert.equal(f.deliveries.length,callbackCount);
 t.diagnostic(JSON.stringify(f.deliveries.map(event=>({company:event.companyId,route:event.contractId,units:event.units,seconds:Math.round((event.deliveredAt-event.departedAt)/1000),metres:Math.round(event.distanceSailed)}))));
});
