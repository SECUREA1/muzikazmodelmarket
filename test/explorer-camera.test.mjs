import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {explorerMovementInput,explorerAimAngles,explorerTopDownPose,explorerBroadcastPose} from '../public/js/explorer-camera.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('top-down controls keep screen directions through the shared room movement basis',()=>{
  for(const yaw of [0,.4,Math.PI/2,Math.PI,-2.4])for(const input of [{x:0,y:1},{x:1,y:0},{x:-.6,y:.8}]){
    const controls=explorerMovementInput(input,yaw,true);
    // This is the physical movement contract used by the server and predictor.
    const worldX=-Math.sin(yaw)*controls.y+Math.cos(yaw)*controls.x;
    const worldZ=-Math.cos(yaw)*controls.y-Math.sin(yaw)*controls.x;
    close(worldX,input.x);close(worldZ,-input.y);
    close(Math.hypot(controls.x,controls.y),Math.hypot(input.x,input.y));
  }
  assert.deepEqual(explorerMovementInput({x:.25,y:.7},2,false),{x:.25,y:.7});
});

test('overhead pointer aim still fires from the physical player eye',()=>{
  const rig=new THREE.Group(),eye=new THREE.PerspectiveCamera();rig.add(eye);
  rig.position.set(7,2,-4);eye.position.y=1.65;
  const target=new THREE.Vector3(11,2.5,-12),origin=eye.getWorldPosition(new THREE.Vector3());
  const aim=explorerAimAngles(origin,target);
  rig.rotation.y=aim.yaw;eye.rotation.order='YXZ';eye.rotation.set(aim.pitch,0,0);
  const direction=eye.getWorldDirection(new THREE.Vector3());
  const expected=target.clone().sub(origin).normalize();
  close(direction.dot(expected),1);assert.deepEqual(eye.getWorldPosition(new THREE.Vector3()).toArray(),origin.toArray());
  const vertical=explorerAimAngles(origin,{x:origin.x,y:100,z:origin.z},.8);
  close(vertical.yaw,.8);close(vertical.pitch,1.15);
});

test('portrait and landscape overhead cameras remain north-up and expose the player floor',()=>{
  const player={x:11,y:4,z:-9};
  for(const aspect of [.46,1,2]){
    const pose=explorerTopDownPose(player,aspect,68),view=new THREE.PerspectiveCamera(58,aspect,.05,700);
    view.position.fromArray(pose.position);view.up.fromArray(pose.up);view.lookAt(...pose.target);view.updateMatrixWorld(true);
    const centre=new THREE.Vector3(...pose.target).project(view),north=new THREE.Vector3(player.x,player.y,player.z-3).project(view),east=new THREE.Vector3(player.x+3,player.y,player.z).project(view);
    close(centre.x,0);close(centre.y,0);assert.ok(north.y>centre.y);assert.ok(east.x>centre.x);
    assert.ok(pose.cutHeight>player.y+1.65);assert.ok(pose.position[1]>pose.cutHeight);
  }
});

test('broadcast shows the whole basketball court from an elevated sideline in portrait and landscape',()=>{
 for(const aspect of [.35,.46,1,1.7,2.4]){
  const pose=explorerBroadcastPose({x:4,y:0,z:10},aspect,68,{court:true});
  const view=new THREE.PerspectiveCamera(58,aspect,.05,700);view.position.fromArray(pose.position);view.up.fromArray(pose.up);view.lookAt(...pose.target);view.updateMatrixWorld(true);
  for(const x of [-7.62,7.62])for(const z of [-14.326,14.326])for(const y of [0,3.05]){
   const point=new THREE.Vector3(x,y,z).project(view);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z<1,`court corner remains visible at ${aspect}`);
  }
  assert.ok(pose.position[0]>0&&pose.position[1]>3.05);assert.ok(pose.cutHeight>10&&pose.cutHeight<16.8,'roof is cut away while ball and hoops remain visible');
  assert.deepEqual(pose.target,[0,1.5,0],'court broadcast stays centered as the player moves');
 }
});

test('broadcast movement follows the sideline screen independently of player aim',()=>{
 for(const yaw of [0,.7,Math.PI,-1.4])for(const viewYaw of [-1.2,.6,1.4])for(const input of [{x:0,y:1},{x:1,y:0},{x:-.6,y:.8}]){
  const controls=explorerMovementInput(input,yaw,true,viewYaw);
  const worldX=-Math.sin(yaw)*controls.y+Math.cos(yaw)*controls.x,worldZ=-Math.cos(yaw)*controls.y-Math.sin(yaw)*controls.x;
  close(worldX,-Math.sin(viewYaw)*input.y+Math.cos(viewYaw)*input.x);close(worldZ,-Math.cos(viewYaw)*input.y-Math.sin(viewYaw)*input.x);
 }
 const follow=explorerBroadcastPose({x:20,y:4,z:-10},1.6);
 assert.deepEqual(follow.target,[20,5,-10]);assert.ok(follow.position[0]>20&&follow.position[1]>5&&follow.position[2]>-10);
});
