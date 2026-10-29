import {randomUUID} from 'node:crypto';
import {straitAirRoute,straitPortFreight} from './public/js/strait-freight-network.js';
import {createPortTransfer,advancePortTransfer,portTransferProjection,portTransferRoute} from './world-port-freight.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const finished=new Set(['air-delivered','port-held','cancelled']);
export const AIR_FREIGHT_RULES=Object.freeze({roadCratesPerFlight:4,loadMs:2000,unloadMs:2000,leaseMs:1200000,maximumFlightMs:900000,reconnectGraceMs:15000,apronHalfWidth:12,apronHalfLength:75,maximumGroundSpeed:.8});
export function ensureAirFreight(ledger){ledger.airTasks ||= {};ledger.airReceipts ||= {};return ledger;}
function sliceLots(lines,offset,quantity){
 const allocations=[];let remaining=quantity;
 for(const line of lines||[]){if(offset>=line.quantity){offset-=line.quantity;continue;}const count=Math.min(remaining,line.quantity-offset);if(count>0)allocations.push({lotId:line.lotId,quantity:count});remaining-=count;offset=0;if(!remaining)break;}
 return allocations;
}
export function previewAirPlan(shipment){
 const route=straitAirRoute(shipment.destinationPortId),perCrate=shipment.packing?.unitsPerRoadCrate||Math.max(1,Math.ceil(Number(shipment.packing?.unitsPerContainer||1)/20)),capacity=perCrate*AIR_FREIGHT_RULES.roadCratesPerFlight;
 if(!route)fail('This receiving port has no connected airfield. Choose road delivery or a port with air cargo service.',422);
 if(!Number.isSafeInteger(shipment.quantity)||shipment.quantity<1||!Number.isSafeInteger(capacity)||capacity<1)fail('This shipment has no valid air packing capacity.',422);
 return {route:clone(route),unitsPerRoadCrate:perCrate,capacity,flightsRequired:Math.ceil(shipment.quantity/capacity)};
}
/** Sea receipts retain the stock in port escrow. Air manifests divide the
 * existing quantity and lot allocations; preparing them never grants stock. */
export function prepareAirTransfers(ledger,shipment,now){
 ensureAirFreight(ledger);
 if(shipment.onwardMode!=='air'||!shipment.seaReceipt)return [];
 if(shipment.airTaskIds)return shipment.airTaskIds.map(id=>ledger.airTasks[id]).filter(Boolean);
 const plan=previewAirPlan(shipment),rows=[];let offset=0,index=0;
 while(offset<shipment.quantity){
  const quantity=Math.min(plan.capacity,shipment.quantity-offset),id='air:'+shipment.id+':'+index++,task={id,shipmentId:shipment.id,orderId:shipment.orderId||null,deedId:shipment.deedId||null,addressId:shipment.addressId||null,ownerId:shipment.ownerId,recipientId:shipment.recipientId||shipment.ownerId,itemId:shipment.itemId,itemName:shipment.itemName,quantity,offset,unitsPerRoadCrate:plan.unitsPerRoadCrate,crateCount:Math.ceil(quantity/plan.unitsPerRoadCrate),mapId:plan.route.mapId,sourcePortId:plan.route.originPortId||plan.route.fromPortId,destinationPortId:plan.route.destinationPortId||plan.route.toPortId,destinationMapId:shipment.destinationMapId,route:clone(plan.route),lotAllocations:sliceLots(ledger.factoryLotAllocations?.[shipment.id]?.lots,offset,quantity),phase:'awaiting-pilot',createdAt:now,updatedAt:now};
  const connection=straitPortFreight(task.sourcePortId),waypoints=[...connection.roadWaypoints,...connection.airRoadWaypoints.slice(1)];
  task.portHandling=createPortTransfer(ledger,{id:'air-origin:'+id,mapId:task.mapId,portId:task.sourcePortId,name:connection.name+' · quay to air cargo apron',waypoints},now);task.phase='port-transfer';
  ledger.airTasks[id]=task;rows.push(task);offset+=quantity;
 }
 shipment.airTaskIds=rows.map(task=>task.id);shipment.airReceivedQuantity=0;return rows;
}
function clearReservation(task,now,reason){
 for(const key of ['captainId','aircraftId','reservationId','reservedAt','leaseUntil'])delete task[key];
 task.phase='awaiting-pilot';task.updatedAt=now;if(reason)task.message=reason;
}
export function advanceAirTransfers(ledger,now,{canAdvance=()=>true}={}){
 ensureAirFreight(ledger);
 for(const task of Object.values(ledger.airTasks)){
  if(finished.has(task.phase))continue;
  if((task.phase==='reserved'||task.phase==='blocked'&&task.heldPhase==='reserved')&&now>=task.leaseUntil)clearReservation(task,now,'The flight reservation expired. Cargo remains at the receiving port.');
  const valid=canAdvance(task);
  if(!valid){if(task.phase!=='blocked')task.heldPhase=task.phase;task.phase='blocked';task.message='Cargo is held because the receiving address or order changed.';if(task.portHandling)advancePortTransfer(task.portHandling,now,{held:true});continue;}
  if(task.phase==='blocked'){task.phase=task.heldPhase||'port-transfer';delete task.heldPhase;delete task.message;}
  if(task.portHandling){
   advancePortTransfer(task.portHandling,now);
   if(['port-transfer','awaiting-pilot'].includes(task.phase))task.phase=task.portHandling.phase==='complete'?'awaiting-pilot':'port-transfer';
  }
 }
 return ledger.airTasks;
}
export function reserveAirTransfer(ledger,taskId,{walletId,aircraftId,mapId}={},now){
 ensureAirFreight(ledger);const task=ledger.airTasks[taskId];
 if(!task)fail('This air cargo task is unavailable.',404);
 if(task.phase==='reserved'&&task.captainId===walletId&&task.aircraftId===aircraftId&&task.mapId===mapId)return task;
 if(task.phase!=='awaiting-pilot'||task.portHandling?.phase!=='complete')fail('Wait for the port truck to deliver this sealed cargo to the airfield, or finish the existing reservation.');
 if(!walletId||!aircraftId||mapId!==task.mapId)fail('Board a cargo aircraft in the assigned shipping map.');
 if(Object.values(ledger.airTasks).some(row=>row.phase==='reserved'&&(row.captainId===walletId||row.mapId===mapId&&row.aircraftId===aircraftId)))fail('Finish or release the existing air manifest before reserving another.');
 Object.assign(task,{phase:'reserved',captainId:walletId,aircraftId,reservationId:randomUUID(),reservedAt:now,leaseUntil:now+AIR_FREIGHT_RULES.leaseMs,updatedAt:now});return task;
}
export function releaseAirTransfer(ledger,taskId,{walletId,reservationId,reason}={},now){
 ensureAirFreight(ledger);const task=ledger.airTasks[taskId];if(!task)fail('This air cargo task is unavailable.',404);
 if(finished.has(task.phase)||task.phase==='awaiting-pilot')return task;
 if(task.captainId!==walletId||reservationId&&task.reservationId!==reservationId)fail('This air manifest belongs to another pilot.',403);
 clearReservation(task,now,reason||'Flight released. Sealed cargo remains reserved at the receiving port.');return task;
}
export function holdAirTransfers(ledger,shipment,now){
 ensureAirFreight(ledger);
 for(const task of Object.values(ledger.airTasks))if(task.shipmentId===shipment.id&&!finished.has(task.phase)){task.phase='port-held';task.updatedAt=now;task.heldAt=now;task.message='The sender held the remaining cargo at port.';}
}
/** Only the gameplay callback supplies this proof. HTTP order/dispatch input
 * cannot settle an air task. All identifiers and quantities match its seal. */
export function settleAirTransfer(ledger,proof,now){
 ensureAirFreight(ledger);const task=ledger.airTasks[proof.airTaskId],receipt=ledger.airReceipts[proof.airTaskId];
 if(receipt){if(receipt.reservationId!==proof.reservationId||receipt.deliveryId!==proof.deliveryId)fail('This air cargo was already received by a different flight.');return receipt;}
 if(!task||task.phase!=='reserved')fail('This air manifest is no longer available.');
 if(task.captainId!==proof.captainId||task.aircraftId!==proof.aircraftId||task.mapId!==proof.mapId||task.shipmentId!==proof.shipmentId||task.reservationId!==proof.reservationId||task.quantity!==proof.quantity||!proof.deliveryId)fail('This flight does not match the sealed air manifest.',422);
 const times=['loadedAt','securedAt','departedAt','approachAt','landedAt','deliveredAt'].map(key=>proof[key]);
 if(!times.every(Number.isSafeInteger)||times.some((value,index)=>value<task.reservedAt||index&&value<times[index-1])||proof.deliveredAt>now||proof.deliveredAt>task.leaseUntil||proof.deliveredAt-proof.loadedAt>AIR_FREIGHT_RULES.maximumFlightMs||proof.securedAt-proof.loadedAt<AIR_FREIGHT_RULES.loadMs||proof.deliveredAt-proof.landedAt<AIR_FREIGHT_RULES.unloadMs)fail('A complete ordered loading, flight and stopped unloading proof is required.',422);
 const record={id:'air-receipt:'+task.id,airTaskId:task.id,shipmentId:task.shipmentId,orderId:task.orderId,addressId:task.addressId,itemId:task.itemId,quantity:task.quantity,mapId:task.mapId,sourcePortId:task.sourcePortId,destinationPortId:task.destinationPortId,captainId:task.captainId,aircraftId:task.aircraftId,reservationId:task.reservationId,deliveryId:proof.deliveryId,loadedAt:proof.loadedAt,departedAt:proof.departedAt,landedAt:proof.landedAt,receivedAt:now,quality:100,lotAllocations:clone(task.lotAllocations)};
 ledger.airReceipts[task.id]=record;task.phase='air-delivered';task.deliveredAt=now;task.updatedAt=now;task.receiptId=record.id;
 const shipment=ledger.shipments?.[task.shipmentId];if(shipment)shipment.airReceivedQuantity=(shipment.airTaskIds||[]).map(id=>ledger.airTasks[id]).filter(row=>row?.phase==='air-delivered').reduce((sum,row)=>sum+row.quantity,0);
 return record;
}
export function projectAirTransfers(ledger,mapId,now){
 ensureAirFreight(ledger);const tasks=Object.values(ledger.airTasks).filter(task=>task.mapId===mapId&&!['cancelled','port-held','air-delivered'].includes(task.phase)),seen=new Set(),routes=[],dropoffs=[],vehicles=[];
 for(const task of tasks){
  if(task.portHandling){const vehicle=portTransferProjection(task.portHandling,now);if(vehicle&&vehicles.length<16){vehicles.push(vehicle);routes.push(portTransferRoute(task.portHandling));}}
  const route=task.route;if(!route||seen.has(route.id))continue;seen.add(route.id);const from=route.origin||route.from,to=route.destination||route.to;
  routes.push({id:route.id,mapId,status:task.phase==='blocked'?'blocked':'ready',kind:'air',origin:clone(from),destination:clone(to),airWaypoints:[clone(from.cargoApron),clone(from.departure),clone(to.approach),clone(to.cargoApron)]});
  for(const [field,kind]of [[from,'air-cargo-departure'],[to,'air-cargo-arrival']])dropoffs.push({id:'air-apron:'+field.id,mapId,kind,name:field.name+' cargo apron',position:clone(field.cargoApron)});
 }
 return {serverTime:now,mapId,routes,dropoffs,vehicles,aircraft:[]};
}
