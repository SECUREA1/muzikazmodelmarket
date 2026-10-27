import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {IN_GAME_BUILDING_ITEMS} from '../public/js/in-game-building-catalog.js';
import {GAME_ECONOMY} from '../game-economy.mjs';

const portals=['portal-door','teleport-pad','portal-arch','portal-ring'];
const props=['quest-scroll','treasure-crystal','healing-potion','supply-crate','treasure-chest','lever-switch','mana-potion','crystal-cluster','reinforced-crate','relic-chest'];
const ids=[...portals,...props];

function dispose(root){
 const resources=new Set();
 root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
 for(const resource of resources)resource.dispose();
}
function transform(node){return [...node.position,...node.quaternion,...node.scale];}
function pose(root,{materials=true}={}){
 const result=[];
 root.traverse(node=>{
  const values=transform(node);
  if(materials)for(const material of [].concat(node.material||[])){
   values.push(material.opacity,material.emissiveIntensity);
   for(const uniform of Object.values(material.uniforms||{}))if(typeof uniform.value==='number')values.push(uniform.value);
  }
  result.push(values);
 });
 return result;
}

test('upgraded native assets produce grounded finite models within a reusable prop budget',()=>{
 for(const id of ids){
  const root=createBuilderModel(id);
  assert.ok(root,id+' constructs through the same factory used by placement and previews');
  try{
   assert.equal(root.userData.modelId,id);
   assert.equal(Boolean(root.userData.portalModel),portals.includes(id));
   assert.equal(Boolean(root.userData.commonPropModel),props.includes(id));
   let meshes=0,triangles=0,drawCalls=0,lights=0;
   root.traverse(node=>{
    if(node.isLight)lights++;
    if(!node.isMesh)return;
    meshes++;
    const geometry=node.geometry,positions=geometry.getAttribute('position');
    assert.ok(positions?.count,id+' has drawable vertices');
    for(const coordinate of positions.array)assert.ok(Number.isFinite(coordinate),id+' vertex is finite');
    triangles+=(geometry.index?.count||positions.count)/3;
    drawCalls+=Array.isArray(node.material)?Math.max(1,geometry.groups.length):1;
    assert.ok(transform(node).every(Number.isFinite),id+' local transform is finite');
   });
   assert.ok(meshes>1&&meshes<=250,id+' remains an individual detailed item');
   assert.ok(drawCalls<=250,id+' stays within 250 draw calls');
   assert.ok(triangles<=100000,id+' stays within 100k triangles');
   assert.equal(lights,0,id+' uses shared world lighting');
   const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
   assert.ok(!bounds.isEmpty()&&[...bounds.min,...bounds.max].every(Number.isFinite),id+' has finite bounds');
   assert.ok(bounds.min.y>=-.15&&bounds.min.y<=.15,id+' base sits at the placement origin');
   assert.ok(size.x>0&&size.y>0&&size.z>0&&Math.max(...size)<12,id+' retains useful metre scale');
  }finally{dispose(root);}
 }
});

test('native item effects animate deterministically without moving their saved placement',()=>{
 for(const id of ids){
  const root=createBuilderModel(id),collection=new THREE.Group();
  try{
   root.position.set(4,1,-3);root.rotation.y=.65;root.scale.setScalar(1.2);
   const placement=transform(root);
   updateBuilderModels(root,1.25);
   const direct=pose(root);
   updateBuilderModels(root,1.25);
   assert.deepEqual(pose(root),direct,id+' repeated frames do not accumulate transforms');
   collection.add(root);updateBuilderModels(collection,1.25);
   assert.deepEqual(pose(root),direct,id+' preview and placed animation paths agree');
   updateBuilderModels(collection,3.5);
   assert.deepEqual(transform(root),placement,id+' animation preserves position, heading and scale');
   root.userData.animationState={enabled:false,speed:1};
   const frozen=pose(root);
   updateBuilderModels(collection,8);
   assert.deepEqual(pose(root),frozen,id+' disabled animation keeps the current frame');
  }finally{dispose(root);}
 }
});

test('portal and glowing prop copies retain independent animation materials when cloned by the editor',()=>{
 for(const id of [...portals,'treasure-crystal','healing-potion','mana-potion','relic-chest','lever-switch']){
  const source=createBuilderModel(id);let copy;
  try{
   updateBuilderModels(source,.5);copy=cloneBuilderRuntime(source);
   const sourcePose=pose(source);
   updateBuilderModels(copy,3);
   assert.deepEqual(pose(source),sourcePose,id+' copied effects do not animate the source');
   assert.notDeepEqual(pose(copy),sourcePose,id+' copied item keeps its animation');
  }finally{dispose(source);if(copy)dispose(copy);}
 }
});

test('upgraded items and expansion variants share catalog identity, authoritative SKUs and artwork',async()=>{
 for(const id of ids){
  const native=nativeBuilderItem(id),catalog=IN_GAME_BUILDING_ITEMS.find(item=>item.buildAssetId===id),offers=GAME_ECONOMY.filter(item=>item.buildAssetId===id);
  assert.ok(native&&catalog,id+' appears in the editor and in-game library');
  assert.equal(offers.length,1,id+' resolves to one existing or new canonical offer');
  assert.equal(offers[0].function_data.behavior,native.behavior,id+' retains its native function');
  assert.deepEqual(offers[0].dimensions,native.dimensions,id+' uses the same placement dimensions');
  if(['portal-arch','portal-ring'].includes(id)){
   assert.equal(native.function_data.action,'teleport',id+' exposes the Portal Tuner');
   assert.equal(Boolean(native.function_data.portal?.enabled),false,id+' requires a configured travel path');
   assert.ok(!native.function_data.portal?.targetMapId&&!native.function_data.portal?.targetObjectId,id+' does not invent a travel destination');
  }
  const svg=await readFile(new URL('../public/images/native-upgrades/'+id+'.svg',import.meta.url),'utf8');
  assert.match(svg,/<svg\b[^>]*viewBox=/,id+' has scalable catalog artwork');
  assert.doesNotMatch(svg,/<script\b|\sonload\s*=/i,id+' artwork is passive');
 }
});
