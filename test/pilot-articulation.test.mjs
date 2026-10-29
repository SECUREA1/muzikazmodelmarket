import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {seatedPilot} from '../public/js/aircraft-seat.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

test('seated crew retain their exact mesh budget while knees, elbows and head move their existing attachments',()=>{
 const root=seatedPilot();try{
  let draws=0,triangles=0;root.traverse(node=>{if(node.isMesh){draws++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;assert.equal(node.userData.collisionDisabled,true);assert.equal(Boolean(node.skeleton),false);}});
  assert.equal(draws,21);assert.equal(triangles,1392);
  const head=root.getObjectByName('CREW_HEAD');assert.ok(head.isGroup);assert.equal(head.children.length,6,'skin, helmet, ear pieces, microphone and visor turn together');
  const bounds=new THREE.Box3().setFromObject(root);assert.ok(bounds.min.y>.4&&bounds.max.y<2.1);
  const joints=[];root.traverse(node=>{if(node.userData.articulatedLimb)joints.push(node);});assert.equal(joints.length,4);
  for(const joint of joints){const end=root.getObjectByName(joint.userData.articulatedLimb.endName),bend=root.getObjectByName(joint.userData.articulatedLimb.bendName);assert.ok(end.children.length);assert.ok(bend.children.length>1);const before=end.children[0].getWorldPosition(new THREE.Vector3());bend.rotation.x=.2;root.updateMatrixWorld(true);assert.ok(end.children[0].getWorldPosition(new THREE.Vector3()).distanceTo(before)>.005);}
 }finally{disposeModelResources(root);}
});

test('cloned seated crew own independent joint transforms and preserve their seated rest pose',()=>{
 const root=seatedPilot(),copy=cloneBuilderRuntime(root);try{
  const a=new THREE.Box3().setFromObject(root),b=new THREE.Box3().setFromObject(copy);assert.deepEqual(a.min.toArray(),b.min.toArray());assert.deepEqual(a.max.toArray(),b.max.toArray());
  copy.getObjectByName('CREW_HEAD').rotation.y=.4;assert.equal(root.getObjectByName('CREW_HEAD').rotation.y,0);
 }finally{const group=new THREE.Group();group.add(root,copy);disposeModelResources(group);}
});
