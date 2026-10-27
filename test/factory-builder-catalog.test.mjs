import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FACTORY_ITEMS,factoryItemSettings} from '../public/js/missile-factory-items.js';
import {BUILDER_SECTIONS,libraryModels,libraryCounts} from '../public/js/builder-library.js';
import {nativeItemGameplay} from '../public/js/editable-map-import.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {createFactoryModel,createMissileFactoryLand} from '../public/js/missile-factory-model.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('all nine factory assets are offered by the shared Backpack catalog and Factory builder category',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url))),models=manifest.assets.map(normalizeCatalogModel).filter(Boolean),factory=libraryModels(models,'factory');
 assert.ok(BUILDER_SECTIONS.some(([id])=>id==='factory'));assert.equal(factory.filter(model=>FACTORY_ITEMS[model.buildAssetId]).length,9);assert.equal(libraryCounts(models).factory,factory.length);
 for(const [id,item]of Object.entries(FACTORY_ITEMS)){const record=manifest.assets.find(value=>value.buildAssetId===id),model=factory.find(value=>value.buildAssetId===id);assert.ok(record&&model,id+' can be selected for placement');assert.equal(record.collection,'Factory & engineering');assert.equal(model.priceMzk,item.priceMzk);assert.deepEqual(record.dimensions,item.dimensions);assert.equal(model.category,'factory');assert.deepEqual(model.function_data,factoryItemSettings(id));}
 assert.equal(libraryModels(models,'factory','loading bay')[0].buildAssetId,'factory-loading-bay');
});

test('factory equipment defaults compile all six playable station roles and keep collectible models decorative',()=>{
 const roles=[];
 const objects=Object.entries(FACTORY_ITEMS).map(([id,item],index)=>{const value=nativeItemGameplay(id);assert.equal(value.category,'factory');assert.equal(value.priceMzk,item.priceMzk);assert.equal(value.function_data.active,true);assert.equal(value.function_data.destructible,false);assert.equal(value.function_data.damage,0);if(item.kind){roles.push(value.function_data.factoryStation);assert.equal(value.behavior,'interact');assert.equal(value.function_data.factoryStationId,'factory-'+item.kind);assert.equal(value.function_data.factoryApproach.z,item.kind==='loading'?0:3.5);}else{assert.equal(value.behavior,'decor');assert.equal(value.function_data.factoryStation,false);}return {id:'factory-test-'+index,modelId:id,asset:{buildAssetId:id},position:{x:index*15,y:0,z:0},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:1,y:1,z:1},functionalSettings:value.function_data};});
 assert.deepEqual(roles.sort(),['assembly','calibration','dispatch','fabrication','loading','procurement']);
 const manifest=compileBuilderScene({version:3,id:'factory-catalog-test',layout:'missile-factory',objects});
 assert.equal(manifest.objects.filter(object=>object.gameplay.factoryStation).length,6);
 for(const object of manifest.objects.filter(object=>object.gameplay.factoryStation)){assert.equal(object.gameplay.active,true);assert.ok(Number.isFinite(object.gameplay.factoryApproach.x));assert.equal(object.transform.rotation.y,Math.PI/2);}
 const copied=factoryItemSettings('factory-assembly-jig');copied.factoryApproach.z=99;assert.equal(factoryItemSettings('factory-assembly-jig').factoryApproach.z,3.5,'placement settings are independently editable');
});

test('editable factory backdrop leaves station objects selectable and loading pads remain drive-over surfaces',()=>{
 const bay=createFactoryModel('factory-loading-bay');assert.ok(bay);bay.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(bay);
 assert.ok(bounds.max.y<=.06&&bounds.min.y>=0,'the freight model contains no truck-blocking bollard or curb');assert.ok(bay.getObjectByName('FACTORY_LOADING_PAD').userData.walkableFloor);
 const backdrop=createMissileFactoryLand({builderScene:{sourceFactory:{enabled:true,editableEquipment:true,editableStations:true}}});
 assert.equal(backdrop.userData.editableEquipment,true);
 for(const name of ['FACTORY_SHOWCASE_CARGO_ROCKET','FACTORY_LIVE_WORK_ORDER','FACTORY_OPERATOR_PAD','FACTORY_OPERATOR_EDGE','FACTORY_LOADING_GUIDE','FACTORY_SIGN_01 / PROCUREMENT','FACTORY_SIGN_LIVE WORK ORDER'])assert.equal(backdrop.getObjectByName(name),undefined,name+' follows editable objects');
 for(const name of ['FACTORY_WALKABLE_FLOOR','FACTORY_HALL_BACK_WALL','FACTORY_WAREHOUSE_SHELF'])assert.ok(backdrop.getObjectByName(name),name+' remains in the architecture');
 assert.doesNotThrow(()=>{backdrop.userData.setFactoryState({jobs:[{job:{recipeId:'cargo-rocket',status:'processing'}}]});backdrop.userData.updateFactoryEffects(123);});
 const resources=new Set();for(const root of [bay,backdrop])root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource?.dispose();
});
