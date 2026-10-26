import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {IN_GAME_BUILDING_ITEMS,BUILDING_CATALOG_CATEGORIES,BUILDING_CATALOG_FUNCTIONS,createBuildingCatalog,buildingCatalogCategories,matchesBuildingCatalogItem} from '../public/js/in-game-building-catalog.js';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {BUILDING_MATERIALS} from '../public/js/building-materials.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {prepareAuthoredBuilderModel} from '../public/js/authored-builder-models.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

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

test('combined builder catalog covers every server GLB SKU and deposited GLB file without granting ownership',async()=>{
 const items=createBuildingCatalog(GAME_ECONOMY),glbs=items.filter(item=>item.catalogSource==='glb');
 const economyGlbs=GAME_ECONOMY.filter(item=>!item.buildAssetId&&/\.(glb|gltf)(?:[?#]|$)/i.test(item.modelUrl||''));
 assert.equal(items.length,IN_GAME_BUILDING_ITEMS.length+economyGlbs.length+GAME_ECONOMY.filter(item=>item.kind==='tool').length);
 assert.equal(new Set(items.map(item=>item.id)).size,items.length);
 assert.deepEqual(new Set(glbs.map(item=>item.economySku)),new Set(economyGlbs.map(item=>item.sku)));
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8'));
 const path=value=>decodeURIComponent(String(value)).replace(/^\//,'');
 for(const record of registry.assets.filter(record=>!record.generated&&/\.(glb|gltf)$/i.test(record.modelPath||'')))assert.ok(glbs.some(item=>path(item.modelUrl)===path(record.modelPath)),record.modelPath+' is browsable');
 for(const item of items)assert.notEqual(item.owned,true,item.id+' does not grant ownership');
 for(const item of glbs){const raw=GAME_ECONOMY.find(record=>record.sku===item.economySku);assert.equal(item.modelUrl,raw.modelUrl);assert.equal(item.sourceId,raw.id);assert.equal(item.priceMzk,raw.priceMzk);assert.ok(item.catalogDescription);}
});

test('catalog keeps native gameplay defaults and GLB authored functions, availability and variants',()=>{
 const native=NATIVE_BUILDER_ITEMS['sofa'];
 const record={id:'authored-seat',sku:'repository:authored-seat',assetType:'prop',name:'Authored seat',modelUrl:'/public/models/chair.glb',owned:true,scale:.6,function_data:{behavior:'seat',action:'sit',seatOffset:[0,.4,0],prompt:'Rest here'},vehicleSettings:{mode:'drive',speed:8}};
 const items=createBuildingCatalog([{id:'economy-sofa',sku:'native:sofa',buildAssetId:'sofa',owned:true,priceMzk:80,behavior:'hostile'},record,{...record,sku:'repository:chair-variant',owned:false}]);
 const sofa=items.find(item=>item.id==='sofa'),seat=items.find(item=>item.economySku===record.sku);
 assert.equal(sofa.behavior,native.behavior);assert.deepEqual(sofa.function_data,native.function_data);assert.equal(sofa.owned,true);assert.equal(sofa.priceMzk,80);
 assert.equal(seat.behavior,'seat');assert.deepEqual(seat.function_data,record.function_data);assert.deepEqual(seat.vehicleSettings,record.vehicleSettings);assert.equal(seat.modelScale,.6);assert.equal(seat.owned,true);
 assert.equal(items.filter(item=>item.modelUrl===record.modelUrl).length,2,'distinct purchase variants remain available');
});

test('combined categories and source/function filters include authored devices and environment GLBs',()=>{
 const items=createBuildingCatalog(GAME_ECONOMY),categories=buildingCatalogCategories(items);
 for(const category of categories)assert.equal(category.count,items.filter(item=>matchesBuildingCatalogItem(item,category.id)).length,category.id);
 for(const id of ['environments','summer-camp','audio','video','services'])assert.ok(categories.some(category=>category.id===id&&category.count>0),id);
 const world=items.find(item=>item.catalogCategory==='environments');assert.ok(world);assert.equal(matchesBuildingCatalogItem(world,'environments','',{source:'glb'}),true);assert.equal(matchesBuildingCatalogItem(world,'all','',{source:'native'}),false);
 const seat=items.find(item=>item.id==='sofa');assert.equal(matchesBuildingCatalogItem(seat,'all','',{functionId:'seat'}),true);assert.equal(matchesBuildingCatalogItem(seat,'all','',{functionId:'fly'}),false);
 for(const filter of BUILDING_CATALOG_FUNCTIONS)assert.ok(filter.label);
 const audio=items.filter(item=>matchesBuildingCatalogItem(item,'all','',{functionId:'audio'}));assert.ok(audio.length>0);assert.ok(audio.every(item=>matchesBuildingCatalogItem(item,'audio')));
});

test('combined catalog excludes private, inactive and unrelated economy records',()=>{
 const items=createBuildingCatalog([
  {id:'private',sku:'x',modelUrl:'private.glb',visibility:'private'},
  {id:'inactive',sku:'y',modelUrl:'inactive.glb',status:'inactive'},
  {id:'logo',sku:'z',modelUrl:'logo.svg'}
 ]);
 assert.equal(items.length,IN_GAME_BUILDING_ITEMS.length);
});

test('catalog exposes every usable tool as an equip action with its existing purchase identity',()=>{
 const items=createBuildingCatalog(GAME_ECONOMY),tools=items.filter(item=>item.catalogSource==='tool');
 assert.equal(tools.length,GAME_ECONOMY.filter(item=>item.kind==='tool').length);
 for(const tool of tools){const raw=GAME_ECONOMY.find(item=>item.sku===tool.economySku);assert.equal(tool.toolId,raw.toolId);assert.equal(tool.category,'tools');assert.equal(tool.behavior,'equip');assert.equal(tool.buildAssetId,undefined);assert.equal(tool.modelUrl,undefined);assert.equal(matchesBuildingCatalogItem(tool,'tools','',{source:'tool',functionId:'equip'}),true);assert.equal(tool.owned,false);}
 assert.equal(buildingCatalogCategories(items).find(category=>category.id==='tools').count,items.filter(item=>matchesBuildingCatalogItem(item,'tools')).length);
});

test('owned native variants retain the usable SKU instead of a locked alias',()=>{
 const items=createBuildingCatalog([
  {sku:'backpack:locked-sofa',buildAssetId:'sofa',owned:false},
  {sku:'backpack:owned-sofa',buildAssetId:'sofa',owned:true}
 ]),sofa=items.find(item=>item.id==='sofa');
 assert.equal(sofa.economySku,'backpack:owned-sofa');assert.equal(sofa.owned,true);
});

test('every purchased GLB catalog entry matches authoritative spawn behavior and authored rendering size',async t=>{
 const glbs=createBuildingCatalog(GAME_ECONOMY).filter(item=>item.catalogSource==='glb');
 assert.equal(glbs.length,55);
 const dir=await mkdtemp(join(tmpdir(),'catalog-glb-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000,
  resolveAsset:async(_,command)=>GAME_ECONOMY.find(record=>record.sku===command.sku)});
 const map={id:'catalog-glb-contract',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}};
 const identity={accountId:'catalog-buyer',username:'Catalog buyer'};
 await runtime.command(map.id,map,identity,{action:'join',requestId:'join-glb-contract'});
 for(const [index,item] of glbs.entries()){
  const raw=GAME_ECONOMY.find(record=>record.sku===item.economySku);
  const snapshot=await runtime.command(map.id,map,identity,{action:'spawn',requestId:'spawn-glb-'+index,
   sku:item.economySku,placement:{position:[1,0,1],rotation:[0,0,0],scale:[1,1,1]}});
  const actor=snapshot.actors[snapshot.result.spawnedId],behavior=actor.definition.gameplay.behavior;
  assert.equal(item.behavior,behavior,item.economySku+' behavior');
  assert.equal(item.function_data.behavior,behavior,item.economySku+' functional behavior');
  assert.equal(item.targetHeight,raw.targetHeight??null,item.economySku+' target height');
  assert.ok(item.catalogFunctions.includes(behavior),item.economySku+' searchable behavior');
  const model=()=>new THREE.Mesh(new THREE.BoxGeometry(2,4,3),new THREE.MeshBasicMaterial());
  const canonical=prepareAuthoredBuilderModel(model(),actor.asset),preview=prepareAuthoredBuilderModel(model(),item);
  const bounds=root=>new THREE.Box3().setFromObject(root);
  assert.deepEqual(bounds(preview).min.toArray(),bounds(canonical).min.toArray(),item.economySku+' lower bounds');
  assert.deepEqual(bounds(preview).max.toArray(),bounds(canonical).max.toArray(),item.economySku+' upper bounds');
  canonical.geometry.dispose();canonical.material.dispose();preview.geometry.dispose();preview.material.dispose();
  const saved=JSON.parse(JSON.stringify(item));
  assert.equal(saved.targetHeight,raw.targetHeight??null,item.economySku+' saved size');
 }
});

test('GLB configuration follows server precedence while keeping original authored fields',()=>{
 const record={id:'configured-avatar',sku:'repository:configured-avatar',assetType:'avatar',modelUrl:'avatar.glb',
  targetHeight:2.4,behavior:'talk',
  function_data:{behavior:'quest',prompt:'First prompt',custom:7},
  interaction_data:{behavior:'patrol',prompt:'Second prompt'},
  configuration:{behavior:'seat',prompt:'Final prompt',seatOffset:[0,.3,0]},
  animationState:{clip:'Idle',enabled:true},vehicleSettings:{mode:'fly',speed:7}};
 const item=createBuildingCatalog([record]).find(item=>item.catalogSource==='glb');
 assert.equal(item.behavior,'seat');assert.equal(item.function_data.behavior,'seat');
 assert.equal(item.function_data.prompt,'Final prompt');assert.equal(item.function_data.custom,7);
 assert.deepEqual(item.function_data.seatOffset,[0,.3,0]);assert.equal(item.targetHeight,2.4);
 assert.deepEqual(item.configuration,record.configuration);assert.deepEqual(item.interaction_data,record.interaction_data);
 assert.deepEqual(item.animationState,record.animationState);assert.deepEqual(item.vehicleSettings,record.vehicleSettings);
});


test('tool descriptions explain their real gameplay use',()=>{
 const tools=createBuildingCatalog(GAME_ECONOMY).filter(item=>item.toolId);
 assert.equal(tools.length,GAME_ECONOMY.filter(item=>item.kind==='tool').length);
 for(const item of tools)assert.ok(!item.catalogDescription.startsWith('Equip '),item.toolId+' has specific instructions');
 assert.match(tools.find(item=>item.toolId==='repair-tool').catalogDescription,/Repair damage/);
 assert.match(tools.find(item=>item.toolId==='recycler').catalogDescription,/Remove an aimed/);
});
