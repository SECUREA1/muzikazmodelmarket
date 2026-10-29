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
import {ensureWorldDelivery,receiveDeedShipment,advanceWorldDelivery,deliveryTaskView,projectWorldDeliveries,holdShipmentAtPort} from './world-delivery-runtime.mjs';
import {DeliveryRoutePool} from './world-delivery-route-pool.mjs';

export const WORLD_SUPPLY_RULES=Object.freeze({initialStock:1000,bulkMinimum:10,bulkDiscountPercent:20,maxQuantity:10000,minimumBuildMs:3000,maximumBuildMs:120000,itemsPerContainer:1000});
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const own=(object,key)=>Object.hasOwn(object,key);
const activePhases=new Set(['loading','secured','sailing','unloading']);
const routes=SHIPPING_ROUTES.filter(route=>route.from!==route.to&&!route.factoryExport);
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>WORLD_SUPPLY_RULES.maxQuantity)fail('Choose 1 to 10,000 whole items.',422);return value;}
function recipeSummary(item){
 const recipe=worldFactoryRecipe(item);
 return {id:recipe.id,profileId:recipe.profileId,recipeVersion:recipe.recipeVersion,itemPlanId:recipe.itemPlanId,fingerprint:recipe.fingerprint,name:recipe.name,itemName:recipe.itemName,description:recipe.description,unitsPerContainer:recipe.unitsPerContainer,unitBuildMs:recipe.unitBuildMs,minimumBuildMs:recipe.minimumBuildMs,stages:recipe.stages.map(({id,name,description,station})=>({id,name,description,station}))};
}

function quoteFor(item,count){
 const amount=quantity(count),unitPriceMzk=factoryUnitPriceMzk(item),subtotalMzk=unitPriceMzk*amount,discountPercent=amount>=WORLD_SUPPLY_RULES.bulkMinimum?WORLD_SUPPLY_RULES.bulkDiscountPercent:0;
 if(!Number.isSafeInteger(subtotalMzk))fail('The catalog price cannot be used for this production batch.',422);
 return {itemId:item.supplyId,quantity:amount,unitPriceMzk,subtotalMzk,discountPercent,priceMzk:Math.max(1,Math.floor(subtotalMzk*(100-discountPercent)/100)),...worldFactoryPlan(item,amount,WORLD_SUPPLY_RULES)};
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
 const shipment={...fields,phase:'queued',createdAt:now,transferMode:'simulated-onward-freight'};
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
  advanceWorldDelivery(ledger,data,now,{planFor:(shipment,options)=>directory.planFor(data,shipment,options)});
 }
 refreshFactoryOrders(ledger,data,now);
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
 constructor(database,{catalog=async()=>[],maps=async()=>[],rooms=async()=>({}),collision,routingWorker=false,routeWorkerPool,now=Date.now}={}){Object.assign(this,{database,catalog,maps,rooms,collision,now});this.deliveryRouteCache=new Map();this.pendingDeliveryPlans=new Map();this.routeWorker=routingWorker?(routeWorkerPool||new DeliveryRoutePool()):null;}
 async directory({walletId,mapId,includeCatalog=true}={}){
  const [items,maps,snapshot]=await Promise.all([includeCatalog?this.catalog():[],this.maps(),this.database.read()]);
  const available=maps.filter(map=>map.visibility!=='private'&&map.playable!==false),activeOrders=Object.values(snapshot.worldSupply?.orders||{}).filter(order=>!['cancelled','delivered'].includes(order.phase)),pendingShips=Object.values(snapshot.worldSupply?.shipments||{}).filter(shipment=>!['delivered','cancelled','port-held'].includes(shipment.phase)),deeds=Object.values(snapshot.landDeeds||{}).filter(deed=>deed.status==='active'&&(deed.ownerId===walletId||'plot-'+deed.id===mapId||activeOrders.some(order=>order.deedId===deed.id)||pendingShips.some(shipment=>shipment.destinationMapId==='plot-'+deed.id))),ids=new Set(deeds.map(deed=>'plot-'+deed.id)),rooms=await this.rooms([...ids]);
  const context=(data,shipment)=>{
   const deed=Object.values(data.landDeeds||{}).find(deed=>deed.id===shipment.deedId)||{id:shipment.deedId,status:'missing'},environment=available.find(map=>map.id===shipment.destinationMapId)||{id:shipment.destinationMapId},room=rooms?.[environment.id]||{},portId=shipment.destinationPortId,revision=deliveryMapRevision({deed,environment,room,portId});return {deed,environment,room,portId,revision};
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
     const input={...entry,now:this.now(),...options};
     const plan=this.routeWorker?await this.routeWorker.calculate(input):planDeedDelivery({...input,collision:typeof this.collision==='function'?this.collision():this.collision});return plan.retryable?plan:remember(key,plan);
    }catch(error){return {id:'deed-route:'+entry.deed.id+':'+entry.revision,deedId:entry.deed.id,mapId:entry.environment.id,revision:entry.revision,status:'blocked',reason:'Delivery route calculation is temporarily unavailable. '+error.message,dropoff:{id:'deed-entrance:'+entry.deed.id,mapId:entry.environment.id,name:'Deed entrance',kind:'plot-entrance',position:entry.environment.spawn||{x:0,y:0,z:0}},hub:null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,estimatedDurationMs:0,legs:[]};}
    finally{this.pendingDeliveryPlans.delete(key);}
   })();this.pendingDeliveryPlans.set(key,job);return job.then(plan=>{preparedPlans.set(key,plan);return plan;});
  };
  for(const deed of deeds){
   const order=activeOrders.find(order=>order.deedId===deed.id);await prepare({deedId:deed.id,destinationMapId:'plot-'+deed.id,destinationPortId:order&&routes.find(route=>route.id===order.contractId)?.to||routes[0]?.to});
   await new Promise(resolve=>setImmediate(resolve));
  }
  for(const shipment of pendingShips){
   const deed=deeds.find(deed=>'plot-'+deed.id===shipment.destinationMapId);if(!deed)continue;
   await prepare({...shipment,deedId:shipment.deedId||deed.id,destinationPortId:shipment.destinationPortId||routes.find(route=>route.id===shipment.contractId)?.to});await new Promise(resolve=>setImmediate(resolve));
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
  return {items,maps:available,rooms,walletId,mapId,planFor:(data,shipment,options={})=>{
   const entry=context(data,shipment),cached=this.deliveryRouteCache.get(keyFor(entry,options))||preparedPlans.get(keyFor(entry,options));if(cached)return cached;
   const base=this.deliveryRouteCache.get(keyFor(entry))||preparedPlans.get(keyFor(entry))||{};
   return {...base,id:'deed-route:'+entry.deed.id+':'+entry.revision,deedId:entry.deed.id,mapId:entry.environment.id,revision:entry.revision,status:'blocked',reason:'The deed or delivery route changed. Waiting for the next validated route update.',dropoff:base.dropoff||{id:'deed-entrance:'+entry.deed.id,mapId:entry.environment.id,name:'Deed entrance',kind:'plot-entrance',position:{x:0,y:0,z:0}},hub:base.hub||null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,estimatedDurationMs:0,legs:[]};
  }};
 }
 async state({mapId,walletId}={}){
  const directory=await this.directory({walletId,mapId}),now=this.now();
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   if(mapId&&mapId!=='world'&&!directory.maps.some(map=>map.id===mapId))fail('Choose an available map.',404);
   const catalog=nativeMarketCatalog(factoryLineupItems(data,directory.items,{walletId}),directory.maps).items.filter(item=>{try{factoryUnitPriceMzk(item);return true;}catch{return false;}});
   const activeIds=new Set(catalog.map(item=>item.supplyId));
   const transferCatalog=Object.values(ledger.catalog).filter(item=>!activeIds.has(item.supplyId)).map(item=>({...item,id:item.supplyId,factoryProducible:false,recipe:recipeSummary(item)}));
   const availableFactoryStock={...ledger.factoryStock};
   for(const lot of Object.values(ledger.factoryLots))if(lot.reservedOrderId)availableFactoryStock[lot.itemId]=Math.max(0,(availableFactoryStock[lot.itemId]||0)-lot.availableQuantity);
   return filterSupplyState({ownerId:walletId||null,deeds:walletId?ownedSupplyDeeds(data,walletId).map(deed=>({...deed,deliveryRoute:ledger.deliveryRoutes[deed.id]||null,deliveryDropoff:ledger.deliveryRoutes[deed.id]?.dropoff||null})):[],orders:Object.values(ledger.orders),deliveryTasks:Object.values(ledger.deliveryTasks).map(task=>deliveryTaskView(task,now)),deliveryRoutes:Object.values(ledger.deliveryRoutes),portReceipts:Object.values(ledger.portReceipts),dropoffReceipts:Object.values(ledger.dropoffReceipts),portEscrow:Object.values(ledger.portEscrow),serverTime:now,rules:WORLD_SUPPLY_RULES,mapId:mapId||'world',catalog:catalog.map(item=>({...item,id:item.supplyId,factoryProducible:true,factoryUnitPriceMzk:factoryUnitPriceMzk(item),recipe:recipeSummary(item)})),transferCatalog,worldStock:ledger.worldStock,factoryStock:ledger.factoryStock,availableFactoryStock,maps:[{id:'world',name:'World stock · central stores',stock:ledger.worldStock},...directory.maps.map(map=>({...ledger.maps[map.id],stores:(map.builderScene?.objects||[]).filter(object=>/shop|store|market/i.test(object.name||object.modelId||'')).map(object=>({id:object.id,name:object.name||object.modelId}))}))],production:Object.values(ledger.production),lots:Object.values(ledger.factoryLots),allocations:Object.values(ledger.factoryLotAllocations),stockReceipts:Object.values(ledger.factoryStockReceipts),shipments:Object.values(ledger.shipments),challenges:distributionChallenges(ledger,directory),routes,shippingMaps:directory.maps.filter(isShippingEnvironment).map(map=>({id:map.id,name:map.name}))},{walletId,data});
  });
 }
 async recipe(itemId,count=1,{walletId}={}){
  const directory=await this.directory({walletId});return this.database.transaction(data=>{ensureWorldSupply(data,directory);const item=factoryProductionItem(data,itemId,directory.items,{walletId});return {itemId:item.supplyId,...worldFactoryPlan(item,quantity(count),WORLD_SUPPLY_RULES)};});
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
  return {serverTime:state.serverTime,production,lots,allocations,shipments,stockReceipts,deliveryTasks:related(state.deliveryTasks),portReceipts:related(state.portReceipts),dropoffReceipts:related(state.dropoffReceipts),portEscrow:related(state.portEscrow),events:production.flatMap(job=>job.events||[]).sort((a,b)=>a.at-b.at)};
 }
 async projection({mapId}={}){
  const directory=await this.directory({mapId,includeCatalog:false}),now=this.now();
  if(!mapId||!directory.maps.some(map=>map.id===mapId))fail('Choose an available delivery map.',404);
  return this.database.transaction(data=>{const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);return projectWorldDeliveries(ledger,mapId,now);});
 }
 async action(walletId,operation,input={}){
  const wallet=cleanWallet(walletId),directory=await this.directory({walletId:wallet}),now=this.now();
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   const user=data.users[wallet];if(!user)fail('Sign in to operate the world factory.',401);
   if(operation==='quote')return quoteFor(factoryProductionItem(data,input.itemId,directory.items,{walletId:wallet}),input.quantity);
   const key=requestKey(wallet,operation,input),signature=JSON.stringify([input.itemId,input.quantity,input.destinationMapId,input.shippingMapId,input.contractId,input.productionId,input.shipmentId,input.expectedPriceMzk,input.sourceMapId,...(input.challengeId?[input.challengeId]:[]),...(input.deedId?[{deedId:input.deedId}]:[]),...(input.orderId?[{orderId:input.orderId}]:[]),...(input.customItemId?[{customItemId:input.customItemId}]:[])]);
   const prior=priorReceipt(ledger,key,signature);if(prior)return prior;
   let result;
   if(operation==='register-design'){
    const item=registerPrivateFactoryBlueprint(data,wallet,input.customItemId);result={itemId:item.supplyId,item};
   }else if(operation==='produce'||operation==='order'){
    const item=factoryProductionItem(data,input.itemId,directory.items,{walletId:wallet}),quote=quoteFor(item,input.quantity),target=operation==='order'?orderDestination(data,wallet,{...input,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:input.contractId||'gulf-gateway'},directory,routes):null;
    if(input.expectedPriceMzk!==undefined&&input.expectedPriceMzk!==quote.priceMzk)fail('The factory quote changed. Review the current cost.');
    if(Number(user.tokens.MZK||0)<quote.priceMzk)fail('Not enough MZK for this production batch.');
    if(Object.values(ledger.production).filter(job=>job.ownerId===wallet&&['building','paused'].includes(job.phase)).length>=20)fail('Finish an existing production batch before starting another.');
    user.tokens.MZK-=quote.priceMzk;
    result=createFactoryProduction(quote,{id:randomUUID(),ownerId:wallet,now});ledger.production[result.id]=result;
    if(target){
     const job=result,order={id:randomUUID(),deliverySchemaVersion:1,ownerId:wallet,deedId:target.deed.id,deedName:target.deed.name,destinationMapId:target.destinationMapId,productionId:job.id,itemId:item.supplyId,itemName:item.name,quantity:quote.quantity,priceMzk:quote.priceMzk,shippingMapId:input.shippingMapId||SHIPPING_ID,contractId:target.route.id,shipmentIds:[],deliveredQuantity:0,phase:'building',createdAt:now,updatedAt:now};
     job.orderId=order.id;ledger.orders[order.id]=order;result=order;
    }
    const fundedJob=target?ledger.production[result.productionId]:result;
    data.transactions.push({id:'factory:'+fundedJob.id,type:'WORLD_FACTORY_PRODUCTION',walletId:wallet,requestId:input.requestId,amountMzk:-quote.priceMzk,balanceAfterMzk:user.tokens.MZK,itemId:item.supplyId,quantity:quote.quantity,...(target?{orderId:result.id,deedId:result.deedId}:{}),createdAt:new Date(now).toISOString()});
   }else if(operation==='pause'||operation==='resume'){
    const job=own(ledger.production,input.productionId)&&ledger.production[input.productionId];
    if(!job||job.ownerId!==wallet)fail('This production batch is not yours.',403);
    result=operation==='pause'?pauseFactoryProduction(job,now):resumeFactoryProduction(job,now);
   }else if(operation==='dispatch'){
    const item=supplyItem(data,input.itemId),count=quantity(input.quantity),destinationMapId=input.destinationMapId,sourceMapId=input.sourceMapId||'factory',shippingMapId=input.shippingMapId||SHIPPING_ID,contractId=input.contractId||'gulf-gateway',route=routes.find(route=>route.id===contractId);
    if(!route)fail('Choose a shipping lane with a destination port.',422);
    if(!supplyItemVisibleTo(data,item.supplyId,wallet))fail('This factory blueprint belongs to another member.',403);
    const recipe=worldFactoryRecipe(item),containerSlots=route.units||4,maxShipmentQuantity=containerSlots*recipe.unitsPerContainer;
    if(count>maxShipmentQuantity)fail('This manifest carries up to '+maxShipmentQuantity+' '+item.name+' units ('+recipe.unitsPerContainer+' per container). Split the batch or choose a larger manifest.',422);
    const packing={recipeId:recipe.id,unitsPerContainer:recipe.unitsPerContainer,containersRequired:Math.ceil(count/recipe.unitsPerContainer),containerSlots,maxShipmentQuantity,sealed:true};
    if(destinationMapId!=='world'&&!directory.maps.some(map=>map.id===destinationMapId))fail('Choose an available destination map.',404);
    if(!directory.maps.some(map=>map.id===shippingMapId&&isShippingEnvironment(map)))fail('Choose an available shipping map.',404);
    if(sourceMapId!=='factory'&&sourceMapId!=='world'&&!directory.maps.some(map=>map.id===sourceMapId))fail('Choose an available source inventory.',404);
    if(sourceMapId===destinationMapId)fail('Choose a different destination inventory for this transfer.',422);
    const challenge=distributionChallengeForDispatch(ledger,directory,input,item);
    const sourceStock=sourceMapId==='factory'?ledger.factoryStock:sourceMapId==='world'?ledger.worldStock:ledger.maps[sourceMapId].stock;
    if((sourceStock[item.supplyId]||0)<count)fail(sourceMapId==='factory'?'Complete enough factory production before dispatching this item.':'The source warehouse has insufficient stock for this transfer.');
    if(sourceMapId!=='factory')sourceStock[item.supplyId]-=count;
    result=createShipment({id:randomUUID(),ownerId:wallet,itemId:item.supplyId,itemName:item.name,quantity:count,packing,sourceMapId,destinationMapId,shippingMapId,contractId,...(challenge?{challenge}:{})},route,now);ledger.shipments[result.id]=result;allocateFactoryLots(ledger,result,{now});
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
   adoptDeedDeliveries(ledger,data);refreshFactoryOrders(ledger,data,now);
   user.updatedAt=new Date(now).toISOString();user.revision=Number(user.revision||0)+1;
   // Snapshot receipts: later state changes cannot change a replay response.
   return saveReceipt(ledger,key,signature,JSON.parse(JSON.stringify(result)));
  });
 }
 async shippingAction(identity,sim,player,environment,command,now=this.now()){
  if(!isShippingEnvironment(environment))fail('Enter a shipping map to carry factory goods.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now,data,directory);
   const shipment=own(ledger.shipments,command.shipmentId)&&ledger.shipments[command.shipmentId];if(!shipment)fail('This factory shipment is unavailable.',404);
   if(shipment.shippingMapId!==environment.id)fail('Enter the assigned shipping map to collect this manifest.');
   if(command.operation==='reserve'){
    if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('Only the current design owner can captain this private factory freight.',403);
    assertOrderFreightAvailable(ledger,data,shipment);
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
 async deliver(identity,result,environment,now=this.now()){
  if(!isShippingEnvironment(environment)||result.type!=='delivery')fail('A verified sea delivery is required.',422);
  const wallet=cleanWallet(identity.walletId),directory=await this.directory({walletId:wallet});
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data);adoptDeedDeliveries(ledger,data);const shipment=own(ledger.shipments,result.shipmentId)&&ledger.shipments[result.shipmentId];
   if(!shipment||shipment.captainId!==wallet||shipment.jobId!==result.jobId||result.deliveryId!==result.jobId||shipment.shippingMapId!==environment.id||shipment.contractId!==result.contractId)fail('This sea delivery does not match the reserved factory manifest.',422);
   if(shipment.phase==='delivered'||shipment.seaReceipt)return shipment;
   assertOrderFreightAvailable(ledger,data,shipment);
   if(!supplyItemVisibleTo(data,shipment.itemId,wallet))fail('This private design is no longer authorized for this captain.',403);
   if(shipment.phase!=='reserved'||now>=shipment.leaseUntil)fail('The factory shipment reservation expired.');
   const route=routes.find(route=>route.id===shipment.contractId);
   const validTimes=[result.startedAt,result.departedAt,result.deliveredAt].every(time=>Number.isSafeInteger(time)&&time>=0),minimumHandlingMs=SHIPPING_RULES.loadingSeconds*((route?.units||4)*2-2)*1000;
   if(!route||result.units!==(route.units||4)||result.cargoId!==route.cargoId||!Number.isInteger(result.quality)||result.quality<40||result.quality>100||!validTimes||result.deliveredAt>now||result.departedAt<result.startedAt||result.deliveredAt<result.departedAt||result.deliveredAt-result.startedAt<minimumHandlingMs||result.deliveredAt-result.startedAt>SHIPPING_RULES.contractLimitMs)fail('Invalid factory sea passage.',422);
   if(shipment.deliverySchemaVersion&&shipment.deedId){
    ensureFactoryLineage(ledger,{now});receiveDeedShipment(ledger,shipment,result,now);updatePortTransfer(shipment,'delivered',now);
    advance(ledger,now,data,directory);return shipment;
   }
   const stock=shipment.destinationMapId==='world'?ledger.worldStock:ledger.maps[shipment.destinationMapId]?.stock;if(!stock)fail('The destination inventory is unavailable.');
   stock[shipment.itemId]=(stock[shipment.itemId]||0)+shipment.quantity;
   if(!Number.isSafeInteger(stock[shipment.itemId]))fail('The destination inventory is at capacity.');
   Object.assign(shipment,{phase:'delivered',deliveredAt:now,deliveryId:result.deliveryId,transferTask:{id:'transfer:'+shipment.id,phase:'delivered',fromPortId:route.to,destinationMapId:shipment.destinationMapId,mode:'simulated-onward-freight',quantity:shipment.quantity}});
   updatePortTransfer(shipment,'delivered',now);
   ensureFactoryLineage(ledger,{now});deliverFactoryLots(ledger,shipment,{now});ledger.factoryStockReceipts[shipment.id]={id:'stock:'+shipment.id,shipmentId:shipment.id,deliveryId:result.deliveryId,itemId:shipment.itemId,quantity:shipment.quantity,destinationMapId:shipment.destinationMapId,receivedAt:now,lotAllocations:ledger.factoryLotAllocations[shipment.id]?.lots||[],quality:result.quality,...(shipment.orderId?{orderId:shipment.orderId,deedId:shipment.deedId,productionId:shipment.productionId}:{})};
   if(shipment.challenge)shipment.challengeResult=distributionChallengeResult(shipment,result,now);
   refreshFactoryOrders(ledger,data,now);
   return shipment;
  });
 }
}
