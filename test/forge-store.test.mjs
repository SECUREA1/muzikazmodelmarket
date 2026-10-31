import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as T from '../public/vendor/three/three.module.min.js';
import {FORGE_ITEMS} from '../public/js/forge-items.js';
import {FORGE_STORE_ASSETS,isForgeStoreDeliverable,resolveStoreCart} from '../store-catalog.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {resolveForgeAsset} from '../server-forge.mjs';
import {forgeWorld} from '../forge-world.mjs';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {storeDisplayProducts,storeFixtureProducts,createStoreProductDisplays} from '../public/js/store-product-displays.js';
import vm from 'node:vm';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('web carts retain native forge identity and the server replaces untrusted details with the canonical item',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8'),normalizer=source.slice(source.indexOf('function normalizeDeliverable('),source.indexOf('function addCartLine('));
 const context=vm.createContext({});vm.runInContext(normalizer,context);
 const item=vm.runInContext("normalizeDeliverable({buildAssetId:'forge-lantern',name:'Forged fake',modelUrl:'https://invalid.example/not-the-lantern.glb',priceMzk:0})",context);
 assert.equal(item.buildAssetId,'forge-lantern');assert.equal(item.modelUrl,undefined);assert.equal(item.format,'procedural-3d');
 const quote=resolveStoreCart([{quantity:1,price:0,deliverable:item}],[]);
 assert.equal(quote.items[0].name,FORGE_ITEMS['forge-lantern'].name);assert.equal(quote.items[0].priceUsd,FORGE_ITEMS['forge-lantern'].priceMzk/100);assert.equal(quote.items[0].behavior,'switch');
 assert.throws(()=>resolveStoreCart([{quantity:1,deliverable:{id:'native-forge-nonexistent',buildAssetId:'forge-nonexistent'}}],[]),/catalog model/);
});

test('every forge native has a canonical store quote and purchased outputs retain verified Backpack/trade provenance',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-store-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'users.json'),database=new UserJsonDatabase(path),account={accountId:'forge-store-maker',mzkBalance:100000},buyer={accountId:'forge-store-buyer',mzkBalance:100000};
 const wallet=(await database.ensureAccount(account)).walletId,buyerWallet=(await database.ensureAccount(buyer)).walletId;
 assert.equal(FORGE_STORE_ASSETS.length,Object.keys(FORGE_ITEMS).length);
 const quote=resolveStoreCart(Object.keys(FORGE_ITEMS).map(id=>({quantity:1,price:0,deliverable:{id,modelUrl:'https://invalid.example/fake.glb',buildAssetId:'material:cube'}})),[]);
 assert.equal(quote.items.length,Object.keys(FORGE_ITEMS).length);
 for(const item of quote.items){assert.equal(item.priceUsd,FORGE_ITEMS[item.buildAssetId].priceMzk/100);assert.equal(item.economySku,'native:'+item.buildAssetId);assert.equal(item.modelUrl,'');assert.equal(item.function_data.behavior,FORGE_STORE_ASSETS.find(asset=>asset.buildAssetId===item.buildAssetId).function_data.behavior);assert.ok(isForgeStoreDeliverable(item));}
 assert.equal(isForgeStoreDeliverable({...quote.items[0],buildAssetId:'material:cube'}),false);
 assert.equal(isForgeStoreDeliverable({...quote.items[0],modelUrl:'https://invalid.example/forged.glb'}),false);
 const receipt=await database.purchaseStoreModels(wallet,quote.items,quote.amountMzk,'forge-store-mzk');
 assert.equal((await database.purchaseStoreModels(wallet,quote.items,quote.amountMzk,'forge-store-mzk')).id,receipt.id);
 const reloaded=new UserJsonDatabase(path),inventory=await reloaded.economy(wallet);
 assert.equal(inventory.balance,100000-quote.amountMzk);
 const blade=receipt.items.find(item=>item.buildAssetId==='forge-damascus-blade');
 assert.equal((await resolveForgeAsset(reloaded,wallet,blade.id)).buildAssetId,'forge-damascus-blade');
 await reloaded.listItem(wallet,blade.id,55);await reloaded.trade({buyerId:buyerWallet,sellerId:wallet,itemId:blade.id,requestId:'store-blade-resale',expectedPriceMzk:55});
 assert.equal(await resolveForgeAsset(reloaded,wallet,blade.id),null);assert.equal((await resolveForgeAsset(reloaded,buyerWallet,blade.id)).buildAssetId,'forge-damascus-blade');
 const order={orderId:'forge-verified-order',memberAccountId:account.accountId,purchaseType:'MARKETPLACE',paymentStatus:'PAID',metadata:{items:quote.items.filter(item=>item.buildAssetId==='forge-warhammer').map(item=>({quantity:1,price:item.priceUsd,deliverable:item}))}};
 const verified=await reloaded.fulfillStoreOrder(wallet,order);assert.equal((await reloaded.fulfillStoreOrder(wallet,order)).id,verified.id);
 assert.equal((await resolveForgeAsset(reloaded,wallet,verified.items[0].id)).buildAssetId,'forge-warhammer');
});

test('forge bazaar uses the live market device and curated shelves preserve real offer identities',async()=>{
 const world=forgeWorld(),scene=world.builderScene,kiosk=scene.objects.find(object=>object.id==='forge-market-kiosk'),manifest=compileBuilderScene(scene),device=manifest.actors.find(actor=>actor.objectId===kiosk.id);
 assert.equal(kiosk.modelId,'market-atm');assert.equal(device.gameplay.device,'market-atm');assert.equal(device.gameplay.behavior,'interact');assert.ok(scene.layoutMeta.locations.some(location=>location.id==='forge-market'));
 const shelf=scene.objects.find(object=>object.id==='forge-shop-plinth-0'),root=new T.Group();root.userData={modelId:shelf.modelId,functionalSettings:shelf.functionalSettings};
 const records=[{id:'ordinary-offer',sku:'native:treasure-chest',buildAssetId:'treasure-chest',name:'Chest',priceMzk:25},{id:'seller-blade',sellerId:'smith',itemId:'earned-blade',buildAssetId:'forge-damascus-blade',name:'Forged Blade',priceMzk:350},{id:'native-shield',sku:'native:forge-aegis-shield',buildAssetId:'forge-aegis-shield',name:'Shield',priceMzk:460}],products=storeDisplayProducts(records),selected=storeFixtureProducts(products,root);
 assert.equal(selected.length,1);assert.equal(selected[0].identity,'player:smith:earned-blade');assert.equal(selected[0].record,records[1]);
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>[root],getPosition:()=>new T.Vector3(),loadProducts:async()=>records,loadModel:async()=>({root:new T.Mesh(new T.BoxGeometry(.3,1,.1),new T.MeshStandardMaterial())}),disposeModel:()=>{}});
 try{manager.update(.5);for(let i=0;i<4;i++){await flush();manager.update(.5);}assert.equal(manager.snapshot().active,1);assert.equal(manager.snapshot().fixtures[0].productId,'player:smith:earned-blade');}
 finally{manager.dispose();}
});

test('forge shop location reaches its live MZK market terminal in the authoritative room',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-shop-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=forgeWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1_000_000}),identity={accountId:'forge-shop-reviewer',walletId:'account:forge-shop-reviewer',username:'Shopper'};
 await runtime.command(world.id,world,identity,{action:'join',requestId:'forge-shop-join'});
 const arrival=await runtime.command(world.id,world,identity,{action:'map-access',locationId:'forge-market',requestId:'forge-shop-arrive'});
 assert.ok(Math.hypot(arrival.players[arrival.selfId].position.x-29,arrival.players[arrival.selfId].position.z-27)<5);
 const opened=await runtime.command(world.id,world,identity,{action:'interact',entityId:'forge-market-kiosk',requestId:'forge-shop-open'});
 assert.equal(opened.result.deviceId,'forge-market-kiosk');assert.equal(opened.result.deviceKind,'market');
});
