import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {createForestSnakeModel,updateForestSnakeModel} from '../public/js/forest-snake-model.js';
import {FOREST_SNAKE_ITEMS,FOREST_SNAKE_MODEL_INFO,forestSnakeNativeItem} from '../public/js/forest-snake-items.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {anchorServerAsset} from '../public/js/server-scene-projection.js';
import {updateBuilderModels} from '../public/js/builder-models-3d.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

test('Mossback is a grounded, large native snake with a bounded continuous mesh and harmless reusable metadata',async()=>{
 const root=createForestSnakeModel();let triangles=0,draws=0;
 try{
  assert.equal(root.userData.modelId,'timberland-snake');assert.equal(root.userData.forestSnakeModel,true);
  root.traverse(node=>{
   if(!node.isMesh)return;assert.equal(node.userData.collisionDisabled,true,node.name);
   const geometry=node.geometry;triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;draws+=geometry.groups.length||1;
   for(const attribute of Object.values(geometry.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite),node.name+' finite '+attribute.name);
  });
  assert.ok(triangles<15000);assert.ok(draws<=15,draws+' draw calls');
  assert.equal(root.getObjectByName('MOSSBACK_BODY').geometry.groups.length,2,'dorsal and ventral plates require only two draws');
  const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());assert.ok(size.z>=12&&size.z<=14);assert.ok(bounds.min.y>=0);assert.ok(size.y>.8);
  const item=forestSnakeNativeItem();assert.equal(item.function_data.damage,0);assert.equal(item.function_data.destructible,false);assert.equal(item.function_data.forestSnake,true);assert.equal(item.category,'creatures');
  assert.equal(FOREST_SNAKE_MODEL_INFO['timberland-snake'][0],item.name);assert.equal(FOREST_SNAKE_ITEMS['timberland-snake'].priceMzk,item.priceMzk);
  assert.match(await readFile(new URL('..'+item.thumbnailUrl,import.meta.url),'utf8'),/<title/);
  assert.equal(createForestSnakeModel('unknown'),null);assert.equal(forestSnakeNativeItem('unknown'),null);
 }finally{disposeModelResources(root);}
});

test('local slithering, speech and reduced motion preserve world placement and stay grounded',()=>{
 const root=createForestSnakeModel(),body=root.getObjectByName('MOSSBACK_BODY'),head=root.getObjectByName('MOSSBACK_HEAD_RIG'),jaw=root.getObjectByName('MOSSBACK_JAW_RIG');
 try{
  root.position.set(23,0,17);root.rotation.y=1.2;const before=body.geometry.attributes.position.array.slice(),placement=root.position.clone(),rotation=root.quaternion.clone();
  updateForestSnakeModel(root,2,{talking:true});assert.notDeepEqual(body.geometry.attributes.position.array,before);assert.ok(jaw.rotation.x<0);assert.equal(root.getObjectByName('MOSSBACK_FORKED_TONGUE').visible,true);
  assert.ok(root.position.equals(placement));assert.ok(root.quaternion.equals(rotation));assert.ok(head.position.z< -5);
  for(let i=0;i<body.geometry.attributes.position.count;i++)assert.ok(body.geometry.attributes.position.getY(i)>=.02);
  updateForestSnakeModel(root,2,{reducedMotion:true});const still=body.geometry.attributes.position.array.slice();updateForestSnakeModel(root,30,{reducedMotion:true});assert.deepEqual(body.geometry.attributes.position.array,still);assert.equal(root.getObjectByName('MOSSBACK_FORKED_TONGUE').visible,false);
  assert.equal(updateForestSnakeModel(new T.Group(),2),false);
 }finally{disposeModelResources(root);}
});

test('snake copies isolate deforming geometry and share only immutable scale textures',()=>{
 const first=createForestSnakeModel(),second=cloneBuilderRuntime(first);
 try{
  const original=first.getObjectByName('MOSSBACK_BODY'),copy=second.getObjectByName('MOSSBACK_BODY'),before=original.geometry.attributes.position.array.slice();
  updateForestSnakeModel(second,3);assert.notEqual(copy.geometry,original.geometry);assert.deepEqual(original.geometry.attributes.position.array,before);
  assert.notEqual(copy.material[0],original.material[0]);assert.equal(copy.material[0].map,original.material[0].map);assert.equal(original.material[0].map.image.width,512);assert.equal(original.material[0].map.userData.nativeSurfaceShared,true);
  assert.equal(original.material[0].normalMap.image.height,512);assert.ok(rootDataSafe(first.userData));
 }finally{disposeModelResources(first);disposeModelResources(second);}
});
function rootDataSafe(data){const copy={...data};return JSON.parse(JSON.stringify(copy)).forestSnakeRig.length>12;}


test('server-anchored portable snakes animate their model child without moving the placement wrapper',()=>{
 const content=createForestSnakeModel(),anchor=anchorServerAsset(T,content),collection=new T.Group(),body=content.getObjectByName('MOSSBACK_BODY');
 collection.add(anchor);anchor.position.set(31,1.2,-42);anchor.rotation.set(.1,.7,-.03);anchor.scale.set(1.2,1.1,.9);
 const position=anchor.position.clone(),rotation=anchor.quaternion.clone(),scale=anchor.scale.clone(),before=body.geometry.attributes.position.array.slice();
 try{
  assert.equal(anchor.userData.forestSnakeModel,undefined,'real server anchors do not copy model flags');
  content.userData.forestSnakeTalking=true;updateBuilderModels(collection,1.5);
  assert.notDeepEqual(body.geometry.attributes.position.array,before,'the wrapped native body slithers');
  assert.ok(content.getObjectByName('MOSSBACK_JAW_RIG').rotation.x<0,'speech options come from the actual model child');
  assert.ok(anchor.position.equals(position));assert.ok(anchor.quaternion.equals(rotation));assert.ok(anchor.scale.equals(scale));
  content.userData.forestSnakeReducedMotion=true;updateBuilderModels(collection,4);const still=body.geometry.attributes.position.array.slice();updateBuilderModels(collection,19);assert.deepEqual(body.geometry.attributes.position.array,still);
 }finally{disposeModelResources(collection);}
});
