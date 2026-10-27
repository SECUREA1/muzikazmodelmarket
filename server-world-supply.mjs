import {randomUUID} from 'node:crypto';
import {nativeMarketCatalog} from './native-market-catalog.mjs';
import {worldFactoryRecipe,worldFactoryPlan} from './public/js/world-factory-recipes.js';
import {cleanWallet} from './user-json-database.mjs';
import {ensureWorldSupply,supplyItem} from './world-supply.mjs';
import {SHIPPING_ID,SHIPPING_ROUTES,SHIPPING_RULES,isShippingEnvironment} from './public/js/shipping-config.js';

export const WORLD_SUPPLY_RULES=Object.freeze({initialStock:1000,bulkMinimum:10,bulkDiscountPercent:20,maxQuantity:10000,minimumBuildMs:3000,maximumBuildMs:120000,itemsPerContainer:1000});
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const own=(object,key)=>Object.hasOwn(object,key);
const activePhases=new Set(['loading','secured','sailing','unloading']);
const routes=SHIPPING_ROUTES.filter(route=>route.from!==route.to&&!route.factoryExport);
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>WORLD_SUPPLY_RULES.maxQuantity)fail('Choose 1 to 10,000 whole items.',422);return value;}
function quoteFor(item,count){
 const amount=quantity(count),rawPrice=Number(item.priceMzk??Number(item.priceUsd??item.price)*100),unitPriceMzk=Math.max(1,Math.round(rawPrice||1)),subtotalMzk=unitPriceMzk*amount,discountPercent=amount>=WORLD_SUPPLY_RULES.bulkMinimum?WORLD_SUPPLY_RULES.bulkDiscountPercent:0;
 if(!Number.isSafeInteger(subtotalMzk))fail('The catalog price cannot be used for this production batch.',422);
 return {itemId:item.supplyId,quantity:amount,unitPriceMzk,subtotalMzk,discountPercent,priceMzk:Math.max(1,Math.floor(subtotalMzk*(100-discountPercent)/100)),...worldFactoryPlan(item,amount,WORLD_SUPPLY_RULES)};
}
function advance(ledger,now){
 for(const job of Object.values(ledger.production))if(job.phase==='building'){
  if(job.schemaVersion>=2&&Array.isArray(job.stages)&&job.stages.length){
   for(const stage of job.stages)stage.phase=now>=stage.readyAt?'complete':now>=stage.startedAt?'processing':'waiting';
   const pending=job.stages.findIndex(stage=>stage.phase!=='complete');
   job.stageIndex=pending<0?job.stages.length-1:pending;
   const stage=job.stages[job.stageIndex];
   Object.assign(job,{stageId:stage.id,stageName:stage.name,stageReadyAt:stage.readyAt,progress:Math.max(0,Math.min(100,Math.floor((now-job.startedAt)/(job.readyAt-job.startedAt)*100)))});
   if(pending>=0)continue;
  }
  if(now<job.readyAt)continue;
  ledger.factoryStock[job.itemId]=(ledger.factoryStock[job.itemId]||0)+job.quantity;
  Object.assign(job,{phase:'ready',completedAt:job.readyAt,progress:100,shippingRequired:true});
 }
 for(const shipment of Object.values(ledger.shipments))if(shipment.phase==='reserved'&&now>=shipment.leaseUntil){
  shipment.releasedReservations ||= {};shipment.releasedReservations[shipment.captainId+':'+(shipment.jobId||'')]=true;
  shipment.phase='queued';delete shipment.jobId;delete shipment.captainId;delete shipment.leaseUntil;
 }
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
 constructor(database,{catalog=async()=>[],maps=async()=>[],now=Date.now}={}){Object.assign(this,{database,catalog,maps,now});}
 async directory(){
  const [items,maps]=await Promise.all([this.catalog(),this.maps()]);
  return {items,maps:maps.filter(map=>map.visibility!=='private'&&map.playable!==false)};
 }
 async state({mapId}={}){
  const directory=await this.directory(),now=this.now();
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now);
   if(mapId&&mapId!=='world'&&!directory.maps.some(map=>map.id===mapId))fail('Choose an available map.',404);
   const catalog=nativeMarketCatalog(Object.values(ledger.catalog),directory.maps).items;
   return {serverTime:now,rules:WORLD_SUPPLY_RULES,mapId:mapId||'world',catalog:catalog.map(item=>({...item,id:item.supplyId,recipe:worldFactoryRecipe(item)})),worldStock:ledger.worldStock,factoryStock:ledger.factoryStock,maps:[{id:'world',name:'World stock · central stores',stock:ledger.worldStock},...directory.maps.map(map=>({...ledger.maps[map.id],stores:(map.builderScene?.objects||[]).filter(object=>/shop|store|market/i.test(object.name||object.modelId||'')).map(object=>({id:object.id,name:object.name||object.modelId}))}))],production:Object.values(ledger.production),shipments:Object.values(ledger.shipments),routes,shippingMaps:directory.maps.filter(isShippingEnvironment).map(map=>({id:map.id,name:map.name}))};
  });
 }
 async action(walletId,operation,input={}){
  const wallet=cleanWallet(walletId),directory=await this.directory(),now=this.now();
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data,directory);advance(ledger,now);
   const user=data.users[wallet];if(!user)fail('Sign in to operate the world factory.',401);
   if(operation==='quote')return quoteFor(supplyItem(data,input.itemId),input.quantity);
   const key=requestKey(wallet,operation,input),signature=JSON.stringify([input.itemId,input.quantity,input.destinationMapId,input.shippingMapId,input.contractId,input.productionId,input.shipmentId,input.expectedPriceMzk,input.sourceMapId]);
   const prior=priorReceipt(ledger,key,signature);if(prior)return prior;
   let result;
   if(operation==='produce'){
    const item=supplyItem(data,input.itemId),quote=quoteFor(item,input.quantity);
    if(input.expectedPriceMzk!==undefined&&input.expectedPriceMzk!==quote.priceMzk)fail('The factory quote changed. Review the current cost.');
    if(Number(user.tokens.MZK||0)<quote.priceMzk)fail('Not enough MZK for this production batch.');
    if(Object.values(ledger.production).filter(job=>job.ownerId===wallet&&job.phase==='building').length>=20)fail('Finish an existing production batch before starting another.');
    user.tokens.MZK-=quote.priceMzk;
    result={id:randomUUID(),schemaVersion:2,ownerId:wallet,...quote,stages:quote.stages.map((stage,index)=>({...stage,startedAt:now+stage.startedOffsetMs,readyAt:now+stage.startedOffsetMs+stage.durationMs,phase:index===0?'processing':'waiting'})),phase:'building',startedAt:now,readyAt:now+quote.buildMs,stageIndex:0,stageId:quote.stages[0].id,stageName:quote.stages[0].name,stageReadyAt:now+quote.stages[0].durationMs,progress:0,shippingRequired:true};ledger.production[result.id]=result;
    data.transactions.push({id:'factory:'+result.id,type:'WORLD_FACTORY_PRODUCTION',walletId:wallet,requestId:input.requestId,amountMzk:-quote.priceMzk,balanceAfterMzk:user.tokens.MZK,itemId:item.supplyId,quantity:quote.quantity,createdAt:new Date(now).toISOString()});
   }else if(operation==='dispatch'){
    const item=supplyItem(data,input.itemId),count=quantity(input.quantity),destinationMapId=input.destinationMapId,sourceMapId=input.sourceMapId||'factory',shippingMapId=input.shippingMapId||SHIPPING_ID,contractId=input.contractId||'gulf-gateway',route=routes.find(route=>route.id===contractId);
    if(!route)fail('Choose a shipping lane with a destination port.',422);
    const recipe=worldFactoryRecipe(item),containerSlots=route.units||4,maxShipmentQuantity=containerSlots*recipe.unitsPerContainer;
    if(count>maxShipmentQuantity)fail('This manifest carries up to '+maxShipmentQuantity+' '+item.name+' units ('+recipe.unitsPerContainer+' per container). Split the batch or choose a larger manifest.',422);
    const packing={recipeId:recipe.id,unitsPerContainer:recipe.unitsPerContainer,containersRequired:Math.ceil(count/recipe.unitsPerContainer),containerSlots,maxShipmentQuantity,sealed:true};
    if(destinationMapId!=='world'&&!directory.maps.some(map=>map.id===destinationMapId))fail('Choose an available destination map.',404);
    if(!directory.maps.some(map=>map.id===shippingMapId&&isShippingEnvironment(map)))fail('Choose an available shipping map.',404);
    if(sourceMapId!=='factory'&&sourceMapId!=='world'&&!directory.maps.some(map=>map.id===sourceMapId))fail('Choose an available source inventory.',404);
    if(sourceMapId===destinationMapId)fail('Choose a different destination inventory for this transfer.',422);
    const sourceStock=sourceMapId==='factory'?ledger.factoryStock:sourceMapId==='world'?ledger.worldStock:ledger.maps[sourceMapId].stock;
    if((sourceStock[item.supplyId]||0)<count)fail(sourceMapId==='factory'?'Complete enough factory production before dispatching this item.':'The source warehouse has insufficient stock for this transfer.');
    sourceStock[item.supplyId]-=count;
    result={id:randomUUID(),ownerId:wallet,itemId:item.supplyId,itemName:item.name,quantity:count,packing,phase:'queued',sourceMapId,destinationMapId,shippingMapId,contractId,createdAt:now,transferMode:'simulated-onward-freight'};result.transferTask={id:'transfer:'+result.id,phase:'awaiting-sea-delivery',fromPortId:route.to,destinationMapId,mode:'simulated-onward-freight',quantity:count};ledger.shipments[result.id]=result;
   }else if(operation==='cancel'){
    if(input.productionId){
     const job=own(ledger.production,input.productionId)&&ledger.production[input.productionId];if(!job||job.ownerId!==wallet)fail('This production batch is not yours.',403);
     if(job.phase!=='building')fail('Only a batch still being built can be cancelled.');
     job.phase='cancelled';job.cancelledAt=now;user.tokens.MZK+=job.priceMzk;
     data.transactions.push({id:'factory-refund:'+job.id,type:'WORLD_FACTORY_REFUND',walletId:wallet,requestId:input.requestId,amountMzk:job.priceMzk,balanceAfterMzk:user.tokens.MZK,createdAt:new Date(now).toISOString()});result=job;
    }else{
     const shipment=own(ledger.shipments,input.shipmentId)&&ledger.shipments[input.shipmentId];if(!shipment||shipment.ownerId!==wallet)fail('This shipment is not yours.',403);
     if(shipment.phase!=='queued')fail('Only an unassigned shipment can be cancelled. Cancel the sea job or wait for its reservation to expire.');
     shipment.phase='cancelled';shipment.cancelledAt=now;if(shipment.transferTask)shipment.transferTask.phase='cancelled';
     const sourceStock=!shipment.sourceMapId||shipment.sourceMapId==='factory'?ledger.factoryStock:shipment.sourceMapId==='world'?ledger.worldStock:ledger.maps[shipment.sourceMapId]?.stock;
     if(!sourceStock)fail('The source warehouse is unavailable.');sourceStock[shipment.itemId]=(sourceStock[shipment.itemId]||0)+shipment.quantity;result=shipment;
    }
   }else fail('Choose a listed world supply action.',422);
   user.updatedAt=new Date(now).toISOString();user.revision=Number(user.revision||0)+1;
   // Snapshot receipts: later state changes cannot change a replay response.
   return saveReceipt(ledger,key,signature,JSON.parse(JSON.stringify(result)));
  });
 }
 async shippingAction(identity,sim,player,environment,command,now=this.now()){
  if(!isShippingEnvironment(environment))fail('Enter a shipping map to carry factory goods.',422);
  const wallet=cleanWallet(identity.walletId);
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data);advance(ledger,now);
   const shipment=own(ledger.shipments,command.shipmentId)&&ledger.shipments[command.shipmentId];if(!shipment)fail('This factory shipment is unavailable.',404);
   if(shipment.shippingMapId!==environment.id)fail('Enter the assigned shipping map to collect this manifest.');
   if(command.operation==='reserve'){
    if(activePhases.has(player.shipping?.job?.phase))fail('Finish or cancel your current manifest first.');
    if(shipment.phase!=='queued')fail('Another captain has reserved this shipment or it has already finished.');
    if(command.contractId!==shipment.contractId)fail('Choose the shipping route assigned to these factory goods.',422);
    shipment.phase='reserved';shipment.captainId=wallet;shipment.leaseUntil=now+SHIPPING_RULES.contractLimitMs+60000;
    return {shipmentId:shipment.id,supplyManifest:[{itemId:shipment.itemId,name:shipment.itemName,quantity:shipment.quantity}],destinationMapId:shipment.destinationMapId,packing:shipment.packing};
   }
   if(command.operation==='release'&&(shipment.releasedReservations?.[wallet+':'+(command.jobId||'')]||shipment.phase==='delivered'&&shipment.captainId===wallet&&shipment.jobId===command.jobId))return {shipmentId:shipment.id};
   if(shipment.phase!=='reserved'||shipment.captainId!==wallet)fail('This shipment reservation belongs to another voyage.');
   if(command.operation==='bind'){
    const job=player.shipping?.job;
    if(!job||job.id!==command.jobId||job.contractId!==shipment.contractId||job.environmentId!==environment.id||job.phase!=='loading'||!Number.isSafeInteger(job.deadline)||job.deadline<=now||job.deadline>now+SHIPPING_RULES.contractLimitMs)fail('A verified loading job is required to bind factory freight.');
    if(shipment.jobId&&shipment.jobId!==job.id)fail('This shipment is already bound to another voyage.');
    shipment.jobId=job.id;shipment.leaseUntil=job.deadline+60000;return {shipmentId:shipment.id};
   }
   if(command.operation==='release'){
    if(shipment.jobId&&shipment.jobId!==command.jobId)fail('This shipment is bound to another voyage.');
    shipment.releasedReservations ||= {};shipment.releasedReservations[wallet+':'+(command.jobId||'')]=true;
    shipment.phase='queued';delete shipment.jobId;delete shipment.captainId;delete shipment.leaseUntil;return {shipmentId:shipment.id};
   }
   fail('Choose a listed factory freight operation.',422);
  });
 }
 async deliver(identity,result,environment,now=this.now()){
  if(!isShippingEnvironment(environment)||result.type!=='delivery')fail('A verified sea delivery is required.',422);
  const wallet=cleanWallet(identity.walletId);
  return this.database.transaction(data=>{
   const ledger=ensureWorldSupply(data),shipment=own(ledger.shipments,result.shipmentId)&&ledger.shipments[result.shipmentId];
   if(!shipment||shipment.captainId!==wallet||shipment.jobId!==result.jobId||result.deliveryId!==result.jobId||shipment.shippingMapId!==environment.id||shipment.contractId!==result.contractId)fail('This sea delivery does not match the reserved factory manifest.',422);
   if(shipment.phase==='delivered')return shipment;
   if(shipment.phase!=='reserved'||now>=shipment.leaseUntil)fail('The factory shipment reservation expired.');
   const route=routes.find(route=>route.id===shipment.contractId);
   const validTimes=[result.startedAt,result.departedAt,result.deliveredAt].every(time=>Number.isSafeInteger(time)&&time>=0),minimumHandlingMs=SHIPPING_RULES.loadingSeconds*((route?.units||4)*2-2)*1000;
   if(!route||result.units!==(route.units||4)||result.cargoId!==route.cargoId||!Number.isInteger(result.quality)||result.quality<40||result.quality>100||!validTimes||result.deliveredAt>now||result.departedAt<result.startedAt||result.deliveredAt<result.departedAt||result.deliveredAt-result.startedAt<minimumHandlingMs||result.deliveredAt-result.startedAt>SHIPPING_RULES.contractLimitMs)fail('Invalid factory sea passage.',422);
   const stock=shipment.destinationMapId==='world'?ledger.worldStock:ledger.maps[shipment.destinationMapId]?.stock;if(!stock)fail('The destination inventory is unavailable.');
   stock[shipment.itemId]=(stock[shipment.itemId]||0)+shipment.quantity;
   Object.assign(shipment,{phase:'delivered',deliveredAt:now,deliveryId:result.deliveryId,transferTask:{id:'transfer:'+shipment.id,phase:'delivered',fromPortId:route.to,destinationMapId:shipment.destinationMapId,mode:'simulated-onward-freight',quantity:shipment.quantity}});
   return shipment;
  });
 }
}
