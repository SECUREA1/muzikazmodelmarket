import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {bevelledBoxGeometry,finishGameItem} from '../public/js/game-item-finish.js';
import {BUILDER_MODEL_INFO,createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';

test('bevels preserve the placement bounds and outward face winding at a fixed triangle budget',()=>{
 for(const size of [[1,2,3],[.06,.1,.08],[20,.2,16]]){
  const geometry=bevelledBoxGeometry(THREE,...size),position=geometry.attributes.position,normal=geometry.attributes.normal;
  assert.equal(position.count/3,44);
  assert.deepEqual(geometry.parameters,{width:size[0],height:size[1],depth:size[2]});
  const bounds=geometry.boundingBox.getSize(new THREE.Vector3());size.forEach((value,i)=>assert.ok(Math.abs(bounds.getComponent(i)-value)<1e-5));
  for(let i=0;i<position.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(position,i),b=new THREE.Vector3().fromBufferAttribute(position,i+1),c=new THREE.Vector3().fromBufferAttribute(position,i+2),n=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(n.length()>0);assert.ok(n.dot(a.clone().add(b).add(c))>0);assert.ok(n.normalize().dot(new THREE.Vector3().fromBufferAttribute(normal,i))>.999);}
 }
});

test('finishing is idempotent, preserves authored colours and leaves media anchors intact',()=>{
 const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0x456789}),screen=new THREE.Mesh(new THREE.BoxGeometry(1.2,.65,.08),mat);screen.userData.mediaScreen=true;root.add(screen,new THREE.Mesh(new THREE.BoxGeometry(),mat));
 finishGameItem(THREE,root);const geometry=root.children[1].geometry;finishGameItem(THREE,root);
 assert.equal(root.children[1].geometry,geometry);assert.equal(screen.geometry.type,'BoxGeometry');assert.equal(mat.color.getHex(),0x456789);
});

test('every registered prop and gaming machine builds finite meshes within a practical cabinet budget',()=>{
 for(const id of Object.keys(BUILDER_MODEL_INFO)){
  const root=createBuilderModel(id);assert.ok(root,id);assert.equal(root.userData.modelId,id);assert.equal(root.userData.visualFinish,'mzk-game-items-v2');let triangles=0,meshes=0;
  root.traverse(node=>{if(!node.isMesh)return;meshes++;assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),id);triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);});
  assert.ok(meshes>0,id);if(INTERACTIVE_DEVICES[id]){assert.ok(meshes<=32,id+' draw budget');assert.ok(triangles<=6000,id+' triangle budget');let screen;root.traverse(n=>{if(n.userData.mediaScreen)screen=n;});if(INTERACTIVE_DEVICES[id].shape!=='deck'){assert.ok(screen,id+' shared feed anchor');assert.ok(screen.geometry.parameters.width>0);assert.equal(screen.name,'DEVICE_SCREEN');}}
 }
});

test('pickups, portals and actors retain their gameplay roles and animate without moving the root',()=>{
 for(const id of ['hero-spawn','scout-avatar','wolf-guardian','rad-tox','void-wolf','ember-dragon','rogue-bot','quest-scroll','treasure-crystal','healing-potion','portal-door','campfire','friendly-ghost','green-bubbles']){
  const root=createBuilderModel(id),group=new THREE.Group();group.add(root);const position=root.position.clone();assert.ok(root.userData.behavior,id);assert.equal(root.userData.interactive,true);assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length()>0);updateBuilderModels(group,20);assert.ok(root.position.equals(position));root.traverse(n=>{assert.ok(n.scale.toArray().every(Number.isFinite));});
 }
});
