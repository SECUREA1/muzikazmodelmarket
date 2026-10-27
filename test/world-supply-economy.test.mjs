import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {GAME_ECONOMY,GAME_BUNDLES,CARE_SUPPLIES} from '../game-economy.mjs';
import {canonicalSupplyId,ensureWorldSupply} from '../world-supply.mjs';
import {materialBulkQuote} from '../public/js/game-item-pricing.js';

async function database(t){
 const dir=await mkdtemp(join(tmpdir(),'world-stock-economy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put('supply-alice',{tokens:{MZK:1000000},items:[]});
 await db.put('supply-bob',{tokens:{MZK:1000000},items:[]});
 return db;
}
const stock=async(db,item)=>(await db.read()).worldSupply.worldStock[canonicalSupplyId(item)];

test('finite catalog stock is seeded once, purchase retries and concurrent last-unit sales conserve stock',async t=>{
 const db=await database(t),item=GAME_ECONOMY.find(item=>item.sku==='tool:scanner');
 assert.equal(await stock(db,item),1000);
 await db.transaction(data=>{data.worldSupply.worldStock[canonicalSupplyId(item)]=1;return true;});
 const sales=await Promise.allSettled(['supply-alice','supply-bob'].map(wallet=>db.economyAction(wallet,'buy',item.sku,'last-scanner')));
 assert.equal(sales.filter(result=>result.status==='fulfilled').length,1);
 assert.match(sales.find(result=>result.status==='rejected').reason.message,/out of stock/i);
 const winner=sales[0].status==='fulfilled'?'supply-alice':'supply-bob',loser=winner==='supply-alice'?'supply-bob':'supply-alice';
 const receipt=await db.economyAction(winner,'buy',item.sku,'last-scanner');
 assert.equal(receipt.id,sales.find(result=>result.status==='fulfilled').value.id);
 assert.equal(await stock(db,item),0);
 assert.equal((await db.get(loser)).tokens.MZK,1000000);
 const restarted=new UserJsonDatabase(db.file),view=await restarted.economy(loser);
 assert.equal(view.items.find(row=>row.sku===item.sku).worldStock,0);
 await assert.rejects(restarted.economyAction(loser,'buy',item.sku,'empty-scanner'),/out of stock/i);
 // A durable owned tool can still be used without buying another tool unit.
 await restarted.economyAction(winner,'use',item.sku,'scan');
 assert.equal(await stock(restarted,item),0);
});

test('bulk material stock is debited once while prepaid deployments consume the reserved credits',async t=>{
 const db=await database(t),item=GAME_ECONOMY.find(item=>item.sku==='material:wall'),quote=materialBulkQuote(item,1000);
 const [receipt,retry]=await Promise.all([db.buyMaterialBulk('supply-alice',item.sku,1000,quote.priceMzk,'all-wall'),db.buyMaterialBulk('supply-alice',item.sku,1000,quote.priceMzk,'all-wall')]);
 assert.equal(receipt.id,retry.id);assert.equal(await stock(db,item),0);
 await db.economyAction('supply-alice','use',item.sku,'prepaid-wall');
 assert.equal((await db.get('supply-alice')).memory.materialCredits[item.sku],999);
 assert.equal(await stock(db,item),0);
 const before=await db.get('supply-bob');
 await assert.rejects(db.buyMaterialBulk('supply-bob',item.sku,1,item.unitPriceMzk,'over-wall'),/out of stock/i);
 assert.deepEqual(await db.get('supply-bob'),before);
});

test('bundle shortages roll back every line and successful bundles debit each included quantity once',async t=>{
 const db=await database(t),bundle=GAME_BUNDLES.find(bundle=>bundle.category==='Builder furniture');
 const quote=(await db.economy('supply-alice')).bundles.find(row=>row.id===bundle.id),last=quote.entries.at(-1);
 await db.transaction(data=>{data.worldSupply.worldStock[canonicalSupplyId(last.sku)]=0;return true;});
 const before=await db.get('supply-alice'),stockBefore={...(await db.read()).worldSupply.worldStock};
 await assert.rejects(db.buyEconomyBundle('supply-alice',bundle.id,quote.priceMzk,'empty-bundle'),/out of stock/i);
 assert.deepEqual(await db.get('supply-alice'),before);assert.deepEqual((await db.read()).worldSupply.worldStock,stockBefore);
 await db.transaction(data=>{data.worldSupply.worldStock[canonicalSupplyId(last.sku)]=5;return true;});
 const receipt=await db.buyEconomyBundle('supply-alice',bundle.id,quote.priceMzk,'available-bundle');
 await db.buyEconomyBundle('supply-alice',bundle.id,quote.priceMzk,'available-bundle');
 assert.equal(receipt.type,'GAME_BUNDLE_PURCHASE');
 for(const entry of quote.entries)assert.equal(await stock(db,entry.sku),entry===last?4:1000-entry.quantity);
});

test('native asset licenses and later physical deployments each consume a unit',async t=>{
 const db=await database(t),item=GAME_ECONOMY.find(item=>item.kind==='asset'&&!item.basic&&item.buildAssetId);
 await db.economyAction('supply-alice','buy',item.sku,'asset-license');
 assert.equal(await stock(db,item),999);
 await db.economyAction('supply-alice','use',item.sku,'asset-deploy');
 await db.economyAction('supply-alice','use',item.sku,'asset-deploy');
 assert.equal(await stock(db,item),998);
 await db.transaction(data=>{data.worldSupply.worldStock[canonicalSupplyId(item)]=0;return true;});
 const before=await db.get('supply-alice');
 await assert.rejects(db.economyAction('supply-alice','use',item.sku,'asset-empty'),/out of stock/i);
 assert.deepEqual(await db.get('supply-alice'),before);
});

test('GLB store aliases share catalog stock and trusted new GLBs persist their finite stock',async t=>{
 const db=await database(t),item=GAME_ECONOMY.find(item=>item.modelUrl&&!item.basic),resolved={id:'store-model-'+item.id,catalogId:item.id,name:item.name,modelUrl:'/'+item.modelUrl.replace(/^\//,''),quantity:2};
 await db.purchaseStoreModels('supply-alice',[resolved],50,'store-glb');
 await db.purchaseStoreModels('supply-alice',[resolved],50,'store-glb');
 assert.equal(await stock(db,item),998);
 const uploaded={id:'published-supply-glb',name:'Published supply GLB',modelUrl:'/uploads/models/supply.glb',quantity:3};
 await db.purchaseStoreModels('supply-alice',[uploaded],30,'store-upload');
 const ledger=(await db.read()).worldSupply,id=ledger.aliases[uploaded.id];
 assert.equal(ledger.worldStock[id],997);
 const restarted=new UserJsonDatabase(db.file);await restarted.economy('supply-alice');
 assert.equal((await restarted.read()).worldSupply.worldStock[id],997);
});

test('care purchases debit units, personal consumption does not debit another unit, and map zero stock blocks sales',async t=>{
 const db=await database(t),item=CARE_SUPPLIES[0],id='care:'+item.id;
 await db.rpgAction('supply-alice','buy',item.id,'care-purchase');
 assert.equal(await stock(db,id),999);
 const owned=(await db.get('supply-alice')).items.find(row=>row.catalogId===item.id);
 await db.rpgAction('supply-alice','use',owned.id,'care-use');
 assert.equal(await stock(db,id),999);
 await db.transaction(data=>{const ledger=ensureWorldSupply(data,{maps:[{id:'supply-map',name:'Supply map'}]});ledger.maps['supply-map'].stock[id]=0;return true;});
 const before=await db.get('supply-bob');
 await assert.rejects(db.rpgAction('supply-bob','buy',item.id,'empty-map-care','supply-map'),/out of stock/i);
 assert.deepEqual(await db.get('supply-bob'),before);assert.equal(await stock(db,id),999);
});

test('paid store orders remain unfulfilled on shortage and deliver exactly once after restocking',async t=>{
 const db=await database(t),accountId='paid-supply-member';
 await db.ensureAccount({accountId,mzkBalance:100,gameAssets:[],landAssets:[],bottleClaims:[]});
 const item=GAME_ECONOMY.find(item=>item.modelUrl&&!item.basic),id=canonicalSupplyId(item),order={orderId:'paid-supply-order',memberAccountId:accountId,purchaseType:'MARKETPLACE',paymentStatus:'PAID',metadata:{items:[{quantity:2,price:25,deliverable:{id:'repository-'+item.id,name:item.name,modelUrl:item.modelUrl}}]}};
 await db.transaction(data=>{data.worldSupply.worldStock[id]=1;return true;});
 const before=await db.get('account:'+accountId);
 await assert.rejects(db.fulfillStoreOrder('account:'+accountId,order),/out of stock/i);
 assert.deepEqual(await db.get('account:'+accountId),before);assert.equal(await stock(db,item),1);
 await db.transaction(data=>{data.worldSupply.worldStock[id]=2;return true;});
 const delivered=await db.fulfillStoreOrder('account:'+accountId,order),replay=await db.fulfillStoreOrder('account:'+accountId,order);
 assert.equal(delivered.id,replay.id);assert.equal(delivered.items.length,2);assert.equal(await stock(db,item),0);
});
