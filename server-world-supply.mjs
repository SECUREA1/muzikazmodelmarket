import {exportForgeFreight,reconcileForgeFreightDeliveries,exportableForgeFreight} from './server-forge-freight.mjs';
import {quarryMarketCatalog} from './public/js/quarry-market.js';
import {QUARRY_MATERIALS} from './public/js/quarry-config.js';
import {requireSupplyDeed} from './world-factory-orders.mjs';
import {randomUUID} from 'node:crypto';
import {createFactoryProduction,advanceFactoryProduction,pauseFactoryProduction,resumeFactoryProduction} from './world-factory-runtime.mjs';
import {ensureFactoryLineage,recordFactoryOutput,allocateFactoryLots,returnFactoryLots,deliverFactoryLots} from './world-factory-lineage.mjs';
import {nativeMarketCatalog} from './native-market-catalog.mjs';
import {worldFactoryRecipe,worldFactoryPlan} from './public/js/world-factory-recipes.js';
import {factoryUnitPriceMzk} from './world-factory-pricing.mjs';
export {factoryUnitPriceMzk} from './world-factory-pricing.mjs';
import {cleanWallet} from './user-json-database.mjs';
import {ensureWorldSupply,supplyItem,factoryLineupItems,factoryProductionItem,registerPrivateFactoryBlueprint,supplyItemVisibleTo,filterSupplyState} from './world-supply.mjs';
import {ownedSupplyDeeds,orderDestination,refreshFactoryOrders,stageFactoryOrders,assertOrderFreightAvailable,cancelFactoryOrder} from './world-factory-orders.mjs';
import {SHIPPING_ID,SHIPPING_ROUTES,SHIPPING_RULES,isShippingEnvironment} from './public/js/shipping-config.js';
import {distributionChallenges,distributionChallengeForDispatch,distributionChallengeResult} from './server-distribution-challenges.mjs';
import {planDeedDelivery,deliveryMapRevision} from './world-delivery-routing.mjs';
import {ensureWorldDelivery,receiveDeedShipment,receiveAirShipment,advanceWorldDelivery,deliveryTaskView,projectWorldDeliveries,holdShipmentAtPort} from './world-delivery-runtime.mjs';
import {DeliveryRoutePool} from './world-delivery-route-pool.mjs';
import {addressMapId,mapDeliveryAddresses,publicDeliveryAddress,resolveDeliveryAddress,addressRecipientValid} from './world-delivery-addresses.mjs';
import {STRAIT_FREIGHT_CONNECTIONS,STRAIT_AIR_ROUTES,straitPortFreight,straitAirRoute} from './public/js/strait-freight-network.js';
import {ensureAirFreight,reserveAirTransfer,releaseAirTransfer,settleAirTransfer} from './world-air-freight.mjs';
import {validateAirReservation} from './server-world-air-freight.mjs';
import {attachOrderJourneys,projectOrderJourney} from './world-order-journey.mjs';
import {ensureWorldItemRequests,createWorldItemRequest,claimWorldItemRequest,cancelWorldItemRequest,attachWorldItemRequestShipment,reconcileWorldItemRequests,publicWorldItemRequest,eligibleWorldItemRequestLots} from './world-item-requests.mjs';
import {worldItemDemandCalls} from './world-item-demand.mjs';
import {FORGE_RECIPES} from './public/js/forge-recipes.js';

export const WORLD_SUPPLY_RULES=Object.freeze({initialStock:1000,bulkMinimum:10,bulkDiscountPercent:20,maxQuantity:10000,minimumBuildMs:3000,maximumBuildMs:120000,itemsPerContainer:1000});
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const own=(object,key)=>Object.hasOwn(object,key);
const activePhases=new Set(['loading','secured','sailing','unloading']);
const routes=SHIPPING_ROUTES.filter(route=>route.from!==route.to&&!route.factoryExport);
function itemRequestAddressValid(data,record,directory){
 if(!directory?.addressValid(data,record))return false;
 const current=directory.addressFor(data,record.addressId);if(!current)return false;
 if(current.revision===record.addressRevision)return true;
 // Renaming an atlas street changes the printed address, not its doorway.
 // Keep paid work attached to that same verified recipient and physical point.
 const saved=record.address;
 return current.id===record.addressId&&current.mapId===record.destinationMapId&&current.kind===saved?.kind&&['x','y','z'].every(axis=>Number.isFinite(current.position?.[axis])&&Number.isFinite(saved?.position?.[axis])&&Math.abs(current.position[axis]-saved.position[axis])<1e-6);
}
function itemRequestDeliveryAddressValid(ledger,data,record,directory){
 if(!directory?.addressValid(data,record))return false;
 const shipment=record.shipmentId?ledger.shipments?.[record.shipmentId]:record,id=shipment?.inventoryRequestId;
 if(!id)return true;
 const request=ledger.itemRequests?.[id];
 return !!request&&request.phase!=='cancelled'&&request.shipmentIds.includes(shipment.id)&&itemRequestAddressValid(data,request,directory);
}
function itemRequestPublicView(data,ledger,record,wallet,now){
 const view=publicWorldItemRequest(record,wallet),uncommittedQuantity=view.fulfillableQuantity;
 const completedQuantity=view.claimedByMe?eligibleWorldItemRequestLots(data,ledger,wallet,record,{now}).reduce((sum,lot)=>sum+lot.availableQuantity,0):0;
 return {...view,uncommittedQuantity,completedQuantity,fulfillableQuantity:Math.min(uncommittedQuantity,completedQuantity),canFulfill:view.canFulfill&&completedQuantity>0};
}
function assertItemRequestFreightAvailable(ledger,data,shipment,directory){
 const id=shipment.inventoryRequestId||shipment.itemRequestId;if(!id)return;
 const request=ledger.itemRequests?.[id];
 if(!request||['cancelled','delivered','attention'].includes(request.phase)||!request.shipmentIds.includes(shipment.id)||!itemRequestAddressValid(data,request,directory))fail('This inventory request or receiving address is on hold. Resolve the request before carrying its freight.');
}
function itemRequestCalls(data,ledger,directory,walletId){
 return worldItemDemandCalls({data,ledger,maps:directory.maps,rooms:directory.rooms,catalog:Object.values(ledger.catalog),walletId,mapId:directory.mapId});
}
function stageItemRequestFreight(data,ledger,wallet,input,directory,now){
 const request=own(ledger.itemRequests||{},input.inventoryRequestId)&&ledger.itemRequests[input.inventoryRequestId];
 if(!request||request.claimantId!==wallet)fail('Claim this inventory request before supplying its items.',403);
 if(!itemRequestAddressValid(data,request,directory))fail('The receiving address moved or changed owner. Resolve this request before shipping.');
 if(!['claimed','shipping','partial'].includes(request.phase))fail('This inventory request is not accepting another shipment.');
 const remaining=request.quantity-(request.committedQuantity||0);if(remaining<1)fail('The requested quantity is already assigned to freight.');
 let lots=eligibleWorldItemRequestLots(data,ledger,wallet,request,{now});
 if(input.lotIds!==undefined){
  if(!Array.isArray(input.lotIds)||!input.lotIds.length||input.lotIds.length>100||input.lotIds.some(id=>typeof id!=='string'||id.length>400)||new Set(input.lotIds).size!==input.lotIds.length)fail('Choose up to 100 distinct completed stock lots.',422);
  if(input.lotIds.some(id=>!lots.some(lot=>lot.id===id)))fail('Only your own completed and sealed factory or forge lots can fulfil this request.',403);
  lots=lots.filter(lot=>input.lotIds.includes(lot.id));
 }
 const available=lots.reduce((sum,lot)=>sum+lot.availableQuantity,0),count=input.quantity===undefined?Math.min(remaining,available):quantity(input.quantity);
 if(count<1||count>remaining||count>available)fail('Complete and seal enough of your own items before preparing this request shipment.');
 const item=supplyItem(data,request.itemId),route=routes.find(route=>route.id===request.contractId),shippingMapId=request.shippingMapId;
 if(!route||!directory.maps.some(map=>map.id===shippingMapId&&isShippingEnvironment(map)))fail('The saved shipping route is unavailable.');
 const address=directory.addressFor(data,request.addressId),onward=onwardSelection(request.onwardMode,route,{destination:true,shippingMapId,directory});
 const recipe=worldFactoryRecipe(item),containerSlots=route.units||4,maxShipmentQuantity=containerSlots*recipe.unitsPerContainer;
 let unallocated=count;
 for(const lot of lots){
  let amount=Math.min(lot.availableQuantity,unallocated);
  while(amount>0){
   const shipped=Math.min(amount,maxShipmentQuantity),shipment=createShipment({id:randomUUID(),...onward,ownerId:wallet,inventoryRequestId:request.id,itemId:item.supplyId,itemName:item.name,quantity:shipped,sourceMapId:'factory',destinationMapId:request.destinationMapId,shippingMapId,contractId:request.contractId,addressId:address.id,address:publicDeliveryAddress(address),deedId:address.deedId,recipientId:address.recipientId,deliverySchemaVersion:1,packing:{recipeId:recipe.id,unitsPerContainer:recipe.unitsPerContainer,containersRequired:Math.ceil(shipped/recipe.unitsPerContainer),containerSlots,maxShipmentQuantity,sealed:true}},route,now);
   ledger.shipments[shipment.id]=shipment;allocateFactoryLots(ledger,shipment,{now,lotId:lot.id});
   attachWorldItemRequestShipment(data,ledger,wallet,{inventoryRequestId:request.id,shipmentId:shipment.id},{now,addressValid:record=>itemRequestAddressValid(data,record,directory)});
   amount-=shipped;unallocated-=shipped;
  }
  if(!unallocated)break;
 }
 return request;
}
function deliveryActivityMaps(ledger={}){
 ledger ||= {};
 const ids=new Set(),terminal=new Set(['delivered','air-delivered','cancelled','port-held']);
 for(const order of Object.values(ledger.orders||{}))if((order.addressId||order.deedId)&&!terminal.has(order.phase))ids.add(order.destinationMapId);
 for(const shipment of Object.values(ledger.shipments||{}))if((shipment.addressId||shipment.deedId)&&shipment.deliverySchemaVersion&&!terminal.has(shipment.phase))ids.add(shipment.destinationMapId);
 for(const task of Object.values(ledger.deliveryTasks||{}))if(!terminal.has(task.phase))ids.add(task.mapId);
 for(const task of Object.values(ledger.deliveryTasks||{}))if(!terminal.has(task.phase)&&task.portHandling?.mapId&&task.portHandling.phase!=='complete')ids.add(task.portHandling.mapId);
 for(const task of Object.values(ledger.airTasks||{}))if(!terminal.has(task.phase)){ids.add(task.mapId);ids.add(task.destinationMapId);}
 ids.delete(undefined);ids.delete(null);return ids;
}
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>WORLD_SUPPLY_RULES.maxQuantity)fail('Choose 1 to 10,000 whole items.',422);return value;}
function onwardSelection(value,route,{destination,shippingMapId=SHIPPING_ID,directory}={}){
 const mode=value??'road';
 if(!['road','air'].includes(mode))fail('Choose road delivery or air onward delivery.',422);
 if(mode==='air'){
  if(!destination)fail('Choose a deed, store or building receiving address before selecting air onward delivery.',422);
  const air=straitAirRoute(route?.to),map=directory?.maps.find(map=>map.id===shippingMapId);
  if(shippingMapId!==SHIPPING_ID||!air||!map?.airport?.enabled)fail('This sea arrival port has no connected air-cargo route. Choose road delivery or another sea lane.',422);
 }
 return {onwardMode:mode,onwardPortId:mode==='air'?straitAirRoute(route.to).toPortId:route?.to};
}
function publicAirTask(task,walletId){
 const {reservationId,captainId,releasedReservations,...record}=task;
 return {...record,isCaptain:!!walletId&&captainId===walletId,reserved:!!captainId};
}
function publicAirReceipt(receipt){const {reservationId,captainId,...record}=receipt;return record;}
function recipeSummary(item){
 const recipe=worldFactoryRecipe(item);
 return {id:recipe.id,profileId:recipe.profileId,recipeVersion:recipe.recipeVersion,itemPlanId:recipe.itemPlanId,fingerprint:recipe.fingerprint,name:recipe.name,itemName:recipe.itemName,description:recipe.description,unitsPerContainer:recipe.unitsPerContainer,unitBuildMs:recipe.unitBuildMs,minimumBuildMs:recipe.minimumBuildMs,stages:recipe.stages.map(({id,name,description,station})=>({id,name,description,station}))};
}

function quoteFor(item,count){
 const amount=quantity(count),unitPriceMzk=factoryUnitPriceMzk(item),subtotalMzk=unitPriceMzk*amount,discountPercent=amount>=WORLD_SUPPLY_RULES.bulkMinimum?WORLD_SUPPLY_RULES.bulkDiscountPercent:0;
 if(!Number.isSafeInteger(subtotalMzk))fail('The catalog price cannot be used for this production batch.',422);
 return {itemId:item.supplyId,quantity:amount,unitPriceMzk,subtotalMzk,discountPercent,priceMzk:Math.max(1,Math.floor(subtotalMzk*(100-discountPercent)/100)),...worldFactoryPlan(item,amount,WORLD_SUPPLY_RULES)};
}
function addressOrderDestination(data,input,directory){
 const address=directory.addressFor(data,input.addressId);if(!address)fail('This store or building delivery address is no longer available.',404);
 if(input.expectedAddressRevision!==undefined&&input.expectedAddressRevision!==address.revision)fail('This receiving address moved or changed owner. Refresh the address and review it before ordering.');
 const route=routes.find(route=>route.id===(input.contractId||'gulf-gateway')),shippingMapId=input.shippingMapId||SHIPPING_ID;
 if(!route)fail('Choose a shipping lane with a destination port.',422);
 if(!directory.maps.some(map=>map.id===shippingMapId&&isShippingEnvironment(map)))fail('Choose an available shipping map.',404);
 if(input.destinationMapId!==undefined&&input.destinationMapId!==address.mapId)fail('The destination must match the selected delivery address.',422);
 const deed=address.deedId?Object.values(data.landDeeds||{}).find(deed=>deed.id===address.deedId&&deed.status==='active'):null;
 return {address,deed,destinationMapId:address.mapId,route};
}
function portTransferTask(shipment,now){
 const route=routes.find(route=>route.id===shipment.contractId);if(!route)return null;
 // Saved port identities come from the selected server route. Staging uses the
 // existing stock allocation; it never awards a second inventory at the dock.
 shipment.originPortId ||= route.from;shipment.destinationPortId ||= route.to;
 const phase=shipment.phase==='delivered'?'delivered':shipment.phase==='cancelled'?'returned':shipment.jobId?'loading':'staged';
 return shipment.portTransferTask ||= {id:'port-stage:'+shipment.id,sourceMapId:shipment.sourceMapId||'factory',shippingMapId:shipment.shippingMapId,toPortId:shipment.originPortId,itemId:shipment.itemId,quantity:shipment.quantity,phase,mode:'simulated-warehouse-transfer',stagedAt:shipment.createdAt??now};
}
function updatePortTransfer(shipment,phase,now){
 const task=portTransferTask(shipment,now);if(!task)return;
 task.phase=phase;
 if(phase==='loading')task.loadingAt ||= now;
 if(phase==='delivered')task.deliveredAt ||= now;
 if(phase==='returned')task.returnedAt ||= now;
}
function createShipment(fields,route,now){
 const connection=fields.shippingMapId===SHIPPING_ID?straitPortFreight(route.to):null,onwardMode=fields.onwardMode||'road';
 const shipment={...fields,onwardMode,onwardPortId:onwardMode==='air'?straitAirRoute(route.to)?.toPortId:route.to,...(connection?{portHandling:{mapId:SHIPPING_ID,portId:route.to,waypoints:connection.roadWaypoints}}:{}),phase:'queued',createdAt:now,transferMode:'simulated-onward-freight'};
 shipment.transferTask={id:'transfer:'+shipment.id,phase:'awaiting-sea-delivery',fromPortId:route.to,destinationMapId:shipment.destinationMapId,mode:'simulated-onward-freight',quantity:shipment.quantity};portTransferTask(shipment,now);return shipment;
}
function adoptDeedDeliveries(ledger,data){
 for(const order of Object.values(ledger.orders||{}))if(!['delivered','cancelled'].includes(order.phase)&&order.deedId)order.deliverySchemaVersion=1;
 for(const shipment of Object.values(ledger.shipments||{})){
  if(['delivered','cancelled','port-held'].includes(shipment.phase))continue;
  const deed=Object.values(data.landDeeds||{}).find(deed=>deed.status==='active'&&'plot-'+deed.id===shipment.destinationMapId);
  if(!deed)continue;shipment.deedId ||= deed.id;shipment.deliverySchemaVersion=1;shipment.recipientId ||= shipment.orderId?ledger.orders?.[shipment.orderId]?.ownerId||deed.ownerId:deed.ownerId;
 }
}
function advance(ledger,now,data,directory){
 ensureWorldDelivery(ledger);
 ensureAirFreight(ledger);
 adoptDeedDeliveries(ledger,data);
 ensureFactoryLineage(ledger,{now});
 for(const job of Object.values(ledger.production))if(advanceFactoryProduction(job,now))recordFactoryOutput(ledger,job,{now});
 if(directory)stageFactoryOrders(ledger,data,directory,routes,now,createShipment);
 for(const shipment of Object.values(ledger.shipments)){
  portTransferTask(shipment,now);
  if(shipment.phase==='reserved'&&now>=shipment.leaseUntil){
   shipment.releasedReservations ||= {};shipment.releasedReservations[shipment.captainId+':'+(shipment.jobId||'')]=true;
   shipment.phase='queued';delete shipment.jobId;delete shipment.captainId;delete shipment.leaseUntil;updatePortTransfer(shipment,'staged',now);
  }
 }
 if(directory?.planFor){
  for(const deed of Object.values(data.landDeeds||{}).filter(deed=>deed.status==='active')){
   const mapId='plot-'+deed.id,active=Object.values(ledger.orders||{}).find(order=>order.deedId===deed.id&&!['cancelled','delivered'].includes(order.phase)),pending=Object.values(ledger.shipments).find(shipment=>shipment.destinationMapId===mapId&&!['cancelled','delivered','port-held'].includes(shipment.phase));
   if(deed.ownerId!==directory.walletId&&directory.mapId!==mapId&&!active&&!pending)continue;
   const plan=directory.planFor(data,{deedId:deed.id,destinationMapId:mapId,destinationPortId:active&&routes.find(route=>route.id===active.contractId)?.to||pending?.destinationPortId||routes[0]?.to});
   ledger.deliveryRoutes[deed.id]=plan;
  }
  for(const record of [...Object.values(ledger.orders||{}),...Object.values(ledger.shipments||{})].filter(record=>record.addressId&&!['cancelled','delivered','port-held'].includes(record.phase))){
   const plan=directory.planFor(data,{...record,destinationPortId:record.destinationPortId||routes.find(route=>route.id===record.contractId)?.to});ledger.deliveryRoutes[record.addressId]=plan;
  }
  advanceWorldDelivery(ledger,data,now,{planFor:(shipment,options)=>directory.planFor(data,shipment,options),addressValid:record=>itemRequestDeliveryAddressValid(ledger,data,record,directory)});
 }
 refreshFactoryOrders(ledger,data,now,{addressValid:record=>directory?.addressValid(data,record)});
 reconcileForgeFreightDeliveries(data,ledger);
 reconcileWorldItemRequests(data,ledger,{now,addressValid:record=>itemRequestAddressValid(data,record,directory)});
}
function requestKey(wallet,operation,input){
 if(typeof input.requestId!=='string'||!input.requestId.trim()||input.requestId.length>140)fail('A supply request id is required.',422);
 return wallet+':'+operation+':'+input.requestId;
}
function priorReceipt(ledger,key,signature){const prior=ledger.receipts[key];if(prior&&prior.signature!==signature)fail('This supply request id was used for a different operation.');return prior?.result;}
function saveReceipt(ledger,key,signature,result){ledger.receipts[key]={signature,result};return result;}

/** All production, reservations, payments and stock transfers share the wallet
 * database lock. Public requests can never mark a passage or delivery complete. */
export class WorldSupplyService {
 constructor(database,{catalog=async()=>[],maps=async()=>[],rooms=async()=>({}),collision,routingWorker=false,routeWorkerPool,now=Date.now}={}){Object.assign(this,{database,catalog,maps,rooms,collision,now});this.deliveryRouteCache=new Map();this.pendingDeliveryPlans=new Map();this.routeWorker=routingWorker?(routeWorkerPool||new DeliveryRoutePool()):null;this.deliveryActivityMapIds=new Set();this.deliveryActivityReady=database.read().then(data=>{this.deliveryActivityMapIds=deliveryActivityMaps(data.worldSupply);});}
 // Gameplay snapshots use only this Set lookup. Persisted freight is indexed
 // once at startup; explicit supply operations replace it after durable commit.
 hasDeliveryActivity(mapId){return this.deliveryActivityMapIds.has(mapId);}
 async supplyTransaction(operation){
  await this.deliveryActivityReady;let activity;
  const result=await this.database.transaction(async data=>{const result=await operation(data);activity=deliveryActivityMaps(data.worldSupply);return result;});
  this.deliveryActivityMapIds=activity;return result;
 }
 async directory({walletId,mapId,addressId,inventoryRequestId,includeCatalog=true,includeDemand=false}={}){
  const [items,maps,snapshot]=await Promise.all([includeCatalog?this.catalog():[],this.maps(),this.database.read()]);
  const savedRequest=inventoryRequestId&&own(snapshot.worldSupply?.itemRequests||{},inventoryRequestId)&&snapshot.worldSupply.itemRequests[inventoryRequestId];
  addressId ||= savedRequest?.addressId;mapId ||= savedRequest?.destinationMapId||addressMapId(addressId);
  const available=maps.filter(map=>map.visibility!=='private'&&map.playable!==false),activeRequests=Object.values(snapshot.worldSupply?.itemRequests||{}).filter(request=>!['cancelled','delivered'].includes(request.phase)),activeOrders=Object.values(snapshot.worldSupply?.orders||{}).filter(order=>!['cancelled','delivered'].includes(order.phase)),pendingShips=Object.values(snapshot.worldSupply?.shipments||{}).filter(shipment=>!['delivered','cancelled','port-held'].includes(shipment.phase)),deeds=Object.values(snapshot.landDeeds||{}).filter(deed=>deed.status==='active'&&(deed.ownerId===walletId||'plot-'+deed.id===mapId||activeOrders.some(order=>order.deedId===deed.id)||pendingShips.some(shipment=>shipment.destinationMapId==='plot-'+deed.id))),ids=new Set(deeds.map(deed=>'plot-'+deed.id));
  for(const id of [mapId,addressMapId(addressId),...activeOrders.filter(order=>order.addressId).map(order=>order.destinationMapId),...pendingShips.filter(shipment=>shipment.addressId).map(shipment=>shipment.destinationMapId),...activeRequests.map(request=>request.destinationMapId)])if(available.some(map=>map.id===id))ids.add(id);
  if(includeDemand)for(const map of available.filter(map=>map.id===mapId||!map.memberPlot||map.ownerId===walletId).sort((a,b)=>Number(b.id===mapId)-Number(a.id===mapId)).slice(0,64))ids.add(map.id);
  const rooms=await this.rooms([...ids]),addressFor=(data,id)=>resolveDeliveryAddress(data,available,rooms,id),addressValid=(data,record)=>addressRecipientValid(data,available,rooms,record);
  const addressesFor=(data,id)=>{const map=available.find(map=>map.id===id);return map?mapDeliveryAddresses(data,map,rooms[id]||{}):[];};
  const context=(data,shipment)=>{
   const address=shipment.addressId?addressFor(data,shipment.addressId):null,base=available.find(map=>map.id===shipment.destinationMapId)||{id:shipment.destinationMapId};
   const deed=shipment.addressId?{id:shipment.addressId,name:address?.name||shipment.address?.name||'Delivery address',ownerId:address?.recipientId||'missing',status:address?'active':'missing'}:Object.values(data.landDeeds||{}).find(deed=>deed.id===shipment.deedId)||{id:shipment.deedId,status:'missing'},environment=address?{...base,delivery:{...base.delivery,...(address.kind.endsWith('entrance')?{dropoff:base.delivery?.dropoff,entrance:address.dropoff}:{dropoff:address.dropoff})}}:base,room=rooms?.[environment.id]||{},portId=shipment.receivingPortId||shipment.onwardPortId||shipment.destinationPortId,revision=deliveryMapRevision({deed,environment,room,portId});return {deed,environment,room,portId,revision,address,addressId:shipment.addressId,storedAddress:shipment.address};
  };
  const keyFor=(entry,{origin,mode}={})=>entry.deed.id+':'+entry.revision+':'+(origin?JSON.stringify([mode||'truck',origin.x,origin.y,origin.z]):'base'),preparedPlans=new Map();
  const remember=(key,plan)=>{if(this.deliveryRouteCache.size>=512)this.deliveryRouteCache.delete(this.deliveryRouteCache.keys().next().value);this.deliveryRouteCache.set(key,plan);return plan;};
  // Geometry work runs before acquiring the wallet transaction. Inside the
  // lock a concurrently changed deed can only hold, never compute a GLB/A* route.
  const prepare=async(shipment,options={})=>{
   const entry=context(snapshot,shipment),key=keyFor(entry,options);if(this.deliveryRouteCache.has(key)){const plan=this.deliveryRouteCache.get(key);preparedPlans.set(key,plan);return plan;}
   if(this.pendingDeliveryPlans.has(key))return this.pendingDeliveryPlans.get(key).then(plan=>{preparedPlans.set(key,plan);return plan;});
   const job=(async()=>{
    await Promise.resolve();
    try{
     if(entry.addressId&&!entry.address)return remember(key,{id:'address-route:'+entry.addressId+':'+entry.revision,addressId:entry.addressId,address:entry.storedAddress,deedId:null,mapId:entry.environment.id,revision:entry.revision,status:'blocked',reason:'The receiving store or building was removed. Choose an available delivery address.',dropoff:entry.storedAddress?.dropoff||{id:'missing:'+entry.addressId,mapId:entry.environment.id,name:'Unavailable receiving address',position:{x:0,y:0,z:0}},hub:null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,estimatedDurationMs:0,legs:[]});
     const input={...entry,now:this.now(),...options};
     const plan=this.routeWorker?await this.routeWorker.calculate(input):planDeedDelivery({...input,collision:typeof this.collision==='function'?this.collision():this.collision});if(entry.address){plan.addressId=entry.address.id;plan.address=publicDeliveryAddress(entry.address);plan.deedId=entry.address.deedId;}return plan.retryable?plan:remember(key,plan);
    }catch(error){return {id:'deed-route:'+entry.deed.id+':'+entry.revision,deedId:entry.deed.id,mapId:entry.environment.id,revision:entry.revision,status:'blocked',reason:'Delivery route calculation is temporarily unavailable. '+error.message,dropoff:{id:'deed-entrance:'+entry.deed.id,mapId:entry.environment.id,name:'Deed entrance',kind:'plot-entrance',position:entry.environment.spawn||{x:0,y:0,z:0}},hub:null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,estimatedDurationMs:0,legs:[]};}
    finally{this.pendingDeliveryPlans.delete(key);}
   })();this.pendingDeliveryPlans.set(key,job);return job.then(plan=>{preparedPlans.set(key,plan);return plan;});
  };
  for(const deed of deeds){
   const order=activeOrders.find(order=>order.deedId===deed.id);await prepare({deedId:deed.id,destinationMapId:'plot-'+deed.id,destinationPortId:order&&routes.find(route=>route.id===order.contractId)?.to||routes[0]?.to});
   await new Promise(resolve=>setImmediate(resolve));
  }
  const explicitAddress=addressId&&addressFor(snapshot,addressId);
  if(explicitAddress)await prepare({addressId,deedId:explicitAddress.deedId,destinationMapId:explicitAddress.mapId,destinationPortId:routes[0]?.to});
  for(const order of activeOrders.filter(order=>order.addressId))await prepare({...order,destinationPortId:routes.find(route=>route.id===order.contractId)?.to});
  for(const shipment of pendingShips){
   const deed=deeds.find(deed=>'plot-'+deed.id===shipment.destinationMapId);if(!deed&&!shipment.addressId)continue;
   await prepare({...shipment,deedId:shipment.deedId||deed?.id,destinationPortId:shipment.destinationPortId||routes.find(route=>route.id===shipment.contractId)?.to});await new Promise(resolve=>setImmediate(resolve));
  }
  for(const task of Object.values(snapshot.worldSupply?.deliveryTasks||{})){
   if(['delivered','port-held','cancelled'].includes(task.phase))continue;
   const shipment=snapshot.worldSupply.shipments[task.shipmentId];if(!shipment)continue;const current=await prepare(shipment);
   if(task.route&&(current.revision!==task.routeRevision||task.phase==='blocked')){
    const view=deliveryTaskView(task,this.now()),courierOnly=['courier','dropoff'].includes(view.phase==='blocked'?task.heldPhase:view.phase),origin=courierOnly?view.courierPosition:view.truckPosition;
    if(origin)await prepare(shipment,{origin,mode:courierOnly?'courier':undefined});
   }
   await new Promise(resolve=>setImmediate(resolve));
  }
  return {items,maps:available,rooms,walletId,mapId,addressFor,addressValid,addressesFor,planFor:(data,shipment,options={})=>{
   const entry=context(data,shipment),cached=this.deliveryRouteCache.get(keyFor(entry,options))||preparedPlans.get(keyFor(entry,options));if(cached)return cached;
   const base=this.deliveryRouteCache.get(keyFor(entry))||preparedPlans.get(keyFor(entry))||{};
   return {...base,id:'deed-route:'+entry.deed.id+':'+entry.revision,deedId:entry.deed.id,mapId:entry.environment.id,revision:entry.revision,status:'blocked',reason:'The deed or delivery route changed. Waiting for the next validated route update.',dropoff:base.dropoff||{id:'deed-entrance:'+entry.deed.id,mapId:entry.environment.id,name:'Deed entrance',kind:'plot-entrance',position:{x:0,y:0,z:0}},hub:base.hub||null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,estimatedDurationMs:0,legs:[]};
  }};
 }
 async addresses({mapId,addressId,offset=0,limit=200}={}){
  const selected=mapId||addressMapId(addressId);if(!selected)fail('Choose a map or delivery address.',422);
  const [maps,data,rooms]=await Promise.all([this.maps(),this.database.read(),this.rooms([selected])]);
  const map=maps.find(map=>map.id===selected&&map.visibility!=='private'&&map.playable!==false);if(!map)fail('This delivery map is unavailable.',404);
  const records=mapDeliveryAddresses(data,map,rooms[selected]||{}).filter(address=>!addressId||address.id===addressId).map(publicDeliveryAddress);
  if(addressId&&!records.length)fail('This delivery address is no longer available.',404);
  const start=addressId?0:Math.max(0,Math.floor(Number(offset)||0)),count=Math.max(1,Math.min(200,Math.floor(Number(limit)||200))),addresses=records.slice(start,start+count),hasMore=start+addresses.length<records.length;
  return {serverTime:this.now(),mapId:selected,addresses,total:records.length,offset:start,hasMore,nextOffset:hasMore?start+addresses.length:null};
 }
 async state({mapId,walletId}={}){
  const directory=await this.directory({walletId,mapId,includeDemand:!!walletId}),now=this.now();
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   if(mapId&&mapId!=='world'&&!directory.maps.some(map=>map.id===mapId))fail('Choose an available map.',404);
   const catalog=nativeMarketCatalog(factoryLineupItems(data,directory.items,{walletId}),directory.maps).items.filter(item=>{try{factoryUnitPriceMzk(item);return true;}catch{return false;}});
   const activeIds=new Set(catalog.map(item=>item.supplyId));
   const transferCatalog=Object.values(ledger.catalog).filter(item=>!activeIds.has(item.supplyId)).map(item=>({...item,id:item.supplyId,factoryProducible:false,recipe:recipeSummary(item)}));
   const availableFactoryStock={...ledger.factoryStock};
   for(const lot of Object.values(ledger.factoryLots))if(lot.reservedOrderId)availableFactoryStock[lot.itemId]=Math.max(0,(availableFactoryStock[lot.itemId]||0)-lot.availableQuantity);
   const addressRecords=mapId?directory.addressesFor(data,mapId).map(publicDeliveryAddress):[],addresses=addressRecords.slice(0,200),addressPage={mapId:mapId||null,total:addressRecords.length,offset:0,hasMore:addressRecords.length>addresses.length,nextOffset:addressRecords.length>addresses.length?addresses.length:null};
   const state=filterSupplyState({exportableForgeItems:exportableForgeFreight(data,walletId),airTasks:Object.values(ledger.airTasks||{}).map(task=>publicAirTask(task,walletId)),airReceipts:Object.values(ledger.airReceipts||{}).map(publicAirReceipt),airRoutes:STRAIT_AIR_ROUTES,freightConnections:STRAIT_FREIGHT_CONNECTIONS,addresses,addressPage,ownerId:walletId||null,deeds:walletId?ownedSupplyDeeds(data,walletId).map(deed=>({...deed,deliveryRoute:ledger.deliveryRoutes[deed.id]||null,deliveryDropoff:ledger.deliveryRoutes[deed.id]?.dropoff||null})):[],orders:Object.values(ledger.orders),deliveryTasks:Object.values(ledger.deliveryTasks).map(task=>deliveryTaskView(task,now)),deliveryRoutes:Object.values(ledger.deliveryRoutes),portReceipts:Object.values(ledger.portReceipts),dropoffReceipts:Object.values(ledger.dropoffReceipts),portEscrow:Object.values(ledger.portEscrow),serverTime:now,rules:WORLD_SUPPLY_RULES,mapId:mapId||'world',catalog:catalog.map(item=>({...item,id:item.supplyId,factoryProducible:true,factoryUnitPriceMzk:factoryUnitPriceMzk(item),recipe:recipeSummary(item)})),transferCatalog,worldStock:ledger.worldStock,factoryStock:ledger.factoryStock,availableFactoryStock,maps:[{id:'world',name:'World stock · central stores',stock:ledger.worldStock},...directory.maps.map(map=>({...ledger.maps[map.id],regionId:map.regionId||null,regionName:map.regionName||map.districtName||null,travelModes:map.travelModes||[],stores:(map.builderScene?.objects||[]).filter(object=>/shop|store|market/i.test(object.name||object.modelId||'')).map(object=>({id:object.id,name:object.name||object.modelId}))}))],production:Object.values(ledger.production),lots:Object.values(ledger.factoryLots),allocations:Object.values(ledger.factoryLotAllocations),stockReceipts:Object.values(ledger.factoryStockReceipts),shipments:Object.values(ledger.shipments),challenges:distributionChallenges(ledger,directory),routes,shippingMaps:directory.maps.filter(isShippingEnvironment).map(map=>({id:map.id,name:map.name}))},{walletId,data});
   if(walletId){
    const eligible=Object.values(ledger.itemRequests||{}).filter(request=>directory.maps.some(map=>map.id===request.destinationMapId)&&supplyItemVisibleTo(data,request.itemId,walletId));
    const mine=request=>request.ownerId===walletId||request.claimantId===walletId,active=request=>!['cancelled','delivered'].includes(request.phase);
    state.inventoryRequests=eligible.sort((a,b)=>Number(mine(b))-Number(mine(a))||Number(active(b))-Number(active(a))||Number(b.destinationMapId===mapId)-Number(a.destinationMapId===mapId)||b.createdAt-a.createdAt).slice(0,100).map(request=>itemRequestPublicView(data,ledger,request,walletId,now));
    state.aiCalls=itemRequestCalls(data,ledger,directory,walletId);
    state.completedOwnedLots=eligibleWorldItemRequestLots(data,ledger,walletId,null,{now}).slice(0,100);
   }else{state.inventoryRequests=[];state.aiCalls=[];state.completedOwnedLots=[];}
   return attachOrderJourneys(state,ledger,{maps:directory.maps,walletId});
  });
 }
 async recipe(itemId,count=1,{walletId}={}){
  const directory=await this.directory({walletId});return this.supplyTransaction(data=>{ensureWorldSupply(data,directory);const item=factoryProductionItem(data,itemId,directory.items,{walletId});return {itemId:item.supplyId,...worldFactoryPlan(item,quantity(count),WORLD_SUPPLY_RULES)};});
 }
 async trace({productionId,shipmentId,lotId,walletId}={}){
  const state=await this.state({walletId});
  if(!productionId&&!shipmentId&&!lotId)fail('Choose a production batch, stock lot or shipment.',422);
  if(productionId&&!state.production.some(job=>job.id===productionId)||shipmentId&&!state.shipments.some(shipment=>shipment.id===shipmentId)||lotId&&!state.lots.some(lot=>lot.id===lotId))fail('The requested factory record is unavailable.',404);
  const ids=new Set(state.lots.filter(lot=>lot.id===lotId||productionId&&lot.productionId===productionId).map(lot=>lot.id));
  for(const allocation of state.allocations.filter(allocation=>allocation.shipmentId===shipmentId))for(const line of allocation.lots)ids.add(line.lotId);
  const lots=state.lots.filter(lot=>ids.has(lot.id)),production=state.production.filter(job=>job.id===productionId||lots.some(lot=>lot.productionId===job.id));
  const allocations=state.allocations.filter(allocation=>allocation.shipmentId===shipmentId||allocation.lots.some(line=>ids.has(line.lotId))),shipIds=new Set(allocations.map(allocation=>allocation.shipmentId));
  if(shipmentId)shipIds.add(shipmentId);
  const shipments=state.shipments.filter(shipment=>shipIds.has(shipment.id)),stockReceipts=state.stockReceipts.filter(receipt=>shipIds.has(receipt.shipmentId));
  const related=records=>(records||[]).filter(record=>shipIds.has(record.shipmentId));
  const orderIds=new Set(shipments.map(shipment=>shipment.orderId).filter(Boolean));for(const job of production)if(job.orderId)orderIds.add(job.orderId);
  const journeys=[...state.orders.filter(order=>orderIds.has(order.id)&&order.journey).map(order=>order.journey),...shipments.filter(shipment=>!shipment.orderId&&shipment.journey).map(shipment=>shipment.journey)];
  return {serverTime:state.serverTime,production,lots,allocations,shipments,stockReceipts,journeys,deliveryTasks:related(state.deliveryTasks),portReceipts:related(state.portReceipts),dropoffReceipts:related(state.dropoffReceipts),airTasks:related(state.airTasks),airReceipts:related(state.airReceipts),portEscrow:related(state.portEscrow),events:production.flatMap(job=>job.events||[]).sort((a,b)=>a.at-b.at)};
 }
 async projection({mapId}={}){
  const directory=await this.directory({mapId,includeCatalog:false}),now=this.now();
  if(!mapId||!directory.maps.some(map=>map.id===mapId))fail('Choose an available delivery map.',404);
  return this.supplyTransaction(data=>{const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);return projectWorldDeliveries(ledger,mapId,now);});
 }
 async quarryMarketCatalog(){const [maps,data]=await Promise.all([this.maps(),this.database.read()]);return quarryMarketCatalog(data.worldSupply||{},maps);}
 async quarryState({mapId,walletId}={}){
  const state=await this.state({mapId,walletId});return {ownerId:state.ownerId,deeds:state.deeds,orders:state.orders.filter(order=>String(order.itemId).startsWith('quarry:')),shipments:state.shipments.filter(shipment=>String(shipment.itemId).startsWith('quarry:')),maps:state.maps.map(map=>({id:map.id,name:map.name,stock:Object.fromEntries(Object.entries(map.stock||{}).filter(([key])=>key.startsWith('quarry:')))})),routes:state.routes.map(route=>({id:route.id,name:route.name,from:route.from,to:route.to})),shippingMaps:state.shippingMaps,serverTime:state.serverTime};
 }
 async quarryInventory(identity,input,now=this.now()){
  const wallet=cleanWallet(identity.walletId);
  return this.database.transaction(data=>{
   const user=data.users[wallet];if(!user)fail('Sign in to manage quarry stock.',401);const ledger=ensureWorldSupply(data);ledger.quarryBookings||={};ledger.quarryUses||={};
   if(input.operation==='export'){
    const item=supplyItem(data,'quarry:'+input.material),count=quantity(input.quantity),signature=JSON.stringify([wallet,input.sourceMapId,item.supplyId,count]),prior=ledger.quarryBookings[input.id];
    if(prior){if(prior.signature!==signature)fail('This quarry booking is already assigned to another reservation.');return prior;}
    ensureWorldSupply(data,{maps:[input.sourceMapId]});const stock=ledger.maps[input.sourceMapId].stock;stock[item.supplyId]=(stock[item.supplyId]||0)+count;
    const receipt={id:input.id,signature,ownerId:wallet,sourceMapId:input.sourceMapId,itemId:item.supplyId,quantity:count,bookedAt:now};ledger.quarryBookings[input.id]=receipt;return receipt;
   }
   const deed=ownedSupplyDeeds(data,wallet).find(deed=>deed.destinationMapId===input.mapId);if(!deed)fail('Only the current deed holder can manage these materials.',403);
   const stock=ledger.maps[input.mapId]?.stock||{},uses=Object.values(ledger.quarryUses).filter(use=>use.mapId===input.mapId&&!use.recovered);
   if(input.operation==='deed-state')return {stock,uses,deed};
   if(input.operation==='recover'){
    const use=ledger.quarryUses[input.useId];if(!use||use.mapId!==input.mapId||use.ownerId!==wallet||use.kind!=='storage')fail('Choose your aggregate storage bay.',403);
    if(!use.recovered){stock[use.itemId]=(stock[use.itemId]||0)+use.quantity;use.recovered=true;use.recoveredAt=now;}return use;
   }
   if(input.operation!=='apply')fail('Choose a quarry inventory operation.',422);
   const item=supplyItem(data,'quarry:'+input.material),count=quantity(input.quantity),signature=JSON.stringify([wallet,input.mapId,input.kind,item.supplyId,count,input.position]);
   const prior=ledger.quarryUses[input.id];if(prior){if(prior.signature!==signature)fail('This placement receipt belongs to another material use.');return prior;}
   if((stock[item.supplyId]||0)<count)fail('Wait for delivered stock before using these materials.');stock[item.supplyId]-=count;
   const record={id:input.id,signature,ownerId:wallet,deedId:deed.id,mapId:input.mapId,kind:input.kind,material:input.material,itemId:item.supplyId,quantity:count,position:input.position,rotationY:input.rotationY||0,createdAt:now,seedReady:input.kind==='garden',recovered:false};ledger.quarryUses[input.id]=record;return record;
  });
 }
 async action(walletId,operation,input={}){
  const wallet=cleanWallet(walletId),directory=await this.directory({walletId:wallet,addressId:input.addressId,mapId:input.destinationMapId,inventoryRequestId:input.inventoryRequestId,includeDemand:operation==='request-create'&&!!input.sourceCallId}),now=this.now();
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   const user=data.users[wallet];if(!user)fail('Sign in to operate the world factory.',401);
   if(operation==='quote')return quoteFor(factoryProductionItem(data,input.itemId,directory.items,{walletId:wallet}),input.quantity);
   const key=requestKey(wallet,operation,input),signature=JSON.stringify([input.itemId,input.quantity,input.destinationMapId,input.shippingMapId,input.contractId,input.productionId,input.shipmentId,input.expectedPriceMzk,input.sourceMapId,...(input.challengeId?[input.challengeId]:[]),...(input.deedId?[{deedId:input.deedId}]:[]),...(input.orderId?[{orderId:input.orderId}]:[]),...(input.customItemId?[{customItemId:input.customItemId}]:[]),...(input.addressId?[{addressId:input.addressId}]:[]),...(input.expectedAddressRevision!==undefined?[{expectedAddressRevision:input.expectedAddressRevision}]:[]),...(input.onwardMode!==undefined?[{onwardMode:input.onwardMode}]:[]),...(operation.startsWith('request-')?[{inventoryRequestId:input.inventoryRequestId,rewardMzk:input.rewardMzk,source:input.source,sourceCallId:input.sourceCallId,lotIds:input.lotIds}]:[])]);
   const prior=priorReceipt(ledger,key,signature);if(prior)return prior;
   let result;
   if(operation.startsWith('request-')){
    ensureWorldItemRequests(ledger);
    const options={now,addressValid:record=>itemRequestAddressValid(data,record,directory)};
    if(operation==='request-create'){
     const item=factoryProductionItem(data,input.itemId,directory.items,{walletId:wallet}),target=addressOrderDestination(data,input,directory),shippingMapId=input.shippingMapId||SHIPPING_ID,onward=onwardSelection(input.onwardMode,target.route,{destination:true,shippingMapId,directory});
     const call=input.sourceCallId?itemRequestCalls(data,ledger,directory,wallet).find(call=>call.id===input.sourceCallId):null;
     if(input.sourceCallId&&(!call||call.itemId!==item.supplyId||call.addressId!==target.address.id||call.addressRevision!==target.address.revision||input.quantity>call.shortfall))fail('This inventory call changed or was already funded. Refresh its current need before funding.');
     if((call?.source||input.source)==='forge'&&!FORGE_RECIPES.some(recipe=>recipe.buildAssetId===item.buildAssetId))fail('Choose a traditional forge design for a forge-only request.',422);
     result=createWorldItemRequest(data,ledger,wallet,input,{item,address:target.address,now,call,shippingMapId,contractId:target.route.id,onwardMode:onward.onwardMode});
    }else if(operation==='request-claim')result=claimWorldItemRequest(data,ledger,wallet,input,options);
    else if(operation==='request-cancel')result=cancelWorldItemRequest(data,ledger,wallet,input,options);
    else if(operation==='request-fulfill')result=stageItemRequestFreight(data,ledger,wallet,input,directory,now);
    else fail('Choose a listed inventory request action.',422);
   }else if(operation==='export-forge'){
    result=exportForgeFreight(data,wallet,input,ledger,now);
   }else if(operation==='register-design'){
    const item=registerPrivateFactoryBlueprint(data,wallet,input.customItemId);result={itemId:item.supplyId,item};
   }else if(operation==='produce'||operation==='order'||operation==='order-address'){
    const item=factoryProductionItem(data,input.itemId,directory.items,{walletId:wallet}),quote=quoteFor(item,input.quantity),target=operation==='order-address'?addressOrderDestination(data,input,directory):operation==='order'?orderDestination(data,wallet,{...input,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:input.contractId||'gulf-gateway'},directory,routes):null;
    const onward=target?onwardSelection(input.onwardMode,target.route,{destination:true,shippingMapId:input.shippingMapId||SHIPPING_ID,directory}):null;
    if(input.expectedPriceMzk!==undefined&&input.expectedPriceMzk!==quote.priceMzk)fail('The factory quote changed. Review the current cost.');
    if(Number(user.tokens.MZK||0)<quote.priceMzk)fail('Not enough MZK for this production batch.');
    if(Object.values(ledger.production).filter(job=>job.ownerId===wallet&&['building','paused'].includes(job.phase)).length>=20)fail('Finish an existing production batch before starting another.');
    user.tokens.MZK-=quote.priceMzk;
    result=createFactoryProduction(quote,{id:randomUUID(),ownerId:wallet,now});ledger.production[result.id]=result;
    if(target){
     const job=result,order={id:randomUUID(),deliverySchemaVersion:1,...onward,ownerId:wallet,deedId:target.deed?.id||null,deedName:target.address?.name||target.deed.name,...(target.address?{addressId:target.address.id,address:publicDeliveryAddress(target.address),recipientId:target.address.recipientId}:{}),destinationMapId:target.destinationMapId,productionId:job.id,itemId:item.supplyId,itemName:item.name,quantity:quote.quantity,priceMzk:quote.priceMzk,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:target.route.id,shipmentIds:[],deliveredQuantity:0,phase:'building',createdAt:now,updatedAt:now};
     job.orderId=order.id;ledger.orders[order.id]=order;result=order;
    }
    const fundedJob=target?ledger.production[result.productionId]:result;
    data.transactions.push({id:'factory:'+fundedJob.id,type:'WORLD_FACTORY_PRODUCTION',walletId:wallet,requestId:input.requestId,amountMzk:-quote.priceMzk,balanceAfterMzk:user.tokens.MZK,itemId:item.supplyId,quantity:quote.quantity,...(target?{orderId:result.id,deedId:result.deedId}:{}),createdAt:new Date(now).toISOString()});
   }else if(operation==='pause'||operation==='resume'){
    const job=own(ledger.production,input.productionId)&&ledger.production[input.productionId];
    if(!job||job.ownerId!==wallet)fail('This production batch is not yours.',403);
    result=operation==='pause'?pauseFactoryProduction(job,now):resumeFactoryProduction(job,now);
   }else if(operation==='order-quarry'){
    const item=supplyItem(data,input.itemId),count=quantity(input.quantity);if(!item.quarryMaterial)fail('Choose a processed quarry material.',422);
    const target=orderDestination(data,wallet,{...input,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:input.contractId||'gulf-gateway'},directory,routes),sourceMapId=input.sourceMapId;
    const source=directory.maps.find(map=>map.id===sourceMapId&&(map.quarry||map.builderScene?.layoutMeta?.quarry)?.enabled);if(!source)fail('Choose a live quarry warehouse.',422);if(source.memberPlot&&source.ownerId!==wallet)fail('Only the current deed holder can sell stock from this private quarry.',403);
    const stock=ledger.maps[sourceMapId]?.stock,priceMzk=QUARRY_MATERIALS[item.quarryMaterial].priceMzk*count;
    if((stock?.[item.supplyId]||0)<count)fail('The quarry warehouse does not have enough processed stock. Mine, screen and book more material first.');if(Number(user.tokens.MZK||0)<priceMzk)fail('Not enough MZK for this material order.');
    const max=(target.route.units||4)*1000;if(count>max)fail('Split this material order into smaller freight manifests.',422);
    stock[item.supplyId]-=count;user.tokens.MZK-=priceMzk;
    const order={id:randomUUID(),quarryOrder:true,deliverySchemaVersion:1,ownerId:wallet,deedId:target.deed.id,deedName:target.deed.name,destinationMapId:target.destinationMapId,productionId:null,itemId:item.supplyId,itemName:item.name,quantity:count,priceMzk,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:target.route.id,shipmentIds:[],deliveredQuantity:0,phase:'awaiting-shipping',sourceMapId,createdAt:now,updatedAt:now};
    const shipment=createShipment({id:randomUUID(),deliverySchemaVersion:1,recipientId:wallet,ownerId:wallet,itemId:item.supplyId,itemName:item.name,quantity:count,packing:{recipeId:'quarry-material',unitsPerContainer:1000,containersRequired:Math.ceil(count/1000),containerSlots:target.route.units||4,maxShipmentQuantity:max,sealed:true},sourceMapId,destinationMapId:target.destinationMapId,shippingMapId:order.shippingMapId,contractId:order.contractId,orderId:order.id,deedId:target.deed.id},target.route,now);
    ledger.shipments[shipment.id]=shipment;allocateFactoryLots(ledger,shipment,{now});order.shipmentIds.push(shipment.id);ledger.orders[order.id]=order;
    data.transactions.push({id:'quarry-order:'+order.id,type:'QUARRY_MATERIAL_ORDER',walletId:wallet,amountMzk:-priceMzk,balanceAfterMzk:user.tokens.MZK,itemId:item.supplyId,quantity:count,deedId:target.deed.id,createdAt:new Date(now).toISOString()});result=order;
   }else if(operation==='dispatch'){
    const item=supplyItem(data,input.itemId),count=quantity(input.quantity),receivingAddress=input.addressId?directory.addressFor(data,input.addressId):null,destinationMapId=receivingAddress?.mapId||input.destinationMapId,sourceMapId=input.sourceMapId||'factory',shippingMapId=input.shippingMapId||SHIPPING_ID,contractId=input.contractId||'gulf-gateway',route=routes.find(route=>route.id===contractId);
    if(!route)fail('Choose a shipping lane with a destination port.',422);
    const onward=onwardSelection(input.onwardMode,route,{destination:!!receivingAddress||Object.values(data.landDeeds||{}).some(deed=>deed.status==='active'&&'plot-'+deed.id===destinationMapId),shippingMapId,directory});
    if(input.addressId&&!receivingAddress)fail('This receiving address is no longer available.',404);
    if(receivingAddress&&input.expectedAddressRevision!==undefined&&input.expectedAddressRevision!==receivingAddress.revision)fail('This receiving address moved or changed owner. Refresh the address and review it before dispatch.');
    if(receivingAddress&&input.destinationMapId!==undefined&&input.destinationMapId!==receivingAddress.mapId)fail('The destination must match the selected delivery address.',422);
    if(!supplyItemVisibleTo(data,item.supplyId,wallet))fail('This factory blueprint belongs to another member.',403);
    const recipe=worldFactoryRecipe(item),containerSlots=route.units||4,maxShipmentQuantity=containerSlots*recipe.unitsPerContainer;
    if(count>maxShipmentQuantity)fail('This manifest carries up to '+maxShipmentQuantity+' '+item.name+' units ('+recipe.unitsPerContainer+' per container). Split the batch or choose a larger manifest.',422);
    const packing={recipeId:recipe.id,unitsPerContainer:recipe.unitsPerContainer,containersRequired:Math.ceil(count/recipe.unitsPerContainer),containerSlots,maxShipmentQuantity,sealed:true};
    if(destinationMapId!=='world'&&!directory.maps.some(map=>map.id===destinationMapId))fail('Choose an available destination map.',404);
    if(!directory.maps.some(map=>map.id===shippingMapId&&isShippingEnvironment(map)))fail('Choose an available shipping map.',404);
    if(sourceMapId!=='factory'&&sourceMapId!=='world'&&!directory.maps.some(map=>map.id===sourceMapId))fail('Choose an available source inventory.',404);
    if(sourceMapId===destinationMapId)fail('Choose a different destination inventory for this transfer.',422);
    const challenge=distributionChallengeForDispatch(ledger,directory,input,item);
    if(item.quarryMaterial){const sourceDeed=Object.values(data.landDeeds||{}).find(deed=>'plot-'+deed.id===sourceMapId);if(!sourceDeed||!ownedSupplyDeeds(data,wallet).some(deed=>deed.id===sourceDeed.id))fail('Use the quarry material order to buy and ship warehouse stock; only your own delivered deed stock can be transferred.',403);const destinationDeed=Object.values(data.landDeeds||{}).find(deed=>'plot-'+deed.id===destinationMapId);const jobSite=directory.maps.find(map=>map.id===destinationMapId&&(map.quarry||map.construction||map.builderScene?.layoutMeta?.construction)?.enabled);if(!jobSite&&(!destinationDeed||!ownedSupplyDeeds(data,wallet).some(deed=>deed.id===destinationDeed.id)))fail('Choose your own deed or a shared quarry/construction receiving site for this material transfer.',403);}
    const sourceStock=sourceMapId==='factory'?ledger.factoryStock:sourceMapId==='world'?ledger.worldStock:ledger.maps[sourceMapId].stock;
    if((sourceStock[item.supplyId]||0)<count)fail(sourceMapId==='factory'?'Complete enough factory production before dispatching this item.':'The source warehouse has insufficient stock for this transfer.');
    if(sourceMapId!=='factory')sourceStock[item.supplyId]-=count;
    result=createShipment({id:randomUUID(),...onward,ownerId:wallet,itemId:item.supplyId,itemName:item.name,quantity:count,packing,sourceMapId,destinationMapId,shippingMapId,contractId,...(receivingAddress?{addressId:receivingAddress.id,address:publicDeliveryAddress(receivingAddress),deedId:receivingAddress.deedId,recipientId:receivingAddress.recipientId,deliverySchemaVersion:1}:{}),...(challenge?{challenge}:{})},route,now);ledger.shipments[result.id]=result;allocateFactoryLots(ledger,result,{now});
   }else if(operation==='cancel'){
    const linkedProduction=input.productionId&&ledger.production[input.productionId],linkedShipment=input.shipmentId&&ledger.shipments[input.shipmentId],orderId=input.orderId||linkedProduction?.orderId||linkedShipment?.orderId;
    if(orderId){result=cancelFactoryOrder(ledger,data,orderId,wallet,input.requestId,now,(shipment,time)=>updatePortTransfer(shipment,'returned',time));}
    else if(input.productionId){
     const job=own(ledger.production,input.productionId)&&ledger.production[input.productionId];if(!job||job.ownerId!==wallet)fail('This production batch is not yours.',403);
     if(!['building','paused'].includes(job.phase))fail('Only a batch still being built can be cancelled.');
     job.phase='cancelled';job.cancelledAt=now;user.tokens.MZK+=job.priceMzk;
     data.transactions.push({id:'factory-refund:'+job.id,type:'WORLD_FACTORY_REFUND',walletId:wallet,requestId:input.requestId,amountMzk:job.priceMzk,balanceAfterMzk:user.tokens.MZK,createdAt:new Date(now).toISOString()});result=job;
    }else{
     const shipment=own(ledger.shipments,input.shipmentId)&&ledger.shipments[input.shipmentId];if(!shipment||shipment.ownerId!==wallet)fail('This shipment is not yours.',403);
     if(shipment.seaReceipt&&shipment.deliverySchemaVersion&&shipment.phase!=='delivered'){holdShipmentAtPort(ledger,shipment,now);result=shipment;}
     else{
     if(shipment.phase!=='queued')fail('Only an unassigned shipment can be cancelled. Cancel the sea job or wait for its reservation to expire.');
     shipment.phase='cancelled';shipment.cancelledAt=now;if(shipment.transferTask)shipment.transferTask.phase='cancelled';updatePortTransfer(shipment,'returned',now);
     const sourceStock=!shipment.sourceMapId||shipment.sourceMapId==='factory'?ledger.factoryStock:shipment.sourceMapId==='world'?ledger.worldStock:ledger.maps[shipment.sourceMapId]?.stock;
     if(!sourceStock)fail('The source warehouse is unavailable.');if(!returnFactoryLots(ledger,shipment,{now}))sourceStock[shipment.itemId]=(sourceStock[shipment.itemId]||0)+shipment.quantity;result=shipment;
     }
    }
   }else fail('Choose a listed world supply action.',422);
   adoptDeedDeliveries(ledger,data);refreshFactoryOrders(ledger,data,now,{addressValid:record=>directory?.addressValid(data,record)});reconcileWorldItemRequests(data,ledger,{now,addressValid:record=>itemRequestAddressValid(data,record,directory)});
   user.updatedAt=new Date(now).toISOString();user.revision=Number(user.revision||0)+1;
   // Snapshot receipts: later state changes cannot change a replay response.
   const response=operation.startsWith('request-')?itemRequestPublicView(data,ledger,result,wallet,now):ledger.orders[result?.id]||ledger.shipments[result?.id]?{...result,journey:projectOrderJourney(ledger,result,{maps:directory.maps})}:result;
   return saveReceipt(ledger,key,signature,JSON.parse(JSON.stringify(response)));
  });
 }
 async shippingAction(identity,sim,player,environment,command,now=this.now()){
  if(!isShippingEnvironment(environment))fail('Enter a shipping map to carry factory goods.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   const shipment=own(ledger.shipments,command.shipmentId)&&ledger.shipments[command.shipmentId];if(!shipment)fail('This factory shipment is unavailable.',404);
   if(shipment.shippingMapId!==environment.id)fail('Enter the assigned shipping map to collect this manifest.');
   if(command.operation==='reserve'){
    if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('Only the current design owner can captain this private factory freight.',403);
    assertOrderFreightAvailable(ledger,data,shipment,directory);assertItemRequestFreightAvailable(ledger,data,shipment,directory);
    if(activePhases.has(player.shipping?.job?.phase))fail('Finish or cancel your current manifest first.');
    if(shipment.phase!=='queued')fail('Another captain has reserved this shipment or it has already finished.');
    if(command.contractId!==shipment.contractId)fail('Choose the shipping route assigned to these factory goods.',422);
    shipment.phase='reserved';shipment.captainId=wallet;shipment.leaseUntil=now+SHIPPING_RULES.contractLimitMs+60000;
    return {shipmentId:shipment.id,supplyManifest:[{itemId:shipment.itemId,name:shipment.itemName,quantity:shipment.quantity}],destinationMapId:shipment.destinationMapId,originPortId:shipment.originPortId,destinationPortId:shipment.destinationPortId,portTransferTask:shipment.portTransferTask,packing:shipment.packing,...(shipment.challenge?{challenge:shipment.challenge}:{})};
   }
   if(command.operation==='release'&&(shipment.releasedReservations?.[wallet+':'+(command.jobId||'')]||(shipment.phase==='delivered'||shipment.seaReceipt)&&shipment.captainId===wallet&&shipment.jobId===command.jobId))return {shipmentId:shipment.id};
   if(shipment.phase!=='reserved'||shipment.captainId!==wallet)fail('This shipment reservation belongs to another voyage.');
   if(command.operation==='bind'){
    const job=player.shipping?.job;
    if(!job||job.id!==command.jobId||job.contractId!==shipment.contractId||job.environmentId!==environment.id||job.phase!=='loading'||!Number.isSafeInteger(job.deadline)||job.deadline<=now||job.deadline>now+SHIPPING_RULES.contractLimitMs)fail('A verified loading job is required to bind factory freight.');
    if(shipment.jobId&&shipment.jobId!==job.id)fail('This shipment is already bound to another voyage.');
    shipment.jobId=job.id;shipment.leaseUntil=job.deadline+60000;updatePortTransfer(shipment,'loading',now);return {shipmentId:shipment.id};
   }
   if(command.operation==='release'){
    if(shipment.jobId&&shipment.jobId!==command.jobId)fail('This shipment is bound to another voyage.');
    shipment.releasedReservations ||= {};shipment.releasedReservations[wallet+':'+(command.jobId||'')]=true;
    shipment.phase='queued';delete shipment.jobId;delete shipment.captainId;delete shipment.leaseUntil;updatePortTransfer(shipment,'staged',now);return {shipmentId:shipment.id};
   }
   fail('Choose a listed factory freight operation.',422);
  });
 }
 async airAction(identity,sim,player,environment,command,now=this.now()){
  if(environment?.id!==SHIPPING_ID||!environment.airport?.enabled)fail('Enter a connected Strait airfield to carry this cargo.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);ensureAirFreight(ledger);
   const task=own(ledger.airTasks,command.airTaskId)&&ledger.airTasks[command.airTaskId],shipment=task&&ledger.shipments[task.shipmentId];
   if(!task||!shipment||task.mapId!==environment.id)fail('This air cargo task is unavailable in this map.',404);
   if(command.operation==='release'){
    const result=releaseAirTransfer(ledger,task.id,{walletId:wallet,reservationId:command.reservationId,reason:command.reason},now);
    return {task:JSON.parse(JSON.stringify(result)),reservationId:result.reservationId||null};
   }
   if(command.operation!=='reserve')fail('Choose a listed air cargo reservation action.',422);
   assertOrderFreightAvailable(ledger,data,shipment,directory);assertItemRequestFreightAvailable(ledger,data,shipment,directory);
   if(['cancelled','delivered','port-held'].includes(shipment.phase)||shipment.addressId&&!directory.addressValid(data,shipment))fail('The receiving address or remaining freight is on hold.');
   if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('Only the current design owner can pilot this private factory freight.',403);
   validateAirReservation(sim,player,environment,task,now);
   const result=reserveAirTransfer(ledger,task.id,{walletId:wallet,aircraftId:player.vehicleId,mapId:environment.id},now);
   return {task:JSON.parse(JSON.stringify(result)),reservationId:result.reservationId};
  });
 }
 async airDelivery(identity,proof,environment,now=this.now()){
  if(environment?.id!==SHIPPING_ID)fail('A verified Strait cargo flight is required.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);ensureAirFreight(ledger);
   const task=own(ledger.airTasks,proof.airTaskId)&&ledger.airTasks[proof.airTaskId],shipment=task&&ledger.shipments[task.shipmentId];
   if(!task||!shipment)fail('This sealed air manifest is unavailable.',404);
   if(task.captainId!==wallet||task.mapId!==environment.id)fail('This air cargo belongs to another pilot or map.',403);
   const previous=ledger.airReceipts[task.id];
   if(previous){if(previous.deliveryId!==proof.deliveryId||previous.reservationId!==proof.reservationId)fail('This cargo was received by another flight.');return previous;}
   assertOrderFreightAvailable(ledger,data,shipment,directory);assertItemRequestFreightAvailable(ledger,data,shipment,directory);
   if(['cancelled','delivered','port-held'].includes(shipment.phase)||shipment.addressId&&!directory.addressValid(data,shipment))fail('The receiving address or remaining freight is on hold.');
   if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('This private design is no longer authorized for this pilot.',403);
   const receipt=settleAirTransfer(ledger,{...proof,captainId:wallet,mapId:environment.id},now);
   receiveAirShipment(ledger,shipment,task,receipt,now);
   advance(ledger,now,data,directory);
   return receipt;
  });
 }
 async deliver(identity,result,environment,now=this.now()){
  if(!isShippingEnvironment(environment)||result.type!=='delivery')fail('A verified sea delivery is required.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.supplyTransaction(data=>{
   const ledger=ensureWorldSupply(data);adoptDeedDeliveries(ledger,data);const shipment=own(ledger.shipments,result.shipmentId)&&ledger.shipments[result.shipmentId];
   if(!shipment||shipment.captainId!==wallet||shipment.jobId!==result.jobId||result.deliveryId!==result.jobId||shipment.shippingMapId!==environment.id||shipment.contractId!==result.contractId)fail('This sea delivery does not match the reserved factory manifest.',422);
   if(shipment.phase==='delivered'||shipment.seaReceipt)return shipment;
   assertOrderFreightAvailable(ledger,data,shipment,directory);assertItemRequestFreightAvailable(ledger,data,shipment,directory);
   if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('This private design is no longer authorized for this captain.',403);
   if(shipment.phase!=='reserved'||now>=shipment.leaseUntil)fail('The factory shipment reservation expired.');
   const route=routes.find(route=>route.id===shipment.contractId);
   const validTimes=[result.startedAt,result.departedAt,result.deliveredAt].every(time=>Number.isSafeInteger(time)&&time>=0),minimumHandlingMs=SHIPPING_RULES.loadingSeconds*((route?.units||4)*2-2)*1000;
   if(!route||result.units!==(route.units||4)||result.cargoId!==route.cargoId||!Number.isInteger(result.quality)||result.quality<40||result.quality>100||!validTimes||result.deliveredAt>now||result.departedAt<result.startedAt||result.deliveredAt<result.departedAt||result.deliveredAt-result.startedAt<minimumHandlingMs||result.deliveredAt-result.startedAt>SHIPPING_RULES.contractLimitMs)fail('Invalid factory sea passage.',422);
   if(shipment.deliverySchemaVersion&&(shipment.deedId||shipment.addressId)){
    ensureFactoryLineage(ledger,{now});receiveDeedShipment(ledger,shipment,result,now);updatePortTransfer(shipment,'delivered',now);
    advance(ledger,now,data,directory);return shipment;
   }
   const stock=shipment.destinationMapId==='world'?ledger.worldStock:ledger.maps[shipment.destinationMapId]?.stock;if(!stock)fail('The destination inventory is unavailable.');
   stock[shipment.itemId]=(stock[shipment.itemId]||0)+shipment.quantity;
   if(!Number.isSafeInteger(stock[shipment.itemId]))fail('The destination inventory is at capacity.');
   Object.assign(shipment,{phase:'delivered',deliveredAt:now,deliveryId:result.deliveryId,transferTask:{id:'transfer:'+shipment.id,phase:'delivered',fromPortId:route.to,destinationMapId:shipment.destinationMapId,mode:'simulated-onward-freight',quantity:shipment.quantity}});
   updatePortTransfer(shipment,'delivered',now);
   ensureFactoryLineage(ledger,{now});deliverFactoryLots(ledger,shipment,{now});ledger.factoryStockReceipts[shipment.id]={id:'stock:'+shipment.id,shipmentId:shipment.id,deliveryId:result.deliveryId,itemId:shipment.itemId,quantity:shipment.quantity,destinationMapId:shipment.destinationMapId,receivedAt:now,lotAllocations:ledger.factoryLotAllocations[shipment.id]?.lots||[],quality:result.quality,...(shipment.orderId?{orderId:shipment.orderId,deedId:shipment.deedId,productionId:shipment.productionId}:{})};
   reconcileForgeFreightDeliveries(data,ledger);reconcileWorldItemRequests(data,ledger,{now,addressValid:record=>itemRequestAddressValid(data,record,directory)});
   if(shipment.challenge)shipment.challengeResult=distributionChallengeResult(shipment,result,now);
   refreshFactoryOrders(ledger,data,now,{addressValid:record=>directory?.addressValid(data,record)});
   return shipment;
  });
 }
}
