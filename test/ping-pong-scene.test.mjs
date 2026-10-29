import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createPingPongScene} from '../public/js/ping-pong-scene.js';
import {createWorldResident} from '../public/js/world-resident-model.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

const ball=(fields={})=>({id:'rally-a',position:{x:0,y:1.1,z:0},velocity:{x:4,y:-2,z:0},radius:.032,floor:0,rally:2,...fields});
const partner=(fields={})=>({id:'practice-a',ownerId:'a',residentId:null,username:'Rally partner',position:{x:0,y:0,z:-5},yaw:Math.PI,pingPong:{equipped:true,equippedAt:1000,swingAt:1200,stroke:'forehand',sequence:1},...fields});
function fixture(options={}){const scene=new THREE.Scene(),projection=createPingPongScene({THREE,scene,...options});return {scene,projection};}

test('scene balls use shared resources and bounded extrapolation without changing gameplay state',()=>{
 const {scene,projection}=fixture(),state=ball(),before=structuredClone(state);
 try{
  projection.receive({balls:[state,ball({id:'rally-b',position:{x:2,y:1.1,z:0}})]},1000);
  const a=projection.root.children.find(node=>node.userData.ballId==='rally-a'),b=projection.root.children.find(node=>node.userData.ballId==='rally-b');
  assert.equal(scene.children.length,1);assert.equal(projection.root.visible,true);assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);assert.equal(a.scale.x,.032);
  projection.update(1,10000);
  assert.ok(Math.abs(a.position.x-.6)<1e-6,'extrapolation stops after 150 ms even when snapshots stall');assert.ok(a.position.y>=.032);
  assert.deepEqual(state,before,'projection does not advance authoritative physics');
  const ray=new THREE.Raycaster(new THREE.Vector3(.6,.8,5),new THREE.Vector3(0,0,-1));assert.deepEqual(ray.intersectObject(projection.root,true),[]);
  projection.receive({balls:[ball({position:{x:0,y:.04,z:0},velocity:{x:0,y:-10,z:0}})]},1100);projection.update(1,1250);
  assert.ok(a.position.y>=.032,'prediction never puts the ball through its known floor');assert.equal(b.parent,null);
  projection.receive({balls:[]},1300);assert.equal(projection.root.children.length,0);assert.equal(projection.root.visible,false);
 }finally{projection.dispose();}
});

test('practice AI is a visible sports resident with a paddle and no idle cargo prop',()=>{
 const {projection}=fixture();
 try{
  projection.receive({partners:[partner()]},1000);projection.update(1/60,1400);
  const ai=projection.root.getObjectByName('PING_PONG_AI_PARTNER');assert.ok(ai);assert.deepEqual(ai.position.toArray(),[0,0,-5]);assert.equal(ai.rotation.y,Math.PI);
  assert.equal(ai.userData.residentProp.visible,false);assert.equal(ai.userData.residentParts.sport.visible,true);
  assert.ok(ai.userData.avatarPaddle||ai.getObjectByName('PING_PONG_PADDLE'),'AI visibly carries its rally paddle');
  projection.receive({partners:[partner({pingPong:{equipped:true,equippedAt:1000,swingAt:1500,stroke:'backhand',sequence:2}})]},1500);projection.update(1/60,1600);
  assert.equal(projection.root.getObjectByName('PING_PONG_AI_PARTNER'),ai,'snapshots reuse the visible AI');
  projection.reset();assert.equal(ai.parent,null);assert.equal(projection.root.visible,false);
 }finally{projection.dispose();}
});

test('resident partners reuse asynchronous scene actors and cleanup preserves those actors',()=>{
 let resident=null;const {scene,projection}=fixture({getActorRoot:id=>id==='resident-a'?resident:null});
 try{
  projection.receive({partners:[partner({residentId:'resident-a'})]},1000);projection.update(1/60,1200);
  assert.equal(projection.root.children.length,0,'an actor loading in the world is never duplicated');
  resident=createWorldResident();scene.add(resident);projection.update(1/60,1400);
  assert.equal(resident.parent,scene);assert.ok(resident.userData.avatarPaddle||resident.getObjectByName('PING_PONG_PADDLE'));
  projection.reset();assert.equal(resident.parent,scene,'reset does not remove a world resident');assert.equal(scene.children.length,2);assert.equal(resident.userData.avatarPaddle,undefined,'reset restores a resident instead of leaving a frozen held paddle');
 }finally{projection.dispose();if(resident){disposeModelResources(resident);resident.removeFromParent();}}
});

test('reset and disposal release their own resources once and ignore invalid scene positions',()=>{
 const {scene,projection}=fixture();projection.receive({balls:[ball(),ball({id:'invalid',position:{x:NaN,y:0,z:0}})],partners:[partner({position:{x:0,y:Infinity,z:0}})]},1000);
 const sphere=projection.root.getObjectByName('PING_PONG_BALL');let geometryDisposals=0,materialDisposals=0;sphere.geometry.addEventListener('dispose',()=>geometryDisposals++);sphere.material.addEventListener('dispose',()=>materialDisposals++);
 assert.equal(projection.root.children.length,1);projection.reset();assert.equal(geometryDisposals,0,'reset keeps shared ball resources for the next world');
 projection.receive({balls:[ball()]},2000);projection.update(NaN,NaN);projection.update(-1,2000);assert.ok(projection.root.getObjectByName('PING_PONG_BALL').position.toArray().every(Number.isFinite));
 projection.dispose();projection.dispose();assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);assert.equal(scene.children.length,0);
 projection.receive({balls:[ball()]},3000);projection.update(1,3000);assert.equal(scene.children.length,0);
});
