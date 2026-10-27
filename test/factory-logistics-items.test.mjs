import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {FACTORY_LOGISTICS_ITEMS,factoryLogisticsItemSettings} from '../public/js/factory-logistics-items.js';
import {FACTORY_LOGISTICS_MODEL_INFO,createFactoryLogisticsModel} from '../public/js/factory-logistics-props.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {nativeItemGameplay} from '../public/js/editable-map-import.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {libraryModels} from '../public/js/builder-library.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {placementMeshes} from '../public/js/placed-item-collision.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource?.dispose();}

test('all three logistics products have usable factory catalog records and immutable independent defaults',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url))),models=manifest.assets.map(normalizeCatalogModel).filter(Boolean),factory=libraryModels(models,'factory');
 assert.equal(Object.keys(FACTORY_LOGISTICS_ITEMS).length,3);
 for(const [id,item]of Object.entries(FACTORY_LOGISTICS_ITEMS)){
  const records=manifest.assets.filter(row=>row.buildAssetId===id),metadata=nativeItemGameplay(id),settings=factoryLogisticsItemSettings(id);assert.equal(records.length,1,id+' has one canonical catalog entry');assert.ok(factory.some(model=>model.buildAssetId===id));
  assert.equal(records[0].priceMzk,item.priceMzk);assert.equal(records[0].collection,'Factory logistics & exports');assert.deepEqual(records[0].dimensions,item.dimensions);assert.deepEqual(records[0].function_data,settings);assert.deepEqual(metadata.function_data,settings);assert.equal(metadata.category,'factory');assert.equal(metadata.behavior,item.role?'interact':'decor');
  assert.equal(settings.active,true);assert.equal(settings.destructible,false);assert.equal(settings.damage,0);assert.equal(settings.logisticsStation,item.role||false);
  if(item.role){assert.deepEqual(settings.logisticsApproach,{x:0,y:.02,z:3.5});settings.logisticsApproach.z=99;assert.equal(factoryLogisticsItemSettings(id).logisticsApproach.z,3.5);}
 }
 assert.equal(factoryLogisticsItemSettings('factory-export-terminal').logisticsStation,'export');assert.equal(factoryLogisticsItemSettings('factory-certification-kiosk').logisticsStation,'certify');assert.equal(factoryLogisticsItemSettings('factory-freight-crate').logisticsStation,false);assert.equal(factoryLogisticsItemSettings('unknown'),null);
 const objects=Object.keys(FACTORY_LOGISTICS_ITEMS).map((id,index)=>({id:'logistics-prop-'+index,modelId:id,position:{x:index*10,y:0,z:0},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:1,y:1,z:1},functionalSettings:factoryLogisticsItemSettings(id)}));
 const scene=compileBuilderScene({version:3,id:'logistics-catalog-test',layout:'grand-floor',objects});assert.deepEqual(scene.objects.filter(object=>object.gameplay.logisticsStation).map(object=>object.gameplay.logisticsStation),['export','certify']);
});

test('advanced logistics models render, animate within their bounds and leave operator approaches clear',()=>{
 for(const [id,info]of Object.entries(FACTORY_LOGISTICS_MODEL_INFO)){
  const model=createBuilderModel(id),group=new T.Group();assert.ok(model?.userData.factoryLogisticsModel,id+' uses its authored model');group.add(model);assert.deepEqual(info[2],FACTORY_LOGISTICS_ITEMS[id].dimensions);
  const resources=new Set(),meshes=[];model.traverse(node=>{if(node.isMesh)meshes.push(node);if(node.geometry)resources.add(node.geometry);});assert.ok(meshes.length>=20,id+' has detailed assemblies');assert.ok(resources.size<=2,id+' shares primitive geometry');
  for(const elapsed of [0,1,10000]){assert.doesNotThrow(()=>updateBuilderModels(group,elapsed));group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());assert.ok(bounds.min.y>=-.001);assert.ok(size.x<=info[2][0]+.02&&bounds.max.y<=info[2][1]+.02&&size.z<=info[2][2]+.02,id+' stays within its catalog dimensions');}
  const settings=factoryLogisticsItemSettings(id);if(settings.logisticsApproach){const p=settings.logisticsApproach,approach=new T.Box3(new T.Vector3(p.x-.38,p.y,p.z-.38),new T.Vector3(p.x+.38,p.y+1.7,p.z+.38));for(const mesh of placementMeshes(model))assert.equal(approach.intersectsBox(new T.Box3().setFromObject(mesh)),false,id+' leaves a clear operator capsule');}
  dispose(model);
 }
 assert.equal(createFactoryLogisticsModel('unknown'),null);
});
