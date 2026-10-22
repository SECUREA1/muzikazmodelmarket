import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionModel,updateConstructionModel,CONSTRUCTION_MODEL_IDS} from '../public/js/construction-models.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {ROAD_VEHICLES,stepRoadVehicle} from '../public/js/road-vehicles.js';

test('crane rope and trolley agree with server hoist coordinates',()=>{
 const root=createConstructionModel('tower-crane');
 root.userData.construction={slew:Math.PI/2,trolley:24,hoist:33};updateConstructionModel(root,4);root.updateMatrixWorld(true);
 const hook=root.getObjectByName('CRANE_HOOK_BLOCK').getWorldPosition(new THREE.Vector3());
 assert.ok(Math.abs(hook.x-24)<.001);assert.ok(Math.abs(hook.z)<.001);assert.ok(Math.abs(hook.y-33)<.001);
 const cab=root.getObjectByName('CRANE_GROUND_CONTROL_STATION');assert.ok(cab.position.y<1);
});

test('construction hydraulic models articulate from shared state with finite geometry',()=>{
 for(const id of CONSTRUCTION_MODEL_IDS){
  const root=createConstructionModel(id);assert.ok(root.userData.constructionModel);
  root.userData.construction={bed:.8,load:5,blade:.9,boom:1.2,stick:-1.4,bucket:.6,swing:.8};root.userData.driving={distance:3,speed:2};updateConstructionModel(root,2);
  root.traverse(part=>{assert.ok(Number.isFinite(part.position.x+part.position.y+part.position.z));assert.ok(Number.isFinite(part.quaternion.x+part.quaternion.y+part.quaternion.z+part.quaternion.w));});
  const bounds=new THREE.Box3().setFromObject(root);assert.ok(bounds.max.y>bounds.min.y);
  if(id==='site-dumptruck'){assert.equal(root.getObjectByName('DUMP_BED_HINGE').rotation.x,.8);assert.equal(root.userData.constructionParts.load.visible,true);}
  if(id==='site-bulldozer')assert.ok(root.getObjectByName('DOZER_BLADE').position.y>1);
  if(id==='site-excavator')assert.equal(root.getObjectByName('EXCAVATOR_SWING').rotation.y,.8);
 }
});

test('tracked machines pivot at rest while crane base stays fixed',()=>{
 for(const id of ['site-bulldozer','site-excavator','tower-crane']){
  const actor={modelId:id,position:{x:0,y:0,z:0},rotation:{y:0},driving:{speed:0}};
  const next=stepRoadVehicle(actor,{side:1,forward:0},.1);
  assert.equal(next.position.x,0);assert.equal(next.position.z,0);
  assert.equal(id==='tower-crane'?next.rotation.y===0:next.rotation.y<0,true);
  assert.equal(ROAD_VEHICLES[id].siteOnly,true);
 }
});

test('every construction model has an editable catalogue entry and SVG illustration',async()=>{
 const {assets}=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8'));
 for(const id of CONSTRUCTION_MODEL_IDS){const item=assets.find(asset=>asset.buildAssetId===id);assert.ok(item,id);assert.equal(item.format,'procedural-3d');assert.match(await readFile(new URL('../'+item.thumbnailUrl.replace(/^\//,''),import.meta.url),'utf8'),/<svg/);}
});

test('editable construction copies animate their own hydraulic joints',()=>{
 for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){const source=createConstructionModel(id),copy=cloneBuilderRuntime(source);assert.notEqual(copy.userData.constructionParts,source.userData.constructionParts);copy.userData.construction={slew:1,trolley:35,hoist:50,bed:.8,blade:.5,boom:1.2,stick:-1,bucket:.7};updateConstructionModel(copy,5);const sourceRam=source.userData.constructionParts.hydraulics[0],copyRam=copy.userData.constructionParts.hydraulics[0];if(sourceRam){assert.notEqual(sourceRam.assembly,copyRam.assembly);assert.ok(copyRam.rod.scale.y>0);}if(id==='tower-crane'){assert.equal(source.getObjectByName('CRANE_SLEW').rotation.y,0);assert.equal(copy.getObjectByName('CRANE_SLEW').rotation.y,1);}}
});

test('hydraulic rods and dozer arms stay pinned at both ends through full travel and cloning',()=>{
 const close=(a,b,message)=>assert.ok(a.distanceTo(b)<1e-6,message+': '+a.distanceTo(b));
 for(const id of ['site-dumptruck','site-bulldozer','site-excavator'])for(const cloned of [false,true]){
  const original=createConstructionModel(id),root=cloned?cloneBuilderRuntime(original):original;
  root.position.set(13,2,-17);root.rotation.set(.04,1.2,-.03);root.scale.set(1.3,.8,1.1);
  for(const state of [{bed:0,blade:0,boom:.3,stick:-1.5,bucket:-1.2,swing:-2},{bed:.95,blade:1.2,boom:1.3,stick:-.2,bucket:1.2,swing:2},{bed:.45,blade:.6,boom:.8,stick:-.8,bucket:.2,swing:.6}]){
   root.userData.construction=state;root.userData.driving={steering:.8};updateConstructionModel(root,2);root.updateMatrixWorld(true);
   const point=(descriptor,parent)=>Array.isArray(descriptor)?parent.localToWorld(new THREE.Vector3(...descriptor)):descriptor.frame.localToWorld(new THREE.Vector3(...descriptor.point));
   for(const ram of root.userData.constructionParts.hydraulics){
    close(ram.body.localToWorld(new THREE.Vector3(0,-.5,0)),point(ram.a,ram.assembly.parent),id+' cylinder base');
    close(ram.rod.localToWorld(new THREE.Vector3(0,.5,0)),point(ram.b,ram.assembly.parent),id+' piston eye');
    close(ram.eyeB.getWorldPosition(new THREE.Vector3()),point(ram.b,ram.assembly.parent),id+' pin and cap');
   }
   for(const link of root.userData.constructionParts.links){close(link.part.localToWorld(new THREE.Vector3(0,-.5,0)),point(link.a,link.part.parent),id+' link start');close(link.part.localToWorld(new THREE.Vector3(0,.5,0)),point(link.b,link.part.parent),id+' link end');}
  }
 }
});

test('dump body raises its front while the gate remains connected and hangs vertically',()=>{
 const root=createConstructionModel('site-dumptruck'),parts=root.userData.constructionParts,front=new THREE.Vector3(0,.1,-4.9);
 root.userData.construction={bed:0};updateConstructionModel(root);const low=parts.bed.localToWorld(front.clone());
 root.userData.construction={bed:.95};updateConstructionModel(root);const high=parts.bed.localToWorld(front.clone());assert.ok(high.y>low.y+3);
 const gateUp=new THREE.Vector3(0,1,0).transformDirection(parts.tailgate.matrixWorld);assert.ok(gateUp.distanceTo(new THREE.Vector3(0,1,0))<1e-6);
 const bedHinge=parts.bed.localToWorld(new THREE.Vector3(0,1,.2)),gateHinge=parts.tailgate.getWorldPosition(new THREE.Vector3());assert.ok(gateHinge.distanceTo(bedHinge)<1e-6);
});

test('crane slings connect hook to both beam shackles as the payload rotates',()=>{
 const source=createConstructionModel('tower-crane');
 for(const root of [source,cloneBuilderRuntime(source)])for(const loadYaw of [0,Math.PI/2,-.7]){
  root.position.set(7,0,-2);root.rotation.y=.9;root.userData.construction={slew:.8,trolley:26,hoist:12,load:'steel-beam',loadYaw};updateConstructionModel(root,4);root.updateMatrixWorld(true);
  const parts=root.userData.constructionParts,hook=parts.hook.getWorldPosition(new THREE.Vector3());assert.equal(parts.slingFrame.visible,true);
  for(const {side,part}of parts.slings){const top=part.localToWorld(new THREE.Vector3(0,-.5,0)),bottom=part.localToWorld(new THREE.Vector3(0,.5,0)),expectedBottom=new THREE.Vector3(hook.x+Math.cos(loadYaw)*side*4,hook.y-3.5+.65,hook.z-Math.sin(loadYaw)*side*4),expectedTop=parts.slingFrame.localToWorld(new THREE.Vector3(0,-.4,0));assert.ok(top.distanceTo(expectedTop)<1e-6);assert.ok(bottom.distanceTo(expectedBottom)<1e-6);}
  root.userData.construction.load=null;updateConstructionModel(root,5);assert.equal(parts.slingFrame.visible,false);
 }
});

test('a blocked track pivot preserves the physical chassis heading and position',()=>{
 const actor={id:'blocked-dozer',modelId:'site-bulldozer',position:{x:2,y:0,z:3},rotation:{y:.4},driving:{speed:0}};
 const next=stepRoadVehicle(actor,{side:1},.1,{groundAt:point=>point,blocked:()=>true});assert.equal(next.rotation.y,.4);assert.deepEqual(next.position,actor.position);assert.equal(next.driving.blocked,true);
});

test('side-only steering counter-rotates crawler tracks and blocked pivots stop them',()=>{
 for(const id of ['site-bulldozer','site-excavator'])for(const cloned of [false,true]){
  const original=createConstructionModel(id),root=cloned?cloneBuilderRuntime(original):original;
  root.userData.driving={speed:0,steering:0};updateConstructionModel(root,0);
  const tracks=root.userData.constructionParts.tracks,positions=()=>tracks.map(({shoes})=>shoes[6].position.z),before=positions();
  root.userData.driving={speed:0,steering:1,blocked:false};updateConstructionModel(root,.1);const turning=positions();
  assert.ok(turning[0]>before[0],id+' left track advances when turning right');assert.ok(turning[1]<before[1],id+' right track reverses during pivot');
  assert.ok(Math.abs((turning[0]-before[0])+(turning[1]-before[1]))<1e-6,id+' equal opposing track travel at rest');
  root.userData.driving.blocked=true;updateConstructionModel(root,.2);assert.deepEqual(positions(),turning,id+' blocked chassis cannot move its track shoes');
  root.userData.driving={speed:-1,steering:0,blocked:false};updateConstructionModel(root,.3);const reversed=positions();assert.ok(reversed.every((z,index)=>z<turning[index]),id+' both tracks reverse with reverse travel');
 }
});

test('cab levers visibly push to extend and pull to lift, including cloned controls and spreader yaw',()=>{
 for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator'])for(const cloned of [false,true]){
  const original=createConstructionModel(id),root=cloned?cloneBuilderRuntime(original):original,point=mesh=>new THREE.Vector3(0,.28,-.1).applyMatrix4(mesh.matrix);
  root.userData.construction={axes:{}};updateConstructionModel(root,0);const joysticks=root.userData.constructionParts.joysticks,neutral=joysticks.map(({mesh})=>point(mesh));
  for(const demand of [-1,1]){
   root.userData.construction={axes:Object.fromEntries(['slew','trolley','hoist','loadYaw','stick','boom','bucket','bed','blade'].map(axis=>[axis,demand]))};updateConstructionModel(root,1);
   joysticks.forEach(({mesh,side},index)=>{const moved=point(mesh),pushToExtend=(id==='tower-crane'||id==='site-excavator')&&side<0;assert.ok((moved.z-neutral[index].z)*demand*(pushToExtend?-1:1)>0,id+' visible handle direction matches extension/lift control');if(id==='tower-crane'&&side>0)assert.ok((moved.x-neutral[index].x)*demand>0,'spreader yaw moves the right crane handle horizontally');});
  }
  root.userData.construction={axes:{}};updateConstructionModel(root,2);joysticks.forEach(({mesh},index)=>assert.ok(point(mesh).distanceTo(neutral[index])<1e-9,id+' controls return to visible neutral'));
 }
});
