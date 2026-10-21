import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {buildCollision,alignPointAboveFloor} from '../public/js/environments/environment-collision.js';
import {LocalWalkingView} from '../public/js/local-walking-view.js';
import {createVehicleCollision} from '../public/js/local-vehicle-collision.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
const down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
function floorRoot({mirrored=true}={}){
 const root=new THREE.Group(),parent=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));parent.position.set(11,4,-7);parent.rotation.y=.35;parent.scale.set(mirrored?-1:1,1,1);floor.rotation.x=-Math.PI/2;floor.name='FLOOR_UPPER_DECK';parent.add(floor);root.add(parent);
 const pillar=createBuilderModel('material:round-column');pillar.position.set(18,0,-1);root.add(pillar);root.updateMatrixWorld(true);return {root,floor};
}
function remainSupported(collision,position){const view=new LocalWalkingView(),target={};view.reconcile(position,{receivedAt:0,grounded:true});for(let frame=1;frame<=30;frame++)view.sample(frame*1000/60,1/60,{side:.1},{octree:collision.octree},target);assert.ok(Math.abs(target.y-position.y)<1e-6,'feet must stay at '+position.y+', got '+target.y);assert.equal(view.grounded,true);}
test('reflected upper-deck floor remains a floor instead of falling to the map containment base',()=>{
 const {root,floor}=floorRoot(),positions=Array.from(floor.geometry.attributes.position.array),normals=Array.from(floor.geometry.attributes.normal.array),index=Array.from(floor.geometry.index.array),collision=buildCollision(root);
 const hit=collision.octree.rayIntersect(new THREE.Ray(new THREE.Vector3(11,6,-7),down));assert.ok(hit);assert.ok(Math.abs(hit.position.y-4)<1e-7);assert.ok(hit.triangle.getNormal(new THREE.Vector3()).y>.99);remainSupported(collision,{x:11,y:4.02,z:-7});assert.ok(Math.abs(createVehicleCollision({octree:collision.octree}).groundAt({x:11,y:6,z:-7}).y-4.02)<1e-7);
 assert.deepEqual(Array.from(floor.geometry.attributes.position.array),positions);assert.deepEqual(Array.from(floor.geometry.attributes.normal.array),normals);assert.deepEqual(Array.from(floor.geometry.index.array),index);
});
test('nested reflected floors and ceilings retain their outward-facing collision normals',()=>{
 const {root}=floorRoot(),nested=new THREE.Group(),ceiling=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));nested.position.set(11,7,-7);nested.scale.x=-1;ceiling.rotation.x=Math.PI/2;ceiling.name='CEILING';nested.add(ceiling);root.add(nested);const collision=buildCollision(root);
 const hit=collision.octree.rayIntersect(new THREE.Ray(new THREE.Vector3(11,6,-7),up));assert.ok(hit);assert.ok(Math.abs(hit.position.y-7)<1e-7);assert.ok(hit.triangle.getNormal(new THREE.Vector3()).y<-.99);
});
test('every transformed map floor instance supports walking, including reflected instance matrices',()=>{
 const root=new THREE.Group(),parent=new THREE.Group();parent.position.set(30,2,-5);parent.rotation.y=.25;parent.scale.set(-1,1,1);const geometry=new THREE.PlaneGeometry(8,8);geometry.rotateX(-Math.PI/2);const floors=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),2);floors.name='INSTANCED_FLOOR';
 const first=new THREE.Matrix4().makeTranslation(0,2,0),second=new THREE.Matrix4().compose(new THREE.Vector3(12,5,0),new THREE.Quaternion(),new THREE.Vector3(-1,1,1));floors.setMatrixAt(0,first);floors.setMatrixAt(1,second);parent.add(floors);root.add(parent);root.updateMatrixWorld(true);const collision=buildCollision(root);
 for(const local of [new THREE.Vector3(0,2,0),new THREE.Vector3(12,5,0)]){const world=local.clone().applyMatrix4(parent.matrixWorld),hit=collision.octree.rayIntersect(new THREE.Ray(world.clone().add(new THREE.Vector3(0,1,0)),down));assert.ok(hit);assert.ok(Math.abs(hit.position.y-world.y)<1e-7);assert.ok(hit.triangle.getNormal(new THREE.Vector3()).y>.99);remainSupported(collision,{x:world.x,y:world.y+.02,z:world.z});}
});
test('spawn sampling uses inverse-transpose normals under nonuniform parent scales',()=>{
 const root=new THREE.Group(),parent=new THREE.Group(),geometry=new THREE.PlaneGeometry(20,20);geometry.rotateX(-Math.PI/2);const floor=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));floor.name='FLOOR';floor.rotation.z=Math.PI/4;parent.position.y=4;parent.scale.set(10,.1,1);parent.add(floor);root.add(parent);root.updateMatrixWorld(true);const result=alignPointAboveFloor(new THREE.Vector3(0,0,0),[floor],new THREE.Box3().setFromObject(root));assert.ok(Math.abs(result.y-4.02)<1e-7,'a physically gentle floor remains spawnable after nonuniform scaling');
});
test('spawn sampling includes instance transforms when rejecting steep surfaces above a real floor',()=>{
 const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(8,8);geometry.rotateX(-Math.PI/2);const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ground=new THREE.Mesh(geometry,material),upper=new THREE.InstancedMesh(geometry,material,1);ground.name='FLOOR';upper.name='INSTANCED_FLOOR';upper.setMatrixAt(0,new THREE.Matrix4().compose(new THREE.Vector3(0,4,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,Math.PI/3)),new THREE.Vector3(1,1,1)));root.add(ground,upper);root.updateMatrixWorld(true);const result=alignPointAboveFloor(new THREE.Vector3(0,0,0),[upper,ground],new THREE.Box3().setFromObject(root));assert.ok(Math.abs(result.y-.02)<1e-7,'the instance slope is checked instead of the unrotated source normal');
});
