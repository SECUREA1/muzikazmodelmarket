import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FACTORY_TESTING_ITEMS,factoryTestingItemSettings} from '../public/js/factory-testing-items.js';
import {createFactoryTestingBuilderScene,editableFactoryTestingScene,testingBuilderLayoutMeta} from '../public/js/factory-testing-builder.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,PROVING_DASHBOARD_STATIONS,testingStations,testingTargets} from '../public/js/factory-test-config.js';
import {editableMapScene,nativeItemGameplay} from '../public/js/editable-map-import.js';
import {factoryProvingGroundsWorld,mountainCompoundWorld} from '../factory-testing-world.mjs';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {libraryModels} from '../public/js/builder-library.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {marketCategory} from '../public/js/market-categories.js';
import {marketFacets} from '../public/js/market-facets.js';

const environment=scene=>({id:scene.id,factoryTesting:scene.sourceFactoryTesting,builderScene:scene});
test('proving and compound templates expose their playable stations and targets as separate Builder selections',()=>{
 const range=createFactoryTestingBuilderScene({id:'my-test-range'}),compound=createFactoryTestingBuilderScene({kind:'compound',id:'my-compound'});
 assert.equal(range.objects.length,PROVING_STATIONS.length+2);assert.equal(testingStations(environment(range)).length,PROVING_STATIONS.length);assert.equal(testingTargets(environment(range)).length,2);
 for(const dashboard of PROVING_DASHBOARD_STATIONS){const placed=range.objects.find(object=>object.id===dashboard.id);assert.equal(placed.functionalSettings.testingDashboard,dashboard.testingDashboard);const station=testingStations(environment(range)).find(value=>value.objectId===dashboard.id);assert.equal(station.testingDashboard,dashboard.testingDashboard);}
 assert.equal(compound.objects.length,3);assert.deepEqual(testingStations(environment(compound)).map(value=>value.kind),['return','containment','deep-hatch']);
 for(const scene of [range,compound]){assert.ok(scene.sourceFactoryTesting.editableEquipment);assert.ok(scene.sourceFactoryTesting.editableTargets);assert.ok(scene.sourceFactoryTesting.editableStations);const compiled=compileBuilderScene(scene);assert.equal(compiled.actors.filter(actor=>actor.gameplay.testingStation).length,scene===range?PROVING_STATIONS.length:3);}
});

test('canonical map copies preserve tests and edited geometry without copying account clearance or restoring removed equipment',()=>{
 for(const map of [factoryProvingGroundsWorld(),mountainCompoundWorld()]){
  const original=structuredClone(map),copy=editableMapScene(map,{id:'custom-test-'+map.id});assert.deepEqual(map,original);
  assert.notEqual(copy.id,PROVING_ID);assert.notEqual(copy.id,COMPOUND_ID);assert.equal(copy.sourceFactoryTesting.kind,map.factoryTesting.kind);
  assert.deepEqual(copy.sourceSpawn,map.spawn);assert.ok(copy.baseEnvironment.factoryTesting.editableEquipment);
  const station=copy.objects.find(object=>object.functionalSettings?.testingStation),before=testingStations(environment(copy)).find(value=>value.objectId===station.id);
  station.position.x+=17;station.rotation.y=Math.PI/2;station.scale.z=2;
  const moved=testingStations(environment(copy)).find(value=>value.objectId===station.id),offset=station.functionalSettings.testingApproach;
  assert.ok(Math.abs(moved.position.x-(station.position.x+offset.z*2))<1e-8);assert.ok(Math.abs(moved.position.z-(station.position.z-offset.x))<1e-8);assert.notDeepEqual(moved.position,before.position);
  copy.objects=copy.objects.filter(object=>object.id!==station.id);copy.sourceFactoryTesting.clearance={facility:true,deep:true};copy.sourceFactoryTesting.unlocked=true;
  const restored=editableFactoryTestingScene(JSON.parse(JSON.stringify(copy)));assert.equal(restored.objects.length,copy.objects.length);assert.equal(restored.sourceFactoryTesting.clearance,undefined);assert.equal(restored.sourceFactoryTesting.unlocked,undefined);
  assert.ok(!testingStations(environment(restored)).some(value=>value.objectId===station.id));
  const empty=editableFactoryTestingScene({...restored,objects:[]});assert.deepEqual(empty.objects,[]);assert.deepEqual(testingStations(environment(empty)),[]);assert.deepEqual(testingTargets(environment(empty)),[]);
 }
});

test('moved, disabled and removed targets update saved local markers and stations enable testing on an ordinary map',()=>{
 const scene=createFactoryTestingBuilderScene(),target=scene.objects.find(object=>object.id==='target-alpha');target.position={x:41,y:0,z:-44};target.scale={x:2,y:2,z:2};
 scene.objects.find(object=>object.id==='cargo-zone').functionalSettings.active=false;
 const meta=testingBuilderLayoutMeta(scene,{}),marker=meta.locations.find(place=>place.testingTargetId?.endsWith('target-alpha'));
 assert.equal(marker.x,41);assert.equal(marker.z,-44);assert.equal(meta.locations.filter(place=>place.testingTargetId).length,1);
 const again=testingBuilderLayoutMeta({...scene,layoutMeta:meta},meta);assert.deepEqual(again.locations,meta.locations);
 const plain={id:'small-garden',layout:'grand-floor',objects:[{id:'console',modelId:'testing-launch-console',position:{x:2,y:0,z:3},functionalSettings:factoryTestingItemSettings('testing-launch-console')}]};
 const saved=testingBuilderLayoutMeta(plain,{});assert.equal(saved.factoryTesting.kind,'proving');assert.equal(testingStations(environment(plain)).length,1);
 assert.equal(plain.layout,'grand-floor');assert.equal(plain.sourceLayout,undefined);
});

test('seven test assets have one priced offer, full native/registry gameplay metadata and both public map bills of materials',async()=>{
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8'));
 for(const [id,item]of Object.entries(FACTORY_TESTING_ITEMS)){
  const offers=GAME_ECONOMY.filter(offer=>offer.buildAssetId===id);assert.equal(offers.length,1);const offer=offers[0];
  assert.equal(offer.priceMzk,item.priceMzk);assert.equal(marketCategory(offer),'factory');assert.ok(marketFacets(offer).uses.includes('play'));
  const expected=factoryTestingItemSettings(id);for(const [field,value]of Object.entries(expected))assert.deepEqual(offer.function_data[field],value,id+': '+field);
  const native=nativeBuilderItem(id),gameplay=nativeItemGameplay(id);assert.equal(native.behavior,expected.behavior);assert.equal(gameplay.behavior,expected.behavior);
  const entry=registry.assets.find(asset=>asset.buildAssetId===id),normalized=normalizeCatalogModel(entry);assert.equal(normalized.behavior,expected.behavior);assert.equal(normalized.category,'factory-testing');
  assert.equal(libraryModels([normalized],'factory-testing').length,1);assert.equal(libraryModels([normalized],'factory').length,1);
  for(const [field,value]of Object.entries(expected))assert.deepEqual(normalized.function_data[field],value,id+': registry '+field);
  await access(new URL('..'+item.thumbnailUrl,import.meta.url));
 }
 const catalog=nativeMarketCatalog(GAME_ECONOMY,[factoryProvingGroundsWorld(),mountainCompoundWorld()]);assert.equal(catalog.maps.length,2);
 for(const map of catalog.maps)assert.ok(map.components.every(part=>part.sku),map.name+' retains market links for every assembly');
});

test('test-equipment MZK purchases replay once and retain station and target functions in the owned Backpack',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'testing-market-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:testing-builder';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:5000},items:[],memory:{},revision:0};return {};});let spent=0;
 for(const id of Object.keys(FACTORY_TESTING_ITEMS)){const offer=GAME_ECONOMY.find(item=>item.buildAssetId===id),receipt=await database.economyAction(wallet,'buy',offer.sku,'testing-buy-'+id);assert.equal((await database.economyAction(wallet,'buy',offer.sku,'testing-buy-'+id)).id,receipt.id);spent+=offer.priceMzk;}
 const pack=await database.economy(wallet);assert.equal(pack.balance,5000-spent);assert.equal(pack.ownedAssets.length,7);
 assert.equal(pack.ownedAssets.filter(item=>item.function_data.testingStation).length,5);assert.equal(pack.ownedAssets.filter(item=>item.function_data.testingTarget).length,2);
});
