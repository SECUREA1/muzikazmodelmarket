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
for(const view of ['helm','chase'])test(view+' follows predicted boat attitude immediately without changing its helm or chase transform',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.05,700),model=new THREE.Group();rig.position.set(144,.35,30);rig.rotation.y=-Math.PI/2;rig.add(camera);
 const controller=createHarborCamera({camera,playerRig:rig}),boat={id:'boat',modelId:'harbor-skiff',rotation:{x:0,y:0,z:0}},origin=new THREE.Vector3(144,0,30),lookYaw=.35,lookPitch=.2;
 controller.update({boat,model,origin,view,lookYaw,lookPitch});
 for(const rotation of [{x:.05,y:1.1,z:-.3},{x:-.03,y:-.6,z:.2}]){
  boat.rotation=rotation;
  const body=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x,rotation.y,rotation.z,'YXZ'));
  controller.update({boat,model,origin,view,lookYaw,lookPitch,delta:0,immediate:true});
  assert.ok(model.quaternion.angleTo(body)<1e-7,'local boat attitude changes immediately');
  const expected=(view==='helm'?new THREE.Vector3(...HARBOR_HELM_POSES[boat.modelId].position):new THREE.Vector3(0,3,7.5)).applyQuaternion(body).add(origin);
  assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);
  if(view==='helm'){
   const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(lookPitch,lookYaw,0,'YXZ'));
   assert.ok(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(body.clone().multiply(head))<1e-7);
  }else{
   const target=new THREE.Vector3(0,.8,-5).applyQuaternion(body).add(origin);
   assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(target.sub(expected).normalize())>1-1e-10);
  }
  const firstPosition=camera.getWorldPosition(new THREE.Vector3()),firstAttitude=camera.getWorldQuaternion(new THREE.Quaternion());
  controller.update({boat,model,origin,view,lookYaw,lookPitch,delta:1/120,immediate:true});
  assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(firstPosition)<1e-8);
  assert.ok(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(firstAttitude)<1e-7);
 }
});
test('boat camera preserves eased attitude for callers that omit immediate mode',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(),model=new THREE.Group();rig.add(camera);const controller=createHarborCamera({camera,playerRig:rig}),boat={id:'boat',modelId:'harbor-skiff',rotation:{y:0}};
 controller.update({boat,model,origin:rig.position});boat.rotation.y=1;
 controller.update({boat,model,origin:rig.position,delta:1/60});
 const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,1,0));
 assert.ok(model.quaternion.angleTo(target)>.5);assert.ok(model.quaternion.angleTo(new THREE.Quaternion())>0);
});
