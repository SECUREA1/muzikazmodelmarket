import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {plotSpaceId} from '../member-plots.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';

const OWNER='deed-order-owner',OTHER='deed-order-other',ITEM='tool:scanner';
const deed={id:'deed-order-home',worldId:'order-home',name:'Order Home',ownerId:OWNER,status:'active',hostedSpace:{environmentId:'public-commons'}};
const maps=[{id:'hormuz-shipping',name:'Hormuz Shipping',visibility:'public'},{id:'city-market',name:'City Market'}, {id:plotSpaceId(deed),name:'Order Home plot',memberPlot:true,deedId:deed.id}];
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'world-factory-orders-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put(OWNER,{tokens:{MZK:1000000},items:[{id:deed.id,type:'land-deed',worldId:deed.worldId,name:deed.name}]});
 await db.put(OTHER,{tokens:{MZK:1000000},items:[]});
 await db.transaction(data=>{data.landDeeds[deed.worldId]={...deed};return {};});
 let clock=1000000;
 const options={maps:async()=>maps,now:()=>clock},service=new WorldSupplyService(db,options);
 const f={db,service,options,get now(){return clock;},set now(value){clock=value;}};
 f.order=(input={},wallet=OWNER)=>service.action(wallet,'order',{deedId:deed.id,itemId:ITEM,quantity:10,shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'order-home-supplies',...input});
 f.ready=async(input={})=>{const order=await f.order(input),state=await service.state();f.now=state.production.find(job=>job.id===order.productionId).readyAt;return {order,state:await service.state()};};
 return f;
}
const snapshot=async f=>JSON.stringify(await f.db.read());
const orderOf=(state,id)=>state.orders.find(row=>row.id===id);
const plotStock=state=>state.maps.find(map=>map.id===plotSpaceId(deed)).stock;
async function voyage(f,shipment,id='deed-sea-voyage'){
 const environment=maps[0],identity={walletId:OTHER},player={shipping:{}};
 await f.service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 const startedAt=f.now;
 player.shipping.job={id,phase:'loading',contractId:shipment.contractId,environmentId:environment.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:id});
 const route=SHIPPING_ROUTES.find(route=>route.id===shipment.contractId);
 return {environment,identity,player,result:{type:'delivery',shipmentId:shipment.id,jobId:id,deliveryId:id,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000}};
}

test('deed factory orders verify current entitlement, destination and sea lane before charging',async t=>{
 const f=await fixture(t);
 for(const input of [{deedId:'missing-deed'},{destinationMapId:'city-market'},{shippingMapId:'city-market'},{contractId:'dock-induction'},{quantity:0},{quantity:1.5},{quantity:10001}]){
  const before=await snapshot(f);await assert.rejects(f.order({...input,requestId:'invalid-'+JSON.stringify(input)}));assert.equal(await snapshot(f),before);
 }
 await assert.rejects(f.order({},OTHER),{statusCode:403});
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].status='revoked';return {};});
 const inactive=await snapshot(f);await assert.rejects(f.order());assert.equal(await snapshot(f),inactive);
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].status='active';data.users[OWNER].items=[];return {};});
 const missingItem=await snapshot(f);await assert.rejects(f.order(),{statusCode:403});assert.equal(await snapshot(f),missingItem);
});

test('an accepted deed order charges once, locks four manufacturing stages and replays its original response',async t=>{
 const f=await fixture(t),quote=await f.service.action(OWNER,'quote',{itemId:ITEM,quantity:10});
 const before=await snapshot(f);await assert.rejects(f.order({expectedPriceMzk:quote.priceMzk+1}),/quote changed/);assert.equal(await snapshot(f),before);
 const first=await f.order({expectedPriceMzk:quote.priceMzk});
 assert.equal(first.deedId,deed.id);assert.equal(first.ownerId,OWNER);assert.equal(first.destinationMapId,plotSpaceId(deed));assert.equal(first.itemId,ITEM);assert.equal(first.phase,'building');assert.deepEqual(first.shipmentIds,[]);
 assert.deepEqual(await f.order({expectedPriceMzk:quote.priceMzk}),first);
 let state=await f.service.state();const job=state.production.find(row=>row.id===first.productionId);
 assert.equal(job.orderId,first.id);assert.equal(job.stages.length,4);assert.equal(job.stages.flatMap(stage=>stage.operations).length,12);assert.equal(job.blueprint.itemId,ITEM);
 assert.equal((await f.db.get(OWNER)).tokens.MZK,1000000-quote.priceMzk);
 await assert.rejects(f.order({expectedPriceMzk:quote.priceMzk,quantity:11}),/different operation/);
 f.now=job.readyAt;state=await f.service.state();assert.equal(orderOf(state,first.id).phase,'awaiting-shipping');
 assert.deepEqual(await f.order({expectedPriceMzk:quote.priceMzk}),first,'receipt is an immutable acceptance snapshot');
 assert.equal((await f.db.read()).transactions.filter(row=>row.type==='WORLD_FACTORY_PRODUCTION').length,1);
});

test('ready deed batches split within route capacity and reserve their exact lot across restart',async t=>{
 const f=await fixture(t),ordinary=await f.service.action(OTHER,'produce',{itemId:ITEM,quantity:7,requestId:'older-shared-output'});
 f.now=ordinary.readyAt;await f.service.state();
 const quote=await f.service.action(OWNER,'quote',{itemId:ITEM,quantity:1}),route=SHIPPING_ROUTES.find(route=>route.id==='gulf-gateway'),capacity=(route.units||4)*quote.recipe.unitsPerContainer;
 assert.ok(capacity<10000,'fixture item allows a split within maximum quantity');
 const {order,state}=await f.ready({quantity:capacity+1}),current=orderOf(state,order.id),shipments=state.shipments.filter(row=>row.orderId===order.id);
 assert.equal(shipments.length,2);assert.deepEqual(shipments.map(row=>row.quantity).sort((a,b)=>b-a),[capacity,1]);assert.equal(shipments.reduce((sum,row)=>sum+row.quantity,0),order.quantity);
 assert.deepEqual(new Set(current.shipmentIds),new Set(shipments.map(row=>row.id)));assert.equal(current.deliveredQuantity,0);assert.equal(plotStock(state)[ITEM],undefined);assert.equal(state.worldStock[ITEM],1000);
 assert.equal(state.factoryStock[ITEM],7,'previous shared output is untouched');
 for(const shipment of shipments){
  assert.equal(shipment.destinationMapId,plotSpaceId(deed));assert.equal(shipment.sourceMapId,'factory');assert.equal(shipment.phase,'queued');assert.equal(shipment.packing.sealed,true);assert.ok(shipment.quantity<=shipment.packing.maxShipmentQuantity);
  const allocation=state.allocations.find(row=>row.shipmentId===shipment.id);assert.deepEqual(allocation.lots,[{lotId:'production:'+order.productionId,quantity:shipment.quantity}]);
 }
 const reopened=new WorldSupplyService(new UserJsonDatabase(f.db.file),f.options),again=await reopened.state();
 assert.deepEqual(again.shipments,state.shipments);assert.deepEqual(orderOf(again,order.id),current);assert.equal(again.factoryStock[ITEM],7);
});

test('only verified complete sea delivery fulfills the deed order and credits its plot once',async t=>{
 const f=await fixture(t),{order,state}=await f.ready(),shipment=state.shipments.find(row=>row.orderId===order.id),v=await voyage(f,shipment);
 let current=await f.service.state();assert.equal(orderOf(current,order.id).phase,'in-transit');assert.equal(plotStock(current)[ITEM],undefined);
 const before=await snapshot(f);await assert.rejects(f.service.deliver(v.identity,{...v.result,quality:0},v.environment));assert.equal(await snapshot(f),before);
 f.now=v.result.deliveredAt;
 const delivered=await f.service.deliver(v.identity,v.result,v.environment);assert.equal(delivered.phase,'delivered');assert.deepEqual(await f.service.deliver(v.identity,v.result,v.environment),delivered);
 current=await f.service.state();const finished=orderOf(current,order.id);assert.equal(finished.phase,'delivered');assert.equal(finished.deliveredQuantity,10);assert.equal(plotStock(current)[ITEM],10);assert.equal(current.stockReceipts.filter(row=>row.shipmentId===shipment.id).length,1);assert.equal(current.worldStock[ITEM],1000);
 await assert.rejects(f.service.action(OWNER,'cancel',{orderId:order.id,requestId:'cancel-delivered-order'}));assert.equal(plotStock(await f.service.state())[ITEM],10);
});

test('deed order cancellation refunds unfinished production once and releases packed queued cargo without refund',async t=>{
 const f=await fixture(t),order=await f.order();
 await assert.rejects(f.service.action(OTHER,'cancel',{orderId:order.id,requestId:'foreign-cancellation'}),{statusCode:403});
 const input={orderId:order.id,requestId:'cancel-building-order'},cancelled=await f.service.action(OWNER,'cancel',input);
 assert.equal(cancelled.phase,'cancelled');assert.deepEqual(await f.service.action(OWNER,'cancel',input),cancelled);assert.equal((await f.db.get(OWNER)).tokens.MZK,1000000);
 await assert.rejects(f.service.action(OWNER,'cancel',{...input,requestId:'cancel-building-again'}));
 let state=await f.service.state();f.now=state.production.find(row=>row.id===order.productionId).readyAt+1;state=await f.service.state();assert.equal(state.factoryStock[ITEM]||0,0);assert.equal(state.shipments.length,0);
 const ready=await f.ready({requestId:'packed-order'}),paid=(await f.db.get(OWNER)).tokens.MZK;
 await f.service.action(OWNER,'cancel',{orderId:ready.order.id,requestId:'cancel-packed-order'});
 state=await f.service.state();assert.equal(orderOf(state,ready.order.id).phase,'cancelled');assert.equal(state.shipments.filter(row=>row.orderId===ready.order.id&&row.phase==='cancelled').length,ready.state.shipments.length);assert.equal(state.factoryStock[ITEM],10);assert.equal((await f.db.get(OWNER)).tokens.MZK,paid);assert.equal(plotStock(state)[ITEM],undefined);
 assert.equal((await f.db.read()).transactions.filter(row=>row.type==='WORLD_FACTORY_REFUND').length,1);
});

test('assigned voyages prevent order cancellation until sea reservation is released',async t=>{
 const f=await fixture(t),{order,state}=await f.ready(),shipment=state.shipments.find(row=>row.orderId===order.id),v=await voyage(f,shipment);
 const before=await snapshot(f);await assert.rejects(f.service.action(OWNER,'cancel',{orderId:order.id,requestId:'cancel-assigned'}));assert.equal(await snapshot(f),before);
 await f.service.shippingAction(v.identity,{},v.player,v.environment,{operation:'release',shipmentId:shipment.id,jobId:v.result.jobId});
 const result=await f.service.action(OWNER,'cancel',{orderId:order.id,requestId:'cancel-released'});assert.equal(result.phase,'cancelled');assert.equal((await f.service.state()).factoryStock[ITEM],10);
});

test('existing production cancellation also stops its linked deed fulfillment',async t=>{
 const f=await fixture(t),order=await f.order(),state=await f.service.state(),job=state.production.find(row=>row.id===order.productionId);
 await f.service.action(OWNER,'cancel',{productionId:job.id,requestId:'cancel-linked-production'});
 f.now=job.readyAt+1;const next=await f.service.state();assert.equal(orderOf(next,order.id).phase,'cancelled');assert.equal(next.production.find(row=>row.id===job.id).phase,'cancelled');assert.equal(next.shipments.length,0);assert.equal(next.factoryStock[ITEM]||0,0);assert.equal((await f.db.get(OWNER)).tokens.MZK,1000000);
});

test('a deed transferred during production holds exact output until its original buyer releases it',async t=>{
 const f=await fixture(t),order=await f.order(),production=(await f.service.state()).production.find(row=>row.id===order.productionId),paid=(await f.db.get(OWNER)).tokens.MZK;
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].ownerId=OTHER;const item=data.users[OWNER].items.find(row=>row.id===deed.id);data.users[OWNER].items=data.users[OWNER].items.filter(row=>row.id!==deed.id);data.users[OTHER].items.push(item);return {};});
 f.now=production.readyAt;
 let state=await f.service.state(),held=orderOf(state,order.id);assert.equal(held.phase,'attention');assert.ok(held.attentionReason);assert.equal(state.shipments.filter(row=>row.orderId===order.id).length,0);assert.equal(plotStock(state)[ITEM],undefined);
 const lot=state.lots.find(row=>row.productionId===order.productionId);assert.equal(lot.reservedOrderId,order.id);assert.equal(lot.availableQuantity,10);
 assert.equal(state.factoryStock[ITEM],10);assert.equal(state.availableFactoryStock[ITEM],0,'held output is accounted for without becoming generally dispatchable');
 await assert.rejects(f.service.action(OTHER,'dispatch',{itemId:ITEM,quantity:1,destinationMapId:'city-market',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'take-held-order-stock'}));
 assert.equal((await f.service.state()).factoryStock[ITEM],10);
 await f.service.action(OWNER,'cancel',{orderId:order.id,requestId:'release-held-order'});state=await f.service.state();assert.equal(orderOf(state,order.id).phase,'cancelled');assert.equal((await f.db.get(OWNER)).tokens.MZK,paid);assert.equal(state.availableFactoryStock[ITEM],10,'cancelled hold becomes available without a second stock credit');
 const transfer=await f.service.action(OTHER,'dispatch',{itemId:ITEM,quantity:10,destinationMapId:'city-market',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'use-released-order-stock'});assert.equal(transfer.phase,'queued');assert.equal((await f.service.state()).factoryStock[ITEM],0);
});

test('a transferred deed cannot collect a previously queued order through a new sea reservation',async t=>{
 const f=await fixture(t),{order,state}=await f.ready(),shipment=state.shipments.find(row=>row.orderId===order.id);
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].ownerId=OTHER;return {};});
 await assert.rejects(f.service.shippingAction({walletId:OTHER},{},{shipping:{}},maps[0],{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId}));
 const next=await f.service.state();assert.equal(orderOf(next,order.id).phase,'attention');assert.equal(next.shipments.find(row=>row.id===shipment.id).phase,'queued');assert.equal(plotStock(next)[ITEM],undefined);
 await f.service.action(OWNER,'cancel',{orderId:order.id,requestId:'cancel-transferred-queued'});assert.equal((await f.service.state()).factoryStock[ITEM],10);
});


test('a partially delivered order can cancel only its unsent remainder after a deed transfer',async t=>{
 const f=await fixture(t),quote=await f.service.action(OWNER,'quote',{itemId:ITEM,quantity:1}),route=SHIPPING_ROUTES.find(route=>route.id==='gulf-gateway'),capacity=(route.units||4)*quote.recipe.unitsPerContainer;
 const {order,state}=await f.ready({quantity:capacity+1}),shipments=state.shipments.filter(row=>row.orderId===order.id),first=shipments.find(row=>row.quantity===capacity),unsent=shipments.find(row=>row.quantity===1),v=await voyage(f,first,'partial-order-voyage');
 f.now=v.result.deliveredAt;await f.service.deliver(v.identity,v.result,v.environment);
 let next=await f.service.state();assert.equal(orderOf(next,order.id).deliveredQuantity,capacity);assert.equal(orderOf(next,order.id).phase,'awaiting-shipping');assert.equal(plotStock(next)[ITEM],capacity);
 const receipt=next.stockReceipts.find(row=>row.shipmentId===first.id);assert.equal(receipt.orderId,order.id);assert.equal(receipt.deedId,deed.id);assert.equal(receipt.productionId,order.productionId);
 const paid=(await f.db.get(OWNER)).tokens.MZK;
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].ownerId=OTHER;return {};});
 next=await f.service.state();assert.equal(orderOf(next,order.id).phase,'attention');assert.match(orderOf(next,order.id).attentionReason,/remaining.*unsent/);
 const cancel={orderId:order.id,requestId:'cancel-partially-delivered-order'},result=await f.service.action(OWNER,'cancel',cancel);assert.equal(result.phase,'cancelled');assert.equal(result.deliveredQuantity,capacity);assert.equal(result.cancelledQuantity,1);assert.deepEqual(await f.service.action(OWNER,'cancel',cancel),result);
 next=await f.service.state();assert.equal(plotStock(next)[ITEM],capacity);assert.equal(next.factoryStock[ITEM],1);assert.equal(next.availableFactoryStock[ITEM],1);
 assert.equal(next.shipments.find(row=>row.id===first.id).phase,'delivered');assert.equal(next.shipments.find(row=>row.id===unsent.id).phase,'cancelled');assert.deepEqual(next.stockReceipts.find(row=>row.shipmentId===first.id),receipt);assert.equal((await f.db.get(OWNER)).tokens.MZK,paid);
 await assert.rejects(f.service.action(OWNER,'cancel',{...cancel,requestId:'cancel-remainder-again'}));assert.equal((await f.service.state()).factoryStock[ITEM],1);
});
