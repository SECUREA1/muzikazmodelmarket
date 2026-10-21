import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {syncServerAvatar,projectServerActor,disposeProjection} from '../public/js/server-scene-projection.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('room snapshots refresh the server-selected avatar and ignore a client model URL',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'server-avatar-'));
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
  const map={id:'avatar-test',builderScene:{layout:'grand-floor',objects:[]},spawn:{x:0,y:0,z:0}};
  const identity={accountId:'player',username:'Player',walletId:'player',stats:{health:100},avatar:{modelUrl:'/first.glb'}};
  const send=(identity,requestId)=>runtime.command(map.id,map,identity,{action:requestId==='join'?'join':'input',requestId,input:{modelUrl:'/unapproved.glb'}});
  assert.equal((await send(identity,'join')).players['account:player'].modelUrl,'/first.glb');
  assert.equal((await send({...identity,avatar:{modelUrl:'/second.glb'}},'update')).players['account:player'].modelUrl,'/second.glb');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('server actor projection preserves authored materials and applies full transforms and removal',()=>{
 const root=new THREE.Group(),materials=[new THREE.MeshStandardMaterial({emissiveIntensity:.7}),new THREE.MeshStandardMaterial({emissiveIntensity:.3})];
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),materials));root.userData.serverRenderOffset={y:2};
 const actor={position:{x:1,y:3,z:4},rotation:{x:.2,y:.4,z:.6},active:true,switched:false};
 projectServerActor(root,actor);assert.equal(root.position.y,5);assert.equal(root.rotation.x,.2);assert.equal(root.rotation.z,.6);assert.equal(materials[0].emissiveIntensity,.7);
 const scaled={...actor,scale:{x:2,y:3,z:4}};projectServerActor(root,scaled);projectServerActor(root,scaled);assert.deepEqual(root.scale.toArray(),[2,3,4],'server scaling does not compound across snapshots');
 projectServerActor(root,{...actor,paint:0xff0000,switched:true,open:true});assert.equal(materials[1].color.getHex(),0xff0000);assert.equal(materials[1].emissiveIntensity,1.5);assert.equal(root.children[0].userData.collisionDisabled,true);
 projectServerActor(root,actor);assert.equal(materials[1].emissiveIntensity,.3);assert.equal(root.children[0].userData.collisionDisabled,false);
 projectServerActor(root,null);assert.equal(root.visible,false);projectServerActor(root,actor);assert.equal(root.visible,true);disposeProjection(root);
});

test('avatar changes discard late models, animate the confirmed model, and retain a fallback on failure',()=>{
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData.serverBody=body;
 const pending=[],loader={load(url,success,progress,failure){pending.push({url,success,failure});}};
 let current=true;const sync=(url,now=0)=>syncServerAvatar({THREE,root,peer:{modelUrl:url},loader,prepare:model=>model,isCurrent:()=>current,now});
 sync('first.glb');sync('first.glb');assert.equal(pending.length,1);
 sync('second.glb');const stale=new THREE.Group();pending[0].success({scene:stale});assert.equal(root.children.includes(stale),false);assert.equal(body.visible,true);
 const model=new THREE.Group();pending[1].success({scene:model,animations:[new THREE.AnimationClip('Idle',1,[])]});assert.equal(body.visible,false);assert.equal(model.parent,root);assert.ok(root.userData.serverMixer);
 sync('broken.glb');assert.equal(model.parent,null);assert.equal(body.visible,true);pending[2].failure();sync('broken.glb',Date.now());assert.equal(pending.length,3,'failed assets back off');
 sync('broken.glb',Date.now()+6000);assert.equal(pending.length,4);current=false;pending[3].success({scene:new THREE.Group()});assert.equal(body.visible,true);
 disposeProjection(root);
});

test('server enemy projection interpolates positions and turns, and snaps teleports',async()=>{
 const {targetServerEnemy,interpolateServerEnemy}=await import('../public/js/server-scene-projection.js');
 const root=new THREE.Group(),actor={position:{x:1,y:0,z:2},rotation:{y:3.1}};
 targetServerEnemy(root,actor,.62,1000);assert.deepEqual(root.position.toArray(),[1,.62,2]);
 actor.position.x=2;actor.rotation.y=-3.1;targetServerEnemy(root,actor,.62,1100);
 assert.equal(root.position.x,1);interpolateServerEnemy(root,.05,1150);
 assert.ok(root.position.x>1&&root.position.x<2);assert.ok(root.rotation.y>3.1,'turn follows the short path across pi');
 actor.position.x=30;targetServerEnemy(root,actor,.62,1300);assert.equal(root.position.x,30);
});

test('controller disposal detaches brain roots even when the controller only frees resources',async()=>{
 const {disposeServerEnemyProjection}=await import('../public/js/server-scene-projection.js');
 const scene=new THREE.Scene(),root=new THREE.Group();let disposed=0;
 root.userData.serverController={dispose(){disposed++;}};scene.add(root);
 disposeServerEnemyProjection(root);assert.equal(root.parent,null);assert.equal(scene.children.length,0);assert.equal(disposed,1);
});

test('enemy motion continues between snapshots and bounds prediction during a stalled connection',async()=>{
 const {targetServerEnemy,interpolateServerEnemy}=await import('../public/js/server-scene-projection.js');
 const root=new THREE.Group(),actor={position:{x:0,y:0,z:0},rotation:{y:0}};
 targetServerEnemy(root,actor,0,1000);
 actor.position.x=.1;targetServerEnemy(root,actor,0,1100);
 interpolateServerEnemy(root,1,1150);
 assert.ok(Math.abs(root.position.x-.05)<.001);
 interpolateServerEnemy(root,1,5000);
 assert.ok(Math.abs(root.position.x-.18)<.001,'prediction stops after the configured 80 ms');
 actor.position.x=30;targetServerEnemy(root,actor,0,5100);
 interpolateServerEnemy(root,1,5200);
 assert.equal(root.position.x,30,'teleports discard prior velocity');
});
