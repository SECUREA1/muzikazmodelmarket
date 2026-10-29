import {DEED_DELIVERY_RULES} from './world-delivery-routing.mjs';
import {deliverFactoryLots} from './world-factory-lineage.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const terminal=new Set(['delivered','cancelled','port-held']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const whole=value=>Number.isSafeInteger(value)&&value>=0;
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409});};
export const ROAD_DELIVERY_RULES=Object.freeze({roadCratesPerContainer:20,truckSlots:4,maximumActiveTrucksPerMap:16,departureHeadwayMs:1500});
export function ensureWorldDelivery(ledger){
 for(const key of ['deliveryTasks','deliveryRoutes','portReceipts','dropoffReceipts','portEscrow','deliveryNextDepartureAt'])ledger[key] ||= {};
 return ledger;
}
function sample(points,progress){
 if(!points?.length)return null;
 const lengths=points.slice(1).map((point,index)=>distance(point,points[index])),total=lengths.reduce((a,b)=>a+b,0);
 let remaining=Math.max(0,Math.min(1,progress))*total;
 for(let index=0;index<lengths.length;index++){
  if(remaining<=lengths[index]||index===lengths.length-1){const a=points[index],b=points[index+1],t=lengths[index]?Math.min(1,remaining/lengths[index]):1;return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},rotationY:Math.atan2(a.x-b.x,a.z-b.z)};}
  remaining-=lengths[index];
 }
 return {position:{...points[0]},rotationY:0};
}
function timeline(route,{loading=true,courierOnly=false,crateCount=1}={}){
 courierOnly ||= route.accessMode==='courier-access'||route.hub?.vehicleAccess===false||!route.truckWaypoints?.length;
 const rules=DEED_DELIVERY_RULES,steps=[];
 if(loading)steps.push({phase:'loading',durationMs:rules.unpackMs+rules.loadMs+crateCount*350});
 if(!courierOnly){
  const drivingMs=route.truckDurationMs??route.estimatedDurationMs-route.courierDistanceMeters/rules.courierSpeedMps*1000-rules.unpackMs-rules.loadMs-rules.unloadMs-rules.handoverMs;
  steps.push({phase:'driving',durationMs:Math.max(500,Math.ceil(Number.isFinite(drivingMs)?drivingMs:route.truckDistanceMeters/rules.truckSpeedMps*1000))});
  steps.push({phase:'unloading',durationMs:rules.unloadMs+crateCount*250});
 }
 steps.push({phase:'courier',durationMs:Math.max(500,Math.ceil(route.courierDurationMs??route.courierDistanceMeters/rules.courierSpeedMps*1000))});
 steps.push({phase:'dropoff',durationMs:rules.handoverMs});return steps;
}
function installRoute(task,route,now,{loading=true,courierOnly=false}={}){
 task.route=clone(route);task.routeRevision=route.revision;task.timeline=timeline(route,{loading,courierOnly,crateCount:task.crateCount});
 task.elapsedMs=0;task.totalDurationMs=task.timeline.reduce((sum,step)=>sum+step.durationMs,0);task.startedAt=now;task.lastAdvancedAt=now;task.updatedAt=now;task.phase=task.timeline[0].phase;
 delete task.blockedReason;delete task.blockedAt;delete task.heldPhase;
}
export function deliveryTaskView(task,now=task.lastAdvancedAt){
 const route=task.route||{},elapsed=Math.max(0,Number(task.elapsedMs)||0),steps=task.timeline||[];
 let offset=0,stage=steps.at(-1)||{phase:task.phase,durationMs:0},stageOffset=0;
 for(const step of steps){stage=step;stageOffset=offset;if(elapsed<offset+step.durationMs)break;offset+=step.durationMs;}
 const stageProgress=stage.durationMs?Math.max(0,Math.min(1,(elapsed-stageOffset)/stage.durationMs)):0;
 const actualPhase=terminal.has(task.phase)||task.phase==='blocked'||task.phase==='awaiting-truck'?task.phase:stage.phase;
 const motionPhase=task.phase==='blocked'?(task.heldPhase||stage.phase):stage.phase;
 const truckPath=route.truckWaypoints||[],footPath=route.courierWaypoints||[],truckAt=motionPhase==='loading'?sample(truckPath,0):motionPhase==='driving'?sample(truckPath,stageProgress):sample(truckPath,1),courierAt=motionPhase==='courier'?sample(footPath,stageProgress):sample(footPath,motionPhase==='dropoff'||actualPhase==='delivered'?1:0);
 const truckPosition=truckAt?.position||task.truckPosition||route.hub?.position||task.lastPosition||null,courierPosition=courierAt?.position||task.courierPosition||route.dropoff?.position||null;
 return {...task,phase:actualPhase,stageStartedAt:Number(task.lastAdvancedAt||now)-(elapsed-stageOffset),stageDurationMs:stage.durationMs,stageProgress,progress:stageProgress,truckPosition,courierPosition,position:motionPhase==='courier'||motionPhase==='dropoff'?courierPosition:truckPosition,rotationY:motionPhase==='courier'?courierAt?.rotationY||0:truckAt?.rotationY||0,estimatedDurationMs:task.totalDurationMs};
}
export function receiveDeedShipment(ledger,shipment,result,now){
 ensureWorldDelivery(ledger);
 if(ledger.portReceipts[shipment.id])return ledger.portReceipts[shipment.id];
 const receipt={id:'port:'+shipment.id,shipmentId:shipment.id,orderId:shipment.orderId,deedId:shipment.deedId,ownerId:shipment.ownerId,itemId:shipment.itemId,quantity:shipment.quantity,portId:shipment.destinationPortId,shippingMapId:shipment.shippingMapId,deliveryId:result.deliveryId,quality:result.quality,receivedAt:now};
 ledger.portReceipts[shipment.id]=receipt;
 shipment.seaReceipt=clone(receipt);shipment.phase='port-received';shipment.seaReceivedAt=now;shipment.deliveryId=result.deliveryId;shipment.deliveryTaskIds=[];
 shipment.transferTask={id:'transfer:'+shipment.id,phase:'port-received',fromPortId:shipment.destinationPortId,destinationMapId:shipment.destinationMapId,mode:'server-managed-road-delivery',quantity:shipment.quantity};
 ledger.portEscrow[shipment.id]={id:'port-escrow:'+shipment.id,shipmentId:shipment.id,orderId:shipment.orderId,deedId:shipment.deedId,ownerId:shipment.ownerId,itemId:shipment.itemId,quantity:shipment.quantity,remainingQuantity:shipment.quantity,heldQuantity:0,deliveredQuantity:0,phase:'awaiting-road-delivery',portId:shipment.destinationPortId,receivedAt:now};
 const unitsPerContainer=shipment.packing.unitsPerContainer,unitsPerRoadCrate=Math.max(1,Math.ceil(unitsPerContainer/ROAD_DELIVERY_RULES.roadCratesPerContainer)),capacity=unitsPerRoadCrate*ROAD_DELIVERY_RULES.truckSlots;
 Object.assign(shipment.packing,{unitsPerRoadCrate,roadCratesPerContainer:ROAD_DELIVERY_RULES.roadCratesPerContainer,truckSlots:ROAD_DELIVERY_RULES.truckSlots,unitsPerTruck:capacity});
 if(!whole(capacity)||!capacity)fail('This shipment has no valid road packing capacity.');
 let remaining=shipment.quantity,index=0;
 while(remaining){
  const quantity=Math.min(remaining,capacity),id='deed-truck:'+shipment.id+':'+index++;
  let offset=shipment.quantity-remaining,toAssign=quantity;const lotAllocations=[];
  for(const line of ledger.factoryLotAllocations[shipment.id]?.lots||[]){if(offset>=line.quantity){offset-=line.quantity;continue;}const count=Math.min(toAssign,line.quantity-offset);lotAllocations.push({lotId:line.lotId,quantity:count});toAssign-=count;offset=0;if(!toAssign)break;}
  ledger.deliveryTasks[id]={id,shipmentId:shipment.id,orderId:shipment.orderId,deedId:shipment.deedId,ownerId:shipment.ownerId,recipientId:shipment.recipientId||shipment.ownerId,itemId:shipment.itemId,itemName:shipment.itemName,quantity,unitsPerRoadCrate,crateCount:Math.ceil(quantity/unitsPerRoadCrate),truckSlots:ROAD_DELIVERY_RULES.truckSlots,sourceContainerCount:Math.ceil(quantity/unitsPerContainer),lotAllocations,modelId:'frontier-pickup',mapId:shipment.destinationMapId,phase:'awaiting-route',createdAt:now,receivedAtPortAt:now,lastAdvancedAt:now,elapsedMs:0,totalDurationMs:0,deliveredQuantity:0};
  shipment.deliveryTaskIds.push(id);remaining-=quantity;
 }
 return receipt;
}
function creditTask(ledger,task,shipment,now){
 const existing=ledger.dropoffReceipts[task.id];if(existing)return existing;
 const stock=ledger.maps[task.mapId]?.stock;if(!stock)fail('The deed receiving inventory is unavailable.');
 const next=(stock[task.itemId]||0)+task.quantity;if(!Number.isSafeInteger(next))fail('The deed inventory is at capacity.');stock[task.itemId]=next;
 const receipt={id:'door:'+task.id,deliveryId:task.id,deliveryTaskId:task.id,shipmentId:shipment.id,orderId:task.orderId,deedId:task.deedId,productionId:shipment.productionId,ownerId:task.ownerId,itemId:task.itemId,quantity:task.quantity,destinationMapId:task.mapId,dropoffId:task.route.dropoff.id,dropoff:clone(task.route.dropoff),routeRevision:task.routeRevision,receivedAt:now,seaDeliveryId:shipment.deliveryId,quality:shipment.seaReceipt.quality,lotAllocations:clone(task.lotAllocations||[])};
 ledger.dropoffReceipts[task.id]=receipt;ledger.factoryStockReceipts[task.id]=clone(receipt);
 task.phase='delivered';task.deliveredAt=now;task.deliveredQuantity=task.quantity;task.elapsedMs=task.totalDurationMs;
 const escrow=ledger.portEscrow[shipment.id];escrow.deliveredQuantity+=task.quantity;escrow.remainingQuantity-=task.quantity;escrow.phase=escrow.remainingQuantity?'road-delivery':'delivered';return receipt;
}
export function advanceWorldDelivery(ledger,data,now,{planFor}={}){
 ensureWorldDelivery(ledger);
 const occupied=new Map();for(const task of Object.values(ledger.deliveryTasks))if(task.route&&!terminal.has(task.phase)&&task.phase!=='awaiting-truck')occupied.set(task.mapId,(occupied.get(task.mapId)||0)+1);
 for(const task of Object.values(ledger.deliveryTasks)){
  if(terminal.has(task.phase))continue;
  const shipment=ledger.shipments[task.shipmentId],order=ledger.orders?.[task.orderId],deed=Object.values(data.landDeeds||{}).find(deed=>deed.id===task.deedId),recipient=task.recipientId||task.ownerId,owns=deed?.status==='active'&&deed.ownerId===recipient&&data.users[recipient]?.items.some(item=>item.id===task.deedId&&item.type==='land-deed');
  if(!shipment||task.orderId&&!order||order?.phase==='cancelled')continue;
  if(!task.route&&(occupied.get(task.mapId)||0)>=ROAD_DELIVERY_RULES.maximumActiveTrucksPerMap){task.phase='awaiting-truck';task.lastAdvancedAt=now;task.updatedAt=now;continue;}
  if(task.phase==='awaiting-truck'&&task.route){
   if(now<task.departureAt)continue;
   if((occupied.get(task.mapId)||0)>=ROAD_DELIVERY_RULES.maximumActiveTrucksPerMap){task.departureAt=Math.max(now+ROAD_DELIVERY_RULES.departureHeadwayMs,ledger.deliveryNextDepartureAt[task.mapId]||0);ledger.deliveryNextDepartureAt[task.mapId]=task.departureAt+ROAD_DELIVERY_RULES.departureHeadwayMs;task.startedAt=task.lastAdvancedAt=task.departureAt;continue;}
   occupied.set(task.mapId,(occupied.get(task.mapId)||0)+1);task.phase='loading';
  }
  const view=deliveryTaskView(task,now),courierOnly=['courier','dropoff'].includes(view.phase==='blocked'?task.heldPhase:view.phase),origin=courierOnly?view.courierPosition:view.truckPosition;
  const current=planFor(shipment),changed=task.routeRevision&&current?.revision!==task.routeRevision;
  let route=current;
  if(task.route&&(changed||task.phase==='blocked')&&origin)route=planFor(shipment,{origin,mode:courierOnly?'courier':undefined});
  if(!owns||route?.status!=='ready'){
   task.heldPhase=task.phase==='blocked'?task.heldPhase:view.phase;task.phase='blocked';task.blockedAt ||= now;task.blockedReason=!owns?'Deed ownership changed. The original buyer can hold remaining cargo at port.':route?.reason||'No validated route currently reaches this deed.';task.lastAdvancedAt=now;task.updatedAt=now;continue;
  }
  if(!task.route||changed||task.phase==='blocked'){
   const fresh=!task.route,loading=fresh||view.phase==='loading'||view.phase==='awaiting-truck'||task.heldPhase==='loading'||task.heldPhase==='awaiting-truck';
   const previousTruck=view.truckPosition,start=loading?Math.max(now,ledger.deliveryNextDepartureAt[task.mapId]||0):now;
   if(loading){task.departureAt=start;ledger.deliveryNextDepartureAt[task.mapId]=start+ROAD_DELIVERY_RULES.departureHeadwayMs;}
   installRoute(task,route,start,{loading,courierOnly});if(start>now){task.phase='awaiting-truck';if(!fresh)occupied.set(task.mapId,Math.max(0,(occupied.get(task.mapId)||1)-1));}else if(fresh)occupied.set(task.mapId,(occupied.get(task.mapId)||0)+1);
   if(courierOnly&&previousTruck)task.truckPosition=previousTruck;
  }else{
   task.elapsedMs=Math.min(task.totalDurationMs,task.elapsedMs+Math.max(0,now-task.lastAdvancedAt));task.lastAdvancedAt=now;task.updatedAt=now;
  }
  const next=deliveryTaskView(task,now);task.phase=next.phase;task.truckPosition=next.truckPosition;task.courierPosition=next.courierPosition;
  if(task.elapsedMs>=task.totalDurationMs){creditTask(ledger,task,shipment,now);occupied.set(task.mapId,Math.max(0,(occupied.get(task.mapId)||1)-1));}
 }
 for(const shipment of Object.values(ledger.shipments))if(shipment.deliverySchemaVersion&&shipment.seaReceipt&&!['delivered','cancelled','port-held'].includes(shipment.phase)){
  const tasks=shipment.deliveryTaskIds.map(id=>ledger.deliveryTasks[id]);
  shipment.deliveredQuantity=tasks.filter(task=>task.phase==='delivered').reduce((sum,task)=>sum+task.quantity,0);
  if(tasks.length&&tasks.every(task=>task.phase==='delivered')){
   shipment.phase='delivered';shipment.deliveredAt=now;shipment.transferTask.phase='delivered';deliverFactoryLots(ledger,shipment,{now});
  }else shipment.phase=tasks.some(task=>!['awaiting-route','awaiting-truck','blocked','loading'].includes(task.phase))?'land-transit':'port-received';
 }
}
export function holdShipmentAtPort(ledger,shipment,now){
 ensureWorldDelivery(ledger);
 for(const id of shipment.deliveryTaskIds||[]){const task=ledger.deliveryTasks[id];if(task&&task.phase!=='delivered'){task.phase='port-held';task.heldAt=now;task.updatedAt=now;}}
 const escrow=ledger.portEscrow[shipment.id];if(escrow){escrow.phase='port-held';escrow.heldQuantity=escrow.remainingQuantity;escrow.heldAt=now;}
 shipment.phase='port-held';shipment.heldAt=now;if(shipment.transferTask)shipment.transferTask.phase='port-held';
}
export function projectWorldDeliveries(ledger,mapId,now){
 ensureWorldDelivery(ledger);
 const routes=Object.values(ledger.deliveryRoutes).filter(route=>route.mapId===mapId),allTasks=Object.values(ledger.deliveryTasks).filter(task=>task.mapId===mapId),tasks=allTasks.filter(task=>task.phase!=='awaiting-truck'&&task.phase!=='port-held'&&task.phase!=='cancelled'&&(task.phase!=='delivered'||now-task.deliveredAt<10000)).sort((a,b)=>Number(a.phase==='delivered')-Number(b.phase==='delivered')),vehicles=[],couriers=[];
 for(const task of tasks){
  const view=deliveryTaskView(task,now),common={id:task.id,mapId,phase:view.phase,routeId:task.route?.id,routeRevision:task.routeRevision,updatedAt:task.updatedAt,stageStartedAt:view.stageStartedAt,stageDurationMs:view.stageDurationMs,stageProgress:view.stageProgress,progress:view.stageProgress};
  const vehicleAccess=task.route?.accessMode!=='courier-access'&&task.route?.hub?.vehicleAccess!==false&&!!task.route?.truckWaypoints?.length;
  if(vehicleAccess&&view.truckPosition)vehicles.push({...common,modelId:'frontier-pickup',position:view.truckPosition,rotationY:view.rotationY,waypoints:view.phase==='driving'?task.route.truckWaypoints:[view.truckPosition],truckWaypoints:task.route?.truckWaypoints||[],courierWaypoints:task.route?.courierWaypoints||[]});
  if(['courier','dropoff','delivered'].includes(view.phase)&&view.courierPosition)couriers.push({...common,id:task.id+':courier',isCourier:true,modelId:'scout-avatar',position:view.courierPosition,rotationY:view.rotationY,waypoints:view.phase==='courier'?task.route.courierWaypoints:[view.courierPosition]});
 }
 const dropoffs=routes.map(route=>({...route.dropoff,deedId:route.deedId,status:route.status,...(route.reason?{reason:route.reason}:{}),deliveredAt:Math.max(0,...Object.values(ledger.dropoffReceipts).filter(receipt=>receipt.deedId===route.deedId).map(receipt=>receipt.receivedAt))||undefined}));
 return {serverTime:now,mapId,routes:clone(routes),dropoffs,vehicles:vehicles.slice(0,ROAD_DELIVERY_RULES.maximumActiveTrucksPerMap),couriers:couriers.slice(0,ROAD_DELIVERY_RULES.maximumActiveTrucksPerMap),queuedCount:allTasks.filter(task=>task.phase==='awaiting-truck').length};
}
