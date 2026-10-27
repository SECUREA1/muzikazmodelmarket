import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {supplyChallengeMatchesSelection} from '../public/js/world-supply-ui.js';
import {shippingSupplyManifest} from '../public/js/shipping-ui.js';
const maps=[{id:'hormuz-shipping'},{id:'factory-testing-range'},{id:'construction-yard'},{id:'tropical-island'},{id:'missile-factory'}];
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'distribution-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:distributor';await database.put(wallet,{tokens:{MZK:1000000},items:[]});let now=100000;
 const service=new WorldSupplyService(database,{now:()=>now,maps:async()=>maps});
 return {database,wallet,service,get now(){return now;},set now(value){now=value;}};
}
test('rocket and all supply goals resolve canonical items; forged requirements cannot change cargo or consume stock',async t=>{
 const f=await fixture(t),state=await f.service.state();assert.equal(state.challenges.length,6);
 const goal=state.challenges.find(row=>row.id==='rocket-convoy');assert.equal(goal.quantity,4);assert.equal(goal.minimumQuality,90);
 const item=state.catalog.find(item=>item.id===goal.itemId);assert.equal(item.recipe.unitsPerContainer,1);
 assert.match(shippingSupplyManifest({shipmentId:'rocket-shipment',supplyManifest:[{name:goal.itemName,quantity:4}],supplyChallenge:goal}),/Rocket supply convoy.*90% quality required/);
 const production=await f.service.action(f.wallet,'produce',{itemId:goal.itemId,quantity:4,requestId:'rocket-build'});f.now=production.readyAt;await f.service.state();
 const input={...goal,challengeId:goal.id,requestId:'rocket-dispatch'};
 for(const forged of [{quantity:3},{destinationMapId:'world'},{itemId:'tool:scanner'},{sourceMapId:'world'},{contractId:'island-provisions'}]){
  const before=await f.database.read();await assert.rejects(f.service.action(f.wallet,'dispatch',{...input,...forged}));assert.deepEqual(await f.database.read(),before);
 }
 const shipment=await f.service.action(f.wallet,'dispatch',{...input,minimumQuality:0,challenge:{minimumQuality:0},completed:true});
 assert.equal(shipment.challenge.minimumQuality,90);assert.equal(shipment.packing.containersRequired,4);
 assert.equal((await f.service.state()).maps.find(map=>map.id===goal.destinationMapId).stock[goal.itemId],undefined);
 await assert.rejects(f.service.action(f.wallet,'dispatch',{...input,challengeId:'range-restock'}),/different operation/);
 assert.equal((await f.service.state()).challenges.find(row=>row.id===goal.id).completionCount,0);
});
test('cargo below challenge quality still stocks its destination once but cannot claim a completion or extra MZK',async t=>{
 const f=await fixture(t),goal=(await f.service.state()).challenges.find(row=>row.id==='port-maintenance');
 const build=await f.service.action(f.wallet,'produce',{itemId:goal.itemId,quantity:goal.quantity,requestId:'tools-build'});f.now=build.readyAt;await f.service.state();
 const shipment=await f.service.action(f.wallet,'dispatch',{...goal,challengeId:goal.id,requestId:'tools-dispatch'}),identity={walletId:f.wallet},player={shipping:{}};
 await f.service.shippingAction(identity,{},player,maps[0],{operation:'reserve',shipmentId:shipment.id,contractId:goal.contractId});
 const startedAt=f.now;player.shipping.job={id:'tools-real-job',phase:'loading',contractId:goal.contractId,environmentId:maps[0].id,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,maps[0],{operation:'bind',shipmentId:shipment.id,jobId:'tools-real-job'});
 const route=SHIPPING_ROUTES.find(row=>row.id===goal.contractId);f.now+=120000;
 const event={type:'delivery',shipmentId:shipment.id,jobId:'tools-real-job',deliveryId:'tools-real-job',contractId:route.id,cargoId:route.cargoId,units:route.units,quality:84,startedAt,departedAt:startedAt+10000,deliveredAt:f.now};
 const balance=(await f.database.get(f.wallet)).tokens.MZK;
 const first=await f.service.deliver(identity,event,maps[0]);assert.equal(first.challengeResult.completed,false);
 await f.service.deliver(identity,event,maps[0]);const state=await f.service.state();
 assert.equal(state.maps.find(row=>row.id===goal.destinationMapId).stock[goal.itemId],goal.quantity);
 assert.equal(state.challenges.find(row=>row.id===goal.id).completionCount,0);assert.equal((await f.database.get(f.wallet)).tokens.MZK,balance);
});
test('depleted central inventory creates a restock goal without reseeding its count, and UI binding rejects changed constraints',async t=>{
 const f=await fixture(t);await f.service.state();await f.database.transaction(data=>{data.worldSupply.worldStock['tool:scanner']=0;return {};});
 const state=await f.service.state(),goal=state.challenges.find(row=>row.id==='world-restock:tool:scanner');
 assert.equal(goal.destinationMapId,'world');assert.equal(goal.worldStock,0);assert.equal(state.worldStock['tool:scanner'],0);
 assert.equal(supplyChallengeMatchesSelection(goal,goal),true);
 assert.equal(supplyChallengeMatchesSelection(goal,{...goal,quantity:goal.quantity+1}),false);
 assert.equal(supplyChallengeMatchesSelection(goal,{...goal,destinationMapId:'construction-yard'}),false);
 assert.equal(supplyChallengeMatchesSelection(null,goal),false);
});
