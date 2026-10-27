import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFunhouseRideView} from '../public/js/funhouse-ride-view.js';
import {funhouseRidePose} from '../public/js/funhouse-experience-rules.js';
import {FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';
import {xrStick} from '../public/js/xr-game-controls.js';

const source=readFileSync('public/js/house-explorer-glb.js','utf8');
function fixture(presenting=false){
 const camera=new THREE.PerspectiveCamera(),playerRig=new THREE.Group();playerRig.add(camera);
 camera.position.set(0,presenting?0:1.65,0);
 const station=FUNHOUSE_STATIONS.find(value=>value.kind==='car'),calls=[];
 let ride={id:'car-seat',kind:'car',startedAt:1000,endsAt:21000,durationMs:20000,status:'active',gentle:true,stationId:station.id};
 const context=vm.createContext({THREE,funhouseRide:()=>ride,funhouseStations:()=>[station],funhouseRidePose,
  funhouseServerNow:()=>2000,funhouseSeatView:createFunhouseRideView(),funhouseRideView:null,funhouseRideCamera:false,
  player:{yaw:0,pitch:0,eyeHeight:1.65},playerRig,camera,activeEnvironment:{},serverActors:{},topDownAimTarget:null,
  reducedMotion:false,playerPreferences:{reducedMotion:false},lockMenuInput:()=>calls.push('release'),syncCameraToggle:()=>calls.push('toggle'),updateGameCamera:()=>calls.push('camera'),
  renderer:{xr:{isPresenting:presenting,getFrame:()=>({getViewerPose:()=>({transform:{position:{x:.4,y:1.7,z:-.3}}})}),getReferenceSpace:()=>({})}},
  gameCameraMode:'top-down',fishingViewEnabled:false,setStatus:()=>{},writeGameCameraMode:()=>assert.fail('boarding must preserve the saved camera preference')});
 let start=source.indexOf('  function resetFunhouseRideView()');vm.runInContext(source.slice(start,source.indexOf('  const funhouseVR=',start)),context);
 start=source.indexOf('  function isTopDownView()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 start=source.indexOf('  function setGameCameraMode(');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 return {context,camera,playerRig,station,calls,exit:()=>{ride=null;}};
}

test('the explorer keeps an unobstructed ride view, preserves free look and restores the saved camera mode',()=>{
 const f=fixture(),c=f.context;c.presentFunhouseRide();
 assert.equal(c.funhouseRideCamera,true);assert.equal(c.isTopDownView(),false);assert.equal(f.camera.position.y,1.15);
 assert.equal(c.gameCameraMode,'top-down');c.player.yaw=2.7;c.player.pitch=.65;c.presentFunhouseRide();
 assert.equal(c.player.yaw,2.7);assert.equal(f.camera.rotation.x,.65,'looking around is independent of ride seating');
 c.setGameCameraMode('broadcast');assert.equal(c.gameCameraMode,'top-down','ride view controls cannot switch away from the actual seat');
 f.exit();c.presentFunhouseRide();assert.equal(c.funhouseRideCamera,false);assert.equal(c.isTopDownView(),true);
 assert.equal(f.camera.position.y,1.65);assert.equal(c.funhouseSeatView.snapshot().rideId,null);
});

test('the explorer centers a tracked headset at the ride eye without modifying its tracked camera',()=>{
 const f=fixture(true),c=f.context,position=f.camera.position.clone(),rotation=f.camera.quaternion.clone();c.presentFunhouseRide();
 const pose=funhouseRidePose({kind:'car',startedAt:1000,durationMs:20000},f.station,2000);
 const head=new THREE.Vector3(.4,1.7,-.3).applyAxisAngle(new THREE.Vector3(0,1,0),c.player.yaw).add(f.playerRig.position);
 assert.ok(head.distanceTo(new THREE.Vector3(pose.position.x,pose.position.y+1.15,pose.position.z))<1e-8);
 assert.deepEqual(f.camera.position,position);assert.deepEqual(f.camera.quaternion.toArray(),rotation.toArray());assert.equal(c.funhouseSeatView.snapshot().calibrated,true);
 f.exit();c.presentFunhouseRide();assert.equal(c.funhouseSeatView.snapshot().rideId,null);assert.equal(c.funhouseRideCamera,false);
});

test('a boarding reply between XR frames waits for an active headset pose before calibrating',()=>{
 const f=fixture(true),c=f.context,frame=c.renderer.xr.getFrame;
 c.renderer.xr.getFrame=()=>({getViewerPose:()=>{throw Object.assign(Error('Inactive frame'),{name:'InvalidStateError'});}});
 assert.doesNotThrow(()=>c.presentFunhouseRide());assert.equal(c.funhouseSeatView.snapshot().calibrated,false);
 c.renderer.xr.getFrame=frame;c.presentFunhouseRide();assert.equal(c.funhouseSeatView.snapshot().calibrated,true);
});

test('walking and seated VR each dispatch one snap turn through their own input path',()=>{
 let ride=null;const sourceHand={handedness:'right',gamepad:{axes:[1,0]}},context=vm.createContext({THREE,xrStick,
  player:{yaw:0},playerRig:{rotation:{y:0}},fishingUI:{playing:()=>false},funhouseRide:()=>ride,
  funhouseVR:{isActive:()=>true},renderer:{xr:{isPresenting:true,getSession:()=>({inputSources:[sourceHand]})}},
  xrGameControls:{menuOpen:false},walkingSprint:()=>false,stickSprinting:false,turnReady:true,keys:new Set(),mobile:new Set(),thumbInput:{leftX:0,leftY:0}});
 const poll=vm.runInContext(source.match(/pollTurn:(\(\)=>[^,]+),onResume:/)[1],context);
 const turn=vm.runInContext(source.match(/onTurn:(angle=>\{player.yaw\+=angle;playerRig.rotation.y=player.yaw;\})/)[1],context);
 let start=source.indexOf('  function getInput(');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 start=source.indexOf('  function serverInput()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 if(poll())turn(-Math.PI/6);context.getInput();assert.ok(Math.abs(context.player.yaw+Math.PI/6)<1e-10,'walking applies exactly one 30-degree turn');
 context.player.yaw=0;ride={status:'active'};if(poll())turn(-Math.PI/6);context.serverInput();
 assert.ok(Math.abs(context.player.yaw+Math.PI/6)<1e-10,'the seated input lock leaves turning to the XR controls');
});
