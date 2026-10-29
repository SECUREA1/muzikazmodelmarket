import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {normalizeFactoryCatalogItem,marketplaceFactoryCatalog} from '../world-factory-catalog.mjs';
import {ensureWorldSupply,supplyItem,canonicalSupplyId,consumeWorldStock,factoryLineupItems,factoryProductionItem} from '../world-supply.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {factoryUnitPriceMzk} from '../world-factory-pricing.mjs';
import {catalogItemPrice} from '../public/js/game-item-pricing.js';

const SELLER='account:factory-creator',BUYER='account:factory-buyer';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const GLB=GAME_ECONOMY.find(item=>item.modelUrl&&!item.earnedOnly);
const NATIVE=GAME_ECONOMY.find(item=>item.buildAssetId&&item.kind==='asset'&&!item.earnedOnly&&!item.basic&&!item.modelUrl&&!/^factory-/.test(item.buildAssetId));
const MAPS=[{id:'hormuz-shipping'},{id:'market-destination',name:'Marketplace receiving warehouse'}];

async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'factory-marketplace-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json'));
 await database.put(SELLER,{tokens:{MZK:100000000},items:[{...GLB,id:'creator-owned-glb',source:'mzk-store'},{...NATIVE,id:'creator-owned-native',source:'mzk-store'}]});
 await database.put(BUYER,{tokens:{MZK:100000000},items:[]});
 let now=100000;
 const service=new WorldSupplyService(database,{now:()=>now,catalog:()=>database.factoryCatalog(),maps:async()=>MAPS});
 return {database,service,get now(){return now;},set now(value){now=value;}};
}

async function creations(f){
 const native=(await f.database.createBuilderAsset(SELLER,{name:'Configured native seat',asset_type:'props',builder_category:'PROPS',price_mzk:120,function_data:{buildAssetId:NATIVE.buildAssetId,behavior:'seat',seatOffset:[0,.7,0]}})).asset;
 const glb=(await f.database.createBuilderAsset(SELLER,{name:'Creator cargo model',asset_type:'props',builder_category:'PROPS',glb_url:'/uploads/creator-cargo.glb',function_data:{behavior:'interact',prompt:'Inspect creator cargo'},collider_data:{size:[1,2,1]},animation_data:{clip:'idle'}})).asset;
 const nativeListing=await f.database.listBuilderAsset(SELLER,{assetId:native.id,priceMzk:700});
 const glbListing=await f.database.listBuilderAsset(SELLER,{assetId:glb.id,priceMzk:90});
 const custom=await f.database.saveCustomItem(SELLER,{name:'Crimson configured model',requestId:'save-red-custom',format:'glb',modelUrl:GLB.modelUrl,configuration:{color:'#ee2233',behavior:'seat',scale:1.5}});
 const drawing=await f.database.saveCustomItem(SELLER,{name:'Extruded factory artwork',requestId:'save-image-custom',format:'svg',thumbnailUrl:PNG,configuration:{color:'#22ee44',behavior:'decor',extruded:true,depth:40}});
 await f.database.listItem(SELLER,custom.id,250);
 await f.database.listItem(SELLER,drawing.id,75);
 await f.database.listItem(SELLER,'creator-owned-glb',999999);
 await f.database.listItem(SELLER,'creator-owned-native',999999);
 return {native,glb,nativeListing,glbListing,custom,drawing};
}

test('trusted marketplace normalization keeps physical blueprint data and excludes nonmanufacturable records',()=>{
 const native=normalizeFactoryCatalogItem({id:'native-creation',name:'Native seat',asset_type:'props',price_mzk:130,function_data:{modelId:NATIVE.buildAssetId,behavior:'seat'}},{variantId:'builder:native-creation'});
 assert.equal(native.buildAssetId,NATIVE.buildAssetId);assert.equal(native.priceMzk,130);assert.equal(native.factoryVariant,true);assert.equal(native.supplyId,'blueprint:builder:native-creation');
 const glb=normalizeFactoryCatalogItem({id:'glb-creation',name:'GLB',asset_type:'props',glb_url:'/uploads/item.glb',function_data:{prompt:'Use'},collider_data:{radius:2}},{priceMzk:90,variantId:'builder:glb-creation'});
 assert.equal(glb.modelUrl,'/uploads/item.glb');assert.deepEqual(glb.collider_data,{radius:2});assert.equal(glb.priceMzk,90);
 const drawing=normalizeFactoryCatalogItem({id:'drawing',name:'Drawing',format:'svg',renderKind:'image',thumbnailUrl:PNG,configuration:{extruded:true}},{priceMzk:20,variantId:'custom:drawing'});
 assert.equal(drawing.renderKind,'image');assert.equal(drawing.thumbnailUrl,PNG);assert.deepEqual(drawing.configuration,{extruded:true});
 for(const blocked of [{visibility:'private'},{earnedOnly:true},{tradable:false},{source:'prison-earned'},{type:'land-deed'},{type:'land-entitlement'},{type:'license'},{type:'certificate'},{kind:'stock'},{kind:'bundle'},{shippingSupplyId:'shipping-food-stock'}])assert.equal(normalizeFactoryCatalogItem({id:'blocked',modelUrl:'/uploads/blocked.glb',priceMzk:40,...blocked}),null,JSON.stringify(blocked));
 assert.equal(normalizeFactoryCatalogItem({id:'script-only',asset_type:'scripts',script_reference:'/scripts/game.js',price_mzk:40}),null);
 assert.equal(normalizeFactoryCatalogItem({id:'broken-image',format:'svg',renderKind:'image',thumbnailUrl:'not-image'}),null);
 const asset={id:'shared',name:'Shared',asset_usage:'game_builder',owner:SELLER,glb_url:'/uploads/shared.glb'};
 assert.equal(marketplaceFactoryCatalog({builderListings:[{asset,seller_id:BUYER,listing_status:'active',price_mzk:30}]}).length,0,'stale listings cannot publish another owner’s asset');
 assert.equal(marketplaceFactoryCatalog({builderListings:[{asset,seller_id:SELLER,listing_status:'cancelled',price_mzk:30}]}).length,0);
 assert.equal(marketplaceFactoryCatalog({playerListings:[{sellerId:SELLER,itemId:'unlisted',priceMzk:30,item:{id:'unlisted',modelUrl:'/uploads/shared.glb',listing:{active:false}}}]}).length,0);
});

test('published models without stored prices use the shared MZK catalog rules while explicit invalid prices remain ineligible',()=>{
 // Published model records contain category and modelUrl but do not persist a
 // price. They still need a real production quote instead of vanishing.
 const avatar=normalizeFactoryCatalogItem({id:'published-avatar',name:'Creator Avatar',category:'Avatar',modelUrl:'/uploads/public-avatar.glb',status:'published'});
 assert.ok(avatar);assert.equal(avatar.assetType,'avatars');assert.equal(avatar.priceMzk,300);assert.equal(factoryUnitPriceMzk(avatar),300);
 const prop=normalizeFactoryCatalogItem({id:'published-prop',name:'Creator Prop',modelUrl:'/uploads/public-prop.glb',status:'published'});
 assert.ok(prop);assert.equal(prop.priceMzk,catalogItemPrice(prop));assert.equal(factoryUnitPriceMzk(prop),prop.priceMzk);
 const native=normalizeFactoryCatalogItem({id:'published-native',name:'Native asset',buildAssetId:NATIVE.buildAssetId});
 assert.ok(native);assert.equal(native.priceMzk,catalogItemPrice(native));
 const dollar=normalizeFactoryCatalogItem({id:'priced-avatar',category:'Avatar',modelUrl:'/uploads/priced-avatar.glb',priceUsd:2.5});assert.equal(factoryUnitPriceMzk(dollar),250);
 for(const pricing of [{priceMzk:-1},{priceMzk:NaN},{priceMzk:Infinity},{priceMzk:1.5},{priceMzk:'invalid'},{priceUsd:-2},{priceUsd:NaN},{priceUsd:'invalid'}])assert.equal(normalizeFactoryCatalogItem({id:'bad-price',modelUrl:'/uploads/bad-price.glb',...pricing}),null,JSON.stringify(pricing));
 const data={};ensureWorldSupply(data,{items:[avatar]});assert.equal(factoryProductionItem(data,avatar.id,[avatar]).priceMzk,300);
});

test('base GLB cache queries and fragments preserve canonical price and depleted stock',()=>{
 const data={},ledger=ensureWorldSupply(data),id=canonicalSupplyId(GLB),size=Object.keys(ledger.catalog).length;
 consumeWorldStock(data,GLB,11);
 const resale=normalizeFactoryCatalogItem({id:'query-cached-resale',name:'Cached model resale',modelUrl:GLB.modelUrl+'?version=latest#view',priceMzk:999999});
 assert.ok(resale);ensureWorldSupply(data,{items:[resale]});
 assert.equal(canonicalSupplyId(resale),id);assert.equal(supplyItem(data,resale).supplyId,id);assert.equal(supplyItem(data,resale).priceMzk,supplyItem(data,GLB).priceMzk);
 assert.equal(ledger.worldStock[id],989);assert.equal(Object.keys(ledger.catalog).length,size,'a cache URL cannot create a fresh supply entry');
 assert.equal(factoryLineupItems(data,[resale]).filter(item=>item.supplyId===id).length,1);
});

test('configured blueprints repair legacy creation aliases without claiming the base model identity or stock',()=>{
 const data={},ledger=ensureWorldSupply(data),baseId=canonicalSupplyId(GLB),raw={id:'legacy-custom-variant',type:'custom-item',name:'Legacy red model',modelUrl:GLB.modelUrl,configuration:{color:'#ff0011',scale:1.4},listing:{active:true,priceMzk:80}};
 consumeWorldStock(data,GLB,9);ledger.aliases[raw.id]=baseId;ledger.aliases['store:'+raw.id]=baseId;
 const variant=normalizeFactoryCatalogItem(raw,{priceMzk:80,variantId:'custom:'+raw.id});assert.ok(variant);
 assert.equal(canonicalSupplyId(variant),variant.supplyId);ensureWorldSupply(data,{items:[variant]});
 assert.notEqual(variant.supplyId,baseId);assert.equal(ledger.aliases[raw.id],variant.supplyId);
 assert.equal(supplyItem(data,raw).supplyId,variant.supplyId,'raw owned inventory must resolve the configured creation before its shared model URL');
 assert.equal(supplyItem(data,GLB).supplyId,baseId);assert.equal(supplyItem(data,{modelUrl:GLB.modelUrl}).supplyId,baseId);
 assert.equal(ledger.worldStock[baseId],991);assert.equal(ledger.worldStock[variant.supplyId],1000);
 consumeWorldStock(data,raw,3);ensureWorldSupply(data,{items:[variant]});
 assert.equal(ledger.worldStock[variant.supplyId],997);assert.equal(ledger.worldStock[baseId],991);
});

test('all active native, GLB and artwork marketplace blueprints are priced, quoted and producible without cloning ownership',async t=>{
 const f=await fixture(t),created=await creations(f),items=await f.database.factoryCatalog();
 assert.equal(items.length,6);
 const state=await f.service.state(),saved=await f.database.read();
 const native=items.find(item=>item.id===created.native.id),glb=items.find(item=>item.id===created.glb.id),custom=items.find(item=>item.id===created.custom.id),drawing=items.find(item=>item.id===created.drawing.id);
 assert.equal(native.priceMzk,120,'a native creation keeps its stored production price');assert.equal(glb.priceMzk,90,'new GLB production falls back to the authoritative listing MZK price');
 assert.equal(custom.modelUrl,GLB.modelUrl);assert.notEqual(supplyItem(saved,custom).supplyId,canonicalSupplyId(GLB));
 assert.equal(supplyItem(saved,created.custom).supplyId,custom.supplyId,'owned configured GLBs resolve by creation identity before their base model');
 assert.equal(supplyItem(saved,'builder:'+created.glbListing.listing_id).supplyId,glb.supplyId);
 assert.equal(supplyItem(saved,'player:'+SELLER+':'+created.drawing.id).supplyId,drawing.supplyId);
 assert.deepEqual(glb.function_data,created.glb.function_data);assert.deepEqual(glb.collider_data,created.glb.collider_data);
 const ids=[...new Set(items.map(item=>supplyItem(saved,item).supplyId))];assert.equal(ids.length,6);
 assert.equal(state.catalog.filter(item=>item.modelUrl===GLB.modelUrl&&!item.factoryVariant).length,1,'base-model resales reuse the canonical lineup entry');
 const base=state.catalog.find(item=>item.id===canonicalSupplyId(GLB));assert.notEqual(base.factoryUnitPriceMzk,999999,'a resale asking price cannot override canonical production cost');
 let total=0;const before=(await f.database.get(BUYER)).tokens.MZK,jobs=[];
 for(const [index,itemId]of ids.entries()){
  const item=state.catalog.find(item=>item.id===itemId);assert.ok(item,itemId+' is in the factory lineup');
  const quote=await f.service.action(BUYER,'quote',{itemId,quantity:1});assert.equal(quote.unitPriceMzk,item.factoryUnitPriceMzk);assert.equal(quote.priceMzk,quote.unitPriceMzk);assert.equal(quote.stages.flatMap(stage=>stage.operations).length,12);
  const job=await f.service.action(BUYER,'produce',{itemId,quantity:1,expectedPriceMzk:quote.priceMzk,requestId:'market-build-'+index});jobs.push(job);total+=quote.priceMzk;
 }
 assert.equal((await f.database.get(BUYER)).tokens.MZK,before-total);
 f.now=Math.max(...jobs.map(job=>job.readyAt));const finished=await f.service.state();
 for(const itemId of ids){assert.equal(finished.factoryStock[itemId],1);assert.equal(finished.worldStock[itemId],1000);}
 assert.equal((await f.database.get(BUYER)).items.length,0,'manufactured warehouse output does not grant a seller license or clone inventory identity');
 assert.equal((await f.database.read()).builderOwnership[created.native.id].owner_id,SELLER);
});

test('artwork and configured model snapshots survive edits and unlisting; paid stock can still reach its port and destination',async t=>{
 const f=await fixture(t),created=await creations(f),items=await f.database.factoryCatalog();
 const drawing=items.find(item=>item.id===created.drawing.id),custom=items.find(item=>item.id===created.custom.id);
 const drawingJob=await f.service.action(BUYER,'produce',{itemId:drawing.supplyId,quantity:1,requestId:'paid-artwork'});
 const customJob=await f.service.action(BUYER,'produce',{itemId:custom.supplyId,quantity:1,requestId:'paid-custom-model'});
 assert.equal(drawingJob.blueprint.thumbnailUrl,PNG);assert.deepEqual(drawingJob.blueprint.configuration,created.drawing.configuration);
 assert.deepEqual(customJob.blueprint.configuration,created.custom.configuration);assert.equal(customJob.blueprint.modelUrl,GLB.modelUrl);
 await f.database.transaction(data=>{const item=data.users[SELLER].items.find(item=>item.id===created.drawing.id);item.thumbnailUrl='data:image/png;base64,QUJDRA==';item.configuration.color='#112233';item.listing.active=false;const model=data.users[SELLER].items.find(item=>item.id===created.custom.id);model.configuration.color='#000000';model.listing.active=false;return {};});
 let state=await f.service.state();assert.equal(state.catalog.some(item=>item.id===drawing.supplyId),false);assert.equal(state.catalog.some(item=>item.id===custom.supplyId),false);
 for(const itemId of [drawing.supplyId,custom.supplyId]){
  assert.equal(state.transferCatalog.find(item=>item.id===itemId)?.factoryProducible,false,'existing paid stock remains selectable for shipping after unlisting');
  await assert.rejects(f.service.action(BUYER,'quote',{itemId,quantity:1}),/no longer publicly listed/);
  await assert.rejects(f.service.action(BUYER,'produce',{itemId,quantity:1,requestId:'unlisted-'+itemId}),/no longer publicly listed/);
 }
 f.now=Math.max(drawingJob.readyAt,customJob.readyAt);state=await f.service.state();
 const lot=state.lots.find(lot=>lot.productionId===drawingJob.id);assert.equal(lot.blueprint.thumbnailUrl,PNG);assert.deepEqual(lot.blueprint.configuration,created.drawing.configuration);assert.equal(lot.qualityReceipt.checks.every(check=>check.status==='passed'),true);
 assert.equal(state.lots.find(lot=>lot.productionId===customJob.id).blueprint.configuration.color,created.custom.configuration.color);
 const shipment=await f.service.action(BUYER,'dispatch',{itemId:drawing.supplyId,quantity:1,shippingMapId:'hormuz-shipping',destinationMapId:'market-destination',contractId:'gulf-gateway',requestId:'ship-unlisted-paid-art'});
 const route=SHIPPING_ROUTES.find(route=>route.id===shipment.contractId);assert.equal(shipment.originPortId,route.from);assert.equal(shipment.portTransferTask.quantity,1);assert.equal(shipment.portTransferTask.phase,'staged');
 const identity={walletId:BUYER},player={shipping:{job:null}},startedAt=f.now;
 await f.service.shippingAction(identity,{},player,MAPS[0],{operation:'reserve',shipmentId:shipment.id,contractId:route.id});
 player.shipping.job={id:'marketplace-voyage',phase:'loading',contractId:route.id,environmentId:MAPS[0].id,deadline:f.now+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,MAPS[0],{operation:'bind',shipmentId:shipment.id,jobId:player.shipping.job.id});
 f.now+=120000;const receipt={type:'delivery',shipmentId:shipment.id,jobId:player.shipping.job.id,deliveryId:player.shipping.job.id,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:f.now};
 await f.service.deliver(identity,receipt,MAPS[0]);await f.service.deliver(identity,receipt,MAPS[0]);state=await f.service.state();
 assert.equal(state.maps.find(map=>map.id==='market-destination').stock[drawing.supplyId],1);assert.equal(state.worldStock[drawing.supplyId],1000);assert.equal(state.factoryStock[drawing.supplyId],0);assert.equal(state.stockReceipts.length,1);
});

test('a creation retains its supply identity and depleted stock when a new owner relists it',async t=>{
 const f=await fixture(t),created=await creations(f);await f.service.state();
 const first=(await f.database.factoryCatalog()).find(item=>item.id===created.glb.id),id=first.supplyId;
 await f.database.transaction(data=>{consumeWorldStock(data,first,1000);return {};});
 await f.database.purchaseBuilderAsset(BUYER,created.glbListing.listing_id,'buy-creator-blueprint');
 let state=await f.service.state();assert.equal(state.catalog.some(item=>item.id===id),false);assert.equal(state.worldStock[id],0);
 const newListing=await f.database.listBuilderAsset(BUYER,{assetId:created.glb.id,priceMzk:140});
 state=await f.service.state();const relisted=state.catalog.find(item=>item.id===id);assert.ok(relisted);assert.equal(relisted.priceMzk,140);assert.equal(state.worldStock[id],0);
 const data=await f.database.read();assert.equal(supplyItem(data,'builder:'+newListing.listing_id).supplyId,id);assert.equal(factoryProductionItem(data,id,await f.database.factoryCatalog()).supplyId,id);
 assert.equal(factoryLineupItems(data,await f.database.factoryCatalog()).filter(item=>item.supplyId===id).length,1);
 assert.equal(data.builderOwnership[created.glb.id].owner_id,BUYER);
 const restarted=JSON.parse(JSON.stringify(data));ensureWorldSupply(restarted,{items:await f.database.factoryCatalog()});assert.equal(restarted.worldSupply.worldStock[id],0);
});
