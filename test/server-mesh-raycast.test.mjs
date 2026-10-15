import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {accelerateStaticRaycast} from '../server-mesh-raycast.mjs';

test('static triangle acceleration retains exact floor, wall, and transformed ray hits',()=>{
 for(const indexed of [true,false]){
  let geometry=new THREE.SphereGeometry(2,32,24);if(!indexed)geometry=geometry.toNonIndexed();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(2,3,-4);mesh.scale.set(2,1,.5);mesh.rotation.set(.2,.4,.1);mesh.updateMatrixWorld(true);
  const rays=Array.from({length:25},(_,i)=>new THREE.Raycaster(new THREE.Vector3(2+(i%5-2)*.7,8,-4+Math.floor(i/5)-2),new THREE.Vector3(0,-1,0),.01,20));
  const before=rays.map(ray=>ray.intersectObject(mesh,false));accelerateStaticRaycast(mesh);
  for(const [i,ray] of rays.entries()){
   const after=ray.intersectObject(mesh,false);assert.equal(after.length,before[i].length);
   after.forEach((hit,j)=>{assert.ok(Math.abs(hit.distance-before[i][j].distance)<1e-7);assert.ok(hit.point.distanceTo(before[i][j].point)<1e-7);assert.ok(hit.face.normal.distanceTo(before[i][j].face.normal)<1e-7);});
  }
  geometry.dispose();mesh.material.dispose();
 }
});
