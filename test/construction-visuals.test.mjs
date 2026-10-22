import {initialConstructionState,craneHookPosition,CONSTRUCTION_LOAD_OFFSET} from '../public/js/construction-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {constructionWorkPose,createConstructionCamera} from '../public/js/construction-camera.js';
import {constructionOperatorPose} from '../public/js/construction-kinematics.js';
import {projectServerActor} from '../public/js/server-scene-projection.js';
import {createConstructionModel,updateConstructionModel} from '../public/js/construction-models.js';

test('shared progress draws rising floors, keeps its target synchronized, and clears on world travel',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene);
 const site={tower:{x:5,z:-10,baseY:0,width:18,depth:18,floorHeight:4,maxFloors:16,placed:4,target:{x:5,y:8,z:-19,yaw:0}},beams:[],excavation:{x:25,z:17,radius:12,depth:1}};
 const snapshot={construction:site},saved=structuredClone(snapshot);view.update(snapshot);view.animate(1);
 const marker=view.root.getObjectByName('NEXT_STEEL_PLACEMENT');assert.deepEqual(marker.position.toArray(),[5,8,-19]);assert.ok(view.root.children[0].children.length>8);
 site.tower.placed=64;site.tower.target=null;view.update(snapshot);assert.equal(view.root.getObjectByName('NEXT_STEEL_PLACEMENT').visible,false);
 view.update(saved);assert.equal(view.root.getObjectByName('NEXT_STEEL_PLACEMENT').position.y,8);assert.deepEqual(saved.construction.excavation,snapshot.construction.excavation);
 view.reset();assert.equal(view.root.visible,false);assert.equal(view.root.children[0].children.length,0);view.dispose();assert.equal(scene.children.length,0);
});

test('anchored construction models animate confirmed joints and hook height without altering room state',()=>{
 const content=createConstructionModel('tower-crane'),anchor=new THREE.Group();anchor.add(content);
 const actor={modelId:'tower-crane',active:true,position:{x:0,y:0,z:0},rotation:{y:0},construction:{kind:'crane',slew:Math.PI/2,trolley:30,hoist:40,load:null}};
 const saved=structuredClone(actor);projectServerActor(anchor,actor);updateConstructionModel(content,1);content.updateMatrixWorld(true);
 const hook=content.getObjectByName('CRANE_HOOK_BLOCK').getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(hook.x-30)<.01);assert.ok(Math.abs(hook.y-40)<.01);assert.ok(Math.abs(hook.z)<.01);assert.deepEqual(actor,saved);
 const dispose=object=>object.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});dispose(anchor);
});

test('crane work camera rises with the active lifting floor and leaves room in portrait view',()=>{
 const actor={position:{x:-18,y:0,z:-4},construction:{hook:{x:-8,y:.8,z:15}}},site={tower:{target:{x:5,y:4,z:-19}}};
 const low=constructionWorkPose(actor,site,1.7),portrait=constructionWorkPose(actor,site,.5);site.tower.target.y=64;actor.construction.hook.y=68;const high=constructionWorkPose(actor,site,1.7);
 assert.ok(high.position.y>low.position.y+40);assert.ok(portrait.position.z>low.position.z);assert.ok(high.position.y>actor.construction.hook.y);assert.ok(Object.values(high.position).every(Number.isFinite));
});

test('a crane rotated in the Builder starts its hook at the shared steel supply',()=>{
 const actor={modelId:'tower-crane',position:{x:10,y:0,z:-4},rotation:{y:Math.PI/2}},supply={x:5,y:.8,z:15};
 actor.construction=initialConstructionState(actor,supply);const hook=craneHookPosition(actor);
 for(const axis of ['x','y','z'])assert.ok(Math.abs(hook[axis]-(supply[axis]+(axis==='y'?CONSTRUCTION_LOAD_OFFSET:0)))<.001);
});

test('operator cameras follow the actual cab eye, excavator swing and articulated truck steering',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.1,700);scene.add(rig);rig.add(camera);const view=createConstructionCamera({camera,playerRig:rig});
 for(const modelId of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const actor={modelId,active:true,position:{x:12,y:2,z:-3},rotation:{y:.6},scale:{x:1,y:1,z:1},driving:{steering:.7},construction:{kind:modelId==='site-excavator'?'excavator':modelId==='tower-crane'?'crane':'truck',swing:1.1}},saved=structuredClone(actor),pose=constructionOperatorPose(actor);
  rig.position.copy(actor.position);rig.rotation.y=1.3;view.update({machine:actor,lookYaw:.25,lookPitch:0});
  const eye=camera.getWorldPosition(new THREE.Vector3()),direction=camera.getWorldDirection(new THREE.Vector3());
  assert.ok(eye.distanceTo(new THREE.Vector3(pose.position.x,pose.position.y,pose.position.z))<1e-6);assert.ok(Math.abs(Math.atan2(-direction.x,-direction.z)-(pose.yaw+.25))<1e-6);assert.deepEqual(actor,saved);
 }
 view.reset();assert.equal(camera.near,.1);
});

test('visible remote operators remain seated in a swinging excavator cab',()=>{
 const actor={id:'excavator',modelId:'site-excavator',position:{x:0,y:0,z:0},rotation:{y:0},scale:{x:1,y:1,z:1},active:true,holderId:'other',construction:{kind:'excavator',swing:1.2},driving:{speed:0}},root=createConstructionModel(actor.modelId);
 projectServerActor(root,actor,{localId:'me'});root.updateMatrixWorld(true);const driver=root.userData.roadDriver,hip=driver.localToWorld(new THREE.Vector3(0,.89,.63)),pose=constructionOperatorPose(actor);
 assert.equal(driver.visible,true);assert.ok(hip.distanceTo(new THREE.Vector3(pose.seat.x,pose.seat.y,pose.seat.z))<1e-6);
 root.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});
});

test('completed structural actors replace guide columns and floors in the scene view',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),site={tower:{x:5,z:-10,baseY:0,width:18,depth:18,floorHeight:4,maxFloors:16,placed:4,target:{x:5,y:8,z:-19,yaw:0}},beams:[]};
 view.update({construction:site});const guideMeshCount=view.root.children[0].children.length;
 view.update({construction:site,actors:{floor:{active:true,constructionStructure:{kind:'floor',floor:1}}}});
 assert.equal(view.root.children[0].children.length,guideMeshCount-5,'confirmed server columns and deck render only once');view.dispose();
});
