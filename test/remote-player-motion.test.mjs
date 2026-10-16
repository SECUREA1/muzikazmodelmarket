import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {targetServerPlayer,interpolateServerPlayer} from '../public/js/server-scene-projection.js';

test('remote players advance evenly between uneven packets at 30, 60 and 120 FPS',()=>{
 for(const fps of [30,60,120]){
  const root=new THREE.Group(),arrivals=[0,47,103,149,205,251,304,348,401,452,503,549,602,650,701,752,802,849,901,953,1000];
  let next=0,previous=null;
  for(let frame=0;frame<=fps;frame++){
   const now=frame*1000/fps;
   while(next<arrivals.length&&arrivals[next]<=now){const time=arrivals[next++];targetServerPlayer(root,{position:{x:time*.004,y:0,z:0},yaw:0},time);}
   interpolateServerPlayer(root,1/fps,now);
   if(now>=150){assert.ok(Math.abs(root.position.x-(now-100)*.004)<1e-8);if(previous!==null)assert.ok(Math.abs(root.position.x-previous-4/fps)<1e-8);previous=root.position.x;}
  }
 }
});
test('remote turns take the short path; teleports and stalled updates stay bounded',()=>{
 const root=new THREE.Group();
 targetServerPlayer(root,{position:{x:0,y:0,z:0},yaw:3.1},1000);
 targetServerPlayer(root,{position:{x:.4,y:0,z:0},yaw:-3.1},1100);
 interpolateServerPlayer(root,.05,1150);assert.equal(root.position.x,.2);assert.ok(root.rotation.y>3.1);
 interpolateServerPlayer(root,.05,10000);assert.ok(root.position.x<=.7);
 targetServerPlayer(root,{position:{x:20,y:2,z:0},yaw:1},10100);
 assert.deepEqual(root.position.toArray(),[20,2,0]);
 interpolateServerPlayer(root,.016,10116);assert.equal(root.position.x,20);
});
