import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';

const wallet='account:manufacturer',itemId='tool:scanner';
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'factory-process-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json'));await database.put(wallet,{tokens:{MZK:1000000},items:[]});
 let now=1000000;
 const options={now:()=>now,maps:async()=>[{id:'hormuz-shipping',name:'Shipping'},{id:'market-map',name:'Market'}],catalog:async()=>[{id:'authored-plane',name:'Authored GLB aircraft',modelUrl:'/uploads/aircraft.glb',assetType:'aircraft',priceMzk:100}]};
 const service=new WorldSupplyService(database,options);
 return {database,service,options,get now(){return now;},set now(value){now=value;},dispatch:input=>service.action(wallet,'dispatch',{itemId,quantity:10,destinationMapId:'market-map',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'dispatch',...input})};
}

test('all four server manufacturing stages finish before packed stock can enter shipping, never the world store',async t=>{
 const f=await fixture(t),quote=await f.service.action(wallet,'quote',{itemId,quantity:10});
 const production=await f.service.action(wallet,'produce',{itemId,quantity:10,expectedPriceMzk:quote.priceMzk,requestId:'build',readyAt:0,buildMs:0,stages:[],recipe:{unitsPerContainer:100000}});
 assert.equal(production.schemaVersion,2);assert.equal(production.shippingRequired,true);
 assert.deepEqual(production.stages.map(stage=>stage.id),['sourcing','assembly','quality','packing']);
 assert.equal(production.readyAt-production.startedAt,quote.buildMs,'client timing is ignored');
 for(const [index,stage] of production.stages.entries()){
  f.now=stage.readyAt-1;
  const state=await f.service.state(),job=state.production[0];
  assert.equal(job.stageIndex,index);assert.equal(job.stageId,stage.id);assert.equal(job.stages[index].phase,'processing');
  assert.equal(job.stages.filter(stage=>stage.phase==='complete').length,index);
  assert.equal(state.factoryStock[itemId]||0,0);assert.equal(state.worldStock[itemId],1000);
  assert.equal(state.maps.find(map=>map.id==='market-map').stock[itemId],undefined);
  await assert.rejects(f.dispatch({requestId:'early-'+index}),/Complete enough factory production/);
 }
 f.now=production.readyAt;
 const state=await f.service.state(),job=state.production[0];
 assert.equal(job.phase,'ready');assert.equal(job.progress,100);assert.ok(job.stages.every(stage=>stage.phase==='complete'));
 assert.equal(state.factoryStock[itemId],10);assert.equal(state.worldStock[itemId],1000);
 const reopened=new WorldSupplyService(new UserJsonDatabase(f.database.file),f.options);
 assert.equal((await reopened.state()).factoryStock[itemId],10,'restart does not duplicate finished output');
 const shipment=await f.dispatch();assert.equal(shipment.packing.sealed,true);assert.equal(shipment.packing.containersRequired,1);
 assert.equal((await f.service.state()).worldStock[itemId],1000,'dispatch still cannot credit world supply');
 await assert.rejects(f.service.action(wallet,'complete',{productionId:production.id,requestId:'forge-complete'}),/listed world supply action/);
 await assert.rejects(f.service.action(wallet,'deliver',{shipmentId:shipment.id,requestId:'forge-delivery'}),/listed world supply action/);
});

test('large native and GLB assemblies have authoritative packing limits regardless of client capacity fields',async t=>{
 const f=await fixture(t),plane='store:authored-plane';await f.service.state();
 const state=await f.service.state();assert.equal(state.catalog.find(item=>item.id===plane).recipe.unitsPerContainer,1);
 await assert.rejects(f.dispatch({itemId:plane,quantity:5,sourceMapId:'world',packing:{unitsPerContainer:10000},requestId:'oversized-plane'}),/up to 4/);
 assert.equal((await f.service.state()).worldStock[plane],1000,'a rejected batch does not reserve any aircraft');
 const shipment=await f.dispatch({itemId:plane,quantity:4,sourceMapId:'world',requestId:'plane-shipment'});
 assert.deepEqual(shipment.packing,{recipeId:'aircraft',unitsPerContainer:1,containersRequired:4,containerSlots:4,maxShipmentQuantity:4,sealed:true});
 assert.equal((await f.service.state()).worldStock[plane],996);
 await f.service.action(wallet,'cancel',{shipmentId:shipment.id,requestId:'return-aircraft'});
 assert.equal((await f.service.state()).worldStock[plane],1000,'cancellation returns the exact reserved physical units');
 await assert.rejects(f.dispatch({itemId:plane,quantity:1,sourceMapId:'world',contractId:'dock-induction',requestId:'fake-passage'}),/shipping lane/);
 await assert.rejects(f.dispatch({itemId:plane,quantity:1,sourceMapId:'world',contractId:'atlas-export',requestId:'wrong-channel'}),/shipping lane/);
});

test('legacy timed batches finish once while new batches require their complete manufacturing timeline',async t=>{
 const f=await fixture(t);await f.database.transaction(data=>{
  data.worldSupply.production.legacy={id:'legacy',ownerId:wallet,itemId,quantity:3,phase:'building',startedAt:f.now-5000,readyAt:f.now};return true;
 });
 assert.equal((await f.service.state()).factoryStock[itemId],3);
 assert.equal((await f.service.state()).factoryStock[itemId],3);
 assert.equal((await f.service.state()).worldStock[itemId],1000);
});
