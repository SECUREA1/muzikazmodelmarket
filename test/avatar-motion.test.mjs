import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {sampleAvatarMotion,configureAvatarAnimations,updateAvatarAnimations,clearAvatarAnimations} from '../public/js/avatar-motion.js';

test('avatar gait samples actual displacement, reuses state and ignores teleports or seats',()=>{
 const root=new THREE.Group(),p=new THREE.Vector3();
 const state=sampleAvatarMotion(root,p,.05);assert.equal(state.moving,false);
 p.x=.1;assert.equal(sampleAvatarMotion(root,p,.05),state);assert.ok(state.speed>1);assert.equal(state.moving,true);
 p.x=30;sampleAvatarMotion(root,p,.05);assert.equal(state.moving,false);assert.equal(state.speed,0);
 p.z=.1;sampleAvatarMotion(root,p,.05,true);assert.equal(state.moving,false);
 p.z=.2;sampleAvatarMotion(root,p,.05,false,true);assert.equal(state.reducedMotion,true);
 sampleAvatarMotion(root,{x:NaN,y:0,z:0},.05);assert.equal(state.moving,false);
 sampleAvatarMotion(root,p,1);assert.equal(state.moving,false);
});

test('stationary avatars settle, while tiny frame rates and invalid time cannot produce infinite speed',()=>{
 const root=new THREE.Group(),p={x:0,y:0,z:0};sampleAvatarMotion(root,p,1/60);
 p.x=.05;sampleAvatarMotion(root,p,1/60);assert.equal(root.userData.avatarMotion.moving,true);
 for(let n=0;n<100;n++)sampleAvatarMotion(root,p,1/60);
 assert.equal(root.userData.avatarMotion.speed,0);assert.equal(root.userData.avatarMotion.moving,false);
 p.x=.1;sampleAvatarMotion(root,p,0);assert.equal(root.userData.avatarMotion.speed,0);
});

test('authored avatars choose real idle, walk and run clips without accumulating active actions',()=>{
 const owner=new THREE.Group(),model=new THREE.Group(),clips=['Idle','Walk','Run'].map(name=>new THREE.AnimationClip(name,1,[]));
 const mixer=configureAvatarAnimations(THREE,owner,model,clips);assert.ok(mixer);assert.equal(owner.userData.serverMixer,mixer);
 for(let n=0;n<300;n++){
  const phase=n%3;updateAvatarAnimations(owner,.016,{moving:phase>0,speed:phase===2?4:1});
  assert.equal(mixer.stats.actions.inUse,1);
  assert.equal(mixer._actions.find(action=>action.isRunning()).getClip().name,clips[phase].name);
 }
 clearAvatarAnimations(owner);assert.equal(mixer.stats.actions.inUse,0);assert.equal(mixer.stats.actions.total,0);assert.equal(owner.userData.serverMixer,undefined);
});

test('single authored clip is preserved and replacement releases the old mixer',()=>{
 const root=new THREE.Group(),clip=new THREE.AnimationClip('Custom animation',1,[]),old=configureAvatarAnimations(THREE,root,root,[clip]);
 updateAvatarAnimations(root,.05,{moving:true,speed:5});assert.equal(old.stats.actions.inUse,1);
 configureAvatarAnimations(THREE,root,root,[]);assert.equal(old.stats.actions.total,0);
 updateAvatarAnimations(root,.05,{moving:true});
});
