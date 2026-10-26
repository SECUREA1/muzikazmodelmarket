import * as THREE from '../vendor/three/three.module.min.js';
import {HARBOR_HELM_POSES} from './harbor-models.js';
import {shippingVesselType} from './shipping-vessel-specs.js';
// This is the floor transform of the seated fisher, not a headset transform.
// WebXR keeps the user's measured height, lean and head orientation intact.
export function fishingSeatPose(boat,side='starboard',castPoint=null){
 const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback,yaw=finite(boat?.rotation?.y),origin=boat?.position||{},sign=side==='port'?-1:1;
 const offset=(x,y,z)=>({x:finite(origin.x)+x*Math.cos(yaw)+z*Math.sin(yaw),y:finite(origin.y)+y,z:finite(origin.z)-x*Math.sin(yaw)+z*Math.cos(yaw)}),eye=offset(sign*.38,1.8,1.65);
 const target=Number.isFinite(castPoint?.x)&&Number.isFinite(castPoint?.z)?{x:castPoint.x,y:finite(castPoint.y,.05),z:castPoint.z}:offset(sign*6.15,.05,.8);
 return {position:{x:eye.x,y:finite(origin.y)+.2,z:eye.z},eye,yaw:Math.atan2(eye.x-target.x,eye.z-target.z),target};
}
export function createHarborCamera({camera,playerRig}){
 const body=new THREE.Quaternion(),attitude=new THREE.Quaternion(),head=new THREE.Quaternion(),inverse=new THREE.Quaternion(),point=new THREE.Vector3(),target=new THREE.Vector3(),focus=new THREE.Quaternion(),focusMatrix=new THREE.Matrix4();let active=null,near=camera.near,fov=camera.fov;
 return {update({boat,model=null,origin,lookYaw=0,lookPitch=0,delta=.016,view='helm',immediate=false,fishingTarget=null}){
  if(!boat||boat.active===false){if(active){camera.near=near;camera.fov=fov;camera.up.set(0,1,0);camera.position.set(0,1.65,0);camera.quaternion.identity();camera.updateProjectionMatrix();active=null;}return false;}
  const pose=HARBOR_HELM_POSES[boat.modelId||boat.asset?.buildAssetId]||{position:[.3,1.43,.72],fov:74};body.setFromEuler(new THREE.Euler(boat.rotation?.x||0,boat.rotation?.y||0,boat.rotation?.z||0,'YXZ'));
  if(active!==boat.id){active=boat.id;near=camera.near;fov=camera.fov;attitude.copy(body);camera.near=.025;camera.fov=pose.fov||74;camera.updateProjectionMatrix();}else if(immediate)attitude.copy(body);else attitude.slerp(body,1-Math.exp(-Math.min(.1,delta)*10));
  if(model){model.position.copy(origin);model.quaternion.copy(attitude);model.updateMatrixWorld(true);}playerRig.updateMatrixWorld(true);playerRig.getWorldQuaternion(inverse).invert();
  if(view==='fishing-port'||view==='fishing-starboard'){const side=view==='fishing-port'?-1:1;point.set(side*.38,1.8,1.65).applyQuaternion(attitude).add(origin);if(Number.isFinite(fishingTarget?.x)&&Number.isFinite(fishingTarget?.z))target.set(fishingTarget.x,Number.isFinite(fishingTarget.y)?fishingTarget.y:.05,fishingTarget.z);else target.set(side*6.15,.05,.8).applyQuaternion(attitude).add(origin);focus.setFromRotationMatrix(focusMatrix.lookAt(point,target,new THREE.Vector3(0,1,0)));head.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(Number.isFinite(lookPitch)?lookPitch:0,-1.15,1.15),Number.isFinite(lookYaw)?lookYaw:0,0,'YXZ'));camera.position.copy(playerRig.worldToLocal(point));camera.up.set(0,1,0);camera.quaternion.copy(inverse).multiply(focus).multiply(head);}else if(view==='chase'){const shipping=shippingVesselType(boat);point.set(0,shipping?shipping.height+8:boat.modelId==='harbor-yacht'?14:boat.modelId==='harbor-patrol'?4.5:3,shipping?shipping.length*1.2:boat.modelId==='harbor-yacht'?38:boat.modelId==='harbor-patrol'?12:7.5).applyQuaternion(attitude).add(origin);target.set(0,shipping?shipping.height*.3:.8,shipping?-shipping.length*.2:-5).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(point));camera.up.set(0,1,0);camera.lookAt(target);}else{point.fromArray(pose.position).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(point));head.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(lookPitch,-.7,.8),THREE.MathUtils.clamp(lookYaw,-1.5,1.5),0,'YXZ'));camera.quaternion.copy(inverse).multiply(attitude).multiply(head);camera.up.set(0,1,0);}camera.updateMatrixWorld(true);return true;
 },reset(){return this.update({boat:null});}};
}
