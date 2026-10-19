import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {SPORTS_BUILDER_ITEMS,sportsBackpackAsset,readBuilderTray,toggleBuilderTrayItem,BUILDER_TRAY_KEY} from '../public/js/builder-sports-catalog.js';
import {GAME_ECONOMY,ownsEconomyItem} from '../game-economy.mjs';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('public/models/backpack-assets.json',root),'utf8'));

test('every authored sports part is a native free Backpack asset and can be resolved by the server economy',()=>{
 assert.equal(new Set(SPORTS_BUILDER_ITEMS.map(item=>item.id)).size,SPORTS_BUILDER_ITEMS.length);
 for(const item of SPORTS_BUILDER_ITEMS){
  const expected=sportsBackpackAsset(item),record=manifest.assets.find(asset=>asset.buildAssetId===item.id),economy=GAME_ECONOMY.find(asset=>asset.buildAssetId===item.id);
  assert.ok(record,`${item.id} is in the Backpack`);
  for(const [key,value] of Object.entries(expected))assert.deepEqual(record[key],value,`${item.id}.${key}`);
  assert.ok(economy,`${item.id} has an authoritative placement SKU`);
  assert.equal(economy.kind,'asset');assert.equal(economy.priceMzk,0);assert.equal(economy.useCostMzk,0);
  assert.equal(ownsEconomyItem({items:[]},economy),true,`${item.id} is usable without buying an upgrade`);
 }
 const stadium=manifest.assets.find(asset=>asset.builderLayoutId==='basketball-stadium');
 assert.equal(stadium.id,'basketball-arena');
 assert.equal(stadium.builderUrl,'/environment-builder.html?layout=basketball-stadium');
});

test('the market and in-game builder include all sports items through the shared catalog',async()=>{
 const [market,game,html]=await Promise.all(['builder-market.js','public/js/house-explorer-glb.js','builder-market.html'].map(path=>readFile(new URL(path,root),'utf8')));
 const marketList=market.match(/const builderModels = ([\s\S]+?);\n/)?.[1];
 const gameList=game.match(/const BUILD_ASSETS = ([\s\S]+?\n  \]\));/)?.[1];
 assert.ok(marketList);assert.ok(gameList);
 const {ARCADE_PARTS}=await import('../public/js/arcade-rules.js');
 for(const list of [vm.runInNewContext(marketList,{SPORTS_BUILDER_ITEMS}),vm.runInNewContext(gameList,{SPORTS_BUILDER_ITEMS,ARCADE_PARTS})]){
  for(const item of SPORTS_BUILDER_ITEMS){const entries=list.filter(entry=>entry[0]===item.id);assert.equal(entries.length,1,`${item.id} appears once`);assert.equal(entries[0][2],item.category);}
 }
 for(const category of ['basketball','hockey']){
  assert.match(html,new RegExp(`data-pack-filter="${category}"`));
  assert.match(game,new RegExp(`'${category}'`));
 }
 assert.match(market,/toggleBuilderTrayItem\(/);
 assert.match(market,/roomStyles\.length/);
 assert.match(market,/builderModels\.length/);
});

test('selecting complete arenas and custom court parts persists a unique native build tray across pages',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const ids=['basketball-stadium','basketball-court-floor','basketball-hoop','hockey-arena','hockey-net'];
 for(const id of ids){const item=SPORTS_BUILDER_ITEMS.find(item=>item.id===id);assert.ok(item);assert.equal(toggleBuilderTrayItem(item,storage).added,true);}
 assert.deepEqual(readBuilderTray(storage).map(item=>item.id),ids);
 assert.deepEqual(JSON.parse(storage.getItem(BUILDER_TRAY_KEY)).map(item=>item.id),ids);
 const floor=SPORTS_BUILDER_ITEMS.find(item=>item.id==='basketball-court-floor');
 assert.equal(toggleBuilderTrayItem(floor,storage).added,false);
 assert.equal(readBuilderTray(storage).some(item=>item.id===floor.id),false);
 assert.equal(toggleBuilderTrayItem(floor,storage).added,true);
 assert.equal(readBuilderTray(storage).filter(item=>item.id===floor.id).length,1);
 storage.setItem(BUILDER_TRAY_KEY,'{"id":"invalid-shape"}');assert.deepEqual(readBuilderTray(storage),[]);
 storage.setItem(BUILDER_TRAY_KEY,'invalid-json');assert.deepEqual(readBuilderTray(storage),[]);
});
