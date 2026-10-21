import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createHarborCamera} from '../public/js/harbor-camera.js';
import {createHarborBoat,HARBOR_HELM_POSES} from '../public/js/harbor-models.js';
for(const modelId of ['harbor-skiff','harbor-sailboat'])test(modelId+' helm follows confirmed waterline and restores walking optics after chase view',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.05,700);rig.position.set(144,.35,30);rig.rotation.y=-Math.PI/2;rig.add(camera);const controller=createHarborCamera({camera,playerRig:rig}),boat={id:'boat',modelId,position:{x:144,y:0,z:30},rotation:{x:.01,y:-Math.PI/2,z:.02}},model=createHarborBoat(modelId),origin=new THREE.Vector3(144,0,30);
 controller.update({boat,model,origin,delta:.016});const expected=new THREE.Vector3(...HARBOR_HELM_POSES[modelId].position).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(.01,-Math.PI/2,.02,'YXZ'))).add(origin);assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);assert.equal(camera.fov,74);assert.equal(model.position.y,0);
 controller.update({boat,model,origin,view:'chase'});assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(origin)>7);controller.reset();assert.equal(camera.fov,68);assert.equal(camera.near,.05);assert.deepEqual(camera.position.toArray(),[0,1.65,0]);
});
