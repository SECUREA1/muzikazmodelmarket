import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createForestHarvestModel,updateForestHarvestModel} from '../public/js/forest-harvest-models.js';
import {FOREST_HARVEST_ITEMS} from '../public/js/forest-harvest-items.js';
import {FORESTRY_ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

// These are the original functional surface counts, before cosmetic detailing.
// Increasing visual resolution must not create extra walk/drive obstructions.
const colliderCounts={
 'forestry-lumber-plank':1,'forestry-lumber-beam':1,'forestry-lumber-panel':1,
 'forestry-lumber-veneer':1,'forestry-lumber-dowel':1,'forestry-axe':3,
 'forestry-chainsaw':23,'forestry-planter':1,'forestry-harvester':44,
 'forestry-forwarder':33,'forestry-log-truck':32,'forestry-stump-grinder':45,
 'forestry-sawmill':14,'forestry-drying-kiln':38,'forestry-nursery':46,'forestry-workbench':36
};

test('higher resolution forestry meshes preserve every existing functional surface and a bounded triangle cost',()=>{
 for(const id of Object.keys(FOREST_HARVEST_ITEMS)){
  const root=createForestHarvestModel(id);let triangles=0,colliders=0;
  root.traverse(node=>{
   if(!node.isMesh)return;
   const source=node.geometry;
   triangles+=(source.index?.count||source.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);
   if(!node.userData.collisionDisabled)colliders++;
   if(node.isInstancedMesh){assert.equal(node.userData.collisionDisabled,true);assert.equal(node.castShadow,false);}
   for(const component of [...node.position,...node.scale,node.rotation.x,node.rotation.y,node.rotation.z])assert.ok(Number.isFinite(component),id);
  });
  assert.equal(colliders,colliderCounts[id],id+' keeps its functional collision surfaces');
  assert.ok(triangles>0&&triangles<12000,id+' remains within the native per-model visual budget');
  if(FORESTRY_ROAD_VEHICLES[id]){
   const chassis=root.getObjectByName('FORESTRY_MAIN_CHASSIS');chassis.geometry.computeBoundingBox();
   const size=chassis.geometry.boundingBox.getSize(new T.Vector3()),spec=FORESTRY_ROAD_VEHICLES[id];
   for(const [actual,expected]of [[size.x,spec.width*.84],[size.y,.45],[size.z,spec.length*.82]])assert.ok(Math.abs(actual-expected)<1e-6);
   assert.equal(chassis.geometry.name,'MZK_BEVELLED_BOX');
  }
  disposeModelResources(root);
 }
});

test('forestry wood, end grain and machinery use authored PBR maps with isolated paint and shared texture ownership',()=>{
 const a=createForestHarvestModel('forestry-sawmill'),b=createForestHarvestModel('forestry-sawmill');
 const log=a.getObjectByName('FORESTRY_TIMBER_LOG'),end=a.getObjectByName('FORESTRY_LOG_END_GRAIN'),paint=a.getObjectByName('FORESTRY_SAW_COVER');
 assert.equal(log.material.userData.forestrySurface,'wood');assert.equal(end.material.userData.forestrySurface,'endgrain');
 assert.notEqual(log.material.map,end.material.map,'cut ends retain their separate ring texture');
 for(const node of [log,end,paint]){
  assert.equal(node.material.map.userData.forestryChannel,'albedo');
  assert.ok(node.material.map.userData.forestryResolution>=2048);
  assert.equal(node.material.normalMap.userData.forestryChannel,'normal');
  assert.equal(node.material.roughnessMap.userData.forestryChannel,'roughness');
  assert.equal(node.material.map.userData.nativeSurfaceShared,true);
 }
 const copy=b.getObjectByName('FORESTRY_SAW_COVER');assert.notEqual(paint.material,copy.material);assert.equal(paint.material.map,copy.material.map);
 const color=copy.material.color.clone();paint.material.color.set('#ff0000');assert.ok(copy.material.color.equals(color));
 let disposed=0;copy.material.map.addEventListener('dispose',()=>disposed++);disposeModelResources(a);assert.equal(disposed,0);disposeModelResources(b);assert.equal(disposed,0);
});

test('cab detailing follows the real vehicle rig while wheel motion stays driven by travelled distance',()=>{
 const root=createForestHarvestModel('forestry-forwarder'),cab=root.getObjectByName('FORESTRY_PROTECTED_CAB'),wheel=root.getObjectByName('FORESTRY_DRIVE_WHEEL');
 assert.equal(root.getObjectByName('FORESTRY_GLAZING_RUBBER_SEALS').parent,cab);
 assert.equal(root.getObjectByName('FORESTRY_DASHBOARD_GAUGE_FACES').parent,cab);
 assert.ok(root.getObjectByName('FORESTRY_HYDRAULIC_PRESSURE_HOSE'));
 const sealPosition=root.getObjectByName('FORESTRY_GLAZING_RUBBER_SEALS').position.clone();
 root.userData.driving={distance:12.4,speed:3};updateForestHarvestModel(root,5);
 assert.ok(Math.abs(wheel.rotation.x-20)<1e-8);assert.ok(root.getObjectByName('FORESTRY_GLAZING_RUBBER_SEALS').position.equals(sealPosition));
 disposeModelResources(root);
});
