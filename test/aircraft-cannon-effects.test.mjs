import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {AircraftCannonEffects} from '../public/js/aircraft-cannon-effects.js';
import {AIRCRAFT_CANNON_PORTS} from '../public/js/aircraft-model.js';
import {aircraftGunPose,AIRCRAFT_GUN_RANGE} from '../public/js/aircraft-combat.js';

const plane=()=>({id:'pilot-plane',position:{x:12,y:35,z:8},rotation:{x:.22,y:.7,z:-.3},scale:{x:1.2,y:1.1,z:.9},health:400,active:true});
function matrixAt(mesh,index){const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);return matrix;}
function positionAt(mesh,index){return new THREE.Vector3().setFromMatrixPosition(matrixAt(mesh,index));}
function directionAt(mesh,index){const elements=matrixAt(mesh,index).elements;return new THREE.Vector3(elements[4],elements[5],elements[6]).normalize();}
const close=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<2e-5,message+' '+actual.toArray()+' expected '+expected.toArray());

test('cannon feedback immediately uses both wings at the predicted pitched, banked airframe pose',()=>{
 const scene=new THREE.Scene(),effects=new AircraftCannonEffects({scene}),actor=plane(),before=JSON.stringify(actor),aim=aircraftGunPose(actor);
 const orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(actor.rotation.x,actor.rotation.y,actor.rotation.z,'YXZ'));
 const target=new THREE.Vector3(aim.origin.x,aim.origin.y,aim.origin.z).addScaledVector(new THREE.Vector3(...aim.direction),150);
 assert.equal(effects.fire(actor,aim),true);assert.equal(effects.activeCount,1);assert.equal(effects.root.visible,true);assert.ok(scene.children.includes(effects.root));
 for(let side=0;side<2;side++){
  const expected=new THREE.Vector3(...AIRCRAFT_CANNON_PORTS[side]).multiply(new THREE.Vector3(actor.scale.x,actor.scale.y,actor.scale.z)).applyQuaternion(orientation).add(new THREE.Vector3(actor.position.x,actor.position.y,actor.position.z));
  close(positionAt(effects.flashes,side),expected,'flash starts at its actual wing barrel');
  const ray=directionAt(effects.core,side),distance=target.distanceTo(expected);
  close(expected.clone().addScaledVector(ray,distance),target,'paired tracers converge at the centered gun aim');
  assert.ok(matrixAt(effects.flashes,side).determinant()>0,'the muzzle is already visible without a network response or update');
 }
 assert.equal(JSON.stringify(actor),before,'cosmetics never apply damage or alter flight physics');effects.dispose();
});
test('pooled tracers reach the full cannon range and fresh flashes survive a slow first render',()=>{
 const effects=new AircraftCannonEffects(),actor=plane();effects.fire(actor);
 const origin=effects.slots[0].origins[0].clone(),direction=effects.slots[0].directions[0].clone();
 effects.update(.2);assert.ok(matrixAt(effects.flashes,0).determinant()>0,'preceding frame time does not erase a newly emitted muzzle');
 effects.update(.2);assert.equal(matrixAt(effects.flashes,0).determinant(),0,'flash ends independently of the tracer');
 const distance=positionAt(effects.core,0).sub(origin).dot(direction);assert.ok(distance>40&&distance<70,'tracer advances beyond the old forty metre laser cap');
 let furthest=distance;
 for(let frame=0;frame<45;frame++){
  effects.update(1/60);if(effects.activeCount)furthest=Math.max(furthest,positionAt(effects.core,0).sub(origin).dot(direction));
 }
 assert.ok(furthest>AIRCRAFT_GUN_RANGE-30,'cannon trail covers distant aircraft');
 effects.update(.2);assert.equal(effects.activeCount,0);assert.equal(effects.root.visible,false);
 for(let index=0;index<effects.capacity*2;index++)assert.equal(matrixAt(effects.core,index).determinant(),0);
 effects.dispose();
});
test('rapid fire recycles a bounded set of GPU buffers, materials, and preallocated volley slots',()=>{
 const scene=new THREE.Scene(),effects=new AircraftCannonEffects({scene,capacity:2}),actor=plane(),aim=aircraftGunPose(actor);
 const slots=effects.slots.slice(),origins=effects.slots.map(slot=>slot.origins.slice()),directions=effects.slots.map(slot=>slot.directions.slice());
 const batches=effects.root.children.slice(),buffers=batches.map(batch=>batch.instanceMatrix.array),geometries=batches.map(batch=>batch.geometry),materials=batches.map(batch=>batch.material);
 for(let volley=0;volley<1000;volley++){
  actor.position.x=volley;assert.equal(effects.fire(actor,aim),true);effects.update(1/60);
  assert.ok(effects.activeCount<=2);assert.equal(scene.children.length,1);assert.equal(effects.root.children.length,3);
 }
 assert.equal(effects.activeCount,2);
 for(let index=0;index<2;index++){
  assert.equal(effects.slots[index],slots[index]);
  for(let side=0;side<2;side++){assert.equal(effects.slots[index].origins[side],origins[index][side]);assert.equal(effects.slots[index].directions[side],directions[index][side]);}
 }
 for(let index=0;index<batches.length;index++){
  assert.equal(effects.root.children[index],batches[index]);assert.equal(batches[index].instanceMatrix.array,buffers[index]);assert.equal(batches[index].geometry,geometries[index]);assert.equal(batches[index].material,materials[index]);
  assert.ok(buffers[index].every(Number.isFinite));assert.equal(batches[index].count,4);
 }
 effects.dispose();
});
test('cannon effects never become colliders or ray targets and reset clears every volley',()=>{
 const effects=new AircraftCannonEffects({capacity:3}),actor=plane();effects.fire(actor);effects.fire(actor);
 effects.root.updateMatrixWorld(true);
 const origin=effects.slots[0].origins[0],direction=effects.slots[0].directions[0],raycaster=new THREE.Raycaster(origin,direction,0,300);
 assert.deepEqual(raycaster.intersectObject(effects.root,true),[]);
 effects.root.traverse(node=>{assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.collider,false);});
 effects.reset();assert.equal(effects.activeCount,0);assert.equal(effects.root.visible,false);assert.equal(effects.cursor,0);
 for(const batch of effects.root.children)for(let index=0;index<6;index++)assert.equal(matrixAt(batch,index).determinant(),0);
 assert.equal(effects.fire(actor),true,'a map reset leaves the pool reusable');effects.dispose();
});
test('invalid fire data leaves the pool intact and disposal releases its shared resources once',()=>{
 const scene=new THREE.Scene(),effects=new AircraftCannonEffects({scene}),actor=plane();
 for(const invalid of [null,{position:{x:NaN,y:0,z:0}},{...actor,active:false},{...actor,health:0}])assert.equal(effects.fire(invalid),false);
 for(const direction of [[0,0,0],[NaN,0,-1],[0,Infinity,0],{x:0,y:0,z:NaN}])assert.equal(effects.fire(actor,{direction}),false);
 assert.equal(effects.activeCount,0);assert.equal(effects.cursor,0);
 assert.equal(effects.fire(actor,{direction:{x:0,y:0,z:-4}}),true);effects.update(NaN);effects.update(-10);
 for(const batch of effects.root.children)assert.ok(batch.instanceMatrix.array.every(Number.isFinite));
 const resources=[effects.glow,effects.core,effects.flashes,effects.tracerGeometry,effects.flashGeometry,effects.glowMaterial,effects.coreMaterial,effects.flashMaterial],released=new Map();
 for(const resource of resources)resource.addEventListener('dispose',()=>released.set(resource,(released.get(resource)||0)+1));
 effects.dispose();effects.dispose();assert.equal(scene.children.length,0);assert.equal(effects.fire(actor),false);
 for(const resource of resources)assert.equal(released.get(resource),1);
});
