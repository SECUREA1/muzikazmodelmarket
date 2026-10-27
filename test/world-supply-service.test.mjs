import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService,WORLD_SUPPLY_RULES} from '../server-world-supply.mjs';
import {SHIPPING_RULES,SHIPPING_ROUTES} from '../public/js/shipping-config.js';

const ITEM='tool:scanner',ALICE='supply-alice',BOB='supply-bob';
const maps=[{id:'hormuz-shipping',name:'Hormuz Shipping',visibility:'public'},
 {id:'custom-shipping',name:'Custom Shipping',builderScene:{layoutMeta:{shipping:{enabled:true}}}},
 {id:'city-market',name:'City Market',builderScene:{objects:[{id:'shop-a',name:'City Store'}]}},
 {id:'private-map',name:'Private',visibility:'private'},{id:'unplayable',name:'Preview',playable:false}];
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'world-supply-service-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put(ALICE,{tokens:{MZK:1000000},items:[]});await db.put(BOB,{tokens:{MZK:1000000},items:[]});
 let time=1000000;
 const options={maps:async()=>maps,catalog:async()=>[{id:'creator-glb',name:'Creator GLB',modelUrl:'/uploads/creator.glb',priceMzk:200}],now:()=>time};
 const service=new WorldSupplyService(db,options);
 const f={db,service,options,get now(){return time;},set now(value){time=value;}};
 f.produce=async(count=10,requestId='produce')=>service.action(ALICE,'produce',{itemId:ITEM,quantity:count,requestId});
 f.ready=async(count=10)=>{const production=await f.produce(count);f.now=production.readyAt;await service.state();return production;};
 f.dispatch=async(input={})=>service.action(ALICE,'dispatch',{itemId:ITEM,quantity:10,destinationMapId:'city-market',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'dispatch',...input});
 return f;
}
const snapshot=async db=>JSON.stringify(await db.read());
async function voyage(f,shipment,{wallet=ALICE,id='voyage-a'}={}){
 const environment=maps.find(map=>map.id===shipment.shippingMapId),identity={walletId:wallet},player={shipping:{job:null}},sim={};
 const reserve=await f.service.shippingAction(identity,sim,player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 const startedAt=f.now;
 player.shipping.job={id,phase:'loading',contractId:shipment.contractId,environmentId:environment.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,sim,player,environment,{operation:'bind',shipmentId:shipment.id,jobId:id});
 const route=SHIPPING_ROUTES.find(route=>route.id===shipment.contractId);
 const result={type:'delivery',shipmentId:shipment.id,jobId:id,deliveryId:id,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};
 return {environment,identity,player,sim,reserve,result};
}

test('factory quotes charge the published bulk price, reject stale quotes, and replay immutable receipts',async t=>{
 const f=await fixture(t),quote=await f.service.action(ALICE,'quote',{itemId:ITEM,quantity:10});
 assert.equal(quote.discountPercent,20);assert.equal(quote.priceMzk,quote.subtotalMzk*.8);
 const before=await snapshot(f.db);
 await assert.rejects(f.service.action(ALICE,'produce',{itemId:ITEM,quantity:10,expectedPriceMzk:quote.priceMzk+1,requestId:'stale'}),/quote changed/);
 assert.equal(await snapshot(f.db),before);
 const input={itemId:ITEM,quantity:10,expectedPriceMzk:quote.priceMzk,requestId:'produce-paid'};
 const first=await f.service.action(ALICE,'produce',input),retry=await f.service.action(ALICE,'produce',input);
 assert.deepEqual(first,retry);assert.equal((await f.db.get(ALICE)).tokens.MZK,1000000-quote.priceMzk);
 f.now=first.readyAt+1;await f.service.state();
 assert.equal((await f.service.action(ALICE,'produce',input)).phase,'building','retry preserves the original response');
 await assert.rejects(f.service.action(ALICE,'produce',{...input,quantity:11}),/different operation/);
 const ledger=(await f.db.read()).worldSupply;
 assert.equal(Object.keys(ledger.production).length,1);assert.equal(ledger.factoryStock[ITEM],10);
 assert.equal(ledger.worldStock[ITEM],1000);
 assert.equal((await f.db.read()).transactions.filter(row=>row.type==='WORLD_FACTORY_PRODUCTION').length,1);
 for(const value of [0,-1,1.2,10001])await assert.rejects(f.service.action(ALICE,'quote',{itemId:ITEM,quantity:value}),{statusCode:422});
 await assert.rejects(f.service.action('unknown-wallet','quote',{itemId:ITEM,quantity:1}),{statusCode:401});
});

test('published GLB dollar prices receive the same MZK wholesale discount',async t=>{
 const f=await fixture(t),service=new WorldSupplyService(f.db,{...f.options,catalog:async()=>[{id:'published-dollar-model',name:'Published model',modelUrl:'/uploads/dollar-model.glb',priceUsd:2.5}]});
 const quote=await service.action(ALICE,'quote',{itemId:'store:published-dollar-model',quantity:10});
 assert.equal(quote.subtotalMzk,2500);assert.equal(quote.priceMzk,2000);
 const repriced=new WorldSupplyService(f.db,{...f.options,catalog:async()=>[{id:'published-dollar-model',name:'Published model',modelUrl:'/uploads/dollar-model.glb',priceUsd:3}]});
 const revised=await repriced.action(ALICE,'quote',{itemId:'store:published-dollar-model',quantity:10});
 assert.equal(revised.priceMzk,2400,'factory quotes use current published prices');
 assert.equal((await repriced.state()).worldStock['store:published-dollar-model'],1000,'repricing does not reseed stock');
});

test('production becomes ready by server time once and survives a new service/database instance',async t=>{
 const f=await fixture(t),production=await f.produce();
 f.now=production.readyAt-1;let state=await f.service.state();
 assert.equal(state.production[0].phase,'building');assert.equal(state.factoryStock[ITEM]||0,0);
 f.now=production.readyAt;state=await f.service.state();
 assert.equal(state.production[0].phase,'ready');assert.equal(state.factoryStock[ITEM],10);
 assert.equal((await f.service.state()).factoryStock[ITEM],10);
 const reopened=new WorldSupplyService(new UserJsonDatabase(f.db.file),f.options);
 assert.equal((await reopened.state()).factoryStock[ITEM],10);
 assert.equal((await reopened.state()).worldStock[ITEM],1000);
 assert.equal((await reopened.state()).catalog.some(item=>item.id==='store:creator-glb'),true);
});

test('dispatch reserves factory goods without stocking world/map inventories and invalid lanes/maps roll back',async t=>{
 const f=await fixture(t);await f.ready();
 for(const invalid of [{contractId:'dock-induction'},{destinationMapId:'missing-map'},{destinationMapId:'private-map'},{destinationMapId:'unplayable'},{shippingMapId:'city-market'},{quantity:4001}]){
  const before=await snapshot(f.db);await assert.rejects(f.dispatch(invalid));assert.equal(await snapshot(f.db),before);
 }
 const shipment=await f.dispatch(),retry=await f.dispatch();
 assert.deepEqual(shipment,retry);assert.equal(shipment.phase,'queued');
 const state=await f.service.state();assert.equal(state.factoryStock[ITEM],0);assert.equal(state.worldStock[ITEM],1000);
 assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],undefined);
 assert.deepEqual(state.maps.find(map=>map.id==='city-market').stores,[{id:'shop-a',name:'City Store'}]);
 assert.equal(state.shippingMaps.some(map=>map.id==='custom-shipping'),true);
 assert.equal(state.maps.some(map=>map.id==='private-map'),false);
});

test('cancellation refunds only unfinished production once and returns queued cargo without refunding its production',async t=>{
 const f=await fixture(t),production=await f.produce(),paid=(await f.db.get(ALICE)).tokens.MZK;
 assert.ok(paid<1000000);
 const cancel={productionId:production.id,requestId:'cancel-production'};
 await f.service.action(ALICE,'cancel',cancel);await f.service.action(ALICE,'cancel',cancel);
 assert.equal((await f.db.get(ALICE)).tokens.MZK,1000000);
 await assert.rejects(f.service.action(ALICE,'cancel',{...cancel,requestId:'second-refund'}),/Only a batch/);
 f.now=production.readyAt+1;assert.equal((await f.service.state()).factoryStock[ITEM]||0,0);
 const next=await f.produce(10,'produce-next');f.now=next.readyAt;await f.service.state();
 const shipment=await f.dispatch(),afterProduction=(await f.db.get(ALICE)).tokens.MZK;
 await assert.rejects(f.service.action(ALICE,'cancel',{productionId:next.id,requestId:'refund-ready'}),/Only a batch/);
 await assert.rejects(f.service.action(BOB,'cancel',{shipmentId:shipment.id,requestId:'steal-cargo'}),{statusCode:403});
 const shipmentCancel={shipmentId:shipment.id,requestId:'cancel-shipment'};
 await f.service.action(ALICE,'cancel',shipmentCancel);await f.service.action(ALICE,'cancel',shipmentCancel);
 assert.equal((await f.db.get(ALICE)).tokens.MZK,afterProduction);
 assert.equal((await f.service.state()).factoryStock[ITEM],10);
 await assert.rejects(f.service.action(ALICE,'cancel',{...shipmentCancel,requestId:'duplicate-cargo'}),/Only an unassigned/);
 assert.equal((await f.service.state()).factoryStock[ITEM],10);
});

test('one captain reserves cargo, binds a verified job, releases safely and can retry with a new voyage',async t=>{
 const f=await fixture(t);await f.ready();const shipment=await f.dispatch(),environment=maps[0],command={operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId};
 const contenders=await Promise.allSettled([ALICE,BOB].map(wallet=>f.service.shippingAction({walletId:wallet},{},{shipping:{}},environment,command)));
 assert.equal(contenders.filter(row=>row.status==='fulfilled').length,1);
 const winner=contenders[0].status==='fulfilled'?ALICE:BOB,identity={walletId:winner},loser=winner===ALICE?BOB:ALICE;
 assert.deepEqual(contenders.find(row=>row.status==='fulfilled').value.supplyManifest,[{itemId:ITEM,name:shipment.itemName,quantity:10}]);
 await assert.rejects(f.service.shippingAction({walletId:loser},{},{shipping:{}},environment,{operation:'release',shipmentId:shipment.id}),/another voyage/);
 await assert.rejects(f.service.shippingAction(identity,{},{shipping:{}},environment,{operation:'bind',shipmentId:shipment.id,jobId:'fake'}),/verified loading/);
 const job={id:'first-voyage',contractId:shipment.contractId,environmentId:environment.id,phase:'loading',startedAt:f.now,deadline:f.now+SHIPPING_RULES.contractLimitMs},player={shipping:{job}};
 await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:job.id});
 await assert.rejects(f.service.action(ALICE,'cancel',{shipmentId:shipment.id,requestId:'cancel-reserved'}),/Only an unassigned/);
 const release={operation:'release',shipmentId:shipment.id,jobId:job.id};
 await f.service.shippingAction(identity,{},player,environment,release);
 await f.service.shippingAction(identity,{},player,environment,release);
 assert.equal((await f.service.state()).factoryStock[ITEM],0);
 player.shipping.job=null;await f.service.shippingAction(identity,{},player,environment,command);
 player.shipping.job={...job,id:'replacement-voyage'};
 await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:'replacement-voyage'});
 await f.service.shippingAction(identity,{},player,environment,release);
 assert.equal((await f.service.state()).shipments[0].jobId,'replacement-voyage','a stale release cannot release a replacement voyage');
});

test('a verified completed sea voyage stocks the selected map or world inventory exactly once',async t=>{
 const f=await fixture(t);await f.ready(20);
 for(const [index,destinationMapId] of ['city-market','world'].entries()){
  const shipment=await f.dispatch({destinationMapId,requestId:'dispatch-'+index}),v=await voyage(f,shipment,{id:'delivery-'+index});
  f.now=v.result.deliveredAt;
  const delivered=await f.service.deliver(v.identity,v.result,v.environment),replay=await f.service.deliver(v.identity,v.result,v.environment);
  assert.deepEqual(delivered,replay);assert.equal(delivered.phase,'delivered');assert.equal(delivered.transferTask.phase,'delivered');
 }
 const state=await f.service.state();
 assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],10);
 assert.equal(state.worldStock[ITEM],1010);assert.equal(state.factoryStock[ITEM],0);
 assert.equal(state.shipments.filter(row=>row.phase==='delivered').length,2);
 assert.equal((await f.db.get(ALICE)).tokens.MZK,1000000-(await f.service.action(ALICE,'quote',{itemId:ITEM,quantity:20})).priceMzk);
});

test('malformed or expired sea settlements cannot mint stock, and expired reservations become available to another captain',async t=>{
 const f=await fixture(t);await f.ready();const shipment=await f.dispatch(),v=await voyage(f,shipment);f.now=v.result.deliveredAt;
 for(const invalid of [{units:1},{cargoId:'wrong-cargo'},{quality:0},{startedAt:undefined},{departedAt:NaN},{deliveredAt:f.now+1},{departedAt:v.result.startedAt-1},{deliveredAt:v.result.startedAt+1}]){
  const before=await snapshot(f.db);await assert.rejects(f.service.deliver(v.identity,{...v.result,...invalid},v.environment));assert.equal(await snapshot(f.db),before);
 }
 let state=await f.service.state(),lease=state.shipments[0].leaseUntil;
 f.now=lease;await assert.rejects(f.service.deliver(v.identity,v.result,v.environment),/expired/);
 state=await f.service.state();assert.equal(state.shipments[0].phase,'queued');assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],undefined);
 await f.service.shippingAction(v.identity,{},v.player,v.environment,{operation:'release',shipmentId:shipment.id,jobId:v.result.jobId});
 await f.service.shippingAction({walletId:BOB},{},{shipping:{}},v.environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 await f.service.shippingAction(v.identity,{},v.player,v.environment,{operation:'release',shipmentId:shipment.id,jobId:v.result.jobId});
 assert.equal((await f.service.state()).shipments[0].captainId,BOB,'an expired captain cannot release the new reservation');
 await assert.rejects(f.service.deliver(v.identity,v.result,v.environment),/does not match/);
});


test('existing world and map warehouse goods transfer through sea jobs without creating stock or factory output',async t=>{
 const f=await fixture(t);await f.service.state();
 let shipment=await f.dispatch({sourceMapId:'world',requestId:'central-transfer'});
 let state=await f.service.state();assert.equal(state.worldStock[ITEM],990);assert.equal(state.factoryStock[ITEM]||0,0);
 const v=await voyage(f,shipment);f.now=v.result.deliveredAt;await f.service.deliver(v.identity,v.result,v.environment);
 state=await f.service.state();assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],10);
 shipment=await f.dispatch({sourceMapId:'city-market',destinationMapId:'world',quantity:4,requestId:'warehouse-return'});
 state=await f.service.state();assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],6);assert.equal(state.worldStock[ITEM],990);
 const refund={shipmentId:shipment.id,requestId:'cancel-warehouse-return'};await f.service.action(ALICE,'cancel',refund);await f.service.action(ALICE,'cancel',refund);
 state=await f.service.state();assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],10);assert.equal(state.factoryStock[ITEM]||0,0);
 await assert.rejects(f.dispatch({sourceMapId:'city-market',destinationMapId:'world',quantity:11,requestId:'oversell-map'}),/insufficient/);
 await assert.rejects(f.dispatch({sourceMapId:'invented-map',requestId:'invented-source'}),{statusCode:404});
 shipment=await f.dispatch({sourceMapId:'city-market',destinationMapId:'world',quantity:10,requestId:'warehouse-to-world'});
 const back=await voyage(f,shipment,{id:'return-voyage'});f.now=back.result.deliveredAt;await f.service.deliver(back.identity,back.result,back.environment);
 state=await f.service.state();assert.equal(state.worldStock[ITEM],1000);assert.equal(state.maps.find(map=>map.id==='city-market').stock[ITEM],0);assert.equal(state.factoryStock[ITEM]||0,0);
 await assert.rejects(f.dispatch({sourceMapId:'city-market',destinationMapId:'world',quantity:1,requestId:'empty-warehouse'}),/insufficient/);
 assert.equal((await f.db.get(ALICE)).tokens.MZK,1000000,'transfers reserve existing goods without manufacturing or production charges');
});
