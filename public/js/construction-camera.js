import {constructionStructure} from './construction-workplans.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {constructionOperatorPose,constructionCollisionBoxes,constructionTransform} from './construction-kinematics.js';
import {isConstructionMachine,constructionMachineKind} from './construction-state.js';

// Follow the work zone so upper-floor placements stay visible from the remote
// crane station. This changes only the local camera, never the shared machine.
export function constructionWorkPose(actor,site,aspect=1,fov=60){
 const kind=constructionMachineKind(actor)||'crane',verticalHalf=THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(fov)||60,1,150)/2);
 if(kind==='crane'){
  const hook=actor.construction?.hook||actor.position,tower=constructionStructure(site,actor),destination=tower?.target||hook;
  const x=(hook.x+destination.x)/2,z=(hook.z+destination.z)/2,y=Math.max(hook.y,destination.y);
  const zoomFit=Math.max(1,Math.tan(Math.PI/6)/Math.tan(verticalHalf)),span=Math.max(32,Math.hypot(hook.x-destination.x,hook.z-destination.z)+18)*zoomFit/Math.max(.4,Math.min(1,aspect));
  return {position:{x:x-span*.65,y:y+span*.72,z:z+span},target:{x,y:Math.max(2,y*.85),z}};
 }
 const yaw=actor.rotation?.y||0,points=[];
 // Use the same connected part geometry as the server and model. Raised truck
 // bodies and extended buckets contribute to the camera fit at their real pose.
 for(const box of constructionCollisionBoxes(actor))for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){const point=constructionTransform(box.matrix,[x*box.size.x,y*box.size.y,z*box.size.z]);points.push(new THREE.Vector3(point.x,point.y,point.z));}
 const bounds=new THREE.Box3().setFromPoints(points),center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(3.5,bounds.getSize(new THREE.Vector3()).length()/2),horizontalHalf=Math.atan(Math.tan(verticalHalf)*Math.max(.3,Number(aspect)||1)),distance=radius/Math.sin(Math.min(verticalHalf,horizontalHalf))*1.16;
 // Look toward the working end from its front quarter. The implement stays
 // between the camera and the cab, so the roof cannot hide its contact point.
 const heading=yaw+(kind==='excavator'?(actor.construction?.swing||0):0),direction=new THREE.Vector3(1,.72,kind==='truck'?1:-1).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP,heading),eye=center.clone().addScaledVector(direction,distance);
 return {position:{x:eye.x,y:eye.y,z:eye.z},target:{x:center.x,y:center.y,z:center.z}};
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
  if(workView){
   const pose=constructionWorkPose(machine,site,camera.aspect,camera.getEffectiveFOV());eye.set(pose.position.x,pose.position.y,pose.position.z);camera.position.copy(playerRig.worldToLocal(eye));camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
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
