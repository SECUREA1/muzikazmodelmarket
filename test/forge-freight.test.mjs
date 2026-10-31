import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {forgeCommand,resolveForgeAsset} from '../server-forge.mjs';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {FORGE_RECIPES,FORGE_STRIKE_COOLDOWN_MS} from '../public/js/forge-recipes.js';
import {migrateGameplayWallet} from '../gameplay-wallet-migration.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'forge-freight-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(directory,'users.json')),smith='account:freight-smith',buyer='account:freight-buyer';
 for(const wallet of [smith,buyer])await db.put(wallet,{tokens:{MZK:10000},items:[]});
 let now=1000000,sequence=0;
 const maps=[{id:'traditional-forge',name:'Traditional Forge',game:'forge'},{id:'hormuz-shipping',name:'Shipping'},{id:'forge-shop',name:'Forge Shop'}],options={maps:async()=>maps,now:()=>now},service=new WorldSupplyService(db,options),environment=maps[0],player={actorId:smith,walletId:smith,position:{...FORGE_STATIONS[0].approach},health:100,grounded:true},sim={actors:{},players:{}};
 sim.players[smith]=player;
 const send=(action,fields={})=>forgeCommand(sim,player,environment,{action,requestId:'forge-freight-work-'+ ++sequence,...fields},now,{database:db,walletId:smith});
 const at=kind=>player.position={...FORGE_STATIONS.find(station=>station.kind===kind).approach};
 const craft=async()=>{
  const recipe=FORGE_RECIPES[0];at('sourcing');const funded=await send('forge-start',{recipeId:recipe.id}),jobId=funded.forge.job.id;
  at('heat');await send('forge-heat',{jobId});now+=recipe.heatMs;await send('forge-status');at('hammer');
  for(let i=0;i<recipe.hammerStrikes;i++){now+=FORGE_STRIKE_COOLDOWN_MS;await send('forge-hammer',{jobId});}
  at('quench');await send('forge-quench',{jobId});at('temper');await send('forge-temper',{jobId});now+=recipe.temperMs;await send('forge-status');at('finish');return (await send('forge-finish',{jobId})).item;
 };
 return {db,smith,buyer,service,options,maps,craft,get now(){return now;},set now(value){now=value;}};
}
async function sail(f,shipment){
 const route=SHIPPING_ROUTES.find(route=>route.id===shipment.contractId),identity={walletId:f.smith},environment=f.maps[1],player={shipping:{}},sim={};
 await f.service.shippingAction(identity,sim,player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:route.id});
 const startedAt=f.now,jobId='forge-sea-'+shipment.id;
 player.shipping.job={id:jobId,phase:'loading',contractId:route.id,environmentId:environment.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,sim,player,environment,{operation:'bind',shipmentId:shipment.id,jobId});
 const result={type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};
 f.now=result.deliveredAt;
 await f.service.deliver(identity,result,environment,f.now);return {identity,result,environment};
}

test('a hand-forged Backpack item becomes one sealed counted lot, survives replay and cannot be restored as a second item',async t=>{
 const f=await fixture(t),item=await f.craft(),sku='native:'+item.buildAssetId;
 const workspace=await f.service.state({walletId:f.smith});assert.equal(workspace.exportableForgeItems[0].id,item.id);assert.deepEqual((await f.service.state()).exportableForgeItems,[]);
 await f.db.listItem(f.smith,item.id,250);
 await assert.rejects(f.service.action(f.smith,'export-forge',{itemId:item.id,requestId:'listed-export'}),/Trading Market/);
 await f.db.listItem(f.smith,item.id,250,false);
 const balance=(await f.db.get(f.smith)).tokens.MZK,input={itemId:item.id,requestId:'seal-once'},sealed=await f.service.action(f.smith,'export-forge',input);
 assert.equal(sealed.itemId,sku);assert.equal(sealed.quantity,1);assert.equal((await f.db.get(f.smith)).items.some(row=>row.id===item.id),false);
 const data=await f.db.read();assert.equal(data.worldSupply.factoryStock[sku],1);assert.equal(data.worldSupply.worldStock[sku],1000);assert.equal(data.worldSupply.factoryLots[sealed.lotId].origin,'traditional-forge');assert.equal(data.forge.accounts[f.smith].job.exportLotId,sealed.lotId);
 assert.equal((await f.db.get(f.smith)).tokens.MZK,balance);assert.equal(await resolveForgeAsset(f.db,f.smith,item.id),null);
 const reopened=new WorldSupplyService(new UserJsonDatabase(f.db.file),f.options);assert.deepEqual(await reopened.action(f.smith,'export-forge',input),sealed);assert.equal((await reopened.state()).factoryStock[sku],1);
 await assert.rejects(reopened.action(f.smith,'export-forge',{...input,requestId:'seal-again'}),/already sealed/);
 await f.db.transaction(data=>{data.users[f.smith].items.push(item);});
 assert.equal(await resolveForgeAsset(f.db,f.smith,item.id),null);await assert.rejects(f.db.listItem(f.smith,item.id,100),/verified/);
 await assert.rejects(f.service.action(f.buyer,'export-forge',{itemId:item.id,requestId:'steal-export'}),/already sealed|Backpack/);
 assert.equal((await f.service.state({walletId:f.smith})).exportableForgeItems.length,0);
});

test('forge export dispatch reserves its real lot, sea delivery restocks a map, and a store buyer receives canonical equipment',async t=>{
 const f=await fixture(t),item=await f.craft(),sku='native:'+item.buildAssetId,sealed=await f.service.action(f.smith,'export-forge',{itemId:item.id,requestId:'seal-for-voyage'});
 const shipment=await f.service.action(f.smith,'dispatch',{itemId:sku,quantity:1,sourceMapId:'factory',destinationMapId:'forge-shop',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'dispatch-forged'});
 let data=await f.db.read();assert.equal(data.worldSupply.factoryStock[sku],0);assert.deepEqual(data.worldSupply.factoryLotAllocations[shipment.id].lots,[{lotId:sealed.lotId,quantity:1}]);assert.equal(data.worldSupply.maps['forge-shop'].stock[sku],undefined);assert.equal(data.forge.accounts[f.smith].commerce?.deliveries||0,0);
 const voyage=await sail(f,shipment);
 data=await f.db.read();assert.equal(data.worldSupply.maps['forge-shop'].stock[sku],1);assert.equal(data.forge.accounts[f.smith].commerce.deliveries,1);
 await f.service.deliver(voyage.identity,voyage.result,voyage.environment,f.now);await f.service.state();assert.equal((await f.db.read()).forge.accounts[f.smith].commerce.deliveries,1);
 await f.db.economyAction(f.buyer,'buy',sku,'buy-delivered-forge','forge-shop');
 assert.equal((await f.db.read()).worldSupply.maps['forge-shop'].stock[sku],0);const bought=await resolveForgeAsset(f.db,f.buyer,'economy:'+sku);assert.equal(bought.buildAssetId,item.buildAssetId);assert.equal(bought.function_data.forgeProduct,item.buildAssetId);assert.equal((await f.db.read()).forge.accounts[f.buyer].commerce.stockOrders,1);
 await f.db.economyAction(f.buyer,'buy',sku,'buy-delivered-forge','forge-shop');assert.equal((await f.db.read()).forge.accounts[f.buyer].commerce.stockOrders,1);
});

test('cancelling a queued forged shipment returns one warehouse unit and never revives the consumed Backpack copy or earns delivery credit',async t=>{
 const f=await fixture(t),item=await f.craft(),sku='native:'+item.buildAssetId;await f.service.action(f.smith,'export-forge',{itemId:item.id,requestId:'seal-cancel'});
 const shipment=await f.service.action(f.smith,'dispatch',{itemId:sku,quantity:1,destinationMapId:'forge-shop',requestId:'dispatch-cancel'});
 await f.service.action(f.smith,'cancel',{shipmentId:shipment.id,requestId:'cancel-sealed-shipment'});
 const data=await f.db.read();assert.equal(data.worldSupply.factoryStock[sku],1);assert.equal(data.worldSupply.maps['forge-shop'].stock[sku],undefined);assert.equal(data.forge.accounts[f.smith].commerce?.deliveries||0,0);assert.equal(await resolveForgeAsset(f.db,f.smith,item.id),null);assert.equal(data.users[f.smith].items.length,0);
});


test('wallet connection carries an exported forge lot supplier and its future delivery credit to the connected wallet',async t=>{
 const f=await fixture(t),item=await f.craft(),sku='native:'+item.buildAssetId,sealed=await f.service.action(f.smith,'export-forge',{itemId:item.id,requestId:'seal-before-link'}),old=f.smith,next='0x'+'e'.repeat(40);
 await f.db.transaction(data=>{data.users[next]={...data.users[old],walletId:next};migrateGameplayWallet(data,old,next);for(const receipt of data.transactions)if(receipt.walletId===old)receipt.walletId=next;delete data.users[old];});
 const migrated=await f.db.read();assert.equal(migrated.worldSupply.factoryLots[sealed.lotId].forgeWalletId,next);assert.equal(migrated.forge.accounts[next].job.exportLotId,sealed.lotId);
 const shipment=await f.service.action(next,'dispatch',{itemId:sku,quantity:1,sourceMapId:'factory',destinationMapId:'forge-shop',requestId:'dispatch-after-link'});f.smith=next;await sail(f,shipment);
 const data=await f.db.read();assert.equal(data.forge.accounts[next].commerce.deliveries,1);assert.equal(data.forge.accounts[old],undefined);
});
