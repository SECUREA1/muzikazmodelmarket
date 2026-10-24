import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FACTORY_ITEMS,factoryItemSettings} from '../public/js/missile-factory-items.js';
import {BUILDER_MODEL_INFO} from '../public/js/builder-models-3d.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {marketCategory,marketCategoryOptions} from '../public/js/market-categories.js';
import {marketFacets,matchesMarketFilters} from '../public/js/market-facets.js';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';

const factory=GAME_ECONOMY.filter(item=>item.category==='Factory & engineering');
const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8'));
const backpack=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8')).assets;
test('every supported native item is market-listed and factory equipment carries editable functional metadata through the unified registry',async()=>{
 assert.equal(factory.length,9);
 for(const id of Object.keys(BUILDER_MODEL_INFO))assert.ok(GAME_ECONOMY.some(item=>item.buildAssetId===id),id+' has a game-market offer');
 for(const [id,item]of Object.entries(FACTORY_ITEMS)){
  const offers=factory.filter(value=>value.buildAssetId===id);assert.equal(offers.length,1,id+' has one canonical offer');
  const offer=offers[0];assert.equal(offer.kind,'asset');assert.equal(offer.priceMzk,item.priceMzk);
  assert.equal(marketCategory(offer),'factory');assert.deepEqual(offer.function_data,factoryItemSettings(id));
  assert.ok(matchesMarketFilters(offer,{category:'factory',uses:['craft']}));
  const facets=marketFacets(offer);assert.ok(facets.uses.includes('build'));assert.ok(!facets.uses.includes('combat')&&!facets.uses.includes('fly'),'factory display models remain clearly categorized');
  const asset=registry.assets.find(value=>value.buildAssetId===id);assert.ok(asset,id+' has a unified registry entry');
  assert.equal(asset.generated,false);assert.equal(asset.modelPath,'');assert.equal(asset.category,'factory');
  assert.deepEqual(asset.function_data,offer.function_data);
  const model=normalizeCatalogModel(asset);assert.equal(model.buildAssetId,id);assert.equal(model.category,'factory');assert.deepEqual(model.function_data,offer.function_data);
  await access(new URL('..'+offer.thumbnailUrl,import.meta.url));
 }
 assert.equal(marketCategoryOptions(factory).find(category=>category.id==='factory').count,9);
 assert.ok(factory.every(item=>GAME_BUNDLES.some(bundle=>bundle.entries.some(entry=>entry.sku===item.sku))),'factory types also appear in discounted bundles');
 for(const raw of backpack.filter(item=>item.buildAssetId&&item.visibility!=='private')){
  const before=normalizeCatalogModel(raw),entry=registry.assets.find(item=>item.assetId===raw.id),after=entry&&normalizeCatalogModel(entry);
  assert.ok(after,raw.id+' keeps a native registry entry');
  for(const key of ['type','behavior','category'])assert.equal(after[key],before[key],raw.id+' retains '+key+' when loaded through the registry');
  assert.deepEqual(after.function_data,before.function_data,raw.id+' retains its full interactive configuration');
 }
});

test('all factory types can be bought with MZK once and placed from Backpack with their six station interactions preserved',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-market-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:factory-market-member';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:10000},items:[],memory:{},revision:0};return {};});
 let total=0;
 for(const item of factory){
  const receipt=await database.economyAction(wallet,'buy',item.sku,'factory-buy-'+item.buildAssetId);
  assert.equal(receipt.amountMzk,-item.priceMzk);total+=item.priceMzk;
  assert.equal((await database.economyAction(wallet,'buy',item.sku,'factory-buy-'+item.buildAssetId)).id,receipt.id);
 }
 const pack=await database.economy(wallet),models=backpackPlacementModels({},pack);
 assert.equal(pack.balance,10000-total);assert.equal(pack.ownedAssets.length,9);
 for(const item of factory){const placed=models.find(model=>model.buildAssetId===item.buildAssetId);assert.ok(placed);assert.deepEqual(placed.function_data,{...factoryItemSettings(item.buildAssetId),buildAssetId:item.buildAssetId});}
 assert.equal(pack.ownedAssets.filter(item=>item.function_data.factoryStation).length,6);
});

test('the complete model audit adds only verified local authored GLB files to remaining market offers',async()=>{
 const extra=GAME_ECONOMY.filter(item=>item.source==='repository-discovery');assert.equal(extra.length,11);
 for(const item of extra){assert.match(item.modelUrl,/^\/public\/.*\.(?:glb|gltf)$/i);await access(new URL('..'+item.modelUrl,import.meta.url));assert.ok(!registry.assets.find(asset=>asset.modelPath===item.modelUrl)?.generated);}
 for(const asset of registry.assets.filter(value=>!value.generated&&/\.(?:glb|gltf)$/i.test(value.modelPath)))assert.ok(GAME_ECONOMY.some(item=>item.modelUrl?.replace(/^\//,'')===asset.modelPath.replace(/^\//,'')),asset.name+' is available in the model market');
});
