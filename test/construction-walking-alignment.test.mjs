import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {constructionWorld} from '../construction-world.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {isConstructionMachine} from '../public/js/construction-state.js';
import {placementBounds,placementMeshes,placementTriangles} from '../public/js/placed-item-collision.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
function fixture(){
 const map=constructionWorld(),collision=new ServerBuilderCollision(),builderDecor=new THREE.Group();
 const context=vm.createContext({THREE,placementBounds,isConstructionMachine,builderDecor,serverHostedRoom:true,registerBuilderObjectAdapter(){},floorPointAt:()=>({y:0})});
 const start=source.indexOf('function applyBuilderObject(');
 vm.runInContext(source.slice(start,source.indexOf('  function registerBuilderObjectAdapter',start)),context);
 for(const item of map.builderScene.objects){const model=createBuilderModel(item.modelId);if(model)context.applyBuilderObject(model,item,0,new THREE.Vector3(),0);}
 return {map,collision,builderDecor};
}
test('construction visible geometry and walking bounds retain exact authored thin and long dimensions',()=>{
 const {map,collision,builderDecor}=fixture(),world=collision.world(map);
 for(const root of builderDecor.children){
  if(isConstructionMachine(map.builderScene.objects.find(item=>item.id===root.userData.builderObjectId)))continue;
  const server=world.root.children.find(item=>item.userData.builderObjectId===root.userData.builderObjectId);
  assert.ok(server,root.userData.builderObjectId);
  const localBounds=placementBounds(THREE,root),serverBounds=placementBounds(THREE,server);
  for(const edge of ['min','max'])for(const axis of ['x','y','z'])assert.ok(Math.abs(localBounds[edge][axis]-serverBounds[edge][axis])<1e-5,`${root.userData.builderObjectId} ${edge}.${axis}: visible ${localBounds[edge][axis]} vs collider ${serverBounds[edge][axis]}`);
  assert.ok(root.userData.walkingBounds.equals(localBounds),'cached walking bounds match final anchored geometry');
 }
});
test('continuous walking across open haul lanes and ground markings never needs a click or direction reset',()=>{
 const {map,collision,builderDecor}=fixture();
 const terrain=collision.world(map).root.children[0];
 const groups=[terrain,...builderDecor.children].map(root=>({bounds:placementBounds(THREE,root),triangles:placementTriangles(THREE,[root])}));
 for(const [from,to]of [[{x:-15,z:23},{x:-15,z:48}],[{x:50,z:56},{x:138,z:56}],[{x:-58,z:125},{x:138,z:125}],[{x:-58,z:50},{x:7,z:50}]]){
  let position={...from,y:.02};const capsule=new Capsule(new THREE.Vector3(from.x,.36,from.z),new THREE.Vector3(from.x,1.33,from.z),.34);
  const distance=Math.hypot(to.x-from.x,to.z-from.z),dx=(to.x-from.x)/distance/20,dz=(to.z-from.z)/distance/20;
  for(let step=0;step<Math.floor(distance*20);step++){
   const before={...position},next=collision.resolve(map,position,{x:position.x+dx,y:position.y-.01,z:position.z+dz});
   assert.ok(Math.hypot(next.x-position.x,next.z-position.z)>.049,'server open route blocked at '+JSON.stringify(position));position=next;
   const moved=moveWalkingCapsule(capsule,{x:dx,y:-.01,z:dz},{triangleGroups:groups,grounded:true,verticalVelocity:0,maxStepHeight:.26});
   assert.ok(Math.hypot(moved.moved.x,moved.moved.z)>.049,'browser open route blocked near '+JSON.stringify(before));
  }
 }
});
