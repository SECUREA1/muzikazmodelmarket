import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {MzkAccountStore} from '../loadout-code-store.mjs';
import {IN_GAME_BUILDING_ITEMS,createBuildingCatalog} from '../public/js/in-game-building-catalog.js';

test('free basics, paid ownership, use charges and member resale form one economy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'game-economy-'));
 try{
 const store=new MzkAccountStore(join(dir,'accounts.json')),db=new UserJsonDatabase(join(dir,'users.json'));
 const alice=await store.freePlayLogin('EconomyAlice','economy-alice-password'),bob=await store.freePlayLogin('EconomyBob','economy-bob-password');
 const a=(await db.ensureAccount(alice)).walletId,b=(await db.ensureAccount(bob)).walletId;
 const catalog=await db.economy(a),start=catalog.balance;
 for(const sku of ['tool:laser','tool:brick','tool:repair-tool','material:studs']){const item=catalog.items.find(row=>row.sku===sku);assert.equal(item.owned,true);assert.equal(item.priceMzk,0);assert.equal(item.useCostMzk,0);}
 assert.equal(catalog.items.find(item=>item.sku==='tool:jetpack').owned,false);
 await assert.rejects(db.economyAction(a,'use','tool:jetpack','locked-use'),/Purchase/);
 const buy=await db.economyAction(a,'buy','tool:jetpack','buy-jetpack');assert.equal(buy.balanceAfterMzk,start-750);
 assert.equal((await db.economyAction(a,'buy','tool:jetpack','buy-jetpack')).id,buy.id);
 await assert.rejects(db.economyAction(a,'buy','tool:jetpack','buy-again'),/already owned/);
 await db.economyAction(a,'use','tool:jetpack','fly-once');await db.economyAction(a,'use','tool:jetpack','fly-once');assert.equal((await db.get(a)).tokens.MZK,start-751);
 const owned=(await db.get(a)).items.find(item=>item.economySku==='tool:jetpack');
 await db.listItem(a,owned.id,400);
 await db.trade({buyerId:b,sellerId:a,itemId:owned.id,requestId:'trade-jetpack',expectedPriceMzk:400});
 await assert.rejects(db.economyAction(a,'use','tool:jetpack','sold-use'),/Purchase/);
 assert.equal((await db.gameplaySpending()).wallets.find(row=>row.walletId===a).spentMzk,751);
 await db.economyAction(b,'use','tool:jetpack','new-owner-use');assert.equal((await db.get(b)).tokens.MZK,start-401);
 const basic=(await db.get(a)).items.find(item=>item.source==='mzk-access-code');await assert.rejects(db.listItem(a,basic.id,100),/cannot be resold/);
 await db.spendGameplay(b,{amountMzk:start-401,requestId:'spend-rest',gameId:'test'});
 await assert.rejects(db.economyAction(b,'buy','tool:scanner','poor-buy'),/Not enough/);
 assert.equal((await db.economy(b)).items.find(item=>item.sku==='tool:scanner').owned,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('every in-game builder option has an upgrade catalog entry',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.match(source,/createBuildingCatalog\(gameEconomy\?\.items\|\|\[\]\)/);
 assert.ok(IN_GAME_BUILDING_ITEMS.length>50);
 const catalogue=createBuildingCatalog(GAME_ECONOMY);
 for(const asset of IN_GAME_BUILDING_ITEMS){const upgrade=GAME_ECONOMY.find(item=>item.buildAssetId===asset.buildAssetId||asset.materialId&&item.materialId===asset.materialId);assert.ok(upgrade,asset.id+' has a purchasable upgrade');assert.ok(catalogue.some(item=>item.buildAssetId===asset.buildAssetId&&item.economySku===upgrade.sku),asset.id+' retains its purchase identity in the live catalogue');}
});
