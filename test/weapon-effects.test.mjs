import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {RANGED_WEAPONS,fireWeapon} from '../public/js/game-weapons.js';
import {canActivateTool} from '../public/js/game-tool-rules.js';
import {supportsWorldTools} from '../public/js/rad-tox-rules.js';
const source=readFileSync('public/js/house-explorer-glb.js','utf8');
function methods(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function fixture(){
 const context=vm.createContext({THREE,RANGE_WEAPONS:RANGED_WEAPONS,RANGED_WEAPONS,fireWeapon,UTILITY_TOOLS:{},rangeActive:false,activeEnvironment:{},supportsWorldTools,canActivateTool,gameplayOverlayOpen:()=>false});
 const System=vm.runInContext(`(class {${methods('    weaponMuzzle(', '    registerLaserShot(')}${methods('    fireExtraWeapon(', '    fireFlame(')}})`,context);
 const system=new System();Object.assign(system,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(70,16/9,.1,100),lasers:[],raycaster:new THREE.Raycaster(),tone(){},state:'standby',active:false,getEnvironment:()=>({}),tool:'laser',ammo:10,weaponCooldown:0,bubbles:[],bricks:[],lootBlocks:[],avatarTargets:()=>[],flameColliders:()=>[],flameSystem:{sweep:()=>null},registerLaserShot(){}});
 system.camera.position.set(4,2,8);system.camera.rotation.set(.1,.7,0);system.camera.updateMatrixWorld();
 return system;
}
test('own laser has a visible muzzle offset and finite width, with its target endpoint unchanged',()=>{
 const system=fixture(),origin=system.camera.getWorldPosition(new THREE.Vector3()),direction=system.camera.getWorldDirection(new THREE.Vector3()),end=origin.clone().addScaledVector(direction,30),original=origin.clone();
 const beam=system.fireLaser(end,origin);beam.updateMatrixWorld();
 const localStart=new THREE.Vector3(0,-beam.geometry.parameters.height/2,0).applyMatrix4(beam.matrixWorld),localEnd=new THREE.Vector3(0,beam.geometry.parameters.height/2,0).applyMatrix4(beam.matrixWorld);
 assert.ok(localEnd.distanceTo(end)<1e-6);assert.ok(localStart.distanceTo(origin)>.4);assert.ok(beam.geometry.parameters.radiusTop>=.01);assert.ok(origin.equals(original));
 const projected=localStart.clone().project(system.camera);assert.ok(Math.abs(projected.x)>.1&&Math.abs(projected.y)>.1,'trace begins away from the reticle');
 const remote=new THREE.Vector3(12,2,8),remoteBeam=system.fireLaser(end,remote);remoteBeam.updateMatrixWorld();
 assert.ok(new THREE.Vector3(0,-remoteBeam.geometry.parameters.height/2,0).applyMatrix4(remoteBeam.matrixWorld).distanceTo(remote)<1e-6,'remote muzzle remains at its reported origin');
});
test('every ranged weapon fires without an encounter, with visible traces, one muzzle flash and one sound',()=>{
 for(const [tool,profile] of Object.entries(RANGED_WEAPONS)){
  const system=fixture(),sounds=[];system.tool=tool;system.tone=(...args)=>sounds.push(args);
  const origin=system.camera.getWorldPosition(new THREE.Vector3()),direction=system.camera.getWorldDirection(new THREE.Vector3());
  assert.equal(system.fireExtraWeapon(origin,direction),true,tool);assert.equal(system.ammo,9,tool);assert.equal(system.lasers.filter(effect=>effect.userData.weaponFlash).length,1,tool);assert.equal(system.lasers.length,profile.pellets+1,tool);assert.equal(sounds.length,1,tool);
 }
});
test('the first shot waits for audio resume and later user actions can retry a suspended context',async()=>{
 let created=0,resumes=0,release;const gain=()=>({gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}});
 class AudioContext{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};}
  createGain(){return gain();}
  resume(){resumes++;return new Promise(resolve=>{release=()=>{this.state='running';resolve();};});}
  createOscillator(){created++;return {frequency:{},connect:()=>gain(),start(){},stop(){},disconnect(){}};}
 }
 const context=vm.createContext({window:{AudioContext},playerPreferences:{effectsVolume:70},console});
 const System=vm.runInContext(`(class {${methods('    initAudio(){','    rapidPopSound(){')}})`,context),system=new System();system.audioAvailable=true;
 system.tone(340,.06,'square',.035);assert.equal(resumes,1);assert.equal(created,0);release();await system.audioResumePromise;await Promise.resolve();assert.equal(created,1);assert.equal(system.soundGain.gain.value,.7);
 system.audioContext.state='suspended';system.tone(340,.06);assert.equal(resumes,2);release();await system.audioResumePromise;await Promise.resolve();assert.equal(created,2);
});
