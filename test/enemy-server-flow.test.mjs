import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {EnemySnapshotMotion} from '../public/js/enemy-snapshot-motion.js';
import {targetServerEnemy,interpolateServerEnemy} from '../public/js/server-scene-projection.js';
import {animateSharedEnemy,playSharedEnemyAttack} from '../public/js/shared-enemy-animation.js';
import {createSharedEnemyEffects} from '../public/js/shared-enemy-effects.js';
import {stepRadToxEnemy} from '../rad-tox-campaign.mjs';
import {ENEMY_BEHAVIORS,stepEnemyCombat} from '../server-enemy-combat.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const kinds=['ghost','toxic','brain','snake'];
const epoch=1700000000000;
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);

test('all enemy poses move evenly under packet jitter, duplicate ticks and reordered replies at 30/60/120 FPS',()=>{
 for(const kind of kinds)for(const fps of [30,60,120]){
  const root=new THREE.Group(),speed=ENEMY_BEHAVIORS[kind].moveSpeed;
  const packets=Array.from({length:41},(_,i)=>({time:epoch+i*50,at:40+i*50+[0,8,22,4,17][i%5],x:speed*i*.05}));
  let next=0,previous=null;
  for(let frame=0;frame<=fps*2;frame++){
   const now=frame*1000/fps;
   while(next<packets.length&&packets[next].at<=now){
    const packet=packets[next++],actor={kind,spawnId:'wave-one',position:{x:packet.x,y:0,z:0}};
    targetServerEnemy(root,actor,1,packet.at,packet.time);
    targetServerEnemy(root,actor,1,packet.at+2,packet.time); // another command in the same simulation tick
    targetServerEnemy(root,{...actor,position:{x:-50,y:0,z:0}},1,packet.at+3,packet.time-50);
   }
   interpolateServerEnemy(root,1/fps,now);
   if(now>=250){
    close(root.position.x,(now-140)*speed/1000);close(root.position.y,1);
    if(previous!==null)close(root.position.x-previous,speed/fps);
    previous=root.position.x;
   }
  }
 }
});

test('a better clock sample corrects gradually while a late packet cannot rewind enemy time',()=>{
 const motion=new EnemySnapshotMotion();motion.push({x:0,y:0,z:0},100,epoch);
 motion.sample(150,{});motion.push({x:.2,y:0,z:0},170,epoch+100);
 let previous=motion.renderTime(170);
 for(let now=180;now<=500;now+=10){
  if(now===200)motion.push({x:.3,y:0,z:0},now,epoch+150);
  const time=motion.renderTime(now);assert.ok(time>=previous);assert.ok(time-previous<=10.5001);previous=time;
 }
 const before=motion.targetOffset;motion.push({x:.4,y:0,z:0},800,epoch+200);assert.equal(motion.targetOffset,before);
});

test('enemy buffering caps stalled extrapolation and clears old poses and flashes on retry',()=>{
 const root=new THREE.Group(),actor={spawnId:'first',position:{x:0,y:0,z:0}};
 targetServerEnemy(root,actor,1,0,epoch);
 targetServerEnemy(root,{...actor,position:{x:.2,y:0,z:0}},1,50,epoch+50);
 interpolateServerEnemy(root,.1,10000);close(root.position.x,.52);
 root.userData.lastAttack=100;root.userData.flashToken=100;root.userData.tellToken=200;
 targetServerEnemy(root,{spawnId:'retry',position:{x:1,y:0,z:0}},1,10001,epoch+10001);
 assert.deepEqual(root.position.toArray(),[1,1,0]);assert.equal(root.userData.lastAttack,undefined);assert.equal(root.userData.flashToken,undefined);
 targetServerEnemy(root,{spawnId:'retry',position:{x:1.1,y:0,z:0}},1,12000,epoch+12000);
 close(root.position.x,1.1); // a long disconnect also resets the old path
});

test('ranged orbit and melee holding have stable bands instead of reversing on each threshold crossing',()=>{
 for(const kind of kinds){
  const ranged=!!ENEMY_BEHAVIORS[kind].speed,range=ENEMY_BEHAVIORS[kind].range;
  const actor={id:kind,kind,position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}},movementMode:ranged?'orbit':'hold'};
  for(let i=0;i<40;i++){
   const target={id:'alice',position:{x:0,y:0,z:ranged?4.5+(i%2?.06:-.06):range*(i%2?.82:.72)},health:100};
   stepRadToxEnemy({events:[]},actor,[target],1000+i*50,.05,()=>false,(_p,n)=>n,false);
   assert.equal(actor.movementMode,ranged?'orbit':'hold');
  }
 }
});

test('late server ticks use bounded collision steps and can slide past an obstacle for each enemy',()=>{
 for(const kind of kinds){
  const speed=ENEMY_BEHAVIORS[kind].moveSpeed,actor={id:kind,kind,radTox:true,position:{x:0,y:0,z:0},rotation:{y:0}};
  let calls=0;
  stepRadToxEnemy({events:[]},actor,[{id:'alice',position:{x:0,y:0,z:10},health:100}],1000,.25,()=>false,(previous,next)=>{
   calls++;assert.ok(Math.hypot(next.x-previous.x,next.z-previous.z)<=speed*.05+1e-8);
   return next.z>0?previous:next;
  },false);
  assert.ok(calls>=5);assert.ok(Math.abs(actor.position.x)>0);assert.equal(actor.position.z,0);
  assert.ok(Math.hypot(actor.velocity.x,actor.velocity.z)<=speed+1e-8);
 }
});

function combat(){
 const now=10000,player={position:{x:0,y:0,z:0},health:100,lastSeen:now};
 const actor={id:'ghost',kind:'ghost',radTox:true,active:true,health:40,position:{x:0,y:0,z:-4}};
 return {now,actor,player,sim:{actors:{ghost:actor},players:{alice:player},events:[],match:{state:'active'}},collision:{blocksShot:()=>false}};
}

test('a new enemy projectile starts at the muzzle rather than skipping the elapsed server tick',()=>{
 for(const kind of ['ghost','brain']){
  const {now,actor,sim,collision}=combat();actor.kind=kind;
  stepEnemyCombat(sim,{now,dt:.25,environment:{},collision});
  const projectile=Object.values(sim.projectiles)[0];assert.ok(projectile);
  assert.deepEqual(projectile.position,{...actor.position,y:ENEMY_BEHAVIORS[kind].height});
  stepEnemyCombat(sim,{now:now+50,dt:.05,environment:{},collision});
  close(Math.hypot(projectile.position.x-actor.position.x,projectile.position.y-ENEMY_BEHAVIORS[kind].height,projectile.position.z-actor.position.z),ENEMY_BEHAVIORS[kind].speed*.05);
 }
});

test('a projectile can hit a player before a wall; a closer wall still blocks it',()=>{
 for(const wall of [2,4]){
  const {now,actor,player,sim}=combat();actor.active=false;
  player.position.z=-1;
  sim.projectiles={p:{id:'p',actorId:actor.id,kind:'ghost',position:{x:0,y:.9,z:-4},velocity:[0,0,20],bornAt:now-1000,expiresAt:now+1000}};
  const collision={blocksShot:(_e,_o,_d,length)=>length>wall};
  stepEnemyCombat(sim,{now,dt:.25,environment:{},collision});
  assert.equal(player.combat?.hitsTaken||0,wall===4?1:0);assert.equal(Object.keys(sim.projectiles).length,0);
 }
});

test('enemy aiming retains the movement target when two players are similarly close',()=>{
 const {now,actor,player,sim,collision}=combat();actor.movementTargetId='bob';
 sim.players.bob={...player,position:{x:1,y:0,z:0}};
 stepEnemyCombat(sim,{now,dt:.05,environment:{},collision});
 assert.equal(actor.attackTargetId,'bob');assert.equal(sim.events[0].targetId,'bob');
});

test('shared projectiles finish their buffered path before removal and reject old snapshots',()=>{
 const scene=new THREE.Scene();let now=40;
 const effects=createSharedEnemyEffects({THREE,scene,resources:()=>({}),now:()=>now});
 const snapshot=(time,z)=>({simulationTime:epoch+time,projectiles:z===null?{}:{p:{id:'p',kind:'ghost',position:{x:0,y:1,z},velocity:[0,0,6],expiresAt:epoch+2500}}});
 effects.sync(snapshot(0,0));now=90;effects.sync(snapshot(50,.3));now=140;effects.sync(snapshot(100,null));
 effects.update(.05);assert.equal(scene.children.length,1);close(scene.children[0].position.z,0);
 now=190;effects.update(.05);close(scene.children[0].position.z,.3);
 now=240;effects.update(.05);assert.equal(scene.children.length,0);
 effects.sync(snapshot(50,.3));assert.equal(scene.children.length,0);
 effects.clear();
});

test('projectile effects expire during a network stall and release their own material',()=>{
 const scene=new THREE.Scene();let now=0,disposed=0;
 const effects=createSharedEnemyEffects({THREE,scene,resources:()=>({}),now:()=>now});
 effects.sync({simulationTime:epoch,projectiles:{p:{id:'p',kind:'brain',position:{x:0,y:1,z:0},expiresAt:epoch+2500}}});
 scene.children[0].material.addEventListener('dispose',()=>disposed++);
 now=3000;effects.update(3);assert.equal(scene.children.length,0);assert.equal(disposed,1);effects.clear();assert.equal(disposed,1);
});

test('snake animation preserves authored segment placement and does not drift over time',()=>{
 const root=new THREE.Group(),part=new THREE.Group();part.position.set(2,.4,-1);root.add(part);root.userData={serverKind:'snake',parts:[part]};
 for(let i=0;i<600;i++){animateSharedEnemy(root,1/60,i/60);assert.ok(Math.abs(part.position.x-2)<=.090001);close(part.position.y,.4);close(part.position.z,-1);}
 assert.deepEqual(root.position.toArray(),[0,0,0]);
});

test('attack snapshot and event render one flash regardless of arrival order',()=>{
 for(const eventFirst of [true,false]){
  let flashes=0;const root=new THREE.Group();root.userData.serverController={attackFlash:{update(){},play(){flashes++;}}};
  if(eventFirst)playSharedEnemyAttack(root,1000);
  root.userData.lastAttack=1000;animateSharedEnemy(root,.016,1);
  if(!eventFirst)playSharedEnemyAttack(root,1000);
  playSharedEnemyAttack(root,950);animateSharedEnemy(root,.016,1.016);assert.equal(flashes,1);
  playSharedEnemyAttack(root,2000);assert.equal(flashes,2);
 }
});

test('two users share one server encounter with stable enemy spawns, attacks and retry identities',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'enemy-flow-'));let now=100000,request=0;
 try{
  const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  runtime.collision.safeSpawn=(_e,p)=>p;runtime.collision.encounterSpawn=(_e,p)=>p;
  runtime.collision.resolve=(_e,_p,n)=>({...n,y:1,floorY:1});runtime.collision.resolvePlaced=(_e,_p,n)=>n;runtime.collision.blocksShot=()=>false;
  const environment={id:'shared-enemies',modelUrl:'/public/models/environments/muzimakzmain.glb',playable:true,spawn:{x:0,y:1,z:2}};
  const send=(accountId,action='input')=>runtime.command(environment.id,environment,{accountId,username:accountId,stats:{health:100}},{action,input:{},requestId:'flow-'+ ++request});
  const first=structuredClone(await send('alice','join'));await send('bob','join');
  await store.update(environment.id,room=>{for(const player of Object.values(room.simulation.players)){player.spawnProtectedUntil=0;player.shieldUntil=now+10000;};});
  for(let tick=0;tick<60;tick++){
   now+=[50,50,80,35,250][tick%5];
   const alice=structuredClone(await send('alice')),bob=structuredClone(await send('bob'));
   assert.equal(alice.simulationTime,bob.simulationTime);assert.deepEqual(alice.actors,bob.actors);
   for(const actor of Object.values(alice.actors).filter(a=>a.radTox)){
    assert.equal(actor.spawnId,first.actors[actor.id].spawnId);
    assert.ok(['x','y','z'].every(axis=>Number.isFinite(actor.position[axis])));
    assert.ok(Math.hypot(actor.velocity.x,actor.velocity.z)<=ENEMY_BEHAVIORS[actor.kind].moveSpeed+1e-8);
   }
  }
  const before=structuredClone(await runtime.snapshot(environment.id,environment));
  assert.deepEqual(new Set(Object.values(before.actors).filter(a=>a.radTox).map(a=>a.kind)),new Set(kinds));
  assert.ok(before.events.some(e=>e.action==='enemy-attack'));
  await store.update(environment.id,room=>{Object.assign(room.simulation.match,{state:'finished',outcome:'defeat',endedAt:now});});
  now+=10000;const retried=await send('alice');
  for(const actor of Object.values(retried.actors).filter(a=>a.radTox)){
   assert.notEqual(actor.spawnId,first.actors[actor.id].spawnId);assert.equal(actor.lastAttack,undefined);
  }
  assert.equal(Object.keys(retried.projectiles).length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
