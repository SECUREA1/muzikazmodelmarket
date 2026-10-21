import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from '../public/vendor/three/three.module.min.js';
import {broadcastCameraPose} from '../public/js/broadcast-camera.js';
import {explorerBroadcastPose} from '../public/js/explorer-camera.js';
import {arcadeGameCameraPose} from '../public/js/arcade-3d-games.js';
function frame(pose,aspect,width,depth,height){
 const camera=new PerspectiveCamera(pose.fov,aspect,.05,700);camera.position.fromArray(pose.position||pose.eye);camera.up.fromArray(pose.up);camera.lookAt(...pose.target);camera.updateMatrixWorld(true);
 for(const x of [-width/2,width/2])for(const y of [-height/2,height/2])for(const z of [-depth/2,depth/2]){
  const point=new Vector3(pose.target[0]+x,pose.target[1]+y,pose.target[2]+z).project(camera);
  assert.ok(Math.abs(point.x)<.98&&Math.abs(point.y)<.98&&point.z<1,JSON.stringify({aspect,point}));
 }
}
test('shared broadcast fits the full playing volume through portrait, landscape, and orbit changes',()=>{
 for(const aspect of [.35,.7,1,1.8,3])for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI]){
  const pose=broadcastCameraPose({aspect,yaw,width:32,depth:17,height:5,target:[4,2,-5]});frame(pose,aspect,32,17,5);
  const dx=pose.position[0]-4,dy=pose.position[1]-2,dz=pose.position[2]+5;
  assert.ok(Math.abs(Math.atan2(dy,Math.hypot(dx,dz))-55*Math.PI/180)<1e-8);
 }
});
test('basketball broadcast frames both baskets and stays centered when a player moves',()=>{
 for(const aspect of [.4,1,2]){
  const pose=explorerBroadcastPose({x:6,y:0,z:10},aspect,1,Math.PI/2,{court:true});
  assert.deepEqual(pose.target,[0,1.8,0]);frame(pose,aspect,17,31,4);
  assert.deepEqual(pose,explorerBroadcastPose({x:-5,y:0,z:-10},aspect,1,Math.PI/2,{court:true}));
  assert.ok(pose.cutHeight>5&&Number.isFinite(pose.cutHeight));
 }
});
test('every arcade game has a real broadcast pose fitting its authored play area',()=>{
 for(const id of ['hockey','shooting','basketball','air-hockey','billiards'])for(const aspect of [.4,1,2]){
  const pose=arcadeGameCameraPose(id,'broadcast',{aspect});assert.equal(pose.mode,'broadcast');frame(pose,aspect,pose.width,pose.depth,3);
  assert.notDeepEqual(pose.eye,arcadeGameCameraPose(id,'first-person',{aspect}).eye);
 }
});
