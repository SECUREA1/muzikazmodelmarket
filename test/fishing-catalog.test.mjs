import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FISHING_GEAR} from '../public/js/fishing-config.js';
import {GAME_ECONOMY,ownsEconomyItem} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {marketCategory} from '../public/js/market-categories.js';
import {marketFacets} from '../public/js/market-facets.js';
import {validTool,isFishingTool} from '../public/js/game-tool-rules.js';
import {toolsPouchState} from '../public/js/tools-pouch-state.js';
import {createBuildingCatalog} from '../public/js/in-game-building-catalog.js';
import {GameEconomy} from '../public/js/game-economy-client.js';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {MzkAccountStore} from '../loadout-code-store.mjs';

test('fishing equipment shares one tool identity through native models, markets and pouch equipment',()=>{
 const catalog=createBuildingCatalog(GAME_ECONOMY);
 for(const gear of FISHING_GEAR){
  const matches=GAME_ECONOMY.filter(item=>item.buildAssetId===gear.id);
  assert.equal(matches.length,1,gear.id+' has one canonical ownership SKU');
  const [item]=matches;
  assert.equal(item.sku,'tool:'+gear.id);assert.equal(item.toolId,gear.id);
  assert.equal(item.priceMzk,gear.priceMzk);assert.equal(item.useCostMzk,0);
  assert.equal(item.description,gear.description);assert.equal(validTool(gear.id),true);assert.equal(isFishingTool(gear.id),true);
  assert.equal(marketCategory(item),'tools');
  assert.equal(marketFacets(item).subcategory,'fishing');assert.ok(marketFacets(item).uses.includes('fish'));
  assert.equal(NATIVE_BUILDER_ITEMS[gear.id].function_data.fishingGear,gear.id);
  assert.equal(catalog.find(record=>record.buildAssetId===gear.id).economySku,item.sku);
  const pouch=toolsPouchState({records:[{...item,id:'owned-'+gear.id}],tool:gear.id});
  assert.equal(pouch.items[0].category,'tools');assert.equal(pouch.items[0].status,'Equipped');
  assert.equal(pouch.items[0].actionLabel,'Equip tool');
 }
 assert.equal(isFishingTool('laser'),false);assert.equal(isFishingTool('fishing-imaginary'),false);
});

test('starter tackle is available before catalog refresh while upgrades require ownership',()=>{
 const client=new GameEconomy({inventory:{},announce:()=>{},shop:()=>{}});
 for(const gear of FISHING_GEAR)assert.equal(client.owns('tool:'+gear.id),Boolean(gear.basic),gear.id);
 for(const gear of FISHING_GEAR)assert.equal(ownsEconomyItem({items:[]},GAME_ECONOMY.find(item=>item.sku==='tool:'+gear.id)),Boolean(gear.basic),gear.id);
});

test('paid tackle uses server purchase authorization and persists reusable ownership without repeated charges',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fishing-economy-'));
 try{
  const accounts=new MzkAccountStore(join(dir,'accounts.json')),db=new UserJsonDatabase(join(dir,'users.json'));
  const account=await accounts.freePlayLogin('FishingBuyer','fishing-buyer-password');
  const {walletId}=await db.ensureAccount(account),before=(await db.get(walletId)).tokens.MZK;
  await assert.rejects(db.economyAction(walletId,'use','tool:fishing-reel','unowned-reel'),/Purchase/);
  const receipt=await db.economyAction(walletId,'buy','tool:fishing-reel','buy-reel');
  assert.equal(receipt.balanceAfterMzk,before-90);
  assert.equal((await db.economyAction(walletId,'buy','tool:fishing-reel','buy-reel')).id,receipt.id);
  await assert.rejects(db.economyAction(walletId,'buy','tool:fishing-reel','buy-again'),/already owned/);
  await db.economyAction(walletId,'use','tool:fishing-reel','equip-reel');
  const state=await db.economy(walletId);
  assert.equal(state.balance,before-90);
  const owned=state.ownedAssets.find(item=>item.toolId==='fishing-reel');
  assert.equal(owned.economySku,'tool:fishing-reel');assert.equal(owned.buildAssetId,'fishing-reel');
  assert.equal(marketCategory(owned),'tools');assert.equal(owned.assetType,'tools');
 }finally{await rm(dir,{recursive:true,force:true});}
});
