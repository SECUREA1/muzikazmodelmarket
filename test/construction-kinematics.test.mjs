import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionModel,updateConstructionModel} from '../public/js/construction-models.js';
import {constructionKinematics,constructionCollisionBoxes,constructionJointPose,constructionOperatorPose} from '../public/js/construction-kinematics.js';

const names={slew:'CRANE_SLEW',trolley:'CRANE_TROLLEY',hook:'CRANE_HOOK_BLOCK',front:'TRUCK_ARTICULATED_FRONT',bed:'DUMP_BED_HINGE',tailgate:'DUMP_TAILGATE',blade:'DOZER_BLADE',swing:'EXCAVATOR_SWING',boom:'EXCAVATOR_BOOM',stick:'EXCAVATOR_STICK',bucket:'EXCAVATOR_BUCKET'};
const actor=id=>({id:'test-'+id,modelId:id,position:{x:30,y:1.3,z:-20},rotation:{x:.03,y:1.8,z:-.04},scale:{x:1.2,y:.9,z:1.1},construction:{slew:1.1,trolley:37,hoist:23,bed:.8,blade:.4,boom:.7,stick:-.8,bucket:-.6,swing:1.7},driving:{steering:.7}});
const rendered=entity=>{const root=createConstructionModel(entity.modelId);root.position.copy(entity.position);root.rotation.set(entity.rotation.x,entity.rotation.y,entity.rotation.z);root.scale.copy(entity.scale);root.userData.construction=entity.construction;root.userData.driving=entity.driving;updateConstructionModel(root);return root;};

test('shared collider frames agree with rendered machine joints after rotation and scale',()=>{
 for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const entity=actor(id),root=rendered(entity),pose=constructionKinematics(entity);
  for(const [key,name]of Object.entries(names))if(pose.nodes[key]){const part=root.getObjectByName(name),expected=new THREE.Matrix4().fromArray(pose.world).multiply(new THREE.Matrix4().fromArray(pose.nodes[key].matrix));assert.ok(part,id+' '+name);part.matrixWorld.elements.forEach((value,index)=>assert.ok(Math.abs(value-expected.elements[index])<1e-6,id+' '+key+' matrix '+index));}
  const boxes=constructionCollisionBoxes(entity);assert.ok(boxes.length>=8,id);for(const box of boxes){assert.ok(box.matrix.every(Number.isFinite));assert.ok(Object.values(box.size).every(value=>Number.isFinite(value)&&value>0));assert.equal(box.objectId,entity.id);}
 }
});

test('bucket contact and operator eyes match visible geometry rather than chassis centers',()=>{
 for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const entity=actor(id),root=rendered(entity),parts=root.userData.constructionParts,pose=constructionOperatorPose(entity),cab=id==='tower-crane'?root.getObjectByName('CRANE_GROUND_CONTROL_STATION'):root.getObjectByName('OPERATOR_CAB'),expected=cab.localToWorld(new THREE.Vector3(0,1.37,.25));
  assert.ok(expected.distanceTo(new THREE.Vector3().copy(pose.position))<1e-6,id+' eyes');
  const seat=cab.localToWorld(new THREE.Vector3(0,.54,.25));assert.ok(seat.distanceTo(new THREE.Vector3().copy(pose.seat))<1e-6,id+' seat');
  if(id==='site-excavator'){const teeth=parts.bucket.localToWorld(new THREE.Vector3(0,-.16,-.95));assert.ok(teeth.distanceTo(new THREE.Vector3().copy(constructionJointPose(entity).bucketTip))<1e-6);}
 }
});

test('positive boom lifts and positive stick extends the actual bucket',()=>{
 const entity=actor('site-excavator');entity.position={x:0,y:0,z:0};entity.rotation={x:0,y:0,z:0};entity.scale={x:1,y:1,z:1};entity.construction.swing=0;entity.construction.bucket=0;
 entity.construction.boom=.3;const low=constructionJointPose(entity).bucketPivot;entity.construction.boom=1.3;const high=constructionJointPose(entity).bucketPivot;assert.ok(high.y>low.y+2);
 entity.construction.boom=.7;entity.construction.stick=-1.5;const curled=constructionJointPose(entity).bucketPivot;entity.construction.stick=-.2;const extended=constructionJointPose(entity).bucketPivot;assert.ok(extended.z<curled.z-1);
});

test('client walking and placement use the same hidden solid boxes as authoritative collision',async()=>{
 const {placementMeshes,placementTriangles}=await import('../public/js/placed-item-collision.js');
 const {cloneBuilderRuntime}=await import('../public/js/builder-runtime-clone.js');
 for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const entity=actor(id),original=rendered(entity);
  for(const root of [original,cloneBuilderRuntime(original)]){
   updateConstructionModel(root,1);root.updateMatrixWorld(true);
   const expected=constructionCollisionBoxes(entity),physical=placementMeshes(root);
   assert.equal(physical.length,expected.length,id+' box count');
   physical.forEach((mesh,index)=>{
    const box=expected[index],matrix=new THREE.Matrix4().fromArray(box.matrix).scale(new THREE.Vector3().copy(box.size));
    assert.equal(mesh.userData.constructionCollider,true);assert.equal(mesh.visible,true);assert.equal(mesh.material.visible,false);
    assert.equal(mesh.userData.collisionOnly,true);assert.equal(mesh.geometry.type,'BoxGeometry');assert.equal(mesh.geometry.parameters.width,1);
    mesh.matrixWorld.elements.forEach((value,element)=>assert.ok(Math.abs(value-matrix.elements[element])<1e-6,id+' physical matrix '+index+'/'+element));
   });
   assert.equal(placementTriangles(THREE,[root]).length,expected.length*12,id+' only server boxes become walking triangles');
  }
 }
});

test('dumptruck nose, operator cab and physical steering agree with forward turns',async()=>{
 const {stepRoadVehicle}=await import('../public/js/road-vehicles.js');
 for(const side of [-1,1]){
  const entity={id:'steering-truck',modelId:'site-dumptruck',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},construction:{bed:0},driving:{speed:2,steering:side,parked:false}},pose=constructionKinematics(entity),front=constructionTransformForTest(pose.nodes.front.matrix,[0,1,-3.4]),driven=stepRoadVehicle(entity,{side,forward:1},.1);
  assert.ok(front.x*side>0,'front nose bends into the commanded turn');assert.ok(driven.position.x*side>0,'forward driving moves toward the bent front');assert.ok(constructionOperatorPose(entity).yaw*side<0,'operator view faces the articulated nose');
  const root=rendered(entity),visibleNose=root.getObjectByName('TRUCK_ARTICULATED_FRONT').localToWorld(new THREE.Vector3(0,1,-3.4));assert.ok(visibleNose.distanceTo(new THREE.Vector3(front.x,front.y,front.z))<1e-6);
 }
});
function constructionTransformForTest(matrix,point){return new THREE.Vector3(...point).applyMatrix4(new THREE.Matrix4().fromArray(matrix));}
