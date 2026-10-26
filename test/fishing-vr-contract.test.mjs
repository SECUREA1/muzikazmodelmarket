import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {fishingSeatPose} from '../public/js/harbor-camera.js';
import {createFishingVRScreen} from '../public/js/fishing-vr-screen.js';

const canvas=()=>({width:0,height:0,getContext:()=>new Proxy({}, {get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;return true;}})});
function fixture(){
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(75,1,.025,700);scene.add(rig);rig.add(camera);
 rig.position.set(35,.2,-17);rig.rotation.y=.65;camera.position.set(.12,1.62,-.08);camera.rotation.set(-.12,.18,.035,'YXZ');scene.updateMatrixWorld(true);
 const actions=[],reels=[],screen=createFishingVRScreen({scene,camera,onAction:value=>actions.push(value),onReel:value=>reels.push(value),createCanvas:canvas});
 const state={enabled:true,playing:true,presenting:true,menuOpen:false,phase:'ready',primaryEnabled:true,side:'starboard',tension:.2,progress:0,message:'Ready to cast',location:'Marina Fishing Grounds'};
 const update=patch=>{Object.assign(state,patch);screen.update(state);};
 const ray=(name='AUTO')=>{scene.updateMatrixWorld(true);const origin=camera.getWorldPosition(new THREE.Vector3()),point=screen.root.getObjectByName('FISHING_VR_ACTION_'+name).getWorldPosition(new THREE.Vector3());return {origin,direction:point.sub(origin).normalize()};};
 update({});return {scene,rig,camera,screen,state,actions,reels,update,ray};
}

test('fishing seat transforms stay boat-relative and face the selected real cast point',()=>{
 for(const side of ['port','starboard'])for(const yaw of [0,Math.PI/2,-2.15]){
  const boat={id:'angler',position:{x:130,y:2.3,z:-45},rotation:{x:.03,y:yaw,z:-.02}},before=structuredClone(boat),target={x:139.1,y:.1,z:-51.8};
  const pose=fishingSeatPose(boat,side,target),sign=side==='port'?-1:1;
  assert.ok(Math.abs(pose.position.x-(130+sign*.38*Math.cos(yaw)+1.65*Math.sin(yaw)))<1e-8);
  assert.ok(Math.abs(pose.position.z-(-45-sign*.38*Math.sin(yaw)+1.65*Math.cos(yaw)))<1e-8);
  assert.ok(Math.abs(pose.position.y-2.5)<1e-8,'the helper returns floor position, not a forced headset eye height');
  const toward=new THREE.Vector3(target.x-pose.eye.x,0,target.z-pose.eye.z).normalize(),forward=new THREE.Vector3(-Math.sin(pose.yaw),0,-Math.cos(pose.yaw));
  assert.ok(toward.dot(forward)>.999999);assert.deepEqual(boat,before);assert.deepEqual(pose.target,target);
 }
 const recovered=fishingSeatPose({position:{x:NaN,y:Infinity,z:NaN},rotation:{y:NaN}},'starboard',{x:NaN,z:0});
 assert.ok([...Object.values(recovered.position),...Object.values(recovered.eye),...Object.values(recovered.target),recovered.yaw].every(Number.isFinite));
});

test('the VR sports screen never rewrites tracked head or player-rig transforms',()=>{
 const f=fixture(),cameraPosition=f.camera.position.clone(),cameraQuaternion=f.camera.quaternion.clone(),rigPosition=f.rig.position.clone(),rigQuaternion=f.rig.quaternion.clone(),initial=f.screen.snapshot();
 assert.equal(initial.visible,true);const head=f.camera.getWorldPosition(new THREE.Vector3());
 assert.ok(f.screen.root.position.y<head.y-.4,'the screen leaves the actual water/rod sightline clear');
 f.camera.rotation.y+=.9;f.camera.rotation.z-=.1;f.camera.position.x+=.22;f.scene.updateMatrixWorld(true);
 const trackedPosition=f.camera.position.clone(),trackedQuaternion=f.camera.quaternion.clone();f.update({progress:.45,phase:'reeling'});
 assert.deepEqual(f.camera.position.toArray(),trackedPosition.toArray());assert.deepEqual(f.camera.quaternion.toArray(),trackedQuaternion.toArray());assert.deepEqual(f.rig.position.toArray(),rigPosition.toArray());assert.deepEqual(f.rig.quaternion.toArray(),rigQuaternion.toArray());
 assert.equal(f.screen.snapshot().yaw,initial.yaw,'head rotation must not drag the menu across the fishing view');
 assert.notDeepEqual(f.camera.position.toArray(),cameraPosition.toArray());assert.notDeepEqual(f.camera.quaternion.toArray(),cameraQuaternion.toArray());f.screen.dispose();
});

test('VR screen ray actions honor visibility, menu, disabled and invalid-input boundaries',()=>{
 const f=fixture();assert.equal(f.screen.pointerDown(f.ray()),true);assert.deepEqual(f.actions,['auto']);f.actions.length=0;
 for(const patch of [{enabled:false},{enabled:true,playing:false},{playing:true,presenting:false},{presenting:true,menuOpen:true}]){
  f.update(patch);assert.equal(f.screen.snapshot().visible,false);assert.equal(f.screen.pointerDown(f.ray()),false);assert.deepEqual(f.actions,[]);
 }
 f.update({menuOpen:false,phase:'ready',primaryEnabled:false});assert.equal(f.screen.snapshot().visible,true);
 assert.equal(f.screen.pointerDown(f.ray()),true,'a disabled screen tile consumes its own ray so no weapon action falls through');assert.deepEqual(f.actions,[]);
 f.update({primaryEnabled:true});
 for(const ray of [null,{}, {origin:new THREE.Vector3(),direction:new THREE.Vector3()}, {origin:new THREE.Vector3(NaN,0,0),direction:new THREE.Vector3(0,0,-1)}])assert.equal(f.screen.pointerDown(ray),false);
 assert.deepEqual(f.actions,[]);f.screen.dispose();assert.equal(f.screen.pointerDown(f.ray()),false);
});

test('losing the VR screen or an enabled reel action releases a held reel exactly once',()=>{
 for(const patch of [{menuOpen:true},{presenting:false},{playing:false},{enabled:false},{primaryEnabled:false},{pending:true},{phase:'caught'}]){
  const f=fixture();f.update({phase:'reeling'});assert.equal(f.screen.pointerDown(f.ray()),true);assert.deepEqual(f.reels,[true]);
  f.update(patch);assert.deepEqual(f.reels,[true,false],JSON.stringify(patch)+' must stop the reel');f.screen.pointerUp();f.screen.dispose();f.screen.dispose();assert.deepEqual(f.reels,[true,false]);
 }
 const f=fixture();f.update({phase:'reeling'});f.screen.pointerDown(f.ray());f.screen.dispose();assert.deepEqual(f.reels,[true,false]);assert.equal(f.scene.getObjectByName('FISHING_VR_SPORTS_SCREEN'),undefined);
});

test('unchanged VR snapshots reuse textures while changed progress redraws the same screen',()=>{
 const f=fixture(),first=f.screen.snapshot(),face=f.screen.root.getObjectByName('FISHING_VR_STATUS'),texture=face.material.map;
 for(let index=0;index<90;index++)f.update({});assert.equal(f.screen.snapshot().drawCount,first.drawCount);
 f.update({progress:.35,tension:.68,phase:'reeling'});assert.equal(f.screen.snapshot().drawCount,first.drawCount+1);assert.equal(face.material.map,texture);
 assert.equal(f.screen.root.name,'FISHING_VR_SPORTS_SCREEN');f.screen.dispose();
});

test('a second controller release cannot cancel the other controller’s screen reel hold',()=>{
 const f=fixture();f.update({phase:'reeling'});
 f.screen.pointerDown(f.ray(),'right');f.screen.pointerUp('left');assert.deepEqual(f.reels,[true]);assert.equal(f.screen.snapshot().reeling,true);
 f.screen.pointerDown(f.ray(),'left');f.screen.pointerUp('right');assert.deepEqual(f.reels,[true]);assert.equal(f.screen.snapshot().reeling,true);
 f.screen.pointerUp('left');assert.deepEqual(f.reels,[true,false]);assert.equal(f.screen.snapshot().reeling,false);
 f.screen.dispose();
});
