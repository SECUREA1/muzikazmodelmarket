import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {constructionWorkPose,createConstructionCamera} from '../public/js/construction-camera.js';
import {constructionJointPose,constructionCollisionBoxes,constructionTransform,constructionOperatorPose} from '../public/js/construction-kinematics.js';

const models=['site-excavator','site-bulldozer','site-dumptruck'];
function machine(modelId,extension=0){return {modelId,active:true,position:{x:23,y:2,z:-12},rotation:{y:1.1},scale:{x:1.15,y:1.15,z:1.15},driving:{steering:.8},construction:{swing:extension?.9:0,boom:extension?1.3:.3,stick:extension?-.2:-1.5,bucket:extension?1.2:-1.2,blade:extension?1.2:0,bed:extension?.95:0}};}

test('all work cameras fit the actual implement and body at portrait and landscape aspect ratios',()=>{
 for(const modelId of models)for(const extension of [0,1])for(const aspect of [320/568,390/844,844/390,1.6])for(const fov of [32,60,90]){
  const actor=machine(modelId,extension),saved=structuredClone(actor),pose=constructionWorkPose(actor,null,aspect,fov),camera=new THREE.PerspectiveCamera(fov,aspect,.035,1000);
  camera.position.copy(pose.position);camera.lookAt(pose.target.x,pose.target.y,pose.target.z);camera.updateMatrixWorld(true);
  const points=Object.values(constructionJointPose(actor)).filter(Boolean);
  for(const box of constructionCollisionBoxes(actor))for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])points.push(constructionTransform(box.matrix,[x*box.size.x,y*box.size.y,z*box.size.z]));
  for(const point of points){const projected=new THREE.Vector3(point.x,point.y,point.z).project(camera);assert.ok(Math.abs(projected.x)<.92&&Math.abs(projected.y)<.92&&projected.z<1&&projected.z>-1,`${modelId} fov=${fov} aspect=${aspect} point ${JSON.stringify(point)} outside work view: ${projected.toArray()}`);}
  assert.deepEqual(actor,saved,'view calculations never change authoritative state');
 }
});

test('mobile machines switch between a clear work view and their shared cab eye without moving the rig',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,390/844,.1,1000);scene.add(rig);rig.add(camera);rig.position.set(12,2,-8);rig.rotation.y=.4;
 const view=createConstructionCamera({camera,playerRig:rig});
 for(const modelId of models){const actor=machine(modelId,1),original=structuredClone(actor),rigPosition=rig.position.clone();
  assert.equal(view.update({machine:actor,workView:true}),true);const workEye=camera.getWorldPosition(new THREE.Vector3()),operator=constructionOperatorPose(actor);assert.ok(workEye.distanceTo(new THREE.Vector3(...Object.values(operator.position)))>8);
  view.update({machine:actor,workView:false});const eye=camera.getWorldPosition(new THREE.Vector3());assert.ok(eye.distanceTo(new THREE.Vector3(operator.position.x,operator.position.y,operator.position.z))<1e-6);assert.deepEqual(actor,original);assert.ok(rig.position.equals(rigPosition));
 }
 view.reset();assert.equal(camera.near,.1);
});

test('crane work framing keeps both the suspended beam and tower target visible on upper floors',()=>{
 for(const aspect of [320/568,390/844,844/390,1.6])for(const floor of [4,64])for(const fov of [32,60,90]){
  const actor={modelId:'tower-crane',position:{x:-18,y:0,z:-4},construction:{hook:{x:-8,y:floor+3.5,z:15}}},site={tower:{target:{x:5,y:floor,z:-19}}},pose=constructionWorkPose(actor,site,aspect,fov),camera=new THREE.PerspectiveCamera(fov,aspect,.035,1000);
  camera.position.copy(pose.position);camera.lookAt(pose.target.x,pose.target.y,pose.target.z);camera.updateMatrixWorld(true);
  for(const point of [actor.construction.hook,site.tower.target]){const projected=new THREE.Vector3(point.x,point.y,point.z).project(camera);assert.ok(Math.abs(projected.x)<.9&&Math.abs(projected.y)<.9&&projected.z<1,`crane floor=${floor} aspect=${aspect} clips hook or target`);}
 }
});


test('camera controller fits the actual narrowed lens and optical zoom without changing either setting',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(32,390/844,.1,1000);scene.add(rig);rig.add(camera);camera.zoom=1.25;
 const view=createConstructionCamera({camera,playerRig:rig});
 for(const modelId of models){const actor=machine(modelId,1);view.update({machine:actor,workView:true});
  for(const point of Object.values(constructionJointPose(actor)).filter(Boolean)){const projected=new THREE.Vector3(point.x,point.y,point.z).project(camera);assert.ok(Math.abs(projected.x)<.92&&Math.abs(projected.y)<.92,modelId+' clips its implement at narrowed FOV');}
  assert.equal(camera.fov,32);assert.equal(camera.zoom,1.25);
 }
 view.reset();assert.equal(camera.fov,32);assert.equal(camera.zoom,1.25);
});
