import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {FOREST_HARVEST_ITEMS,forestHarvestItemSettings} from '../public/js/forest-harvest-items.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {FORESTRY_ROAD_VEHICLES,isRoadVehicle,stepRoadVehicle} from '../public/js/road-vehicles.js';

test('forestry tools, machinery and milled lumber use real native placement models',async()=>{
 for(const [id,definition]of Object.entries(FOREST_HARVEST_ITEMS)){
  const root=createBuilderModel(id),native=nativeBuilderItem(id),resources=new Set();
  try{
   assert.ok(root,id+' constructs');assert.equal(root.userData.modelId,id);assert.equal(root.userData.forestHarvestModel,true);
   assert.equal(native.buildAssetId,id);assert.equal(native.function_data.damage,0);
   let triangles=0;
   root.traverse(node=>{
    assert.ok([...node.position,...node.scale,node.rotation.x,node.rotation.y,node.rotation.z].every(Number.isFinite),id+' transforms are finite');
    if(node.geometry){resources.add(node.geometry);triangles+=(node.geometry.index?.count||node.geometry.attributes.position?.count||0)/3;}
    for(const material of [].concat(node.material||[]))resources.add(material);
   });
   assert.ok(triangles>0&&triangles<30000,id+' has bounded geometry');
   const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());
   assert.ok(bounds.min.y>=-.1,id+' is grounded');assert.ok(size.x>0&&size.y>0&&size.z>0);
   const image=await readFile(new URL('..'+native.thumbnailUrl,import.meta.url),'utf8');assert.match(image,/<svg/);
   if(definition.kind==='lumber')assert.equal(native.behavior,'decor');
   if(definition.kind==='station')assert.ok(forestHarvestItemSettings(id).forestStation);
  }finally{for(const resource of resources)resource.dispose?.();}
 }
});

test('forestry vehicles use server road movement with capacity and operator positions',()=>{
 for(const kind of ['harvester','forwarder','log-truck','stump-grinder']){
  const id='forestry-'+kind,spec=FORESTRY_ROAD_VEHICLES[id],actor={modelId:id,position:{x:0,y:0,z:0},rotation:{y:0}};
  assert.ok(isRoadVehicle(actor));assert.ok(spec.forestry);assert.ok(spec.seat.every(Number.isFinite));
  const next=stepRoadVehicle(actor,{forward:1},.1);
  assert.ok(next.position.z<0,kind+' drives forward');assert.ok(next.driving.speed>0);
 }
 assert.equal(FORESTRY_ROAD_VEHICLES['forestry-forwarder'].cargoCapacity,12);
 assert.equal(FORESTRY_ROAD_VEHICLES['forestry-log-truck'].cargoCapacity,24);
});
