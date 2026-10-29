import {randomUUID} from 'node:crypto';
import {isAircraft} from './public/js/aircraft-flight.js';
import {AIR_FREIGHT_RULES} from './world-air-freight.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const terminal=new Set(['delivered','cancelled']);
const speed=craft=>Math.max(Math.abs(Number(craft?.flight?.speed)||0),Math.abs(Number(craft?.flight?.airspeed)||0));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const origin=route=>route?.origin||route?.from;
const destination=route=>route?.destination||route?.to;
const environmentRevision=environment=>String(environment?.contentUpdatedAt||environment?.updatedAt||'');
const publicReceipt=receipt=>receipt?{id:receipt.id,airTaskId:receipt.airTaskId,quantity:receipt.quantity,receivedAt:receipt.receivedAt}:null;
export function playerAirFreightView(player){
 const job=player?.airFreight;if(!job)return null;
 return {id:job.id,airTaskId:job.airTaskId,mapId:job.mapId,aircraftId:job.aircraftId,phase:job.phase,quantity:job.quantity,route:job.route,message:job.message,loadReadyAt:job.loadReadyAt,unloadReadyAt:job.unloadReadyAt,deliveredAt:job.deliveredAt,cancelledAt:job.cancelledAt};
}
function parkedAt(craft,airfield){const apron=airfield?.cargoApron;return !!apron&&craft.flight?.airborne!==true&&speed(craft)<AIR_FREIGHT_RULES.maximumGroundSpeed&&Math.abs(craft.position.x-apron.x)<=AIR_FREIGHT_RULES.apronHalfWidth&&Math.abs(craft.position.z-apron.z)<=AIR_FREIGHT_RULES.apronHalfLength&&Math.abs(craft.position.y-(apron.y||0))<=1.5;}
export function cancelWorldAirFreight(player,now,reason='Air freight ended after exit, relocation or disconnection. Cargo remains at port.'){
 const job=player?.airFreight;if(!job||terminal.has(job.phase))return false;
 job.phase='cancelled';job.cancelledAt=now;job.message=reason;return true;
}
export function validateAirReservation(sim,player,environment,task,now){
 const craft=sim.actors?.[player?.vehicleId];
 if(!player||player.health<=0||now-player.lastSeen>AIR_FREIGHT_RULES.reconnectGraceMs||player.replacedByRoom)fail('Join the live shipping room before taking an air manifest.');
 if(!isAircraft(craft)||craft.active===false||craft.health<=0||craft.trafficAI||craft.holderId!==player.actorId)fail('Board a free cargo aircraft before reserving this flight.');
 if(environment.id!==task.mapId||!environment.airport?.enabled)fail('This air cargo belongs to another airport map.');
 if(player.vehicleMission?.status==='active'||['loading','secured','sailing','unloading'].includes(player.shipping?.job?.phase))fail('Finish or cancel the active craft assignment before reserving cargo.');
 if(player.airFreight&&!terminal.has(player.airFreight.phase)&&player.airFreight.airTaskId!==task.id)fail('Finish or release the current air cargo first.');
 if(!parkedAt(craft,origin(task.route)))fail('Park at the origin port cargo apron and stop before loading.');
 return craft;
}
function currentJob(sim,player,environment,now){
 const job=player?.airFreight;if(!job||terminal.has(job.phase))return null;
 const craft=sim.actors?.[job.aircraftId];
 if(environment.id!==job.mapId||environmentRevision(environment)!==job.environmentRevision||player.replacedByRoom||player.health<=0||now-player.lastSeen>AIR_FREIGHT_RULES.reconnectGraceMs||player.vehicleMission?.status==='active'||player.vehicleId!==job.aircraftId||!isAircraft(craft)||craft.active===false||craft.health<=0||craft.holderId!==player.actorId||(player.movementRevision||0)!==job.movementRevision||(craft.placementRevision||0)!==job.placementRevision||now>job.leaseUntil){cancelWorldAirFreight(player,now);return null;}
 return {job,craft};
}
/** All proof positions come from the authoritative aircraft after physics.
 * Snapshot polling and HTTP request payloads cannot advance these markers. */
export function stepWorldAirFreight(sim,environment,now){
 for(const player of Object.values(sim.players||{})){
  const current=currentJob(sim,player,environment,now);if(!current)continue;const {job,craft}=current,from=origin(job.route),to=destination(job.route);
  if(job.phase==='loading'){
   if(!parkedAt(craft,from)){job.phase='reserved';delete job.loadedAt;delete job.loadReadyAt;job.message='Loading stopped. Park at the origin cargo apron to restart.';}
   else if(now>=job.loadReadyAt){job.phase='loaded';job.message='Cargo loaded. Secure the sealed manifest before takeoff.';}
  }
  if(['reserved','loading','loaded'].includes(job.phase)&&craft.flight?.airborne){cancelWorldAirFreight(player,now,'The aircraft departed without securing its air manifest. Cargo remains at port.');continue;}
  if(job.phase==='secured'&&craft.flight?.airborne===true&&(Number(craft.flight.altitude)||0)>=12&&gap(craft.position,from.runway||from)<=260){job.departedAt=now;job.phase='airborne';job.message='Departure verified. Fly to the receiving airfield approach beacon.';}
  if(job.phase==='airborne'&&craft.flight?.airborne===true&&(Number(craft.flight.altitude)||0)>=8&&gap(craft.position,to.approach)<=95){job.approachAt=now;job.phase='approach';job.message='Receiving approach verified. Land and park at the cargo apron.';}
  if(['approach','landed','unloading'].includes(job.phase)){
   if(parkedAt(craft,to)){
    job.landedAt ||= now;
    if(job.phase==='approach')job.phase='landed';
    if(job.phase==='unloading'&&now>=job.unloadReadyAt)job.message='Stopped unloading complete. Confirm unload to hand cargo to the receiving trucks.';
   }else{
    delete job.landedAt;delete job.unloadReadyAt;
    if(job.phase!=='approach')job.phase='approach';
   }
  }
 }
}
// The existing Auto takeoff stages a stopped aircraft on its assigned runway.
// Only this explicit server action may rebase a secured manifest's revision.
export function allowAirFreightTakeoff(player,craft,now){
 const job=player?.airFreight;
 if(job?.phase==='secured'&&job.aircraftId===craft.id&&(player.movementRevision||0)===job.movementRevision+1&&!job.departedAt&&now<=job.leaseUntil)job.movementRevision=player.movementRevision;
}
export async function worldSupplyAirCommand(sim,player,environment,command,now,{identity,action,delivery}={}){
 stepWorldAirFreight(sim,environment,now);const operation=command.operation,taskId=command.airTaskId||command.taskId;
 if(operation==='reserve'){
  const result=await action(identity,sim,player,environment,{operation,airTaskId:taskId},now),task=result.task||result,craft=validateAirReservation(sim,player,environment,task,now);
  const previous=player.airFreight;if(previous&&!terminal.has(previous.phase)&&previous.airTaskId===task.id&&previous.reservationId===task.reservationId)return {message:previous.message||'This air manifest is already reserved.'};
  player.airFreight={id:randomUUID(),airTaskId:task.id,shipmentId:task.shipmentId,quantity:task.quantity,mapId:environment.id,environmentRevision:environmentRevision(environment),aircraftId:craft.id,reservationId:task.reservationId||result.reservationId,route:clone(task.route),phase:'reserved',reservedAt:task.reservedAt,leaseUntil:task.leaseUntil,movementRevision:player.movementRevision||0,placementRevision:craft.placementRevision||0,message:'Air cargo reserved. Load while parked at the port cargo apron.'};
  return {message:player.airFreight.message};
 }
 const job=player.airFreight;
 if(operation==='release'){
  if(!job||taskId&&job.airTaskId!==taskId)fail('Choose your current air manifest.');
  await action(identity,sim,player,environment,{operation:'release',airTaskId:job.airTaskId,reservationId:job.reservationId},now);cancelWorldAirFreight(player,now,'Air manifest released. Cargo remains sealed at port.');job.releasedAt=now;return {message:job.message};
 }
 if(!job||taskId&&job.airTaskId!==taskId)fail('Reserve this air manifest in its cargo aircraft first.');
 if(job.phase==='delivered'&&operation==='unload')return {message:'This air cargo was already received.',airReceipt:publicReceipt(job.receipt)};
 const current=currentJob(sim,player,environment,now);if(!current)fail(job.message||'This air manifest is no longer active.');const {craft}=current;
 if(operation==='load'){
  if(!['reserved','loading','loaded'].includes(job.phase)||!parkedAt(craft,origin(job.route)))fail('Stop at the origin port cargo apron before loading.');
  if(job.phase==='reserved'){job.loadedAt=now;job.loadReadyAt=now+AIR_FREIGHT_RULES.loadMs;job.phase='loading';job.message='Loading sealed cargo. Keep the aircraft parked.';}
  return {message:job.message};
 }
 if(operation==='secure'){
  if(job.phase==='secured')return {message:'The air manifest is already secured.'};
  if(job.phase!=='loaded'||!parkedAt(craft,origin(job.route)))fail('Complete loading at the origin cargo apron before securing the manifest.');
  job.securedAt=now;job.phase='secured';job.message='Manifest sealed. Fly to '+(destination(job.route).name||'the receiving airfield')+'.';return {message:job.message};
 }
 if(operation==='unload'){
  if(!['landed','unloading'].includes(job.phase)||!parkedAt(craft,destination(job.route)))fail('Fly the departure and approach, then land and stop at the receiving cargo apron.');
  if(job.phase==='landed'){job.phase='unloading';job.unloadReadyAt=now+AIR_FREIGHT_RULES.unloadMs;job.message='Unloading sealed cargo. Keep the aircraft parked, then confirm unload.';return {message:job.message};}
  if(now<job.unloadReadyAt)fail('Keep the aircraft stopped until unloading completes.');
  const proof={deliveryId:job.id,airTaskId:job.airTaskId,shipmentId:job.shipmentId,reservationId:job.reservationId,aircraftId:job.aircraftId,mapId:environment.id,quantity:job.quantity,loadedAt:job.loadedAt,securedAt:job.securedAt,departedAt:job.departedAt,approachAt:job.approachAt,landedAt:job.landedAt,deliveredAt:now};
  const receipt=await delivery(identity,proof,environment,now);job.phase='delivered';job.deliveredAt=now;job.receipt=receipt;job.message='Air cargo received. Airport handling and the receiving trucks complete the final doorstep delivery.';return {message:job.message,airReceipt:publicReceipt(receipt)};
 }
 fail('Choose reserve, load, secure, unload or release for air cargo.',422);
}
