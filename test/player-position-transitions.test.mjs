import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
class Capsule {
  constructor(start,end,radius){Object.assign(this,{start,end,radius});}
  translate(vector){this.start.add(vector);this.end.add(vector);}
}
function fixture(){
  const player={height:1.65,radius:.34,velocity:new THREE.Vector3(1,-2,3),onGround:true};
  const feet=new THREE.Vector3(4,1.2,-3);
  return vm.createContext({
    THREE,Capsule,player,playerCollider:new Capsule(feet.clone().add(new THREE.Vector3(0,player.radius,0)),feet.clone().add(new THREE.Vector3(0,player.height,0)),player.radius),
    playerRig:{position:new THREE.Vector3(4,.99,-3)},localGroundViewY:.99,
    alignSpawnToCurrentFloor:point=>point.setY(1.23),updateLandingFrame(){},setStatus(){},
    serverHostedRoom:false,currentSpaceScale:2,activeEnvironment:{},
    envLoader:{world:{},setSpaceScale:scale=>({scale})},
    scaleControl:{querySelector:()=>({})},toxicBubbleSystem:{handleSpaceScaleChanged(){}}
  });
}
function evaluateSection(context,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,'the actual explorer transition is present');
  vm.runInContext(source.slice(from,to),context);
}
function acceptedFeet(context){return context.playerCollider.start.clone().add(new THREE.Vector3(0,-context.player.radius,0));}
function closeVector(actual,expected){assert.ok(actual.distanceTo(expected)<1e-10,`${actual.toArray()} ≈ ${expected.toArray()}`);}
function consistentPose(context,expected){
  closeVector(acceptedFeet(context),expected);
  closeVector(context.playerCollider.end.clone().add(new THREE.Vector3(0,-context.player.height,0)),expected);
  closeVector(context.playerRig.position,expected);
  assert.ok(Math.abs(context.localGroundViewY-expected.y)<1e-10);
}

test('explicit teleport resets both capsule feet and eased view height atomically',()=>{
  const context=fixture();
  evaluateSection(context,'  function movePlayerTo(point)','  function teleportFromController');
  const requested=new THREE.Vector3(8,1.1,6),original=requested.clone();
  context.movePlayerTo(requested);
  consistentPose(context,new THREE.Vector3(8,1.23,6));
  closeVector(requested,original);
  closeVector(context.player.velocity,new THREE.Vector3());
  assert.equal(context.player.onGround,false);
});

test('space scaling transforms accepted feet independently of stair camera easing',()=>{
  const context=fixture();
  evaluateSection(context,'  function applySpaceScale(scale','  function alignSpawnToCurrentFloor');
  context.applySpaceScale(4);
  consistentPose(context,new THREE.Vector3(8,2.4,-6));
  assert.equal(context.currentSpaceScale,4);
  assert.equal(context.activeEnvironment.spaceScale,4);
  context.applySpaceScale(2);
  consistentPose(context,new THREE.Vector3(4,1.2,-3));
});

test('space scaling with keepPlayer disabled preserves the complete player pose',()=>{
  const context=fixture(),beforeFeet=acceptedFeet(context),beforeView=context.playerRig.position.clone();
  evaluateSection(context,'  function applySpaceScale(scale','  function alignSpawnToCurrentFloor');
  context.applySpaceScale(4,{keepPlayer:false});
  closeVector(acceptedFeet(context),beforeFeet);closeVector(context.playerRig.position,beforeView);
  assert.equal(context.localGroundViewY,.99);
  assert.equal(context.currentSpaceScale,4);
});

test('vehicle exit restores standing capsule dimensions, visible pose, and fresh grounding',()=>{
  const context=fixture();let options,avatarVisible=false;
  Object.assign(context,{
    BuilderVehicleController:class{constructor(value){options=value;}},
    builderDecor:{},camera:{},keys:new Set(),mobile:new Set(),thumbInput:{leftX:0,leftY:0},
    setPlayerAvatarVisible:value=>{avatarVisible=value;}
  });
  evaluateSection(context,'  const vehicleController=new BuilderVehicleController','  const localBasketballAIRoots');
  const destination=new THREE.Vector3(5,.2,7),original=destination.clone();
  options.onExit(destination);
  consistentPose(context,destination);
  closeVector(destination,original);closeVector(context.player.velocity,new THREE.Vector3());
  assert.equal(context.player.onGround,false);assert.equal(avatarVisible,true);
});
