import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGameItems} from '../public/js/game-load-work.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
test('world item preparation yields in bounded batches and stops immediately on a map switch',async()=>{
 const seen=[],progress=[];let active=true,yields=0;
 const completed=await prepareGameItems(Array.from({length:100},(_,i)=>i),item=>seen.push(item),{current:()=>active,progress:n=>progress.push(n),yieldTask:async()=>{yields++;if(yields===2)active=false;}});
 assert.equal(completed,false);assert.deepEqual(seen,[0,1,2,3,4,5,6,7]);assert.deepEqual(progress,[4,8]);
});
test('dense shared maps retain all floors while avoiding a second collision tree',()=>{
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100,100,100),new THREE.MeshBasicMaterial());floor.name='FLOOR';floor.rotation.x=-Math.PI/2;root.add(floor);
 const collision=buildCollision(root,'auto',[],{buildOctree:true,maxTriangles:100});assert.equal(collision.octreeBuilt,false);assert.equal(collision.triangleCount,20000);assert.ok(collision.floorMeshes.includes(floor));assert.ok(collision.collisionMeshes.includes(floor));assert.ok(Math.abs(new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObjects(collision.floorMeshes,false)[0].point.y)<1e-6);
 const small=new THREE.Group();small.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));assert.equal(buildCollision(small,'auto',[],{maxTriangles:100}).octreeBuilt,true);
});
