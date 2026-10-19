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

test('broadcast zoom and orbit preserve the player target',()=>{
 const player={x:3,y:2,z:8},base=explorerBroadcastPose(player,1,1,0),rotated=explorerBroadcastPose(player,1,1,Math.PI/2),zoom=explorerBroadcastPose(player,1,2,0);
 assert.deepEqual(base.target,rotated.target);assert.deepEqual(base.target,zoom.target);
 close(rotated.position[0]-player.x,base.position[2]-player.z);
 close(zoom.position[2]-player.z,2*(base.position[2]-player.z));
 for(const yaw of [0,1,2])for(const viewYaw of [0,1,2]){
 const controls=explorerMovementInput({x:0,y:1},yaw,true,viewYaw);
 close(-Math.sin(yaw)*controls.y+Math.cos(yaw)*controls.x,-Math.sin(viewYaw));
 close(-Math.cos(yaw)*controls.y-Math.sin(yaw)*controls.x,-Math.cos(viewYaw));
 }
});
