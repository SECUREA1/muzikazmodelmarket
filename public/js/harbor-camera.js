import * as THREE from '../vendor/three/three.module.min.js';
import {HARBOR_HELM_POSES} from './harbor-models.js';
export function createHarborCamera({camera,playerRig}){
 const body=new THREE.Quaternion(),attitude=new THREE.Quaternion(),head=new THREE.Quaternion(),inverse=new THREE.Quaternion(),point=new THREE.Vector3(),target=new THREE.Vector3();let active=null,near=camera.near,fov=camera.fov;
 return {update({boat,model=null,origin,lookYaw=0,lookPitch=0,delta=.016,view='helm',immediate=false}){
  if(!boat||boat.active===false){if(active){camera.near=near;camera.fov=fov;camera.up.set(0,1,0);camera.position.set(0,1.65,0);camera.quaternion.identity();camera.updateProjectionMatrix();active=null;}return false;}
  const pose=HARBOR_HELM_POSES[boat.modelId||boat.asset?.buildAssetId]||{position:[.3,1.43,.72],fov:74};body.setFromEuler(new THREE.Euler(boat.rotation?.x||0,boat.rotation?.y||0,boat.rotation?.z||0,'YXZ'));
  if(active!==boat.id){active=boat.id;near=camera.near;fov=camera.fov;attitude.copy(body);camera.near=.025;camera.fov=pose.fov||74;camera.updateProjectionMatrix();}else if(immediate)attitude.copy(body);else attitude.slerp(body,1-Math.exp(-Math.min(.1,delta)*10));
  if(model){model.position.copy(origin);model.quaternion.copy(attitude);model.updateMatrixWorld(true);}playerRig.updateMatrixWorld(true);playerRig.getWorldQuaternion(inverse).invert();
  if(view==='chase'){point.set(0,boat.modelId==='harbor-yacht'?14:boat.modelId==='harbor-patrol'?4.5:3,boat.modelId==='harbor-yacht'?38:boat.modelId==='harbor-patrol'?12:7.5).applyQuaternion(attitude).add(origin);target.set(0,.8,-5).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(point));camera.up.set(0,1,0);camera.lookAt(target);}else{point.fromArray(pose.position).applyQuaternion(attitude).add(origin);camera.position.copy(playerRig.worldToLocal(point));head.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(lookPitch,-.7,.8),THREE.MathUtils.clamp(lookYaw,-1.5,1.5),0,'YXZ'));camera.quaternion.copy(inverse).multiply(attitude).multiply(head);camera.up.set(0,1,0);}camera.updateMatrixWorld(true);return true;
 },reset(){return this.update({boat:null});}};
}
