import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {stackPlacementOffset} from '../public/js/stack-placement.js';
import {createBuildingBlock} from '../public/js/building-materials.js';
import {placementBoxes,resolvePlacedSolids} from '../public/js/placed-item-collision.js';
import {placedCollisionWorld} from '../server-placed-collision.mjs';
const bounds=(x,y,z,w=1,h=1,d=1)=>new THREE.Box3(new THREE.Vector3(x,y,z),new THREE.Vector3(x+w,y+h,z+d));
test('same spot rises through multiple layers while adjacent wall blocks stay level',()=>{
 const cube=bounds(0,0,0),solids=[bounds(0,1,0),bounds(0,0,0)];
 assert.equal(stackPlacementOffset(cube,solids),2);
 assert.equal(stackPlacementOffset(bounds(1,0,0),solids),0);
 assert.equal(stackPlacementOffset(bounds(0,2,0),solids),0);
 assert.equal(stackPlacementOffset(bounds(0,0,0,2,.5,2),solids),2);
 assert.equal(stackPlacementOffset(cube,[bounds(0,5,0)]),0,'distant ceilings do not pull a floor placement upward');
});
test('two real bricks stack two tall, match server colliders and support a landing',()=>{
 const records={},roots=[];
 for(let i=0;i<2;i++){
  const root=createBuildingBlock(THREE,'studs');const local=new THREE.Box3().setFromObject(root);root.position.y=-local.min.y;
  root.updateMatrixWorld(true);root.position.y+=stackPlacementOffset(new THREE.Box3().setFromObject(root),placementBoxes(THREE,roots));root.updateMatrixWorld(true);roots.push(root);
  records[i]={id:String(i),materialId:'studs',position:root.position.toArray(),rotation:[0,0,0],scale:[1,1,1]};
 }
 const boxes=placementBoxes(THREE,roots),server=placedCollisionWorld({},records),top=Math.max(...boxes.map(b=>b.max.y));
 assert.equal(Math.max(...server.boxes.map(b=>b.max.y)),top);
 assert.ok(Math.abs(top-2*(boxes[0].max.y-boxes[0].min.y))<.001);
 const landed=resolvePlacedSolids({x:0,y:top+2,z:0},{x:0,y:top-.1,z:0},server.boxes);
 assert.equal(landed.grounded,true);assert.equal(landed.y,top);
});
