import * as THREE from '../vendor/three/three.module.min.js';
import {constructionOperatorPose} from './construction-kinematics.js';
import {isConstructionMachine} from './construction-state.js';

// Follow the work zone so upper-floor placements stay visible from the remote
// crane station. This changes only the local camera, never the shared machine.
export function constructionWorkPose(actor,site,aspect=1){
 const hook=actor.construction?.hook||actor.position,tower=site?.tower;
 const destination=tower?.target||hook;
 const x=(hook.x+destination.x)/2,z=(hook.z+destination.z)/2,y=Math.max(hook.y,destination.y);
 const span=Math.max(32,Math.hypot(hook.x-destination.x,hook.z-destination.z)+18)/Math.max(.55,Math.min(1,aspect));
 return {position:{x:x-span*.65,y:y+span*.72,z:z+span},target:{x,y:Math.max(2,y*.85),z}};
}

// The seat belongs to the cab frame: an excavator's upper carriage and an
// articulated truck's cab turn independently of their chassis and head look.
export function createConstructionCamera({camera,playerRig}){
 const inverse=new THREE.Quaternion(),cab=new THREE.Quaternion(),head=new THREE.Quaternion(),eye=new THREE.Vector3();
 let active=false,originalNear=camera.near;
 return {update({machine,site,workView=false,lookYaw=0,lookPitch=0}={}){
  if(!isConstructionMachine(machine)||machine.active===false){active=false;return false;}
  if(!active){originalNear=camera.near;active=true;}
  playerRig.updateMatrixWorld(true);camera.up.set(0,1,0);camera.near=.035;
  if((machine.asset?.buildAssetId||machine.modelId)==='tower-crane'&&workView){
   const pose=constructionWorkPose(machine,site,camera.aspect);eye.set(pose.position.x,pose.position.y,pose.position.z);camera.position.copy(playerRig.worldToLocal(eye));camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
  }else{
   const pose=constructionOperatorPose(machine);if(!pose)return false;
   eye.set(pose.position.x,pose.position.y,pose.position.z);camera.position.copy(playerRig.worldToLocal(eye));
   playerRig.getWorldQuaternion(inverse).invert();cab.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,pose.yaw);
   head.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(lookPitch,-1.25,1.15),lookYaw,0,'YXZ'));
   camera.quaternion.copy(inverse).multiply(cab).multiply(head);
  }
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return true;
 },reset(){if(active){camera.near=originalNear;camera.updateProjectionMatrix();}active=false;}};
}
