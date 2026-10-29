import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBasketballAIAvatar,animateBasketballAIAvatar} from '../public/js/basketball-ai-avatar.js';
import {createFunhouseModel,updateFunhouseModel} from '../public/js/clown-funhouse-models.js';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';

function resources(t,root){
 t.after(()=>{const owned=new Set();root.traverse(node=>{if(node.geometry)owned.add(node.geometry);if(node.skeleton)owned.add(node.skeleton);for(const material of [].concat(node.material||[])){owned.add(material);for(const value of Object.values(material))if(value?.isTexture)owned.add(value);}});for(const item of owned)item.dispose();});return root;
}
function budget(root){let meshes=0,triangles=0,lights=0,bytes=0;const skinned=[],geometry=new Set(),skeletons=new Set();root.traverse(node=>{if(node.isLight)lights++;if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);geometry.add(node.geometry);if(node.isSkinnedMesh){skinned.push(node);skeletons.add(node.skeleton);}}});for(const value of geometry){for(const attribute of Object.values(value.attributes))bytes+=attribute.array.byteLength;bytes+=value.index?.array.byteLength||0;}for(const value of skeletons)bytes+=value.boneMatrices.byteLength;return {meshes,triangles,lights,skinned,bytes};}
function pose(root){root.updateMatrixWorld(true);const points=[];root.traverse(node=>{if(node.isBone)points.push(...node.getWorldPosition(new THREE.Vector3()).toArray(),...node.rotation.toArray().slice(0,3));});return points;}

test('AI athletes articulate both elbows, knees and ankles under the previous render budget',t=>{
 const root=resources(t,createBasketballAIAvatar(THREE,'07')),stats=budget(root);
 assert.equal(stats.meshes,9,'no extra draws for joint detail');assert.ok(stats.triangles<=1352);assert.ok(stats.bytes<=36496,'geometry and bone storage fit below the previous geometry bytes');assert.equal(stats.skinned.length,4);assert.equal(stats.lights,0);
 const identity=root.userData.basketballNumber,limbs=root.userData.basketballLimbs;
 animateBasketballAIAvatar(root,true,.13);const first=pose(root);
 animateBasketballAIAvatar(root,true,.47);const second=pose(root);
 assert.ok(first.length>0);assert.notDeepEqual(first,second,'lower joints animate with the gait');assert.ok(second.every(Number.isFinite));
 animateBasketballAIAvatar(root,false,.47);assert.ok(limbs.every(({joint})=>joint.rotation.x===0),'existing idle shoulder/hip API remains stable');
 animateBasketballAIAvatar(root,true,8,{reducedMotion:true});const reduced=pose(root);animateBasketballAIAvatar(root,true,20,{reducedMotion:true});assert.deepEqual(pose(root),reduced,'reduced motion freezes joint animation');
 assert.equal(root.userData.basketballNumber,identity);assert.equal(root.userData.basketballLimbs,limbs,'joint lookup is reused');
});

test('all five clown variants have articulated clothing and keep their previous meshes, size and lighting',t=>{
 for(const role of ['ringmaster','juggler','greeter','driver','scare-clown']){
  const root=resources(t,createFunhouseModel('funhouse-'+role+'-avatar')),stats=budget(root),isJuggler=role==='juggler';
  assert.ok(stats.meshes<=(isJuggler?31:28),role+' does not add draws');assert.ok(stats.triangles<=(isJuggler?9806:8750),role+' stays under old triangles');assert.equal(stats.skinned.length,4);assert.equal(stats.lights,0);assert.ok(stats.bytes<=(isJuggler?290292:262740),role+' geometry and bone bytes remain bounded');
  const bounds=new THREE.Box3().setFromObject(root);assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<.001);
  updateFunhouseModel(root,.13);const first=pose(root);updateFunhouseModel(root,.71);const second=pose(root);
  assert.notDeepEqual(first,second,role+' lower joints move');assert.ok(second.every(Number.isFinite));
  assert.ok(root.getObjectByName('FUNHOUSE_CLOWN_ARM'));assert.ok(root.getObjectByName('CREEPY_CLOWN_TEETH'));
 }
});

test('full funhouse performers retain four independently deforming limb meshes and reduced motion is stable',t=>{
 const root=resources(t,createClownFunhouseLand());const characters=[];root.traverse(node=>{if(node.userData.creepyClownCharacter&&node.getObjectByName('FUNHOUSE_CLOWN_HIP'))characters.push(node);});assert.ok(characters.length>=10);
 for(const character of characters)assert.equal(budget(character).skinned.length,4,character.name+' keeps animated meshes outside static batching');
 root.userData.updateFunhouseEffects(.2,true);const first=characters.map(pose);root.userData.updateFunhouseEffects(20,true);assert.deepEqual(characters.map(pose),first,'reduced motion avoids time-driven joint work');
});
