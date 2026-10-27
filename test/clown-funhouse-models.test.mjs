import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {FUNHOUSE_ITEMS} from '../public/js/clown-funhouse-items.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();}

test('market models construct their own authored assembly without allocating the carnival world',()=>{
 for(const id of Object.keys(FUNHOUSE_ITEMS)){
  const root=createBuilderModel(id);try{
   let meshes=0,lights=0;root.traverse(node=>{if(node.isMesh)meshes++;if(node.isLight)lights++;});
   assert.ok(meshes>0&&meshes<200,id+' keeps only its assembly');assert.equal(lights,0,id+' inherits world lighting');
   assert.equal(root.userData.modelId,id);assert.equal(typeof root.userData.animateFunhouseStation,'function');
   const bounds=new THREE.Box3().setFromObject(root,true);assert.ok(!bounds.isEmpty()&&[...bounds.min,...bounds.max].every(Number.isFinite));
  }finally{dispose(root);}
 }
});

test('selected native avatars animate directly and placed models honor their animation settings',()=>{
 const model=createBuilderModel('funhouse-juggler-avatar'),collection=new THREE.Group();
 try{
  const spinner=model.getObjectByName('FUNHOUSE_HAT_SPINNER'),initial=spinner.rotation.y;
  updateBuilderModels(model,2);assert.notEqual(spinner.rotation.y,initial,'direct avatar projection spins the authored hat');
  const normal=spinner.rotation.y;model.userData.animationState={enabled:true,speed:2};collection.add(model);
  updateBuilderModels(collection,2);assert.ok(Math.abs(spinner.rotation.y-normal*2)<.001,'placed models retain authored animation speed');
  const frozen=spinner.rotation.y;model.userData.animationState.enabled=false;updateBuilderModels(model,4);assert.equal(spinner.rotation.y,frozen);
 }finally{dispose(model);}
});

test('portable gallery exposes target positions in the assembly coordinate frame',()=>{
 const gallery=createBuilderModel('funhouse-water-gallery');try{
  assert.equal(gallery.userData.funhouseTargets.length,6);
  assert.equal(gallery.userData.funhouseTargets[0].position.x,-7.5);
  assert.equal(gallery.userData.funhouseTargets[0].position.z,0);
  gallery.userData.animateFunhouseStation('funhouse-water-gallery',{targetId:0,hit:true});
  updateBuilderModels(gallery,.3);
  assert.ok(gallery.getObjectByName('FUNHOUSE_SPLASH_TARGET_0').rotation.z<0);
 }finally{dispose(gallery);}
});
