import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mirrorMapMeshes} from '../public/js/local-map-3d.js';
test('map mirrors actual transformed game meshes without altering or disposing shared resources',()=>{
 const parent=new THREE.Group(),root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,4),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);parent.position.set(10,2,-8);root.rotation.y=.7;root.scale.setScalar(2);mesh.position.set(3,0,9);parent.add(root);root.add(mesh);
 const map=mirrorMapMeshes([root]),copy=map.group.children[0];assert.deepEqual(copy.matrix.elements,mesh.matrixWorld.elements);assert.equal(copy.geometry,geometry);assert.equal(copy.material,material);assert.equal(mesh.parent,root);
 assert.equal(map.update(),false,'idle geometry does not request a redraw');mesh.position.x=14;assert.equal(map.update(),true);assert.deepEqual(copy.matrix.elements,mesh.matrixWorld.elements);
 root.visible=false;map.update();assert.equal(copy.visible,false);
 let disposed=0;geometry.addEventListener('dispose',()=>disposed++);material.addEventListener('dispose',()=>disposed++);map.dispose();assert.equal(disposed,0);assert.equal(root.children[0],mesh);
});
test('instanced map objects retain exact game instance transforms',()=>{
 const root=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2);mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(20,4,-30));root.add(mesh);const map=mirrorMapMeshes([root]),copy=map.group.children[0];assert.equal(copy.instanceMatrix,mesh.instanceMatrix);assert.equal(copy.count,2);map.dispose();
});
