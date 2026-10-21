import * as THREE from '../vendor/three/three.module.min.js';
import {AIRCRAFT_COCKPIT_POSE} from './aircraft-model.js';
// Camera presentation follows confirmed flight state; it never moves the vehicle.
export function createAircraftCamera({camera,playerRig}){
 const attitude=new THREE.Quaternion(),body=new THREE.Quaternion(),head=new THREE.Quaternion(),inverse=new THREE.Quaternion(),position=new THREE.Vector3(),target=new THREE.Vector3(),up=new THREE.Vector3(),eye=new THREE.Vector3();let activeId=null,originalNear=camera.near,originalFov=camera.fov;
 return {update({aircraft,model=null,origin,lookYaw=0,lookPitch=0,delta=.016,view='cockpit'}){
  if(!aircraft||aircraft.active===false){if(activeId){camera.near=originalNear;camera.fov=originalFov;camera.updateProjectionMatrix();camera.up.set(0,1,0);camera.position.set(0,1.65,0);camera.quaternion.identity();activeId=null;}return false;}
  body.setFromEuler(new THREE.Euler(aircraft.rotation?.x||0,aircraft.rotation?.y||0,aircraft.rotation?.z||0,'YXZ'));
  if(activeId!==aircraft.id){originalNear=camera.near;originalFov=camera.fov;camera.fov=AIRCRAFT_COCKPIT_POSE.fov||74;activeId=aircraft.id;attitude.copy(body);camera.near=.025;camera.updateProjectionMatrix();}else attitude.slerp(body,1-Math.exp(-Math.min(.1,delta)*12));
  if(model){model.position.copy(origin);model.quaternion.copy(attitude);model.updateMatrixWorld(true);}
  playerRig.updateMatrixWorld(true);playerRig.getWorldQuaternion(inverse).invert();
  if(view==='chase'){
   position.set(0,3.8,12).applyQuaternion(attitude).add(origin);target.set(0,1,-12).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(position));up.set(0,1,0).applyQuaternion(attitude);camera.up.copy(up);camera.lookAt(target);
  }else{
   const point=AIRCRAFT_COCKPIT_POSE.position||AIRCRAFT_COCKPIT_POSE.eye||[0,1.6,.65];eye.fromArray(point).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(eye));
   head.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(lookPitch,-.7,.85),THREE.MathUtils.clamp(lookYaw,-1.35,1.35),0,'YXZ'));camera.quaternion.copy(inverse).multiply(attitude).multiply(head);camera.up.set(0,1,0);
  }
  camera.updateMatrixWorld(true);return true;
 },reset(){return this.update({aircraft:null});}};
}
