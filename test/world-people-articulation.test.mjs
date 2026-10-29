import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {constructionOperatorPose} from '../public/js/construction-kinematics.js';

const meshBudget=root=>{let meshes=0,triangles=0;root.traverse(node=>{if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;}});return {meshes,triangles};};
const crewFixture=state=>{const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),worker={id:'joints',name:'Joint test',state,position:{x:0,y:0,z:0},heading:0},snapshot={construction:{crew:{workers:[worker],jobs:[]}},actors:{}};view.update(snapshot);return {view,worker,snapshot,root:view.root.getObjectByName('CONSTRUCTION_WORKER_joints')};};

test('construction hips and ankles articulate the existing crew meshes inside the old rendering budget',()=>{
 const {view,root,snapshot}=crewFixture('walking'),before=structuredClone(snapshot),budget=meshBudget(root),geometries=[];root.traverse(node=>{if(node.isMesh)geometries.push(node.geometry);});
 assert.deepEqual(budget,{meshes:24,triangles:964});
 const hips=root.getObjectByName('CREW_HIPS'),leg=root.getObjectByName('CREW_LEFT_LEG'),knee=leg.getObjectByName('CREW_KNEE'),ankle=leg.getObjectByName('CREW_ANKLE'),elbow=root.getObjectByName('CREW_ELBOW');
 assert.equal(leg.parent,hips);assert.equal(ankle.parent,knee);assert.equal(ankle.children.length,1,'the original boot follows its ankle without new geometry');
 view.animate(0);view.animate(.17);
 assert.notEqual(hips.rotation.y,0);assert.notEqual(knee.rotation.x,0);assert.ok(knee.rotation.x<0,'a backward knee flexion follows the lifted leg');assert.notEqual(ankle.rotation.x,0);assert.notEqual(elbow.rotation.x,0);
 for(let frame=1;frame<=120;frame++)view.animate(.17+frame/60);
 assert.deepEqual(meshBudget(root),budget);let index=0;root.traverse(node=>{if(node.isMesh)assert.equal(node.geometry,geometries[index++],'animation reuses geometry');});assert.deepEqual(snapshot,before,'rendering never advances authoritative jobs');
 view.animate(3,{reducedMotion:true});for(const joint of [hips,leg,knee,ankle,elbow])assert.equal(joint.rotation.x,0);assert.equal(hips.rotation.y,0);assert.equal(hips.rotation.z,0);view.dispose();
});

test('seated construction operators keep exact cabin hip placement and tools follow the elbow',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),worker={id:'joints',state:'waiting',position:{x:0,y:0,z:0}},machine={id:'excavator',modelId:'site-excavator',position:{x:3,y:0,z:4},rotation:{y:.4},construction:{kind:'excavator',swing:.7}};worker.machineId='excavator';view.update({construction:{crew:{workers:[worker]}},actors:{excavator:machine}});view.animate(0);const root=view.root.getObjectByName('CONSTRUCTION_WORKER_joints');root.updateMatrixWorld(true);
 const hips=root.getObjectByName('CREW_HIPS'),pose=constructionOperatorPose(machine);assert.ok(hips.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().copy(pose.seat))<1e-6);assert.equal(root.getObjectByName('CREW_LEFT_LEG').rotation.x,Math.PI/2);assert.equal(root.getObjectByName('CREW_KNEE').rotation.x,-Math.PI/2);assert.equal(root.getObjectByName('CREW_ANKLE').rotation.x,0);view.dispose();
});

test('prison residents bend real elbow and knee vertex rings without additional draws or gameplay mutations',async()=>{
 const {createPrisonLand}=await import('../public/js/prison-world.js'),prison=createPrisonLand(),people=prison.userData.prisonNpcs,actor=[...people.values()][0],savedPosition=actor.position.clone();
 assert.deepEqual(meshBudget(actor),{meshes:14,triangles:474},'guard stays at fourteen draws and below its original552 triangles');
 const hips=actor.getObjectByName('PRISON_RESIDENT_HIPS'),knee=actor.getObjectByName('PRISON_RESIDENT_LEG_LEFT_BEND'),ankle=actor.getObjectByName('PRISON_RESIDENT_LEG_LEFT_END'),elbow=actor.getObjectByName('PRISON_RESIDENT_ARM_LEFT_BEND'),hand=actor.getObjectByName('PRISON_RESIDENT_HAND'),shoe=actor.getObjectByName('PRISON_RESIDENT_SHOE'),limb=actor.getObjectByName('PRISON_RESIDENT_LEG');
 assert.equal(limb.isSkinnedMesh,true);assert.equal(limb.geometry.attributes.skinWeight.count,limb.geometry.attributes.position.count);assert.ok(limb.geometry.attributes.position.count>24,'the trouser has a real intermediate bend ring');assert.equal(shoe.parent,ankle);assert.equal(hand.parent.name,'PRISON_RESIDENT_ARM_LEFT_END');
 const npcs={guard:{id:actor.userData.prisonNpcId,state:'walking',position:{x:savedPosition.x,y:savedPosition.y,z:savedPosition.z}}},state={npcs},saved=structuredClone(state);prison.userData.setPrisonState(state);prison.userData.updatePrisonEffects(.17);
 assert.notEqual(hips.rotation.y,0);assert.notEqual(knee.rotation.x,0);assert.notEqual(ankle.rotation.x,0);assert.notEqual(elbow.rotation.x,0);assert.ok(actor.position.equals(savedPosition));assert.deepEqual(state,saved);
 const geometry=limb.geometry;for(let frame=1;frame<=120;frame++)prison.userData.updatePrisonEffects(.17+frame/60);assert.equal(limb.geometry,geometry);assert.deepEqual(meshBudget(actor),{meshes:14,triangles:474});
 prison.userData.updatePrisonEffects(3,true);assert.equal(hips.rotation.y,0);assert.ok(Math.abs(knee.rotation.x)===0);assert.ok(Math.abs(ankle.rotation.x)===0);assert.ok(Math.abs(elbow.rotation.x)===0);assert.equal(people.size,13);
});
