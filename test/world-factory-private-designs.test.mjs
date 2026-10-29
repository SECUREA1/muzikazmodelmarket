import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {ensureWorldSupply,registerPrivateFactoryBlueprint,factoryProductionItem,factoryLineupItems,supplyItemVisibleTo,filterSupplyState,supplyItem} from '../world-supply.mjs';
import {ownedCustomFactoryItem,marketplaceFactoryCatalog} from '../world-factory-catalog.mjs';
import {cleanCustomItem} from '../custom-item-rules.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';

const ALICE='account:private-designer',BOB='account:private-recipient';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const GLB=GAME_ECONOMY.find(item=>item.modelUrl&&!item.earnedOnly);
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'private-factory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json'));
 await database.put(ALICE,{tokens:{MZK:1000000},items:[{...GLB,id:'owned-source-glb',source:'mzk-store'}]});
 await database.put(BOB,{tokens:{MZK:1000000},items:[]});
 const drawing=await database.saveCustomItem(ALICE,{name:'Private factory drawing',requestId:'save-private-drawing',format:'svg',thumbnailUrl:PNG,configuration:{extruded:true,material:'emissive',color:'#ee2233',depth:40,behavior:'seat'}});
 let now=100000;
 const service=new WorldSupplyService(database,{catalog:()=>database.factoryCatalog(),maps:async()=>[{id:'hormuz-shipping'},{id:'receiving-map',name:'Receiving map'}],now:()=>now});
 return {database,drawing,service,get now(){return now;},set now(value){now=value;}};
}

test('owner development registers a validated saved design at zero without changing its listing or granting inventory',async t=>{
 const f=await fixture(t),before=await f.database.get(ALICE);
 const item=await f.database.transaction(data=>registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id));
 assert.equal(item.supplyId,'blueprint:custom:'+f.drawing.id);assert.equal(item.privateFactoryBlueprint,true);
 assert.equal(item.configuration.material,'neon');assert.equal(item.thumbnailUrl,PNG);assert.equal(item.configuration.depth,40);
 const data=await f.database.read(),ledger=data.worldSupply;
 assert.equal(ledger.worldStock[item.supplyId],0);assert.equal(ledger.factoryStock[item.supplyId]||0,0);
 assert.equal(supplyItem(data,f.drawing).supplyId,item.supplyId);
 assert.deepEqual(await f.database.get(ALICE),before);assert.deepEqual(await f.database.factoryCatalog(),[]);
 assert.equal(factoryProductionItem(data,item.supplyId,[],{walletId:ALICE}).supplyId,item.supplyId);
 assert.equal(factoryLineupItems(data,[],{walletId:ALICE}).some(row=>row.supplyId===item.supplyId),true);
 assert.equal(factoryLineupItems(data).some(row=>row.supplyId===item.supplyId),false);
 assert.equal(factoryLineupItems(data,[item]).some(row=>row.supplyId===item.supplyId),false,'passing a private catalog definition cannot bypass visibility');
 assert.throws(()=>factoryProductionItem(data,item.supplyId,[],{walletId:BOB}),{statusCode:409});
 assert.throws(()=>registerPrivateFactoryBlueprint(data,BOB,f.drawing.id),{statusCode:403});
 assert.throws(()=>registerPrivateFactoryBlueprint(data,ALICE,'owned-source-glb'),{statusCode:403});
 assert.throws(()=>registerPrivateFactoryBlueprint(data,ALICE,'not-a-saved-design'),{statusCode:403});
 assert.equal(supplyItemVisibleTo(data,item.supplyId,ALICE),true);assert.equal(supplyItemVisibleTo(data,item.supplyId,BOB),false);assert.equal(supplyItemVisibleTo(data,item.supplyId),false);
 const reopened={users:data.users};ensureWorldSupply(reopened,{items:[item]});assert.equal(reopened.worldSupply.worldStock[item.supplyId],0,'trusted private catalog reconciliation also starts at zero');
});

test('private records and every related stock dictionary stay out of public and other-owner views',async t=>{
 const f=await fixture(t),data=await f.database.read(),item=registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),id=item.supplyId,publicId='tool:scanner';
 const privateRecord={itemId:id,name:f.drawing.name},publicRecord={itemId:publicId};
 const state={catalog:[{...item,id},{id:publicId,supplyId:publicId}],transferCatalog:[{...item,id}],worldStock:{[id]:0,[publicId]:1000},factoryStock:{[id]:7,[publicId]:2},availableFactoryStock:{[id]:4,[publicId]:2},maps:[{id:'receiving-map',stock:{[id]:3,[publicId]:4}}]};
 for(const field of ['production','orders','lots','allocations','stockReceipts','shipments','challenges'])state[field]=[privateRecord,publicRecord];
 for(const walletId of [undefined,BOB]){
  const view=filterSupplyState(state,{walletId,data});
  assert.equal(JSON.stringify(view).includes(id),false);assert.equal(JSON.stringify(view).includes(f.drawing.name),false);
  assert.equal(view.worldStock[publicId],1000);assert.equal(view.availableFactoryStock[publicId],2);assert.equal(view.maps[0].stock[publicId],4);
  for(const field of ['production','orders','lots','allocations','stockReceipts','shipments','challenges'])assert.deepEqual(view[field],[publicRecord]);
 }
 const own=filterSupplyState(state,{walletId:ALICE,data});assert.equal(own.catalog.length,2);assert.equal(own.factoryStock[id],7);assert.equal(own.availableFactoryStock[id],4);
 assert.equal(state.catalog.length,2,'filtering must not mutate the authoritative state');
});

test('public promotion retains zero stock and stable identity; private registration cannot unpublish it or change its price',async t=>{
 const f=await fixture(t),data=await f.database.read(),item=registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),id=item.supplyId;
 const saved=data.users[ALICE].items.find(row=>row.id===f.drawing.id);saved.listing={active:true,priceMzk:83};
 const publicItems=marketplaceFactoryCatalog({playerListings:[{sellerId:ALICE,itemId:saved.id,priceMzk:83,item:saved}]});
 ensureWorldSupply(data,{items:publicItems});
 assert.equal(data.worldSupply.worldStock[id],0);assert.equal(data.worldSupply.catalog[id].privateFactoryBlueprint,undefined);
 assert.equal(data.worldSupply.catalog[id].factoryBlueprintOwnerId,undefined);assert.equal(data.worldSupply.catalog[id].priceMzk,83);
 assert.equal(supplyItemVisibleTo(data,id,BOB),true);assert.equal(factoryProductionItem(data,id,publicItems).supplyId,id);
 assert.equal(registerPrivateFactoryBlueprint(data,ALICE,saved.id).priceMzk,83);
 assert.equal(data.worldSupply.worldStock[id],0);assert.equal(data.worldSupply.catalog[id].privateFactoryBlueprint,undefined);
});

test('reselling a saved custom design immediately moves private access and production rights to its current holder',async t=>{
 const f=await fixture(t),data=await f.database.read(),item=registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),id=item.supplyId;
 const index=data.users[ALICE].items.findIndex(row=>row.id===f.drawing.id),[saved]=data.users[ALICE].items.splice(index,1);data.users[BOB].items.push(saved);
 assert.equal(supplyItemVisibleTo(data,id,ALICE),false);assert.equal(supplyItemVisibleTo(data,id,BOB),true);
 assert.throws(()=>factoryProductionItem(data,id,[],{walletId:ALICE}),{statusCode:409});
 assert.equal(factoryProductionItem(data,id,[],{walletId:BOB}).supplyId,id);
 assert.throws(()=>registerPrivateFactoryBlueprint(data,ALICE,saved.id),{statusCode:403});
 const view=filterSupplyState({catalog:[{...item,id}],worldStock:{[id]:0}},{walletId:BOB,data});
 assert.equal(view.catalog[0].factoryBlueprintOwnerId,BOB,'stale registration owner metadata cannot preserve old access');
 assert.equal(registerPrivateFactoryBlueprint(data,BOB,saved.id).factoryBlueprintOwnerId,BOB);assert.equal(data.worldSupply.worldStock[id],0);
});

test('private GLB development uses only owned saved model data and cannot inject protected proof or malformed artwork',async t=>{
 const f=await fixture(t),custom=await f.database.saveCustomItem(ALICE,{name:'Private configured GLB',requestId:'save-private-glb',format:'glb',modelUrl:GLB.modelUrl,configuration:{scale:1.7,color:'#112233'}}),data=await f.database.read();
 const saved=data.users[ALICE].items.find(item=>item.id===custom.id);saved.certificate={id:'forged'};saved.priceMzk=0;saved.shippingSupplyId='forged';
 const item=ownedCustomFactoryItem(data,ALICE,saved.id);assert.equal(item.modelUrl,GLB.modelUrl);assert.equal(item.configuration.scale,1.7);
 for(const field of ['certificate','shippingSupplyId','saveRequestId','sourceItemId','listing'])assert.equal(item[field],undefined);
 assert.ok(item.priceMzk>0,'production price comes from catalog rules, never a supplied discount');
 data.users[ALICE].items.find(item=>item.id===f.drawing.id).thumbnailUrl='data:image/png;base64,QUJDRA==';
 assert.throws(()=>registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),/valid PNG/);
 const old=data.users[ALICE].items.find(item=>item.id===f.drawing.id);old.source='client-injected';
 assert.throws(()=>registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),{statusCode:403});
});

test('authenticated factory workspace can produce private designs while public state and other players cannot discover them',async t=>{
 const f=await fixture(t),result=await f.service.action(ALICE,'register-design',{customItemId:f.drawing.id,requestId:'register-private-design'}),id=result.itemId;
 const privateState=await f.service.state({walletId:ALICE});assert.equal(privateState.catalog.some(item=>item.id===id&&item.factoryProducible),true);
 assert.equal(JSON.stringify(await f.service.state()).includes(id),false);assert.equal(JSON.stringify(await f.service.state({walletId:BOB})).includes(id),false);
 const quote=await f.service.action(ALICE,'quote',{itemId:id,quantity:2});
 const job=await f.service.action(ALICE,'produce',{itemId:id,quantity:2,expectedPriceMzk:quote.priceMzk,requestId:'produce-private-design'});
 assert.deepEqual(job.blueprint.configuration,f.drawing.configuration);assert.equal(job.blueprint.thumbnailUrl,PNG);
 await assert.rejects(f.service.action(BOB,'quote',{itemId:id,quantity:1}),{statusCode:409});
 await assert.rejects(f.service.action(BOB,'produce',{itemId:id,quantity:1,requestId:'steal-private-design'}),{statusCode:409});
 f.now=job.readyAt;const ready=await f.service.state({walletId:ALICE});assert.equal(ready.factoryStock[id],2);assert.equal(ready.worldStock[id],0);
 assert.equal(JSON.stringify(await f.service.state()).includes(id),false);
 await assert.rejects(f.service.action(BOB,'dispatch',{itemId:id,quantity:1,destinationMapId:'receiving-map',requestId:'steal-private-stock'}),{statusCode:403});
 assert.deepEqual((await f.database.get(BOB)).items,[]);assert.equal((await f.database.get(ALICE)).items.length,2);
});

test('toolkit emissive finish saves as the supported neon material',()=>{
 const item=cleanCustomItem({name:'Neon drawing',requestId:'save-neon-material',format:'svg',thumbnailUrl:PNG,configuration:{material:'emissive'}});
 assert.equal(item.configuration.material,'neon');
});

test('a previous private-design holder retains their paid production and freight history without catalog or stock access',async t=>{
 const f=await fixture(t),data=await f.database.read(),item=registerPrivateFactoryBlueprint(data,ALICE,f.drawing.id),id=item.supplyId;
 const index=data.users[ALICE].items.findIndex(row=>row.id===f.drawing.id),[saved]=data.users[ALICE].items.splice(index,1);data.users[BOB].items.push(saved);
 const ownJob={id:'own-paid-job',itemId:id,ownerId:ALICE,blueprint:{thumbnailUrl:PNG}},otherJob={id:'other-paid-job',itemId:id,ownerId:'account:other-payer'};
 const ownShipment={id:'own-paid-shipment',itemId:id,ownerId:ALICE},otherShipment={id:'other-paid-shipment',itemId:id,ownerId:'account:other-payer'};
 const state={catalog:[{...item,id}],transferCatalog:[{...item,id}],worldStock:{[id]:0},factoryStock:{[id]:7},availableFactoryStock:{[id]:4},maps:[{id:'receiving-map',stock:{[id]:3}}],production:[ownJob,otherJob],orders:[{id:'own-paid-order',itemId:id,ownerId:ALICE},{id:'other-paid-order',itemId:id,ownerId:'account:other-payer'}],shipments:[ownShipment,otherShipment],lots:[{id:'own-lot',itemId:id,productionId:ownJob.id},{id:'other-lot',itemId:id,productionId:otherJob.id}],allocations:[{itemId:id,shipmentId:ownShipment.id},{itemId:id,shipmentId:otherShipment.id}],stockReceipts:[{itemId:id,shipmentId:ownShipment.id},{itemId:id,shipmentId:otherShipment.id}],challenges:[{itemId:id}]};
 const view=filterSupplyState(state,{walletId:ALICE,data});
 assert.deepEqual(view.catalog,[]);assert.deepEqual(view.transferCatalog,[]);assert.deepEqual(view.worldStock,{});assert.deepEqual(view.factoryStock,{});assert.deepEqual(view.availableFactoryStock,{});assert.deepEqual(view.maps[0].stock,{});assert.deepEqual(view.challenges,[]);
 for(const field of ['production','orders','shipments','lots','allocations','stockReceipts'])assert.deepEqual(view[field],[state[field][0]],field+' keeps only the payer’s linked record');
 assert.equal(view.production[0].blueprint.thumbnailUrl,PNG,'the payer retains their purchased immutable blueprint snapshot');
 for(const walletId of [undefined,'account:unrelated-member'])assert.equal(JSON.stringify(filterSupplyState(state,{walletId,data})).includes(id),false);
 assert.equal(filterSupplyState(state,{walletId:BOB,data}).production.length,2,'the current design holder retains existing SKU visibility');
});

test('selling a private design keeps funded orders visible and cancellable once while revoking new production',async t=>{
 const f=await fixture(t),deed=await f.database.claimLand({walletId:ALICE,worldId:'private-designer-plot',name:'Private designer plot',priceMzk:0,requestId:'claim-private-designer-plot'});
 const service=new WorldSupplyService(f.database,{catalog:()=>f.database.factoryCatalog(),maps:async()=>[{id:'hormuz-shipping'},{id:'plot-'+deed.id,name:'Private designer plot'}],now:()=>f.now});
 const {itemId}=await service.action(ALICE,'register-design',{customItemId:f.drawing.id,requestId:'register-paid-before-resale'});
 const job=await service.action(ALICE,'produce',{itemId,quantity:2,requestId:'produce-paid-before-resale'}),order=await service.action(ALICE,'order',{deedId:deed.id,itemId,quantity:3,requestId:'order-paid-before-resale'});
 await f.database.listItem(ALICE,f.drawing.id,31);await f.database.trade({buyerId:BOB,sellerId:ALICE,itemId:f.drawing.id,requestId:'sell-design-with-funded-work',expectedPriceMzk:31});
 const workspace=await service.state({walletId:ALICE});
 assert.equal(workspace.production.some(row=>row.id===job.id),true);assert.equal(workspace.production.some(row=>row.id===order.productionId),true);assert.equal(workspace.orders.some(row=>row.id===order.id),true);
 assert.equal(workspace.catalog.some(row=>row.id===itemId),false);assert.equal(workspace.transferCatalog.some(row=>row.id===itemId),false);assert.equal(workspace.worldStock[itemId],undefined);
 const trace=await service.trace({productionId:job.id,walletId:ALICE});assert.equal(trace.production[0].blueprint.thumbnailUrl,PNG);assert.deepEqual(trace.production[0].blueprint.configuration,f.drawing.configuration);
 await assert.rejects(service.action(ALICE,'quote',{itemId,quantity:1}),{statusCode:409});
 await assert.rejects(service.action(ALICE,'produce',{itemId,quantity:1,requestId:'produce-after-private-resale'}),{statusCode:409});
 assert.equal(JSON.stringify(await service.state({walletId:'account:unrelated-member'})).includes(itemId),false);assert.equal(JSON.stringify(await service.state()).includes(itemId),false);
 await assert.rejects(service.trace({productionId:job.id,walletId:'account:unrelated-member'}),{statusCode:404});
 const balance=(await f.database.get(ALICE)).tokens.MZK;
 for(const fields of [{productionId:job.id,requestId:'cancel-retained-paid-job'},{orderId:order.id,requestId:'cancel-retained-paid-order'}]){
  const cancelled=await service.action(ALICE,'cancel',fields);assert.equal(cancelled.phase,'cancelled');assert.deepEqual(await service.action(ALICE,'cancel',fields),cancelled);
 }
 assert.equal((await f.database.get(ALICE)).tokens.MZK,balance+job.priceMzk+order.priceMzk);
 const refunds=(await f.database.read()).transactions.filter(row=>row.type==='WORLD_FACTORY_REFUND');assert.equal(refunds.length,2);
 assert.equal((await service.trace({productionId:job.id,walletId:ALICE})).production[0].phase,'cancelled');
 assert.equal((await service.state({walletId:ALICE})).orders.find(row=>row.id===order.id).phase,'cancelled');
});

test('the original payer can trace completed private lots, freight and delivery receipts after selling the design',async t=>{
 const f=await fixture(t),{itemId}=await f.service.action(ALICE,'register-design',{customItemId:f.drawing.id,requestId:'register-traceable-private-design'});
 const job=await f.service.action(ALICE,'produce',{itemId,quantity:2,requestId:'produce-traceable-private-design'});f.now=job.readyAt;await f.service.state({walletId:ALICE});
 const shipment=await f.service.action(ALICE,'dispatch',{itemId,quantity:2,destinationMapId:'receiving-map',requestId:'dispatch-traceable-private-design'}),environment={id:'hormuz-shipping'},identity={walletId:ALICE},player={shipping:{job:null}},startedAt=f.now;
 await f.service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 player.shipping.job={id:'traceable-private-voyage',phase:'loading',contractId:shipment.contractId,environmentId:environment.id,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:player.shipping.job.id});
 const route=SHIPPING_ROUTES.find(row=>row.id===shipment.contractId);f.now+=120000;
 await f.service.deliver(identity,{type:'delivery',shipmentId:shipment.id,jobId:player.shipping.job.id,deliveryId:player.shipping.job.id,contractId:shipment.contractId,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:f.now},environment);
 await f.database.listItem(ALICE,f.drawing.id,31);await f.database.trade({buyerId:BOB,sellerId:ALICE,itemId:f.drawing.id,requestId:'sell-private-design-after-delivery',expectedPriceMzk:31});
 const workspace=await f.service.state({walletId:ALICE});
 assert.equal(workspace.maps.find(map=>map.id==='receiving-map').stock[itemId],undefined);assert.equal(workspace.factoryStock[itemId],undefined);assert.equal(workspace.availableFactoryStock[itemId],undefined);
 for(const selector of [{productionId:job.id},{shipmentId:shipment.id}]){
  const trace=await f.service.trace({...selector,walletId:ALICE});assert.equal(trace.production[0].id,job.id);assert.equal(trace.lots.length,1);assert.equal(trace.allocations.length,1);assert.equal(trace.shipments[0].phase,'delivered');assert.equal(trace.stockReceipts[0].shipmentId,shipment.id);assert.equal(trace.stockReceipts[0].quantity,2);
 }
 await assert.rejects(f.service.trace({shipmentId:shipment.id,walletId:'account:unrelated-member'}),{statusCode:404});
 assert.equal(JSON.stringify(await f.service.state()).includes(itemId),false);
});
