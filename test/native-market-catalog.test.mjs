import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {mainMarketEntries,filterMainMarket} from '../public/js/main-market-filters.js';

test('every native item and function has a purchasable, earned or basic canonical SKU',()=>{
 assert.equal(new Set(GAME_ECONOMY.map(item=>item.sku)).size,GAME_ECONOMY.length);
 for(const native of Object.values(NATIVE_BUILDER_ITEMS)){
  const item=GAME_ECONOMY.find(item=>item.buildAssetId===native.buildAssetId);
  assert.ok(item,native.id);assert.equal(item.native,true);assert.equal(item.function_data.behavior,native.behavior,native.id);
  assert.equal(item.nativeFunction,native.behavior);assert.ok(item.basic||item.earnedOnly||item.priceMzk>0);if(item.earnedOnly)assert.notEqual(item.basic,true,'earned rewards do not become the free basic kit');
 }
 for(const id of ['hockey-stick','hockey-skates','hockey-puck','hockey-net','hockey-player','hockey-goalie','hockey-referee','hockey-linesman'])assert.ok(GAME_ECONOMY.some(item=>item.sku==='native:'+id));
});

test('every reusable part in bundled native maps resolves to a market SKU with quantities',async()=>{
 const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')).map(map=>({...map,source:'repository'}));
 const catalog=nativeMarketCatalog(GAME_ECONOMY,maps);
 assert.equal(catalog.maps.length,maps.filter(map=>map.visibility!=='private'&&map.playable!==false).length);
 for(const map of catalog.maps){
  assert.equal(map.components.reduce((sum,part)=>sum+part.count,0),map.itemCount,map.name);
  for(const component of map.components)assert.ok(component.sku,map.name+': '+component.buildAssetId);
 }
 const airport=catalog.maps.find(map=>map.worldId==='muzikaz-airport');
 assert.ok(airport.itemCount>900);assert.ok(airport.components.some(part=>part.buildAssetId.startsWith('material:')&&part.sku.startsWith('material:')));
 const aircraft=catalog.items.find(item=>item.buildAssetId==='diamond-da40');
 assert.ok(aircraft.nativeMaps.some(map=>map.id===airport.worldId));
 assert.equal(GAME_ECONOMY.find(item=>item.sku===aircraft.sku).nativeMaps,undefined,'usage must not mutate canonical ownership data');
});

test('map breakdown excludes private, member and custom sources and resolves catalog aliases',()=>{
 const scene={objects:[{modelId:'aliased-tree'},{modelId:'aliased-tree'},{modelId:'material:wood'}],catalogModels:[{id:'aliased-tree',buildAssetId:'canopy-tree'}]};
 const catalog=nativeMarketCatalog(GAME_ECONOMY,[{id:'public',source:'repository',visibility:'private'},{id:'public',name:'Public Forest',source:'repository',builderScene:scene},{id:'private',source:'repository',visibility:'private',builderScene:scene},{id:'member',source:'repository',memberPlot:true,builderScene:scene},{id:'custom',source:'custom-builder',builderScene:scene}]);
 assert.equal(catalog.maps.length,1);assert.equal(catalog.maps[0].components.find(part=>part.buildAssetId==='canopy-tree').count,2);
 const entries=mainMarketEntries(catalog.items.map(item=>({...item,source:'upgrade'})).concat(catalog.maps));
 assert.equal(filterMainMarket(entries,{source:'native-map'})[0].item.name,'Public Forest');
 assert.ok(filterMainMarket(entries,{source:'native',query:'Public Forest'}).some(entry=>entry.item.buildAssetId==='canopy-tree'));
 assert.ok(filterMainMarket(entries,{source:'native',query:'seat'}).length);
});

test('world GLB aliases and direct owned/catalog references resolve to existing market items',()=>{
 const model=GAME_ECONOMY.find(item=>item.modelUrl&&!item.buildAssetId&&/ /.test(decodeURIComponent(item.modelUrl))),path=decodeURIComponent(model.modelUrl).replace(/^\//,'');
 const objects=[{id:'url-alias',modelId:'world-model-alias',name:'Dock display model'},{id:'direct-url',modelUrl:'/'+encodeURI(path)+'?v=2'},{id:'catalog-id',modelId:model.id},{id:'owned-model',asset:{id:'owned-copy',modelUrl:'/'+path}}];
 const scene={objects,catalogModels:[{id:'world-model-alias',name:'Imported world model',glb_url:'/'+encodeURI(path)}]};
 const catalog=nativeMarketCatalog(GAME_ECONOMY,[{id:'glb-map',name:'GLB Market World',source:'repository',builderScene:scene}]);
 const components=catalog.maps[0].components;assert.equal(components.length,1);assert.equal(components[0].sku,model.sku);assert.equal(components[0].count,4);assert.equal(components[0].modelUrl,model.modelUrl);assert.equal(components[0].buildAssetId,null);
 assert.ok(catalog.items.find(item=>item.sku===model.sku).nativeMaps[0].aliases.includes('Dock display model'));
 assert.equal(catalog.items.length,GAME_ECONOMY.length,'instances do not create duplicate item SKUs');
});

test('public creator maps link shared market assets while hidden internals and private maps stay excluded',()=>{
 const catalog=nativeMarketCatalog(GAME_ECONOMY,[{id:'creator',name:'Creator Market',source:'custom-builder',builderScene:{objects:[{modelId:'canopy-tree',name:'Courtyard oak'},{modelId:'canopy-tree',hidden:true},{modelId:'canopy-tree',visible:false},{modelId:'canopy-tree',metadata:{internal:true}},{modelId:'canopy-tree',visibility:'private'},{modelId:'canopy-tree',asset:{visibility:'private'}},{modelId:'privately-authored'}],catalogModels:[{id:'privately-authored',buildAssetId:'canopy-tree',visibility:'private'}]}},{id:'private-creator',visibility:'private',source:'custom-builder',builderScene:{objects:[{modelId:'canopy-tree'}]}}]);
 assert.equal(catalog.maps.length,0,'creator maps are not published as free repository templates');
 const item=catalog.items.find(item=>item.buildAssetId==='canopy-tree');assert.deepEqual(item.nativeMaps,[{id:'creator',name:'Creator Market',count:1,aliases:['Courtyard oak']}]);
});

test('authored world base GLBs appear in the same item usage inventory without copying map geometry',()=>{
 const item=GAME_ECONOMY.find(item=>item.modelUrl&&!item.buildAssetId&&item.assetType==='lands');assert.ok(item);
 const map={id:'base-glb-world',name:'Authored GLB World',source:'repository',modelUrl:item.modelUrl,modelUrls:[item.modelUrl,item.modelUrl]};
 const result=nativeMarketCatalog(GAME_ECONOMY,[map]);
 assert.equal(result.maps[0].components.length,1);assert.equal(result.maps[0].components[0].sku,item.sku);assert.equal(result.maps[0].itemCount,1);
 assert.deepEqual(result.items.find(row=>row.sku===item.sku).nativeMaps,[{id:map.id,name:map.name,count:1}]);
 assert.equal(map.builderScene,undefined);
});
