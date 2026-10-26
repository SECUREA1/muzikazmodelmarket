import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';import {GAME_ECONOMY,economyItem} from '../game-economy.mjs';import {LAND_VALUES,materialBulkQuote} from '../public/js/game-item-pricing.js';
test('value pricing uses cents at 100 MZK per dollar and explicit land tiers',()=>{
 assert.equal(GAME_ECONOMY.find(item=>item.buildAssetId==='armchair').priceMzk,25);assert.equal(economyItem('material:wall').priceMzk,5);
 for(const item of GAME_ECONOMY.filter(item=>!item.basic&&!item.earnedOnly)){assert.ok(item.priceMzk>=5&&item.priceMzk<=1000,item.sku);if(item.priceMzk<10)assert.match(item.materialId||item.buildAssetId||item.name,/wall/i);}
 for(const item of GAME_ECONOMY.filter(item=>item.earnedOnly))assert.equal(item.priceMzk,0,'delivery stock has no purchase price');
 assert.equal(Math.min(...Object.values(LAND_VALUES).map(item=>item.priceMzk)),5000);assert.equal(Math.max(...Object.values(LAND_VALUES).map(item=>item.priceMzk)),25000);
 const wall=economyItem('material:wall');assert.equal(materialBulkQuote(wall,10).priceMzk,50);assert.equal(materialBulkQuote(wall,50).priceMzk,225);assert.equal(materialBulkQuote(wall,100).priceMzk,400);
 for(const quantity of [0,-1,1.2,1001,'100',NaN])assert.throws(()=>materialBulkQuote(wall,quantity));
});
test('bulk materials debit once, persist quantities, and fund actual placements before per-use charges',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'material-bulk-'));try{
 let db=new UserJsonDatabase(join(dir,'users.json'));await db.put('builder',{tokens:{MZK:1000},items:[]});
 await assert.rejects(db.buyMaterialBulk('builder','material:wall',100,1,'bad-price'),/price changed/);assert.equal((await db.get('builder')).tokens.MZK,1000);
 const [a,b]=await Promise.all([db.buyMaterialBulk('builder','material:wall',100,400,'same-order'),db.buyMaterialBulk('builder','material:wall',100,400,'same-order')]);assert.equal(a.id,b.id);assert.equal((await db.get('builder')).tokens.MZK,600);
 assert.equal((await db.economy('builder')).items.find(item=>item.sku==='material:wall').stock,100);assert.equal((await db.get('builder')).items.filter(item=>item.economySku==='material:wall').length,1);
 await assert.rejects(db.buyMaterialBulk('builder','material:wall',50,225,'same-order'),/another material/);
 await db.economyAction('builder','use','material:wall','place-1');await db.economyAction('builder','use','material:wall','place-1');assert.equal((await db.get('builder')).memory.materialCredits['material:wall'],99);assert.equal((await db.get('builder')).tokens.MZK,600);
 db=new UserJsonDatabase(db.file);assert.equal((await db.economy('builder')).items.find(item=>item.sku==='material:wall').stock,99);
 await assert.rejects(db.buyMaterialBulk('builder','material:wall',500,2000,'too-poor'),/Not enough/);assert.equal((await db.get('builder')).memory.materialCredits['material:wall'],99);
 await db.put('one-piece',{tokens:{MZK:20},items:[]});await db.economyAction('one-piece','buy','material:wall','single');await db.economyAction('one-piece','use','material:wall','place-first');assert.equal((await db.get('one-piece')).tokens.MZK,15);await db.economyAction('one-piece','use','material:wall','place-second');assert.equal((await db.get('one-piece')).tokens.MZK,10);
 }finally{await rm(dir,{recursive:true,force:true});}
});
