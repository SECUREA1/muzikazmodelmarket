import {SHIPPING_PORTS,SHIPPING_ROUTES} from './public/js/shipping-config.js';
import {straitPortFreight,straitAirRoute} from './public/js/strait-freight-network.js';

const values=records=>Object.values(records||{});
const whole=value=>Number.isSafeInteger(value)&&value>0;
const count=value=>whole(value)?value:0;
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]??(axis==='y'?0:NaN)))?{x:value.x,y:value.y||0,z:value.z}:null;
const indexBy=(records,key)=>{const index=new Map();for(const record of values(records)){const id=record[key];if(!index.has(id))index.set(id,[]);index.get(id).push(record);}return index;};
const factoryMap=id=>id==='factory'?'world-item-factory':id==='world'?'public-commons':id;
const bounded=(value,total)=>Math.max(0,Math.min(total,value));

/** Build once per explicit supply response, never during gameplay frames. */
export function orderJourneyContext(ledger,{maps=[]}={}){
 return {maps:new Map(maps.filter(map=>map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])),roads:indexBy(ledger.deliveryTasks,'shipmentId'),air:indexBy(ledger.airTasks,'shipmentId')};
}
function mapStop(context,mapId,locationId,position){
 const map=context.maps.get(mapId),url=map?new URL('model-explorer.html','https://world.invalid/'):null;
 // Map types can supply a canonical local entry, but arbitrary request or
 // persisted order URLs are never reflected into a navigation link.
 if(url){
  let supplied;try{supplied=typeof map.playUrl==='string'?new URL(map.playUrl,'https://world.invalid/'):null;}catch{}
  if(supplied?.origin==='https://world.invalid'&&['/model-explorer.html','/hockey.html','/arcade.html','/tropical-island.html'].includes(supplied.pathname))url.pathname=supplied.pathname;
  url.searchParams.set('environment',mapId);url.searchParams.set('house',map.roomId||mapId);url.searchParams.set('mode',map.source==='custom-builder'&&map.builderScene?.gameplay?.multiplayer===false?'solo':'multiplayer');url.searchParams.set('autoplay','1');
 }
 return {mapId:mapId||null,mapName:map?.name||mapId||'World inventory',locationId:locationId||mapId||null,regionId:map?.regionId||map?.districtId||null,regionName:map?.regionName||map?.districtName||null,available:!!map,playUrl:url?url.pathname.slice(1)+url.search:null,...(point(position)?{position:point(position)}:{})};
}
function matching(receipt,shipment){return receipt&&receipt.shipmentId===shipment.id&&receipt.itemId===shipment.itemId&&receipt.quantity===shipment.quantity;}
function seaQuantity(ledger,shipment){
 const receipt=ledger.portReceipts?.[shipment.id];
 if(matching(receipt,shipment)&&receipt.shippingMapId===shipment.shippingMapId)return count(shipment.quantity);
 const stock=ledger.factoryStockReceipts?.[shipment.id];
 return !shipment.deliverySchemaVersion&&matching(stock,shipment)&&stock.destinationMapId===shipment.destinationMapId?count(shipment.quantity):0;
}
function airReceiptValid(ledger,task,shipment){
 const receipt=ledger.airReceipts?.[task.id];
 return receipt&&task.phase==='air-delivered'&&receipt.airTaskId===task.id&&receipt.shipmentId===shipment.id&&receipt.itemId===shipment.itemId&&receipt.quantity===task.quantity&&receipt.mapId===shipment.shippingMapId&&task.mapId===shipment.shippingMapId;
}
function doorReceiptValid(ledger,task,shipment){
 const receipt=ledger.dropoffReceipts?.[task.id];
 return receipt&&receipt.deliveryTaskId===task.id&&receipt.shipmentId===shipment.id&&receipt.itemId===shipment.itemId&&receipt.quantity===task.quantity&&receipt.destinationMapId===shipment.destinationMapId&&task.mapId===shipment.destinationMapId;
}

/** A read-only quest projection. A map visit, client clock, claimed phase or
 * requested destination can never substitute for durable freight receipts. */
export function projectOrderJourney(ledger,record,{maps=[],context=orderJourneyContext(ledger,{maps})}={}){
 const isOrder=Object.hasOwn(ledger.orders||{},record.id),shipments=isOrder?(record.shipmentIds||[]).map(id=>ledger.shipments?.[id]).filter(shipment=>shipment&&shipment.orderId===record.id):[record],quantity=count(record.quantity),shippingMapId=record.shippingMapId||shipments[0]?.shippingMapId;
 const route=SHIPPING_ROUTES.find(route=>route.id===record.contractId),originPortId=route?.from||shipments[0]?.originPortId,arrivalPortId=route?.to||shipments[0]?.destinationPortId,originPort=SHIPPING_PORTS.find(port=>port.id===originPortId),arrivalPort=SHIPPING_PORTS.find(port=>port.id===arrivalPortId),airMode=record.onwardMode==='air'||shipments.some(shipment=>shipment.onwardMode==='air'),canonicalStrait=shippingMapId==='hormuz-shipping',airRoute=airMode&&canonicalStrait?straitAirRoute(arrivalPortId):null,arrivalConnection=canonicalStrait?straitPortFreight(arrivalPortId):null,receivingConnection=canonicalStrait?straitPortFreight(airRoute?.toPortId||arrivalPortId):null;
 const sourceMapId=factoryMap(record.sourceMapId||shipments[0]?.sourceMapId||'factory'),destinationMapId=record.destinationMapId,job=ledger.production?.[record.productionId],stagedQuantity=shipments.reduce((sum,shipment)=>sum+count(shipment.quantity),0),modernQuantity=bounded(shipments.filter(shipment=>shipment.deliverySchemaVersion).reduce((sum,shipment)=>sum+count(shipment.quantity),0)+((record.deliverySchemaVersion||record.deedId||record.addressId)?Math.max(0,quantity-stagedQuantity):0),quantity),legacyQuantity=quantity-modernQuantity,addressed=modernQuantity>0,roadTasks=shipments.flatMap(shipment=>context.roads.get(shipment.id)||[]),airTasks=shipments.flatMap(shipment=>context.air.get(shipment.id)||[]),deliveryRoute=ledger.deliveryRoutes?.[record.addressId||record.deedId]||roadTasks.find(task=>task.route)?.route;
 const totals={staged:0,booked:0,sea:0,shore:0,air:0,arrivalShore:0,transfer:0,road:0,door:0,legacy:0};
 for(const shipment of shipments){
  const amount=count(shipment.quantity),sea=seaQuantity(ledger,shipment),roads=context.roads.get(shipment.id)||[],airs=context.air.get(shipment.id)||[];
  totals.staged+=amount;
  if(sea||shipment.phase==='reserved'&&shipment.jobId)totals.booked+=amount;
  totals.sea+=sea;
  if(!shipment.deliverySchemaVersion){
   // Original map-wide transfers have a verified sea-to-inventory receipt,
   // but no physical doorstep leg. Do not invent a truck or a door receipt.
   totals.legacy+=sea;totals.door+=sea;continue;
  }
  if(!sea)continue;
  if(airMode){
   totals.shore+=airs.filter(task=>task.portHandling?.phase==='complete').reduce((sum,task)=>sum+count(task.quantity),0);
   totals.air+=airs.filter(task=>airReceiptValid(ledger,task,shipment)).reduce((sum,task)=>sum+count(task.quantity),0);
  }
  for(const task of roads){
   if(task.shipmentId!==shipment.id||task.itemId!==shipment.itemId||!whole(task.quantity))continue;
   if(airMode&&!airs.some(air=>air.id===task.airTaskId&&airReceiptValid(ledger,air,shipment)))continue;
   const delivered=doorReceiptValid(ledger,task,shipment),shoreComplete=task.portHandling?.phase==='complete'||!task.portHandling&&!!task.route;
   if(shoreComplete||delivered){if(airMode)totals.arrivalShore+=task.quantity;else totals.shore+=task.quantity;}
   if((shoreComplete&&task.route?.status==='ready')||delivered)totals.transfer+=task.quantity;
   if(delivered||shoreComplete&&['courier','dropoff'].includes(task.phase))totals.road+=task.quantity;
   if(delivered)totals.door+=task.quantity;
  }
 }
 for(const key of Object.keys(totals))totals[key]=bounded(totals[key],quantity);
 const sourceReady=!record.productionId||job?.phase==='ready'&&(!job.packingReceipt||job.packingReceipt.quantity>=quantity),held=record.phase==='attention'||record.phase==='port-held'||record.phase==='paused'||roadTasks.some(task=>task.phase==='blocked'||task.phase==='port-held')||airTasks.some(task=>task.phase==='blocked'||task.phase==='port-held'),cancelled=record.phase==='cancelled',completed=quantity>0&&totals.door===quantity;
 const stages=[];
 function stage(id,label,mode,mapId,locationId,position,completedQuantity,{active=false,description,targetQuantity=quantity}={}){
  const previous=stages.at(-1),amount=bounded(completedQuantity,targetQuantity),ready=!previous||previous.completedQuantity>0||previous.status==='completed';
  const status=amount===targetQuantity&&targetQuantity>0?'completed':held||cancelled?'held':active?'active':ready?'available':'locked';
  stages.push({id,label,mode,status,...mapStop(context,mapId,locationId,position),completedQuantity:amount,quantity:targetQuantity,...(description?{description}:{})});
 }
 stage('source',record.quarryOrder?'Processed quarry stock reserved':record.productionId?'Four-stage item production and packing':'Counted warehouse stock reserved',record.productionId?'factory':'road',sourceMapId,record.quarryOrder?'quarry-warehouse':'factory-packing',null,Math.max(sourceReady?quantity:0,totals.sea),{active:job?.phase==='building',description:'Source output remains reserved; world stock is credited only by the receiving inventory receipt.'});
 stage('departure','Packed freight at '+(originPort?.name||'departure port'),'map-transfer',shippingMapId,originPortId,originPort?.position,totals.booked,{active:totals.staged>0&&totals.booked<quantity,description:'Warehouse staging uses the counted freight allocation; this transfer is not a road across separate map rooms.'});
 stage('sea','Sail to '+(arrivalPort?.name||'receiving port'),'boat',shippingMapId,arrivalPortId,arrivalPort?.position,totals.sea,{active:shipments.some(shipment=>shipment.phase==='reserved')});
 if(legacyQuantity)stage('inventory','Verified receiving inventory receipt','map-transfer',destinationMapId,destinationMapId,null,totals.legacy,{targetQuantity:legacyQuantity,description:'The original map-wide transfer records a verified sea-to-inventory receipt. It has no recorded doorstep leg.'});
 if(addressed){
  stage('shore',airMode?'Dock truck to departure cargo apron':'Dock truck to shore freight bay','road',shippingMapId,airMode?arrivalConnection?.airfield?.id:arrivalConnection?.bayId,airMode?arrivalConnection?.airfield?.cargoApron:arrivalConnection?.bay,totals.shore,{targetQuantity:modernQuantity,active:(airMode?airTasks:roadTasks).some(task=>task.portHandling&&task.portHandling.phase!=='complete'&&!['blocked','port-held'].includes(task.phase))});
  if(airMode){
   stage('flight','Load, secure, fly and unload at '+(receivingConnection?.airfield?.name||'receiving cargo apron'),'plane',shippingMapId,arrivalConnection?.airfield?.id,arrivalConnection?.airfield?.cargoApron,totals.air,{targetQuantity:modernQuantity,active:airTasks.some(task=>task.phase==='reserved'),description:'Begin at the departure cargo apron. Air-manifest flight controls guide the receiving approach; the server verifies the assigned aircraft, ordered departure, landing and stopped unloading.'});
   stage('air-arrival','Receiving airfield truck to shore freight bay','road',shippingMapId,receivingConnection?.bayId,receivingConnection?.bay,totals.arrivalShore,{targetQuantity:modernQuantity,active:roadTasks.some(task=>task.portHandling&&task.portHandling.phase!=='complete'&&!['blocked','port-held'].includes(task.phase))});
  }
  stage('map-handoff','Freight handoff to receiving map','map-transfer',destinationMapId,deliveryRoute?.hub?.id,deliveryRoute?.hub?.position,totals.transfer,{targetQuantity:modernQuantity,description:'Separate map rooms connect through their freight handoff. Player navigation uses the public map gateways.'});
  const footOnly=deliveryRoute?.accessMode==='courier-access'||deliveryRoute?.hub?.vehicleAccess===false;
  stage('local-route',footOnly?'Follow the receiving access route':'Truck route through receiving roads',footOnly?'foot':'road',destinationMapId,deliveryRoute?.hub?.id,deliveryRoute?.hub?.position,totals.road,{targetQuantity:modernQuantity,active:roadTasks.some(task=>['loading','driving','unloading'].includes(task.phase))});
  stage('dropoff','Confirmed drop-off at '+(record.address?.name||record.deedName||deliveryRoute?.dropoff?.name||'receiving door'),'foot',destinationMapId,deliveryRoute?.dropoff?.id||record.addressId||record.deedId,deliveryRoute?.dropoff?.position||record.address?.dropoff?.position,totals.door-totals.legacy,{targetQuantity:modernQuantity,active:roadTasks.some(task=>['courier','dropoff'].includes(task.phase)),description:'Only the exact counted door receipt completes the order and credits the receiving inventory.'});
 }
 const nextStop=completed||cancelled?null:stages.find(stage=>stage.status!=='completed')||null;
 return {id:'order-journey:'+record.id,version:1,kind:isOrder?'supply-order':'supply-shipment',orderId:isOrder?record.id:record.orderId||null,shipmentIds:shipments.map(shipment=>shipment.id),quantity,deliveredQuantity:totals.door,legacyReceivedQuantity:totals.legacy,status:completed?'completed':cancelled?'cancelled':held?'held':'active',deedId:record.deedId||null,addressId:record.addressId||null,destinationMapId,stages,nextStop,completedStages:stages.filter(stage=>stage.status==='completed').length,totalStages:stages.length};
}

/** Keep exact order/deed itineraries in the authenticated payer/recipient view.
 * Public captain manifests retain their existing separate transport controls. */
export function attachOrderJourneys(state,ledger,{maps=[],walletId}={}){
 const viewer=String(walletId||'').trim().toLowerCase(),context=orderJourneyContext(ledger,{maps}),permitted=record=>!!viewer&&(record.ownerId===viewer||record.recipientId===viewer);
 return {...state,orders:(state.orders||[]).map(record=>permitted(record)?{...record,journey:projectOrderJourney(ledger,record,{context})}:record),shipments:(state.shipments||[]).map(record=>permitted(record)?{...record,journey:projectOrderJourney(ledger,record,{context})}:record)};
}
