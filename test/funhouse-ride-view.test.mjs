import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunhouseRideView} from '../public/js/funhouse-ride-view.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} equals ${expected}`);
const worldHead=(rig,viewer,yaw=0)=>({x:rig.x+viewer.x*Math.cos(yaw)+viewer.z*Math.sin(yaw),y:rig.y+viewer.y,z:rig.z-viewer.x*Math.sin(yaw)+viewer.z*Math.cos(yaw)});
const feet={x:28,y:.6,z:25};

test('standing and physically seated headset poses share the authored cockpit eye height',()=>{
 for(const height of [1.65,.95]){
  const view=createFunhouseRideView(),viewer={x:0,y:height,z:0};
  const result=view.project({rideId:'car',presenting:true,position:feet,eyeHeight:1.15,viewerPosition:viewer});
  assert.equal(result.active,true);assert.equal(result.calibrated,true);
  const head=worldHead(result.position,viewer);close(head.y,feet.y+1.15);close(head.x,feet.x);close(head.z,feet.z);
 }
});

test('initial room-space position centers the seat under any rig heading without changing tracked inputs',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/3]){
  const view=createFunhouseRideView(),viewer=Object.freeze({x:1.2,y:1.62,z:-.7}),origin=Object.freeze({...feet});
  const result=view.project({rideId:'spinner',presenting:true,position:origin,eyeHeight:1.15,yaw,viewerPosition:viewer}),head=worldHead(result.position,viewer,yaw);
  close(head.x,feet.x);close(head.y,feet.y+1.15);close(head.z,feet.z);
  assert.deepEqual(viewer,{x:1.2,y:1.62,z:-.7});assert.deepEqual(origin,feet);
 }
});

test('leaning and looking after calibration preserve physical headset movement while the ride moves',()=>{
 const view=createFunhouseRideView(),viewer={x:1,y:1.6,z:.5};
 view.project({rideId:'spinner',presenting:true,position:feet,viewerPosition:viewer});
 const movedFeet={x:30,y:.4,z:22},leaned={x:1.25,y:1.8,z:.2},yaw=Math.PI/2;
 const result=view.project({rideId:'spinner',presenting:true,position:movedFeet,yaw,viewerPosition:leaned}),head=worldHead(result.position,leaned,yaw);
 close(head.x,movedFeet.x-.3);close(head.y,movedFeet.y+1.15+.2);close(head.z,movedFeet.z-.25);
 assert.deepEqual(view.snapshot().viewerPosition,viewer,'each frame must retain the initial anchor rather than cancel a lean');
});

test('boarding waits for a valid viewer pose and never projects a nonfinite rig transform',()=>{
 const view=createFunhouseRideView();
 for(const viewerPosition of [null,{x:0,y:NaN,z:0},{x:Infinity,y:1.6,z:0}]){
  const pending=view.project({rideId:'car',presenting:true,position:feet,viewerPosition});
  assert.deepEqual(pending.position,feet);assert.equal(pending.calibrated,false);
 }
 const calibrated=view.project({rideId:'car',presenting:true,position:feet,viewerPosition:{x:0,y:1.7,z:0}});
 assert.equal(calibrated.calibrated,true);close(calibrated.position.y,.05);
});

test('desktop entry, session exit, ride changes and reset release previous seat calibration',()=>{
 const view=createFunhouseRideView(),viewer={x:.4,y:1.7,z:-.2};
 view.project({rideId:'car',presenting:true,position:feet,viewerPosition:viewer});
 const desktop=view.project({rideId:'car',presenting:false,position:feet});assert.deepEqual(desktop.position,feet);assert.equal(desktop.active,false);
 assert.equal(view.snapshot().rideId,null);
 const entering=view.project({rideId:'car',presenting:true,position:feet,viewerPosition:{x:0,y:1,z:0}});close(entering.position.y,.75);
 const switched=view.project({rideId:'spinner',presenting:true,position:feet,viewerPosition:viewer});close(switched.position.x,feet.x-.4);close(switched.position.y,.05);
 const exited=view.project({presenting:true,position:feet});assert.deepEqual(exited.position,feet);assert.equal(view.snapshot().calibrated,false);
 view.project({rideId:'car',presenting:true,position:feet,viewerPosition:viewer});view.reset();assert.deepEqual(view.snapshot(),{rideId:null,calibrated:false,viewerPosition:null});
});

test('diagnostic and projection objects cannot mutate the retained seat anchor',()=>{
 const view=createFunhouseRideView();
 const result=view.project({rideId:'car',presenting:true,position:feet,viewerPosition:{x:1,y:1.6,z:2}});
 result.offset.x=100;result.position.y=100;view.snapshot().viewerPosition.x=100;
 const next=view.project({rideId:'car',presenting:true,position:feet});close(next.offset.x,-1);close(next.position.y,.15);assert.equal(view.snapshot().viewerPosition.x,1);
});
