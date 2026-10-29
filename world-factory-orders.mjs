import {randomUUID} from 'node:crypto';
import {plotSpaceId,plotPlayUrl} from './member-plots.mjs';
import {allocateFactoryLots,returnFactoryLots} from './world-factory-lineage.mjs';
import {isShippingEnvironment} from './public/js/shipping-config.js';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const terminal=new Set(['cancelled','delivered']);

export function ownedSupplyDeeds(data,walletId){
 return Object.values(data.landDeeds||{}).filter(deed=>deed.status==='active'&&deed.ownerId===walletId&&data.users[walletId]?.items.some(item=>item.id===deed.id&&item.type==='land-deed')).map(deed=>({...deed,destinationMapId:plotSpaceId(deed),spaceId:plotSpaceId(deed),playUrl:plotPlayUrl(deed)}));
}
export function requireSupplyDeed(data,walletId,deedId){
 const deed=Object.values(data.landDeeds||{}).find(deed=>deed.id===deedId);
 if(!deed||deed.status!=='active')fail('Choose an active plot deed.',404);
 if(!ownedSupplyDeeds(data,walletId).some(entry=>entry.id===deedId))fail('Only the current deed holder can order supplies for this plot.',403);
 return deed;
}
export function orderDestination(data,walletId,input,directory,routes){
 const deed=requireSupplyDeed(data,walletId,input.deedId),destinationMapId=plotSpaceId(deed),route=routes.find(route=>route.id===input.contractId);
 if(input.destinationMapId!==undefined&&input.destinationMapId!==destinationMapId)fail('The delivery destination must match the selected deed.',422);
 if(!directory.maps.some(map=>map.id===destinationMapId))fail('This deed’s plot inventory is not available yet. Refresh your member plots.',404);
 if(!route)fail('Choose a shipping lane with a destination port.',422);
 if(!directory.maps.some(map=>map.id===input.shippingMapId&&isShippingEnvironment(map)))fail('Choose an available shipping map.',404);
 return {deed,destinationMapId,route};
}
export function refreshFactoryOrders(ledger,data,now){
 ledger.orders ||= {};
 for(const order of Object.values(ledger.orders)){
  if(terminal.has(order.phase))continue;
  const job=ledger.production[order.productionId],shipments=order.shipmentIds.map(id=>ledger.shipments[id]).filter(Boolean);
  order.deliveredQuantity=shipments.filter(shipment=>shipment.phase==='delivered').reduce((sum,shipment)=>sum+shipment.quantity,0);
  if(order.deliveredQuantity===order.quantity){order.phase='delivered';order.deliveredAt ||= now;delete order.attentionReason;continue;}
  if(job?.phase==='cancelled'){order.phase='cancelled';order.cancelledAt ||= job.cancelledAt||now;continue;}
  // Once a deed changes hands, hold the paid output. A later owner must never
  // inherit an earlier owner's unfulfilled order merely by buying the plot.
  if(!ownedSupplyDeeds(data,order.ownerId).some(deed=>deed.id===order.deedId)){
   order.phase='attention';order.attentionReason='Deed ownership changed. Cancel the remaining order to release unsent output; delivered stock stays at its destination.';
  }else if(order.phase!=='attention'){
   order.phase=job?.phase==='paused'?'paused':job?.phase==='building'?'building':shipments.some(shipment=>shipment.phase==='reserved')?'in-transit':'awaiting-shipping';
  }
  order.updatedAt=now;
 }
}
export function stageFactoryOrders(ledger,data,directory,routes,now,createShipment){
 refreshFactoryOrders(ledger,data,now);
 for(const order of Object.values(ledger.orders)){
  const job=ledger.production[order.productionId],lot=ledger.factoryLots[job?.outputLotId];
  if(lot&&!terminal.has(order.phase))lot.reservedOrderId=order.id;
  if(order.phase!=='awaiting-shipping'||!lot||order.shipmentIds.length)continue;
  const route=routes.find(route=>route.id===order.contractId);
  if(!route||!directory.maps.some(map=>map.id===order.shippingMapId&&isShippingEnvironment(map))||!directory.maps.some(map=>map.id===order.destinationMapId)){
   order.phase='attention';order.attentionReason='The assigned plot or shipping route is unavailable. Cancel this order to release its output.';continue;
  }
  const unitsPerContainer=job.recipe?.unitsPerContainer,capacity=(route.units||4)*unitsPerContainer;
  if(!Number.isSafeInteger(capacity)||capacity<1)fail('This order has an invalid saved packing plan.');
  let remaining=order.quantity;
  while(remaining){
   const quantity=Math.min(remaining,capacity),shipment=createShipment({id:randomUUID(),ownerId:order.ownerId,itemId:order.itemId,itemName:order.itemName,quantity,sourceMapId:'factory',destinationMapId:order.destinationMapId,shippingMapId:order.shippingMapId,contractId:order.contractId,orderId:order.id,deedId:order.deedId,productionId:job.id,packing:{recipeId:job.recipe.id,unitsPerContainer,containersRequired:Math.ceil(quantity/unitsPerContainer),containerSlots:route.units||4,maxShipmentQuantity:capacity,sealed:true}},route,now);
   ledger.shipments[shipment.id]=shipment;
   allocateFactoryLots(ledger,shipment,{now,lotId:lot.id,orderId:order.id});order.shipmentIds.push(shipment.id);remaining-=quantity;
  }
  order.stagedAt=now;
 }
}
export function assertOrderFreightAvailable(ledger,data,shipment){
 if(!shipment.orderId)return;
 const order=ledger.orders?.[shipment.orderId];
 if(!order||terminal.has(order.phase)||order.phase==='attention'||!ownedSupplyDeeds(data,order.ownerId).some(deed=>deed.id===order.deedId))fail('This deed order is on hold. The original owner must resolve it before shipping.');
}
export function cancelFactoryOrder(ledger,data,orderId,walletId,requestId,now,onReturned){
 const order=Object.hasOwn(ledger.orders||{},orderId)&&ledger.orders[orderId];
 if(!order||order.ownerId!==walletId)fail('This factory order is not yours.',403);
 if(terminal.has(order.phase))fail('This factory order is already complete or cancelled.');
 const shipments=order.shipmentIds.map(id=>ledger.shipments[id]).filter(Boolean);
 if(shipments.some(shipment=>shipment.phase==='reserved'))fail('Cancel the active sea voyage before cancelling the remaining order. Delivered cargo cannot be recalled.');
 const job=ledger.production[order.productionId],user=data.users[walletId];
 if(['building','paused'].includes(job?.phase)){
  job.phase='cancelled';job.cancelledAt=now;user.tokens.MZK+=job.priceMzk;
  data.transactions.push({id:'factory-refund:'+job.id,type:'WORLD_FACTORY_REFUND',walletId,requestId,amountMzk:job.priceMzk,balanceAfterMzk:user.tokens.MZK,orderId:order.id,createdAt:new Date(now).toISOString()});
 }
 for(const shipment of shipments)if(shipment.phase==='queued'){
  shipment.phase='cancelled';shipment.cancelledAt=now;if(shipment.transferTask)shipment.transferTask.phase='cancelled';onReturned(shipment,now);returnFactoryLots(ledger,shipment,{now});
 }
 for(const lot of Object.values(ledger.factoryLots))if(lot.reservedOrderId===order.id)delete lot.reservedOrderId;
 order.deliveredQuantity=shipments.filter(shipment=>shipment.phase==='delivered').reduce((sum,shipment)=>sum+shipment.quantity,0);
 order.cancelledQuantity=order.quantity-order.deliveredQuantity;
 order.phase='cancelled';order.cancelledAt=now;order.updatedAt=now;delete order.attentionReason;return order;
}
