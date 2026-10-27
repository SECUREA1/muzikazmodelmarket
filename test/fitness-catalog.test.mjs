import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FITNESS_ITEMS,fitnessItemSettings} from '../public/js/fitness-equipment.js';
import {BUILDER_MODEL_INFO,createBuilderModel} from '../public/js/builder-models-3d.js';
import {libraryModels,BUILDER_SECTIONS} from '../public/js/builder-library.js';
import {marketCategory} from '../public/js/market-categories.js';
import {marketFacets} from '../public/js/market-facets.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {MzkAccountStore} from '../loadout-code-store.mjs';

const assets=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8')).assets;
test('all gym assemblies are searchable Builder items and independently purchasable upgrades',async()=>{
 for(const id of ['fitness-basketball-hoop','fitness-table-tennis','fitness-sprint-gates','fitness-ring-scoreboard','fitness-ringside-seating'])assert.ok(FITNESS_ITEMS[id],id+' is available as an expansion upgrade');
 assert.ok(BUILDER_SECTIONS.some(([id])=>id==='fitness'));
 const library=[];
 for(const [id,item]of Object.entries(FITNESS_ITEMS)){
  const entry=assets.find(asset=>asset.buildAssetId===id);assert.ok(entry,id+' has a public item record');
  assert.equal(entry.builderCategory,'fitness');assert.equal(entry.visibility,'public');
  assert.deepEqual(entry.dimensions,item.dimensions);assert.deepEqual(entry.function_data,fitnessItemSettings(id));
  await access(new URL('..'+entry.thumbnailUrl,import.meta.url));
  assert.ok(BUILDER_MODEL_INFO[id]);assert.ok(createBuilderModel(id),id+' can be previewed and placed');
  const upgrades=GAME_ECONOMY.filter(asset=>asset.buildAssetId===id);assert.equal(upgrades.length,1,id+' has exactly one upgrade SKU');
  assert.equal(upgrades[0].priceMzk,item.priceMzk);assert.equal(marketCategory(upgrades[0]),'fitness');
  const facets=marketFacets(upgrades[0]);assert.ok(facets.uses.includes('build'));assert.ok(facets.uses.includes('decorate'));
  library.push({id,buildAssetId:id,name:item.name,description:item.description,category:'fitness',procedural:true});
 }
 assert.equal(libraryModels(library,'fitness').length,Object.keys(FITNESS_ITEMS).length);
 assert.ok(libraryModels(library,'fitness','bench').some(item=>item.id==='fitness-bench-press'));
});

test('gym equipment purchases retain playable settings in the owned Backpack and replay once',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fitness-upgrades-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
 const account=await accounts.freePlayLogin('GymUpgradeMember','gym-upgrade-password'),wallet=(await database.ensureAccount(account)).walletId;
 await database.transaction(data=>{data.users[wallet].tokens.MZK=5000;return true;});
 const bench=GAME_ECONOMY.find(item=>item.buildAssetId==='fitness-bench-press');
 const receipt=await database.economyAction(wallet,'buy',bench.sku,'buy-gold-bench');
 assert.equal(receipt.amountMzk,-FITNESS_ITEMS['fitness-bench-press'].priceMzk);
 const replay=await database.economyAction(wallet,'buy',bench.sku,'buy-gold-bench');assert.equal(replay.id,receipt.id);
 const owned=await database.economy(wallet),item=owned.ownedAssets.find(asset=>asset.buildAssetId==='fitness-bench-press');
 assert.equal(item.function_data.fitnessStation,'bench-press');assert.ok(item.function_data.fitnessApproach);
 assert.equal(owned.balance,5000-bench.priceMzk);assert.equal(owned.items.find(asset=>asset.sku===bench.sku).owned,true);
 const models=backpackPlacementModels({},owned);assert.ok(models.some(model=>model.buildAssetId==='fitness-bench-press'&&model.function_data.fitnessStation==='bench-press'));
});
