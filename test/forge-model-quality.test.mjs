import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {FORGE_ITEMS} from '../public/js/forge-items.js';
import {createForgeModel} from '../public/js/forge-models.js';
import {FORGE_MODEL_QUALITY_VERSION} from '../public/js/forge-model-quality.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource.dispose?.();}

test('crisp forge surfaces preserve normal vectors and cut static draw calls without changing item bounds',()=>{
 let saved=0;
 for(const [id,item]of Object.entries(FORGE_ITEMS)){
  const root=createForgeModel(id);let meshes=0,triangles=0;
  try{
   assert.equal(root.userData.forgeModelQuality.version,FORGE_MODEL_QUALITY_VERSION);saved+=root.userData.forgeModelQuality.drawCallsSaved;
   root.traverse(node=>{
    if(!node.isMesh)return;meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
    const normal=node.geometry.getAttribute('normal');assert.ok(normal,id+' authored normals');
    for(let index=0;index<normal.count;index++){const length=Math.hypot(normal.getX(index),normal.getY(index),normal.getZ(index));assert.ok(Number.isFinite(length)&&Math.abs(length-1)<.001,id+' unit normal');}
    if(node.userData.forgeStaticBatch){assert.ok(node.userData.forgeSourceParts.length>1);assert.equal(node.geometry.groups.length,0,'one material is submitted once');}
   });
   assert.ok(meshes<=28,id+' bounded draw calls');assert.ok(triangles<30000,id+' bounded triangles');
   const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()).toArray();assert.ok(Math.abs(box.min.y)<.001);
   size.forEach((value,index)=>assert.ok(Math.abs(value-item.dimensions[index])<.001,id+' canonical dimensions'));
  }finally{dispose(root);}
 }
 assert.ok(saved>200,'static material batching removes hundreds of repeated submissions across the catalogue');
});

test('forge station and crew pivots remain real independent nodes after placement cloning',()=>{
 const expected={
  'forge-hearth':['flame','workpiece'],'forge-bellows':['bellows'],'forge-anvil':['hammer','workpiece'],
  'forge-quench-tank':['water','workpiece'],'forge-tempering-oven':['gauge','workpiece'],
  'forge-finishing-bench':['finishWheel','workpiece'],'forge-master-smith':['leftArm','rightArm','leftLeg','rightLeg','heldTool']
 };
 for(const [id,keys]of Object.entries(expected)){
  const source=createForgeModel(id),copy=cloneBuilderRuntime(source);
  try{
   for(const key of keys){const name=source.userData.forgeRig[key],original=source.getObjectByName(name),cloned=copy.getObjectByName(name);assert.ok(original&&cloned,id+' '+key);assert.notEqual(original,cloned);cloned.rotation.x+=.25;assert.notEqual(cloned.rotation.x,original.rotation.x);}
   const workpiece=copy.getObjectByName(copy.userData.forgeRig.workpiece);if(workpiece){assert.equal(workpiece.visible,false);workpiece.traverse(node=>{if(node.isMesh)assert.equal(node.userData.collisionDisabled,true);});}
  }finally{dispose(source);dispose(copy);}
 }
});
