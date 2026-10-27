import {randomUUID} from 'node:crypto';
import {SHIPPING_PORTS,SHIPPING_CARGO,isShippingEnvironment} from './public/js/shipping-config.js';
import {SHIPPING_RIVAL_PROFILES,SHIPPING_RIVAL_RULES,shippingCommercialBerth,shippingRivalRoute} from './public/js/shipping-ai-config.js';
import {shippingVesselType} from './public/js/shipping-vessel-specs.js';
import {boatAssistedInput,boatMovementBlocked} from './server-boat-assist.mjs';
import {stepBoatSimulation} from './public/js/boat-simulation.js';
import {clearBoatAssist} from './public/js/boat-assist.js';
import {harborWaterAt,isWatercraft,watercraftFootprint,watercraftOverlap,watercraftSize} from './public/js/harbor-water.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const portBy=id=>SHIPPING_PORTS.find(port=>port.id===id);
const cargoBy=id=>SHIPPING_CARGO.find(cargo=>cargo.id===id);
const phaseDuration=(rival,phase)=>phase==='securing'?SHIPPING_RIVAL_RULES.securingMs:phase==='dispatching'?SHIPPING_RIVAL_RULES.dispatchMs:rival.handlingMs;
const stats=()=>({deliveries:0,unitsDelivered:0,score:0,distanceSailed:0,qualityTotal:0});
const portState=(sim,portId,now)=>{
 const economies=sim.shipping.portEconomy ||= {};
 return economies[portId] ||= {portId,stock:Object.fromEntries(SHIPPING_CARGO.map(cargo=>[cargo.id,SHIPPING_RIVAL_RULES.warehouseTarget])),loaded:0,unloaded:0,imports:0,exports:0,updatedAt:now,productionAt:now+SHIPPING_RIVAL_RULES.warehouseProductionMs};
};
function dispatch(sim,rival,now,type,message,portId){
 const event={id:randomUUID(),at:now,type,companyId:rival.id,companyName:rival.companyName,shipId:rival.shipId,portId:portId||null,message};
 const events=sim.shipping.dispatch ||= [];events.push(event);if(events.length>60)events.splice(0,events.length-60);
 return event;
}
function schedule(rival,phase,now){rival.phase=phase;if(rival.job)rival.job.phase=phase;rival.workStartedAt=now;rival.nextWorkAt=now+phaseDuration(rival,phase);}
function clearPose(environment,boat,position,yaw,actors,padding=.35){
 return watercraftFootprint(position,yaw,boat).every(vertex=>harborWaterAt(environment,vertex,padding))&&!Object.values(actors||{}).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(position,yaw,other.position,other.rotation?.y||0,.25,boat,other));
}
function buildPoints(route,origin,destination){
 const core=route.coreOnly?route.waypoints:route.waypoints.slice(1,-2);
 return [
  {...origin.entry,name:'Commercial quay · pull astern clear',gear:-1},
  {...origin.seaward,name:'Commercial departure · clear the dock'},
  ...core.map(point=>({...point,gear:1})),
  {...destination.seaward,name:portBy(route.to).name+' · commercial approach'},
  {...destination.entry,name:portBy(route.to).name+' · align with commercial berth'},
  {x:destination.x,z:destination.z,yaw:destination.yaw,name:portBy(route.to).name+' · commercial cargo berth'}
 ];
}
function beginJob(sim,rival,boat,environment,now){
 const route=shippingRivalRoute(rival.routeIds[rival.routeIndex%rival.routeIds.length]);
 if(!route||route.from!==rival.currentPortId){rival.message='Awaiting a connected backhaul manifest.';return false;}
 const origin=shippingCommercialBerth(route.from),destination=shippingCommercialBerth(route.to),cargo=cargoBy(route.cargoId),spec=shippingVesselType(boat);
 if(!cargo||!origin||!destination||route.units>spec.slots||route.units*cargo.mass>spec.capacity)return false;
 if(!watercraftFootprint(destination,destination.yaw,boat).every(vertex=>harborWaterAt(environment,vertex,.35))){rival.message='Receiving commercial berth has no safe water approach.';return false;}
 const waypoints=buildPoints(route,origin,destination);
 rival.job={id:randomUUID(),contractId:route.id,title:route.name,phase:'loading',originId:route.from,destinationId:route.to,cargoId:cargo.id,units:route.units,loaded:[],unloaded:0,quality:100,checkpointIndex:0,waypoints,receivingBerth:{x:destination.x,z:destination.z,yaw:destination.yaw},startedAt:now,departedAt:null,distanceSailed:0,lastHullHealth:boat.health};
 rival.message='Loading '+cargo.name+' at '+portBy(route.from).name+'.';
 schedule(rival,'loading',now);dispatch(sim,rival,now,'manifest',rival.companyName+' accepted '+route.name+'.',route.from);updateActor(rival,boat);return true;
}
function updateActor(rival,boat){
 const job=rival.job,cargo=job&&cargoBy(job.cargoId),remaining=job?job.loaded.slice(job.unloaded):[],spec=shippingVesselType(boat);
 boat.boating ||= {};Object.assign(boat.boating,{cargoCount:remaining.length,cargoPortCount:remaining.filter(unit=>unit.side==='port').length,cargoStarboardCount:remaining.filter(unit=>unit.side==='starboard').length,cargoCapacity:spec.slots,cargoMass:remaining.reduce((sum,unit)=>sum+unit.mass,0),cargoSecured:rival.phase==='sailing'||rival.phase==='unloading'});
 boat.trafficJob={title:job?.title||'Awaiting a freight manifest',phase:rival.phase,companyId:rival.id,originId:job?.originId||rival.currentPortId,destinationId:job?.destinationId||rival.currentPortId,cargoId:cargo?.id||null,units:job?.units||0,loaded:job?.loaded.length||0,unloaded:job?.unloaded||0,completed:rival.stats.deliveries,checkpointIndex:job?.checkpointIndex||0};
 boat.shippingPhase=rival.phase;boat.shippingCargo=job?.cargoId||null;
}
function startPassage(rival,boat,now){
 const job=rival.job;clearBoatAssist(boat);Object.assign(boat.boating,{assist:'navigate',anchor:false,assistSince:now,assistOrigin:{...boat.position},assistRoute:job.waypoints.map((point,index)=>({...point,radius:index===job.waypoints.length-1?1.35:5,gear:point.gear||1})),routeIndex:0,routeLength:job.waypoints.length,navigationType:'shipping-rival',navigationRouteId:job.id,navigationDestinationId:job.destinationId,navigationName:job.title,navigationTarget:{...job.receivingBerth}});job.departedAt=now;rival.phase=job.phase='sailing';rival.message='Underway to '+portBy(job.destinationId).name+'.';rival.stalledSince=null;
}
function humanPriority(sim,rival,boat,next,now){
 return Object.values(sim.players||{}).some(player=>!player.replacedByRoom&&player.health>0&&now-player.lastSeen<15000&&player.vehicleId&&isWatercraft(sim.actors[player.vehicleId])&&(()=>{const human=sim.actors[player.vehicleId],distance=gap(boat.position,human.position),safe=Math.hypot(...watercraftSize(boat))+Math.hypot(...watercraftSize(human))+24;return distance<safe&&gap(next,human.position)<distance-.001;})());
}
function rivalPriority(sim,rival,boat,next,input){
 const yielding=sim.actors[rival.giveWayTo];
 if(yielding?.active!==false&&isWatercraft(yielding)){
  const distance=gap(boat.position,yielding.position),safe=Math.hypot(...watercraftSize(boat))+Math.hypot(...watercraftSize(yielding))+24;
  if(distance>safe+15){delete rival.giveWayTo;delete rival.detouringFor;}
  else if(rival.detouringFor===yielding.id&&(input.bowThruster===true&&Math.abs(boat.boating.speed||0)<.2||gap(next,yielding.position)>=distance-.001))return null;
  else return yielding.id;
 }
 for(const other of Object.values(sim.actors)){
  if(!other.shippingRival||other.id===boat.id||other.active===false||String(rival.id)<String(other.shippingCompany))continue;
  const distance=gap(boat.position,other.position),safe=Math.hypot(...watercraftSize(boat))+Math.hypot(...watercraftSize(other))+24;
  if(distance<safe&&gap(next,other.position)<distance-.001){rival.giveWayTo=other.id;return other.id;}
 }
 return null;
}
function legClear(environment,boat,from,to,actors,blocked){
 const distance=gap(from,to),yaw=Math.atan2(from.x-to.x,from.z-to.z),steps=Math.max(1,Math.ceil(distance/3));
 for(let index=0;index<=steps;index++){const ratio=index/steps,position={x:from.x+(to.x-from.x)*ratio,z:from.z+(to.z-from.z)*ratio};if(!clearPose(environment,boat,position,yaw,actors))return false;}
 return !blocked({...from,y:0},{...to,y:0},yaw);
}
function tryPassingRoute(sim,rival,boat,environment,blocked,now){
 const state=boat.boating,target=state.assistRoute?.[state.routeIndex||0];if(!target||target.gear<0)return false;
 const blockers=Object.values(sim.actors).filter(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&gap(other.position,boat.position)<120).sort((a,b)=>gap(a.position,boat.position)-gap(b.position,boat.position));
 const blocker=blockers[0];if(!blocker||blocker.shippingRival&&String(rival.id)<String(blocker.shippingCompany))return false;const dx=target.x-boat.position.x,dz=target.z-boat.position.z,span=Math.hypot(dx,dz);if(span<15)return false;
 const nx=dx/span,nz=dz/span,clearance=Math.hypot(...watercraftSize(boat))+Math.hypot(...watercraftSize(blocker))+18;
 for(const sign of [1,-1]){
  const a={x:blocker.position.x-nx*clearance-nz*clearance*sign,z:blocker.position.z-nz*clearance+nx*clearance*sign,radius:4,gear:1},b={x:blocker.position.x+nx*clearance-nz*clearance*sign,z:blocker.position.z+nz*clearance+nx*clearance*sign,radius:4,gear:1};
  if(!legClear(environment,boat,boat.position,a,sim.actors,blocked)||!legClear(environment,boat,a,b,sim.actors,blocked)||!legClear(environment,boat,b,target,sim.actors,blocked))continue;
  state.assistRoute.splice(state.routeIndex||0,0,a,b);state.routeLength=state.assistRoute.length;rival.message='Giving way via a clear passing channel.';rival.detourAt=now;rival.detouringFor=blocker.id;return true;
 }
 return false;
}
function stepPassage(sim,rival,boat,environment,now,dt,{collision,objects}){
 const job=rival.job,blocked=boatMovementBlocked(environment,boat,sim.actors,collision,objects),before={...boat.position};
 let input=boatAssistedInput(boat,{},environment,now,sim.actors,blocked);
 const waitingBerth=job.checkpointIndex>=job.waypoints.length-2&&!clearPose(environment,boat,job.receivingBerth,job.receivingBerth.yaw,sim.actors);
 if(waitingBerth)input={throttle:0,side:0,brake:true,anchor:false};
 if(Number.isFinite(input.throttle)&&input.throttle>0)input={...input,throttle:input.throttle*rival.speedFactor};
 let pose=stepBoatSimulation(boat,input,dt,{environment,now,blocked});
 const crewYield=rivalPriority(sim,rival,boat,pose.position,input),yielding=humanPriority(sim,rival,boat,pose.position,now)||!!crewYield;
 if(crewYield&&now-(rival.detourAt||0)>15000){rival.detourAt=now;tryPassingRoute(sim,rival,boat,environment,blocked,now);}
 if(yielding)pose=stepBoatSimulation(boat,{throttle:0,side:0,brake:true,anchor:false},dt,{environment,now,blocked});
 Object.assign(boat,pose);const moved=gap(before,boat.position);job.distanceSailed+=moved;rival.stats.distanceSailed+=moved;
 if(pose.boating.impactDamage){job.quality=Math.max(40,job.quality-Math.ceil(pose.boating.impactDamage/10));boat.health=Math.max(1,boat.health-pose.boating.impactDamage);}
 rival.waitingFor=waitingBerth?'commercial berth':yielding?crewYield?'commercial crossing':'player passage':pose.boating.assistStage==='waiting'?'clear channel':null;
 if(moved<.001&&rival.waitingFor){rival.stalledSince??=now;if(!waitingBerth&&now-rival.stalledSince>15000&&now-(rival.detourAt||0)>15000){rival.detourAt=now;tryPassingRoute(sim,rival,boat,environment,blocked,now);}}
 else rival.stalledSince=null;
 const point=job.waypoints[job.checkpointIndex];if(point&&gap(boat.position,point)<=(job.checkpointIndex===job.waypoints.length-1?3.5:9))job.checkpointIndex++;
 if(job.checkpointIndex>=job.waypoints.length&&!boat.boating.assist&&boat.boating.anchor&&Math.abs(boat.boating.speed||0)<.15&&gap(boat.position,job.receivingBerth)<3.5){
  rival.currentPortId=job.destinationId;schedule(rival,'unloading',now);rival.message='Receiving crane unloading '+cargoBy(job.cargoId).name+'.';dispatch(sim,rival,now,'arrived',rival.companyName+' docked at '+portBy(job.destinationId).name+'.',job.destinationId);
 }
 updateActor(rival,boat);
}
export function recordShippingPortDelivery(sim,event){
 if(!sim.shipping||!event?.deliveryId||!Number.isSafeInteger(event.units)||event.units<1||!cargoBy(event.cargoId)||!portBy(event.destinationId))return false;
 const receipts=sim.shipping.portDeliveryReceipts ||= [];if(receipts.includes(event.deliveryId))return false;
 const state=portState(sim,event.destinationId,event.deliveredAt);state.stock[event.cargoId]=Math.min(SHIPPING_RIVAL_RULES.maxWarehouseStock,(state.stock[event.cargoId]||0)+event.units);state.unloaded+=event.units;state.imports++;state.updatedAt=event.deliveredAt;
 receipts.push(event.deliveryId);if(receipts.length>200)receipts.splice(0,receipts.length-200);return true;
}
function completeDelivery(sim,rival,boat,now,onDelivery){
 const job=rival.job;if(job.deliveredAt)return;job.deliveredAt=now;job.phase='delivered';job.unloaded=job.units;
 const score=Math.round(job.units*job.quality),event={deliveryId:job.id,companyId:rival.id,companyName:rival.companyName,shipId:rival.shipId,contractId:job.contractId,cargoId:job.cargoId,originId:job.originId,destinationId:job.destinationId,units:job.units,quality:job.quality,score,distanceSailed:job.distanceSailed,startedAt:job.startedAt,departedAt:job.departedAt,deliveredAt:now};
 rival.stats.deliveries++;rival.stats.unitsDelivered+=job.units;rival.stats.score+=score;rival.stats.qualityTotal+=job.quality;recordShippingPortDelivery(sim,event);rival.lastDelivery=event;rival.message='Manifest delivered. Preparing the next freight contract.';schedule(rival,'dispatching',now);dispatch(sim,rival,now,'delivered',rival.companyName+' delivered '+job.units+' '+cargoBy(job.cargoId).name+' units at '+portBy(job.destinationId).name+'.',job.destinationId);updateActor(rival,boat);onDelivery?.(event);
}
function work(sim,rival,boat,environment,now,onDelivery){
 const job=rival.job;if(now<rival.nextWorkAt)return;
 if(rival.phase==='dispatching'){const previous=rival.routeIndex;if(job?.deliveredAt)rival.routeIndex=(rival.routeIndex+1)%rival.routeIds.length;if(!beginJob(sim,rival,boat,environment,now)){rival.routeIndex=previous;schedule(rival,'dispatching',now);}return;}
 if(!job)return;
 const berth=shippingCommercialBerth(rival.phase==='unloading'?job.destinationId:job.originId);
 if(!berth||gap(boat.position,berth)>3.5||Math.abs(boat.boating?.speed||0)>.15||!boat.boating?.anchor){rival.message='Waiting for a safely moored commercial berth.';rival.nextWorkAt=now+rival.handlingMs;return;}
 if(rival.phase==='loading'){
  const cargo=cargoBy(job.cargoId),state=portState(sim,job.originId,now);if((state.stock[cargo.id]||0)<1){rival.message='Warehouse replenishment pending.';rival.nextWorkAt=now+rival.handlingMs;return;}
  const index=job.loaded.length,side=index%2?'starboard':'port';job.loaded.push({side,mass:cargo.mass,cargoId:cargo.id,loadedAt:now});state.stock[cargo.id]--;state.loaded++;state.updatedAt=now;rival.lastTransfer={kind:'load',at:now,endsAt:now+rival.handlingMs,side,cargoId:cargo.id,unitIndex:index};rival.workStartedAt=now;rival.nextWorkAt=now+rival.handlingMs;
  if(job.loaded.length===job.units){state.exports++;schedule(rival,'securing',now);rival.message='Manifest full. Crew securing balanced cargo.';}updateActor(rival,boat);return;
 }
 if(rival.phase==='securing'){startPassage(rival,boat,now);dispatch(sim,rival,now,'departed',rival.companyName+' departed '+portBy(job.originId).name+' for '+portBy(job.destinationId).name+'.',job.originId);updateActor(rival,boat);return;}
 if(rival.phase==='unloading'){
  const index=job.unloaded,unit=job.loaded[index];job.unloaded++;rival.lastTransfer={kind:'unload',at:now,endsAt:now+rival.handlingMs,side:unit?.side||'port',cargoId:job.cargoId,unitIndex:index};rival.workStartedAt=now;rival.nextWorkAt=now+rival.handlingMs;updateActor(rival,boat);if(job.unloaded===job.units)completeDelivery(sim,rival,boat,now,onDelivery);
 }
}
function initialize(sim,environment,now){
 sim.shipping ||= {enabled:true};sim.shipping.rivals ||= {};
 for(const port of SHIPPING_PORTS)portState(sim,port.id,now);
 for(const profile of SHIPPING_RIVAL_PROFILES){
  let rival=sim.shipping.rivals[profile.id],boat=rival&&sim.actors[rival.shipId];
  if(rival){if(boat){boat.shippingRival=true;boat.trafficAI=true;boat.destructible=false;boat.holderId=null;delete rival.recoveryRequired;}else{rival.recoveryRequired=true;rival.message='Vessel unavailable. Captain awaiting a verified recovery.';rival.lastStepAt=now;}continue;}
  const shipId='shipping-rival-'+profile.id,berth=shippingCommercialBerth(profile.homePortId),spec=shippingVesselType(profile.modelId),candidate={id:shipId,modelId:profile.modelId};
  if(!clearPose(environment,candidate,berth,berth.yaw,sim.actors))continue;
  rival=sim.shipping.rivals[profile.id]={...copy(profile),shipId,actorId:shipId,phase:'dispatching',currentPortId:profile.homePortId,routeIndex:0,stats:stats(),job:null,lastStepAt:now,workStartedAt:now,nextWorkAt:now+SHIPPING_RIVAL_RULES.dispatchMs,version:1};
  boat=sim.actors[shipId]={id:shipId,name:profile.name,modelId:profile.modelId,asset:{buildAssetId:profile.modelId},position:{x:berth.x,y:0,z:berth.z},rotation:{x:0,y:berth.yaw,z:0},scale:{x:1,y:1,z:1},active:true,health:profile.modelId==='shipping-feeder'?650:1200,maxHealth:profile.modelId==='shipping-feeder'?650:1200,spawned:true,trafficAI:true,shippingRival:true,shippingCompany:profile.id,destructible:false,holderId:null,crew:{name:profile.captainName,callsign:profile.callsign,company:profile.companyName},companyColor:profile.color,definition:{objectId:shipId,modelId:profile.modelId,gameplay:{behavior:'vehicle',enabled:true,destructible:false,interactionDistance:3},movement:{speed:spec.speed}},boating:{speed:0,throttle:0,throttleCommand:0,anchor:true,phase:'commercial berth',cargoCount:0,cargoCapacity:spec.slots}};
  beginJob(sim,rival,boat,environment,now);
 }
}
/** One bounded physical step and at most one crane/phase transition per server
 * timestamp. Reloading a stale room never converts elapsed wall time to cargo. */
export function stepShippingRivals(sim,environment,now,{collision,objects={},onDelivery}={}){
 if(!isShippingEnvironment(environment)||!Number.isFinite(now))return;
 sim.actors ||= {};sim.players ||= {};initialize(sim,environment,now);
 for(const state of Object.values(sim.shipping.portEconomy||{}))if(now>=state.productionAt){for(const cargo of SHIPPING_CARGO)if((state.stock[cargo.id]||0)<SHIPPING_RIVAL_RULES.warehouseTarget)state.stock[cargo.id]=(state.stock[cargo.id]||0)+1;state.productionAt=now+SHIPPING_RIVAL_RULES.warehouseProductionMs;state.updatedAt=now;}
 for(const rival of Object.values(sim.shipping.rivals)){
  const boat=sim.actors[rival.shipId];if(!boat||boat.active===false)continue;
  if(now<=rival.lastStepAt)continue;const gapMs=now-rival.lastStepAt;rival.lastStepAt=now;
  if(gapMs>15000){if(rival.phase!=='sailing'){rival.workStartedAt=now;rival.nextWorkAt=now+phaseDuration(rival,rival.phase);}continue;}
  if(rival.phase==='sailing')stepPassage(sim,rival,boat,environment,now,Math.min(SHIPPING_RIVAL_RULES.maxStepSeconds,gapMs/1000),{collision,objects});
  else work(sim,rival,boat,environment,now,onDelivery);
 }
}
export function shippingRivalsView(sim){return Object.values(sim.shipping?.rivals||{}).map(rival=>{
 const boat=sim.actors?.[rival.shipId],job=rival.job,remaining=boat?.boating?.remainingDistance||0,speed=Math.max(1,Math.abs(boat?.boating?.speed||0));
 return {id:rival.id,companyId:rival.id,companyName:rival.companyName,name:rival.name,captainName:rival.captainName,captain:rival.captainName,shipId:rival.shipId,actorId:rival.shipId,modelId:rival.modelId,color:rival.color,phase:rival.phase,message:rival.message,waitingFor:rival.waitingFor||null,position:boat?{...boat.position}:null,rotation:boat?{...boat.rotation}:null,job:job?copy(job):null,stats:{...rival.stats},deliveries:rival.stats.deliveries,score:rival.stats.score,etaSeconds:rival.phase==='sailing'?Math.ceil(remaining/speed):null,workStartedAt:rival.workStartedAt,nextWorkAt:rival.nextWorkAt,lastStepAt:rival.lastStepAt,lastTransfer:rival.lastTransfer?{...rival.lastTransfer}:null};
 });}
export function shippingPortEconomyView(sim){return Object.values(sim.shipping?.portEconomy||{}).map(state=>({...copy(state),arrivals:state.imports,departures:state.exports,receivedUnits:state.unloaded,dispatchedUnits:state.loaded,target:SHIPPING_RIVAL_RULES.warehouseTarget,demand:Object.fromEntries(SHIPPING_CARGO.map(cargo=>[cargo.id,Math.max(0,SHIPPING_RIVAL_RULES.warehouseTarget-(state.stock[cargo.id]||0))]))}));}
export function shippingDispatchView(sim){return (sim.shipping?.dispatch||[]).map(event=>({...event}));}
