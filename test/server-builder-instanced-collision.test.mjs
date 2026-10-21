import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

test('real hockey seating walls occupy every rendered instance instead of the mesh origin',()=>{
 const world=new ServerBuilderCollision().world({id:'hockey-instance-collision',proceduralLand:true,layout:'hockey-arena'});
 const backs=world.floors.find(mesh=>mesh.name==='SPECTATOR_SEAT_BACKS');assert.ok(backs?.isInstancedMesh);
 const triangles=world.triangles.filter(triangle=>triangle.mesh===backs);
 assert.equal(triangles.length,backs.count*8,'each box instance contributes its eight vertical triangles');
 backs.geometry.computeBoundingBox();
 for(const index of [0,Math.floor(backs.count/2),backs.count-1]){
  const instance=new THREE.Matrix4();backs.getMatrixAt(index,instance);
  const expected=backs.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(backs.matrixWorld,instance)),actual=new THREE.Box3();
  for(const triangle of triangles.slice(index*8,index*8+8))for(const point of [triangle.a,triangle.b,triangle.c])actual.expandByPoint(point);
  assert.ok(actual.min.distanceTo(expected.min)<1e-6&&actual.max.distanceTo(expected.max)<1e-6,'seat '+index+' collision follows its full instance transform');
 }
 assert.ok(triangles.every(triangle=>Math.hypot(triangle.a.x,triangle.a.z)>15),'seating does not create a phantom wall at center ice');
});
