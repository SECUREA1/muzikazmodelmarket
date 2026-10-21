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
 controls.reset();assert.equal(camera.near,.05);assert.equal(camera.fov,68);assert.deepEqual(camera.position.toArray(),[0,1.65,0]);assert.deepEqual(camera.up.toArray(),[0,1,0]);
});
test('fixed forward cannons track pitch and bank and hits follow the rotated airframe',()=>{
 const plane={position:{x:0,y:25,z:0},rotation:{x:.3,y:.4,z:-.2}};const pose=aircraftGunPose(plane);assert.ok(pose.direction[1]>0);assert.ok(Math.abs(Math.hypot(...pose.direction)-1)<1e-9);const target={position:{x:pose.origin.x+pose.direction[0]*60,y:pose.origin.y+pose.direction[1]*60,z:pose.origin.z+pose.direction[2]*60},rotation:{...plane.rotation}};assert.ok(aircraftRayDistance(target,pose.origin,pose.direction)>50);
});
