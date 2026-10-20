import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {placementMeshes,placementBounds,placementBoxes,placementTriangles,placementFloorPoint} from '../public/js/placed-item-collision.js';
import {meshStackPlacementOffset} from '../public/js/stack-placement.js';
import {anchorServerAsset} from '../public/js/server-scene-projection.js';
const box=(w,h,d)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('item base aligns with its physical mesh, excluding a lower selection helper',()=>{
 const model=new THREE.Group(),body=box(2,2,2),helper=box(20,20,20);body.position.y=3;helper.userData.avatarCollider=true;body.add(helper);model.add(body);
 const anchored=anchorServerAsset(THREE,model);near(placementBounds(THREE,anchored).min.y,0);
 anchored.position.y=4;anchored.rotation.y=.6;anchored.scale.set(2,1.5,.8);
 const bounds=placementBounds(THREE,anchored);near(bounds.min.y,4);near(bounds.max.y,7);
 const boxes=placementBoxes(THREE,[anchored]);assert.equal(boxes.length,1);near(boxes[0].max.y,7);
});
test('hidden authored floor collider is used instead of a decorative enclosing mesh',()=>{
 const root=new THREE.Group(),visual=box(8,8,8),collider=box(2,.4,2);collider.name='COLLIDER_ITEM_FLOOR';collider.visible=false;collider.position.y=-3.8;root.add(visual,collider);
 assert.deepEqual(placementMeshes(root),[collider]);
 const anchored=anchorServerAsset(THREE,root),bounds=placementBounds(THREE,anchored);near(bounds.min.y,0);near(bounds.max.y,.4);
 const point=placementFloorPoint(THREE,new THREE.Vector3(0,3,0),placementMeshes(anchored));near(point.y,.4);
});
test('ramp stacking uses the actual triangle under the footprint, not the ramp bounding-box top',()=>{
 const root=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,2,4,4,0,4,4,0,0,0,2,4,4,2],3));root.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
 const bounds=new THREE.Box3(new THREE.Vector3(.5,0,.5),new THREE.Vector3(1,1,1));
 near(meshStackPlacementOffset(bounds,placementTriangles(THREE,[root])),1);
 const clear=new THREE.Box3(new THREE.Vector3(5,0,.5),new THREE.Vector3(6,1,1));near(meshStackPlacementOffset(clear,placementTriangles(THREE,[root])),0);
});
test('fallback searches the floor below aim height and returns no placement over an empty gap',()=>{
 const floor=box(5,.4,5),roof=box(5,.4,5);floor.position.y=-.2;roof.position.y=5;floor.updateMatrixWorld(true);roof.updateMatrixWorld(true);
 near(placementFloorPoint(THREE,new THREE.Vector3(0,1.5,0),[floor,roof]).y,0);
 assert.equal(placementFloorPoint(THREE,new THREE.Vector3(10,1.5,0),[floor,roof]),null);
});

test('an item embedded in an existing block rises to its actual top for every layer',()=>{
 const roots=[];
 for(let i=0;i<3;i++){
  const block=box(1,1,1);block.position.y=.5;block.updateMatrixWorld(true);
  const bounds=placementBounds(THREE,block);
  block.position.y+=meshStackPlacementOffset(bounds,placementTriangles(THREE,roots));
  near(placementBounds(THREE,block).min.y,i);roots.push(block);
 }
});
