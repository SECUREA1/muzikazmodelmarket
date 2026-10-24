import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {IN_GAME_BUILDING_ITEMS,BUILDING_CATALOG_CATEGORIES,matchesBuildingCatalogItem} from '../public/js/in-game-building-catalog.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {BUILDING_MATERIALS} from '../public/js/building-materials.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {GAME_ECONOMY} from '../game-economy.mjs';

test('in-game building list includes every native model and preserves authored action settings',()=>{
 assert.equal(IN_GAME_BUILDING_ITEMS.length,Object.keys(NATIVE_BUILDER_ITEMS).length);
 assert.ok(IN_GAME_BUILDING_ITEMS.length>350);
 assert.equal(new Set(IN_GAME_BUILDING_ITEMS.map(item=>item.id)).size,IN_GAME_BUILDING_ITEMS.length);
 for(const item of IN_GAME_BUILDING_ITEMS){
  const native=NATIVE_BUILDER_ITEMS[item.id];
  for(const key of ['id','buildAssetId','type','category','behavior','function_data','vehicleSettings','animationState','questSettings'])assert.deepEqual(item[key],native[key],item.id+' '+key);
  assert.equal(item.owned,undefined,item.id+' must not grant ownership');
  assert.ok(item.catalogDescription,item.id+' description');
  assert.equal(item.thumbnailUrl,native.thumbnailUrl||native.thumbnail_url||native.image||'');
 }
});

test('every in-game native item has its real placeable renderer and an existing purchase identity',()=>{
 for(const item of IN_GAME_BUILDING_ITEMS){
  const root=createBuilderModel(item.buildAssetId);assert.ok(root,item.id+' renderer');
  const bounds=new THREE.Box3().setFromObject(root);assert.ok(!bounds.isEmpty(),item.id+' bounds');
  for(const value of [...bounds.min.toArray(),...bounds.max.toArray()])assert.ok(Number.isFinite(value),item.id+' finite bounds');
  assert.ok(GAME_ECONOMY.some(record=>record.buildAssetId===item.buildAssetId||item.materialId&&record.materialId===item.materialId),item.id+' purchase SKU');
  root.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose();});
 }
});

test('category lists use real counts and seats include all native seating behavior',()=>{
 const all=BUILDING_CATALOG_CATEGORIES.find(category=>category.id==='all');assert.equal(all.count,IN_GAME_BUILDING_ITEMS.length);
 for(const category of BUILDING_CATALOG_CATEGORIES)assert.equal(category.count,IN_GAME_BUILDING_ITEMS.filter(item=>matchesBuildingCatalogItem(item,category.id)).length,category.id);
 const nativeSeats=Object.values(NATIVE_BUILDER_ITEMS).filter(item=>item.behavior==='seat');
 assert.ok(nativeSeats.length>3);
 assert.deepEqual(IN_GAME_BUILDING_ITEMS.filter(item=>matchesBuildingCatalogItem(item,'seats')).map(item=>item.id).sort(),nativeSeats.map(item=>item.id).sort());
 for(const category of ['materials','rooms','factory','fitness','arcade','sports','vehicles','buildings','characters'])assert.ok(BUILDING_CATALOG_CATEGORIES.some(item=>item.id===category&&item.count>0),category);
});

test('materials keep namespaced native IDs and are separated from terrain scenery',()=>{
 const materials=IN_GAME_BUILDING_ITEMS.filter(item=>matchesBuildingCatalogItem(item,'materials'));
 assert.equal(materials.length,BUILDING_MATERIALS.length);
 for(const item of materials){assert.equal(item.id,'material:'+item.materialId);assert.equal(item.buildAssetId,item.id);assert.equal(item.category,'terrain');}
 assert.equal(matchesBuildingCatalogItem(IN_GAME_BUILDING_ITEMS.find(item=>item.id==='terrain-cliff'),'terrain'),true);
 assert.equal(matchesBuildingCatalogItem(IN_GAME_BUILDING_ITEMS.find(item=>item.id==='material:wood'),'terrain'),false);
});

test('search combines all words across native names, category labels and authored behavior',()=>{
 const sofa=IN_GAME_BUILDING_ITEMS.find(item=>item.id==='sofa');
 assert.equal(matchesBuildingCatalogItem(sofa,'seats','cloud seat'),true);
 assert.equal(matchesBuildingCatalogItem(sofa,'all','furniture sofa'),true);
 assert.equal(matchesBuildingCatalogItem(sofa,'vehicles','sofa'),false);
 assert.equal(matchesBuildingCatalogItem(sofa,'all','sofa submarine'),false);
 assert.equal(matchesBuildingCatalogItem(IN_GAME_BUILDING_ITEMS.find(item=>item.id==='corsair-aircraft'),'vehicles','corsair fly'),true);
 assert.equal(matchesBuildingCatalogItem(IN_GAME_BUILDING_ITEMS.find(item=>item.id==='grand-floor'),'map'),true);
 assert.equal(matchesBuildingCatalogItem(IN_GAME_BUILDING_ITEMS.find(item=>item.id==='open-studio'),'room'),true);
 assert.equal(matchesBuildingCatalogItem(null,'all'),false);
});
