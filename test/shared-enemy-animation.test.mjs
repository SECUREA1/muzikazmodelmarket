import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {animateSharedEnemy} from '../public/js/shared-enemy-animation.js';

test('shared enemy idle animation never moves authoritative targets or applies local gameplay',()=>{
 for(const kind of ['toxic','ghost','brain','boss','snake']){
  const root=new THREE.Group(),body=new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshBasicMaterial());root.add(body);
  root.userData={serverKind:kind,serverTarget:new THREE.Vector3(1,2,3)};root.position.set(1,2,3);
  if(kind==='snake')root.userData.parts=[body];
  const before=body.position.clone();animateSharedEnemy(root,.05,1);
  assert.notDeepEqual(body.position.toArray(),before.toArray(),`${kind} has a visible idle animation`);
  assert.deepEqual(root.position.toArray(),[1,2,3]);assert.deepEqual(root.userData.serverTarget.toArray(),[1,2,3]);
  body.geometry.dispose();body.material.dispose();
 }
});

test('attack tells and flashes follow snapshot timestamps once; animation does not call enemy AI',()=>{
 const root=new THREE.Group();let tells=0,flashes=0;const legs=[new THREE.Group()],wings=[new THREE.Group()];
 root.userData={serverKind:'brain',attack:{phase:'tell',readyAt:1600},serverController:{attackTell:{update(){},play(){tells++;},stop(){}},attackFlash:{update(){},play(){flashes++;}},legs,wings,update(){throw Error('local AI must never run');}}};
 animateSharedEnemy(root,.05,1);animateSharedEnemy(root,.05,1.05);assert.equal(tells,1);assert.equal(flashes,0);
 root.userData.lastAttack=1600;root.userData.attack={phase:'attack',readyAt:3200};animateSharedEnemy(root,.05,1.6);animateSharedEnemy(root,.05,1.65);assert.equal(flashes,1);
 root.userData.attack.phase='tell';animateSharedEnemy(root,.05,3);assert.equal(tells,2);
 assert.notEqual(legs[0].rotation.y,0);assert.notEqual(wings[0].rotation.z,0);
});
