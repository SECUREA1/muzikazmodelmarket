import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
test('shared worlds retain floor meshes without building duplicate browser physics; solo retains its tree',async()=>{
 const three=new URL('../public/vendor/three/three.module.min.js',import.meta.url).href;
 const source=(await readFile(new URL('../public/js/environments/environment-collision.js',import.meta.url),'utf8'))
  .replace("'../../vendor/three/three.module.min.js'",JSON.stringify(three))
  .replace("'./collision-policy.js'",JSON.stringify(new URL('../public/js/environments/collision-policy.js',import.meta.url).href))
  .replace(/import \{ Octree \} from [^;]+;/,"class Octree { fromGraphNode(){this.built=true;} }");
 const {buildCollision}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(10,.2,10),new THREE.MeshBasicMaterial());floor.name='GROUND';root.add(floor);root.updateMatrixWorld(true);
 const shared=buildCollision(root,'auto',[],{buildOctree:false});assert.equal(shared.octree.built,undefined);assert.ok(shared.floorMeshes.includes(floor));assert.ok(shared.visibleMeshes.includes(floor));
 const solo=buildCollision(root);assert.equal(solo.octree.built,true);assert.ok(solo.containment.floor);floor.geometry.dispose();floor.material.dispose();
});
