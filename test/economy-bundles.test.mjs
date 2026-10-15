import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GAME_ECONOMY,GAME_BUNDLES,CARE_SUPPLIES,economyBundles} from '../game-economy.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {MzkAccountStore} from '../loadout-code-store.mjs';
async function member(run){const dir=await mkdtemp(join(tmpdir(),'bundles-'));try{const accounts=new MzkAccountStore(join(dir,'accounts.json')),db=new UserJsonDatabase(join(dir,'users.json'));const account=await accounts.freePlayLogin('BundlePlayer','bundle-player-password'),wallet=(await db.ensureAccount(account)).walletId;await run(db,wallet);}finally{await rm(dir,{recursive:true,force:true});}}

test('every paid platform item and care supply belongs to a discount bundle',()=>{
 const upgrades=new Set(GAME_BUNDLES.flatMap(bundle=>bundle.entries.map(item=>item.sku)));
 for(const item of GAME_ECONOMY.filter(item=>!item.basic))assert.ok(upgrades.has(item.sku),item.name);
 const supplies=new Set(GAME_BUNDLES.flatMap(bundle=>bundle.entries.map(item=>item.catalogId)));
 for(const item of CARE_SUPPLIES)assert.ok(supplies.has(item.id));
 for(const bundle of economyBundles({items:[]})){assert.equal(bundle.discountPercent,20);assert.ok(bundle.priceMzk<bundle.subtotalMzk);assert.equal(bundle.priceMzk+bundle.savingsMzk,bundle.subtotalMzk);}
});

test('bundle prices exclude owned items, unlock all remaining items atomically and replay once',()=>member(async(db,wallet)=>{
 const bundle=GAME_BUNDLES.find(bundle=>bundle.category==='Builder furniture');
 await db.economyAction(wallet,'buy',bundle.entries[0].sku,'single-item');
 const before=await db.get(wallet),quote=(await db.economy(wallet)).bundles.find(item=>item.id===bundle.id);
 assert.equal(quote.ownedCount,1);assert.equal(quote.entries.length,bundle.entries.length-1);
 const [receipt,replay]=await Promise.all([db.buyEconomyBundle(wallet,bundle.id,quote.priceMzk,'purchase-bundle'),db.buyEconomyBundle(wallet,bundle.id,quote.priceMzk,'purchase-bundle')]);assert.equal(receipt.id,replay.id);
 const after=await db.get(wallet);assert.equal(after.tokens.MZK,before.tokens.MZK-quote.priceMzk);
 for(const item of bundle.entries)assert.equal(after.items.filter(owned=>owned.economySku===item.sku).length,1);
 assert.equal((await db.economy(wallet)).bundles.find(item=>item.id===bundle.id).owned,true);
 await assert.rejects(db.buyEconomyBundle(wallet,bundle.id,0,'repeat-owned'),/already owned/);
 assert.ok((await db.gameplaySpending()).transactions.some(row=>row.id===receipt.id));
}));

test('stale prices and insufficient funds do not charge or grant part of a bundle',()=>member(async(db,wallet)=>{
 const quote=(await db.economy(wallet)).bundles[0],before=await db.get(wallet);
 await assert.rejects(db.buyEconomyBundle(wallet,quote.id,quote.priceMzk-1,'stale-price'),/price changed/);
 assert.deepEqual(await db.get(wallet),before);
 await db.spendGameplay(wallet,{amountMzk:before.tokens.MZK,requestId:'empty-balance'});const empty=await db.get(wallet);
 await assert.rejects(db.buyEconomyBundle(wallet,quote.id,quote.priceMzk,'insufficient'),/Not enough/);
 assert.deepEqual(await db.get(wallet),empty);
 assert.throws(()=>db.buyEconomyBundle(wallet,'unknown',1,'unknown-bundle'),/no longer available/);
}));

test('care bundles deliver usable supplies and can be repurchased without replay double charges',()=>member(async(db,wallet)=>{
 const quote=(await db.economy(wallet)).bundles.find(item=>item.category==='Care supplies · hydration');
 const first=await db.buyEconomyBundle(wallet,quote.id,quote.priceMzk,'care-bundle');
 assert.equal((await db.buyEconomyBundle(wallet,quote.id,quote.priceMzk,'care-bundle')).id,first.id);
 let owned=(await db.rpgState(wallet)).items;assert.equal(owned.length,quote.entries.length);
 await db.rpgAction(wallet,'use',owned[0].id,'use-supply');
 await db.buyEconomyBundle(wallet,quote.id,quote.priceMzk,'care-second');
 owned=(await db.rpgState(wallet)).items;assert.equal(owned.length,quote.entries.length*2-1);
}));
