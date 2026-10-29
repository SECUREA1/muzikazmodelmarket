import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

const identities=[['hero-spawn','Hero Spawn','talk'],['scout-avatar','AAPE Scout','quest'],['rad-tox','RAD-TOX Mutant','hostile'],['rogue-bot','Rogue Bot','hostile']];
const restMin=[-.5100000059604645,.00999999910593033,-.3032869775593281],restMax=[.5100000059604645,1.9,.2928999960422516];
const limbs=root=>{const result=[];root.traverse(node=>{if(node.userData.articulatedLimb)result.push(node);});return result;};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

test('every native humanoid stand-in keeps its gameplay identity and placement envelope within the previous draw/triangle budgets',()=>{
 for(const [id,label,behavior]of identities){
  const root=createBuilderModel(id);try{
   assert.equal(root.name,label);assert.equal(root.userData.modelId,id);assert.equal(root.userData.behavior,behavior);assert.equal(root.userData.interactive,true);
   const joints=limbs(root);assert.equal(joints.length,4);assert.equal(joints.filter(node=>node.userData.articulatedLimb.kind==='arm').length,2);assert.equal(joints.filter(node=>node.userData.articulatedLimb.kind==='leg').length,2);
   let meshes=0,triangles=0,skins=0;const materials=new Set();root.traverse(node=>{if(!node.isMesh)return;meshes++;if(node.isSkinnedMesh)skins++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;for(const material of [].concat(node.material))materials.add(material);});
   assert.equal(skins,4);assert.ok(meshes<=(id==='hero-spawn'?24:23));assert.ok(triangles<=(id==='hero-spawn'?5068:4620));assert.ok(materials.size<=6);
   const bounds=new THREE.Box3().setFromObject(root);if(id==='hero-spawn'){close(bounds.min.y,.004999999850988264);close(bounds.max.y,1.9);close(bounds.max.x,.5649999976158142);}else{bounds.min.toArray().forEach((value,index)=>close(value,restMin[index]));bounds.max.toArray().forEach((value,index)=>close(value,restMax[index]));}
  }finally{disposeModelResources(root);}
 }
});

test('moving a directly projected native avatar bends elbows, knees and ankles and counter-swings hips',()=>{
 const root=createBuilderModel('scout-avatar');try{
  const joints=limbs(root),pelvis=root.getObjectByName('QUEST_CHARACTER_HIPS');
  updateBuilderModels(root,.23,{moving:true,speed:1});
  assert.notEqual(pelvis.rotation.y,0);assert.notEqual(pelvis.rotation.z,0);
  for(const joint of joints){const data=joint.userData.articulatedLimb,bend=root.getObjectByName(data.bendName),end=root.getObjectByName(data.endName);assert.notEqual(joint.rotation.x,0);if(data.kind==='arm')assert.ok(bend.rotation.x*data.forward<0);else assert.ok(bend.rotation.x*data.forward>=0);if(data.kind==='leg')assert.notEqual(end.rotation.x,0);}
  const before=joints.map(joint=>joint.rotation.x);updateBuilderModels(root,.63,{moving:true});assert.notDeepEqual(joints.map(joint=>joint.rotation.x),before);
  updateBuilderModels(root,1,{moving:true,reducedMotion:true});assert.equal(pelvis.rotation.y,0);assert.equal(pelvis.rotation.z,0);assert.equal(root.getObjectByName('QUEST_CHARACTER_HEAD').rotation.x,0);
  for(const joint of joints){assert.equal(joint.rotation.x,0);if(joint.userData.articulatedLimb.kind==='leg')assert.equal(root.getObjectByName(joint.userData.articulatedLimb.endName).rotation.x,0);}
 }finally{disposeModelResources(root);}
});

test('collection updates inherit motion, respect per-avatar state and avoid hierarchy scans after the initial rig lookup',()=>{
 const group=new THREE.Group(),one=createBuilderModel('scout-avatar'),two=createBuilderModel('rad-tox');group.add(one,two);group.userData.avatarMotion={moving:true,speed:1};two.userData.avatarMotion={moving:false};
 try{
  updateBuilderModels(group,.23);assert.notEqual(one.getObjectByName('QUEST_LEFT_LEG').rotation.x,0);assert.equal(two.getObjectByName('QUEST_LEFT_LEG').rotation.x,0);
  const traversal=one.traverse,lookup=one.getObjectByName;one.traverse=()=>{throw Error('The animation scanned the hierarchy again.');};one.getObjectByName=()=>{throw Error('The animation looked up named joints again.');};
  try{for(let frame=0;frame<60;frame++)updateBuilderModels(group,.3+frame/60);}finally{one.traverse=traversal;one.getObjectByName=lookup;}
  updateBuilderModels(group,2,{reducedMotion:true});assert.equal(one.getObjectByName('QUEST_LEFT_LEG').rotation.x,0);
 }finally{disposeModelResources(group);}
});

test('disabled native animation resets moving joints and preserves the saved speaking contact behavior',()=>{
 const root=createBuilderModel('rogue-bot');try{
  root.userData.questSpeaking=true;updateBuilderModels(root,.2,{moving:false});const head=root.getObjectByName('QUEST_CHARACTER_HEAD');assert.notEqual(head.rotation.x,0);
  root.userData.animationState={enabled:false};updateBuilderModels(root,.4,{moving:true});assert.equal(head.rotation.x,0);for(const joint of limbs(root))assert.equal(joint.rotation.x,0);
 }finally{disposeModelResources(root);}
});
