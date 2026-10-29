import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {applyCustomItemAppearance,applyCustomMaterialAppearance} from '../public/js/custom-item-appearance.js';
import {prepareAuthoredBuilderModel} from '../public/js/authored-builder-models.js';
import {anchorServerAsset,projectServerActor} from '../public/js/server-scene-projection.js';
import {environmentGeometry} from '../server-glb-geometry.mjs';
import {placedCollisionWorld,disposePlacedCollision} from '../server-placed-collision.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const close=(actual,expected,label='value')=>assert.ok(Math.abs(actual-expected)<1e-6,label+': '+actual+' vs '+expected);
const closeVector=(actual,expected,label)=>actual.toArray().forEach((value,index)=>close(value,expected.toArray()[index],label));
const dispose=root=>root.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose();});

test('custom finishes reset to actual authored material and never accumulate tint or opacity',()=>{
 const material=new THREE.MeshStandardMaterial({color:'#314b6a',metalness:.63,roughness:.82,emissive:'#172839',emissiveIntensity:.21,opacity:.8,transparent:true}),base={color:material.color.clone(),emissive:material.emissive.clone()};
 const settings={material:'glass',color:'#ee2134',colorBlend:70};
 applyCustomMaterialAppearance(THREE,material,settings);const first=material.color.clone();assert.equal(material.opacity,.45);assert.equal(material.roughness,.1);
 for(let repeat=0;repeat<8;repeat++)applyCustomMaterialAppearance(THREE,material,settings);
 assert.deepEqual(material.color.toArray(),first.toArray(),'the same tint does not darken or compound');
 applyCustomMaterialAppearance(THREE,material,{material:'neon',color:'#89dac6'});assert.equal(material.emissiveIntensity,.7);
 applyCustomMaterialAppearance(THREE,material,{material:'original',color:'#ff0000',colorBlend:100});
 assert.deepEqual(material.color.toArray(),base.color.toArray());assert.deepEqual(material.emissive.toArray(),base.emissive.toArray());assert.equal(material.emissiveIntensity,.21);assert.equal(material.metalness,.63);assert.equal(material.roughness,.82);assert.equal(material.opacity,.8);assert.equal(material.transparent,true);material.dispose();
});

test('drawing finishes preserve painted instance colors and transparent cutout geometry',()=>{
 const material=new THREE.MeshStandardMaterial({color:'white',roughness:.55,metalness:.08}),original=material.color.clone();
 for(const finish of ['wood','plastic','glass','neon','stone','matte','metal']){
  applyCustomMaterialAppearance(THREE,material,{material:finish,color:'#ff0000',colorBlend:100},{preserveColors:true});assert.deepEqual(material.color.toArray(),original.toArray(),'painted colors remain independent of '+finish+' finish');
 }
 assert.equal(material.metalness,.75);material.dispose();
});

test('custom transform is absolute relative to authored pose and preserves it on reset',()=>{
 const root=new THREE.Mesh(new THREE.BoxGeometry(2,4,6),new THREE.MeshStandardMaterial());root.position.set(2,3,4);root.scale.set(2,3,4);root.rotation.set(.1,.2,.3);const original={position:root.position.clone(),scale:root.scale.clone(),quaternion:root.quaternion.clone()};
 applyCustomItemAppearance(THREE,root,{scale:1.7,orientation:90,material:'metal'});const edited=root.quaternion.clone();
 for(let repeat=0;repeat<5;repeat++)applyCustomItemAppearance(THREE,root,{scale:1.7,orientation:90,material:'metal'});
 closeVector(root.scale,original.scale.clone().multiplyScalar(1.7),'configured scale');close(Math.abs(root.quaternion.dot(edited)),1,'configured turn');
 applyCustomItemAppearance(THREE,root,{material:'original',scale:1,orientation:0});closeVector(root.position,original.position,'original position');closeVector(root.scale,original.scale,'original scale');close(Math.abs(root.quaternion.dot(original.quaternion)),1,'original rotation');dispose(root);
});

test('authored target-height preparation applies custom scale and turn once inside placement transforms',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,6),new THREE.MeshStandardMaterial()),definition={targetHeight:10,configuration:{scale:1.5,orientation:90,material:'metal',color:'#123456'}};
 let prepared=prepareAuthoredBuilderModel(mesh,definition);
 for(let repeat=0;repeat<5;repeat++)prepared=prepareAuthoredBuilderModel(prepared,definition);
 const bounds=new THREE.Box3().setFromObject(prepared),size=bounds.getSize(new THREE.Vector3());close(bounds.min.y,0,'floor anchor');close(size.y,15,'custom height');close(size.x,22.5,'turned width');close(size.z,7.5,'turned depth');
 const placement=new THREE.Group();placement.position.set(4,2,-3);placement.rotation.y=Math.PI/2;placement.scale.setScalar(2);placement.add(prepared);const placed=new THREE.Box3().setFromObject(placement);close(placed.min.y,2,'placed floor');close(placed.getSize(new THREE.Vector3()).y,30,'independent placement scale');dispose(placement);
});

test('editing a previously posed custom wrapper keeps the outer placement independent of local fitting',()=>{
 const content=new THREE.Mesh(new THREE.BoxGeometry(2,4,6),new THREE.MeshStandardMaterial()),definition={targetHeight:10,configuration:{scale:1.5,orientation:70,material:'metal'}};
 const wrapper=prepareAuthoredBuilderModel(content,definition);wrapper.position.set(4,3,2);wrapper.scale.set(2,3,4);wrapper.rotation.set(.1,.2,.3);const before=new THREE.Box3().setFromObject(wrapper),originalPose={position:wrapper.position.clone(),scale:wrapper.scale.clone(),quaternion:wrapper.quaternion.clone()};
 for(let repeat=0;repeat<5;repeat++)assert.equal(prepareAuthoredBuilderModel(wrapper,definition),wrapper);
 const after=new THREE.Box3().setFromObject(wrapper);closeVector(after.min,before.min,'posed lower bounds');closeVector(after.max,before.max,'posed upper bounds');closeVector(wrapper.position,originalPose.position,'outer position');closeVector(wrapper.scale,originalPose.scale,'outer scale');close(Math.abs(wrapper.quaternion.dot(originalPose.quaternion)),1,'outer rotation');dispose(wrapper);
});

test('real GLB custom appearance has identical placed rendering and authoritative collision bounds',()=>{
 const asset={id:'custom-phone',type:'custom-item',modelUrl:'/public/models/props/HOLOPHONE_SILVER.glb',targetHeight:2.4,configuration:{scale:1.7,orientation:90,material:'glass',color:'#12aacc',colorBlend:40}},actor={id:'phone',spawned:true,active:true,asset,position:{x:3,y:2,z:-4},rotation:{x:0,y:.35,z:0},scale:{x:1.2,y:1.1,z:.8}};
 const rendered=anchorServerAsset(THREE,prepareAuthoredBuilderModel(environmentGeometry({modelUrl:asset.modelUrl}),asset));projectServerActor(rendered,actor,{now:1});projectServerActor(rendered,actor,{now:2});const renderBounds=new THREE.Box3().setFromObject(rendered),collision=placedCollisionWorld({phone:actor}),collisionBounds=new THREE.Box3().setFromObject(collision.root);
 closeVector(renderBounds.min,collisionBounds.min,'placed lower bounds');closeVector(renderBounds.max,collisionBounds.max,'placed upper bounds');close(renderBounds.getSize(new THREE.Vector3()).y,2.4*1.7*1.1,'height is not scaled twice');dispose(rendered);disposePlacedCollision(collision);
});

test('saved Builder GLBs keep the custom inner transform when their outer placement is applied',()=>{
 const definition={id:'custom-builder-phone',modelUrl:'/public/models/props/HOLOPHONE_SILVER.glb',targetHeight:2.4,configuration:{scale:1.7,orientation:90}},item={id:'placed-phone',modelId:definition.id,position:{x:3,y:0,z:-4},rotation:{x:0,y:.35,z:0},scale:{x:1.2,y:1.1,z:.8}},environment={id:'custom-builder-appearance',builderScene:{layout:'grand-floor',mapSize:80,objects:[item],catalogModels:[definition]}};
 const content=prepareAuthoredBuilderModel(environmentGeometry({modelUrl:definition.modelUrl}),definition),placement=new THREE.Group();placement.add(content);placement.position.copy(item.position);placement.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);placement.scale.copy(item.scale);const expected=new THREE.Box3().setFromObject(placement),collision=new ServerBuilderCollision(),world=collision.world(environment),actualObject=world.root.children.find(object=>object.userData.builderObjectId===item.id);assert.ok(actualObject);const actual=new THREE.Box3().setFromObject(actualObject);closeVector(actual.min,expected.min,'saved lower bounds');closeVector(actual.max,expected.max,'saved upper bounds');dispose(placement);dispose(world.root);
});
