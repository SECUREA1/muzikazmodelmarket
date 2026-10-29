import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createQuarryModel,updateQuarryModel} from '../public/js/quarry-models.js';
import {QUARRY_MATERIALS} from '../public/js/quarry-config.js';
const machines=['quarry-screening-plant','quarry-jaw-crusher','quarry-conveyor','quarry-stacker'];
const find=(root,key)=>{const found=[];root.traverse(part=>{if(part.userData[key])found.push(part);});return found;};
function dispose(root){root.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});}
const matrixAt=(mesh,index)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);return [...matrix.elements];};
test('quarry flow stays finite and only appears for running plants with confirmed throughput',()=>{
 for(const id of machines){const root=createQuarryModel(id),flows=find(root,'quarryFlow');assert.ok(flows.length,id);assert.ok(flows.every(mesh=>mesh.isInstancedMesh&&mesh.instanceMatrix.count===24&&mesh.userData.collisionDisabled));
  root.userData.quarryMachine={running:true,throughput:0,payloadVolume:12,material:'sand',materialVolumes:{sand:12,stone:4,crushed:8}};updateQuarryModel(root,1);assert.ok(flows.every(mesh=>!mesh.visible&&mesh.count===0),'buffered stock alone never becomes a moving stream');
  const state={running:true,throughput:2,payloadVolume:4,material:'sand',materialVolumes:{sand:2,stone:1,crushed:1}},saved=structuredClone(state);root.userData.quarryMachine=state;updateQuarryModel(root,1.1);
  assert.ok(flows.some(mesh=>mesh.visible&&mesh.count>0));for(const mesh of flows){assert.ok(mesh.count<=24);if(mesh.visible){const expected=QUARRY_MATERIALS[mesh.userData.quarryFlow.material||'sand'].color;assert.equal(mesh.material.color.getHex(),expected);}}
  const mesh=flows.find(mesh=>mesh.visible),before=matrixAt(mesh,0);updateQuarryModel(root,1.2);assert.notDeepEqual(matrixAt(mesh,0),before,'confirmed material travels along the belt');assert.deepEqual(state,saved,'animation never changes shared stock or machine snapshots');
  state.running=false;updateQuarryModel(root,1.3);assert.ok(flows.every(mesh=>!mesh.visible&&mesh.count===0));dispose(root);
 }
});
test('screen outlets show only the confirmed products and hopper contents follow actual payload',()=>{
 const root=createQuarryModel('quarry-screening-plant'),flows=find(root,'quarryFlow'),hopper=find(root,'quarryHopper')[0];root.userData.quarryMachine={running:true,throughput:1,material:'topsoil',materialVolumes:{topsoil:.75,mulch:.25},payloadVolume:0};updateQuarryModel(root,1);
 assert.ok(flows.filter(mesh=>mesh.userData.quarryFlow.material).every(mesh=>!mesh.visible),'soil feed does not invent mineral products');assert.equal(hopper.visible,false);
 root.userData.quarryMachine={running:true,throughput:1,material:'gravel',materialVolumes:{sand:.2,fines:.2,stone:.6},payloadVolume:3};updateQuarryModel(root,1.1);assert.ok(flows.filter(mesh=>mesh.userData.quarryFlow.material).every(mesh=>mesh.visible));assert.equal(hopper.visible,true);const low=hopper.scale.y;
 root.userData.quarryMachine.payloadVolume=9;updateQuarryModel(root,1.2);assert.ok(hopper.scale.y>low);dispose(root);
});
test('new quarry details keep render budgets bounded and plain conveyor endpoints stay exact',()=>{
 for(const id of machines){const root=createQuarryModel(id);let meshes=0,triangles=0;root.traverse(part=>{if(part.isMesh){meshes++;triangles+=(part.geometry.index?.count||part.geometry.getAttribute('position').count)/3;}});assert.ok(meshes<170,id+' meshes: '+meshes);assert.ok(triangles<4000,id+' triangles: '+triangles);assert.doesNotThrow(()=>JSON.stringify(root.userData));dispose(root);}
 const conveyor=createQuarryModel('quarry-conveyor'),deck=conveyor.getObjectByName('QUARRY_RUBBER_DECK');conveyor.updateMatrixWorld(true);for(const z of [-6,6]){const p=deck.localToWorld(new THREE.Vector3(0,0,z));assert.deepEqual(p.toArray(),[0,1.5,z]);}dispose(conveyor);
});
test('crusher flywheel spokes rotate as one guarded assembly and stop without snapping',()=>{
 const root=createQuarryModel('quarry-jaw-crusher'),wheels=find(root,'quarryFlywheel');assert.equal(wheels.length,2);assert.ok(wheels.every(part=>part.isGroup&&part.children.length>=8));root.userData.quarryMachine={running:true,throughput:.8,material:'stone'};updateQuarryModel(root,1);updateQuarryModel(root,1.1);const angles=wheels.map(part=>part.rotation.x);assert.ok(angles.every(value=>value>0));root.userData.quarryMachine.running=false;updateQuarryModel(root,1.2);assert.deepEqual(wheels.map(part=>part.rotation.x),angles);dispose(root);
});

test('stockpile discharge falls vertically from the real belt end and routed gantries do not spill into the haul road',()=>{
 const root=createQuarryModel('quarry-conveyor'),drop=root.getObjectByName('QUARRY_STOCKPILE_DISCHARGE');root.userData.quarryMachine={running:true,throughput:1,material:'sand',dischargeDrop:8};updateQuarryModel(root,1);updateQuarryModel(root,1.1);assert.ok(drop.visible);assert.equal(drop.position.z,6);for(let i=0;i<drop.count;i++){const matrix=matrixAt(drop,i);assert.equal(matrix[14],0);assert.ok(matrix[13]<=1.5&&matrix[13]>=-6.5);}root.userData.quarryMachine.dischargeDrop=0;updateQuarryModel(root,1.2);assert.equal(drop.visible,false);dispose(root);
 const stacker=createQuarryModel('quarry-stacker');stacker.userData.quarryMachine={running:true,throughput:1,routed:true};updateQuarryModel(stacker,1);assert.ok(find(stacker,'quarryFlow').filter(part=>part.userData.quarryFlow.fall).every(part=>!part.visible));dispose(stacker);
});
