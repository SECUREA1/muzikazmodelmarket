import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {CONSTRUCTION_SITE_MODEL_INFO} from '../public/js/construction-site-models.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-profile.js';
import {placementBounds,placementBoxes,resolvePlacedSolids} from '../public/js/placed-item-collision.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {constructionWorld} from '../construction-world.mjs';

const release=root=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}if(node.isInstancedMesh)node.dispose();});for(const resource of resources)resource.dispose?.();};

test('construction support assets use the detailed native graphics and bounded render budgets',()=>{
 const budgets={'construction-site-office':60,'construction-service-canopy':16,'construction-floodlight':15};
 for(const [id,[, ,dimensions]]of Object.entries(CONSTRUCTION_SITE_MODEL_INFO)){
  const root=createBuilderModel(id),item=nativeBuilderItem(id);let visible=0,textured=0;
  try{
   assert.equal(item.buildAssetId,id);assert.equal(root.userData.nativeDesign.version,NATIVE_DESIGN_VERSION);
   assert.equal(root.userData.constructionSupportModel,true);
   root.traverse(node=>{if(node.isMesh&&!node.userData.collisionOnly){visible++;for(const material of [].concat(node.material||[]))if(material.isMeshStandardMaterial&&material.map){textured++;assert.ok(node.geometry.attributes.uv,id+' has UVs for its physical surface maps');}}});
   assert.ok(visible>8&&visible<=budgets[id],id+' keeps detailed geometry inside its per-placement draw budget');
   assert.ok(textured>=4,id+' has real metal, paint or glass maps');
   assert.ok(root.userData.nativeDesign.detailCount>30,id+' includes authored hardware and panel details');
   const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
   for(let axis=0;axis<3;axis++)assert.ok(size.getComponent(axis)<=dimensions[axis]+.001,id+' stays inside its published metre-scaled dimensions');
   assert.ok(bounds.min.y>=-.0001,id+' sits on its authored physical base');
  }finally{release(root);}
 }
});

test('site office contains framed glazing, corrugation and a furnished lift-plan space',()=>{
 const office=createBuilderModel('construction-site-office');
 try{
  assert.equal(office.getObjectByName('OFFICE_WINDOW_GLASS').material.transparent,true);
  assert.equal(office.getObjectByName('OFFICE_ROOF_CORRUGATION').count,31);
  assert.ok(office.getObjectByName('OFFICE_PLAN_TABLE')&&office.getObjectByName('OFFICE_PLAN_BOARD'));
  const shape=placementBounds(THREE,office).getSize(new THREE.Vector3());
  assert.ok(shape.x<=12.5&&shape.z<=7.5,'the physical office remains inside its previous roof footprint');
 }finally{release(office);}
});

test('the maintenance canopy has solid columns and roof while its drive-through aisle remains open',()=>{
 const canopy=createBuilderModel('construction-service-canopy');
 try{
  const boxes=placementBoxes(THREE,[canopy]);assert.equal(boxes.length,7);
  const across=resolvePlacedSolids({x:-14,y:0,z:0},{x:14,y:0,z:0},boxes);
  assert.equal(across.x,14);assert.equal(across.z,0,'walking through the service aisle must not hit a solid whole-building box');
  const column=resolvePlacedSolids({x:-15.2,y:0,z:-4},{x:-15.2,y:0,z:0},boxes);
  assert.ok(column.z<-3,'the same dedicated column collider remains solid');
  assert.equal(canopy.getObjectByName('CANOPY_DIAGONAL_WEB').count,32);
 }finally{release(canopy);}
});

test('site lights keep narrow collision bases and use real emissive optics without extra shadow lights',()=>{
 const light=createBuilderModel('construction-floodlight');let lights=0;
 try{
  light.traverse(node=>{if(node.isLight)lights++;});assert.equal(lights,0);
  const optics=light.getObjectByName('LIGHT_LED_OPTIC');assert.equal(optics.count,16);assert.ok(optics.material.emissiveIntensity>0);
  const shape=placementBounds(THREE,light).getSize(new THREE.Vector3());assert.ok(shape.x<=1.301&&shape.z<=1.301,'floodlights cannot widen into the haul lane');
 }finally{release(light);}
});

test('the public construction map places the detailed support assets without changing its four machine contracts',()=>{
 const map=constructionWorld(),objects=map.builderScene.objects;
 assert.ok(objects.length<746,'reusable assemblies replace the older loose box components');
 assert.equal(objects.filter(item=>item.modelId==='construction-site-office').length,1);
 assert.equal(objects.filter(item=>item.modelId==='construction-service-canopy').length,1);
 assert.equal(objects.filter(item=>item.modelId==='construction-floodlight').length,4);
 assert.equal(objects.filter(item=>item.modelId==='shipping-container-box').length,3);
 assert.equal(objects.some(item=>/container-rib-|office-window-|maintenance-post-|light-pole-/.test(item.id)),false);
 const manifest=compileBuilderScene(map.builderScene),machines=manifest.actors.filter(actor=>actor.behavior==='vehicle');
 assert.deepEqual(machines.map(actor=>actor.modelId),['tower-crane','site-dumptruck','site-bulldozer','site-excavator']);
 for(const actor of machines){assert.equal(actor.asset.buildAssetId,actor.modelId);assert.equal(actor.asset.name,ROAD_VEHICLES[actor.modelId].name);}
 assert.equal(objects.find(item=>item.id==='construction-service-core').scale.y*1.2,10);
 assert.equal(map.construction.earthworks.patches.length,11,'the starter cut/spoil plus eleven extended patches remain available');
});
