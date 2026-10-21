import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createAircraftCamera} from '../public/js/aircraft-camera.js';
import {AIRCRAFT_COCKPIT_POSE,createAircraftModel} from '../public/js/aircraft-model.js';
import {aircraftGunPose,aircraftRayDistance} from '../public/js/aircraft-combat.js';
test('cockpit eye follows the complete confirmed attitude, chase view preserves the plane, and exit restores walking optics',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.05,700);rig.add(camera);rig.position.set(10,25,50);rig.rotation.y=.4;const controls=createAircraftCamera({camera,playerRig:rig}),model=createAircraftModel(),plane={id:'plane',active:true,position:{x:10,y:25,z:50},rotation:{x:.2,y:.4,z:-.3}};
 controls.update({aircraft:plane,model,origin:rig.position,delta:.016});const expected=new THREE.Vector3(...AIRCRAFT_COCKPIT_POSE.position).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,-.3,'YXZ'))).add(rig.position);assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);assert.ok(model.position.distanceTo(rig.position)<1e-8);assert.equal(camera.fov,74);
 const cockpitDistance=camera.getWorldPosition(new THREE.Vector3()).distanceTo(rig.position);controls.update({aircraft:plane,model,origin:rig.position,view:'chase'});assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(rig.position)>cockpitDistance+8);
 const behind=camera.getWorldPosition(new THREE.Vector3());controls.update({aircraft:plane,model,origin:rig.position,view:'chase',lookYaw:.8});assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(behind)>3,'right-stick look orbits the chase camera');
 controls.reset();assert.equal(camera.near,.05);assert.equal(camera.fov,68);assert.deepEqual(camera.position.toArray(),[0,1.65,0]);assert.deepEqual(camera.up.toArray(),[0,1,0]);
});
test('fixed forward cannons track pitch and bank and hits follow the rotated airframe',()=>{
 const plane={position:{x:0,y:25,z:0},rotation:{x:.3,y:.4,z:-.2}};const pose=aircraftGunPose(plane);assert.ok(pose.direction[1]>0);assert.ok(Math.abs(Math.hypot(...pose.direction)-1)<1e-9);const target={position:{x:pose.origin.x+pose.direction[0]*60,y:pose.origin.y+pose.direction[1]*60,z:pose.origin.z+pose.direction[2]*60},rotation:{...plane.rotation}};assert.ok(aircraftRayDistance(target,pose.origin,pose.direction)>50);
});
for(const view of ['cockpit','chase'])test(view+' applies predicted bank and yaw on the first frame without residual camera delay',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.05,700),model=new THREE.Group();rig.position.set(10,25,50);rig.rotation.y=.4;rig.add(camera);
 const controls=createAircraftCamera({camera,playerRig:rig}),plane={id:'plane',active:true,scale:{x:1.2,y:.9,z:1.1},rotation:{x:0,y:0,z:0}},origin=rig.position,lookYaw=.35,lookPitch=.2,scale=new THREE.Vector3(1.2,.9,1.1);
 controls.update({aircraft:plane,model,origin,view,lookYaw,lookPitch});
 for(const rotation of [{x:.2,y:1.1,z:-.45},{x:-.12,y:-.6,z:.4}]){
  plane.rotation=rotation;
  const body=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x,rotation.y,rotation.z,'YXZ'));
  controls.update({aircraft:plane,model,origin,view,lookYaw,lookPitch,delta:0,immediate:true});
  assert.ok(model.quaternion.angleTo(body)<1e-7,'local airframe attitude changes immediately');
  let expected;
  if(view==='cockpit'){
   expected=new THREE.Vector3(...AIRCRAFT_COCKPIT_POSE.position).multiply(scale).applyQuaternion(body).add(origin);
   const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(lookPitch,lookYaw,0,'YXZ'));
   assert.ok(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(body.clone().multiply(head))<1e-7);
  }else{
   const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(lookPitch*.5,lookYaw,0,'YXZ'));
   expected=new THREE.Vector3(0,3.8,12).multiply(scale).applyQuaternion(head);expected.y=Math.max(1.7,expected.y);expected.applyQuaternion(body).add(origin);
   const target=new THREE.Vector3(0,1,-3).multiply(scale).applyQuaternion(body).add(origin);
   assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(target.sub(expected).normalize())>1-1e-10);
  }
  assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);
  const firstPosition=camera.getWorldPosition(new THREE.Vector3()),firstAttitude=camera.getWorldQuaternion(new THREE.Quaternion());
  controls.update({aircraft:plane,model,origin,view,lookYaw,lookPitch,delta:1/120,immediate:true});
  assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(firstPosition)<1e-8);
  assert.ok(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(firstAttitude)<1e-7);
 }
});
test('aircraft camera preserves eased attitude for callers that omit immediate mode',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(),model=new THREE.Group();rig.add(camera);const controls=createAircraftCamera({camera,playerRig:rig}),plane={id:'plane',rotation:{y:0}};
 controls.update({aircraft:plane,model,origin:rig.position});plane.rotation.y=1;
 controls.update({aircraft:plane,model,origin:rig.position,delta:1/60});
 const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,1,0));
 assert.ok(model.quaternion.angleTo(target)>.5);assert.ok(model.quaternion.angleTo(new THREE.Quaternion())>0);
});
