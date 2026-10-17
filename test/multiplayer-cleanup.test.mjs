import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {projectServerActor,interpolateServerEnemy} from '../public/js/server-scene-projection.js';
import {animateSharedEnemy} from '../public/js/shared-enemy-animation.js';
import {spatialEffectGain} from '../public/js/shared-effect-audio.js';
test('batched room updates isolate rooms, roll back failures and flush durable state',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'room-batch-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new SharedRoomStore(join(dir,'rooms.json'));
 store.data={a:{count:0},b:{count:0},c:{count:0}};
 const results=await store.updateMany(['a','b','c'],(room,id)=>{room.count++;if(id==='b')throw Error('bad map');});
 assert.ok(results.find(result=>result.id==='b').error);assert.equal((await store.get('a')).count,1);assert.equal((await store.get('b')).count,0);assert.equal((await store.get('c')).count,1);
 const result=await store.update('a',room=>{room.count++;return room;},{persist:false,roomOnly:true});result.count=100;assert.equal((await store.get('a')).count,2);
 await assert.rejects(store.update('a',room=>{room.count=50;throw Error('rejected');},{persist:false,roomOnly:true}),/rejected/);assert.equal((await store.get('a')).count,2);
 await store.flush();assert.equal((await new SharedRoomStore(store.file).get('a')).count,2);
});
test('one failing world does not stop healthy rooms and failed ticks are retried with backoff',async()=>{
 let now=1000;const store=new SharedRoomStore('/tmp/not-written-room-batch.json');store.data=Object.fromEntries(['good','bad','other'].map(id=>[id,{simulation:{players:{p:{lastSeen:1000}}},ticks:0}]));
 const runtime=new AuthoritativeRooms({store,now:()=>now});for(const id of Object.keys(store.data))runtime.activeWorlds.set(id,{id});let failures=0;
 runtime.step=(room,environment)=>{room.ticks++;if(environment.id==='bad'){failures++;throw Error('bad geometry');}};
 const log=console.error;console.error=()=>{};
 try{await runtime.tickActive();await runtime.tickActive();assert.equal(failures,1);assert.equal((await store.get('good')).ticks,2);assert.equal((await store.get('bad')).ticks,0);assert.equal((await store.get('other')).ticks,2);now+=1100;await runtime.tickActive();assert.equal(failures,2);assert.equal((await store.get('other')).ticks,3);}finally{console.error=log;}
});
test('moving server actors interpolate without changing confirmed state and teleports reset the path',()=>{
 const root=new THREE.Group(),actor={active:true,position:{x:0,y:0,z:0},rotation:{y:0},definition:{gameplay:{behavior:'patrol'}}};
 projectServerActor(root,actor,{now:0});actor.position.x=1;projectServerActor(root,actor,{now:100});assert.equal(root.position.x,0);interpolateServerEnemy(root,.016,125);assert.ok(root.position.x>0&&root.position.x<1.5);assert.equal(actor.position.x,1);
 actor.position.x=20;projectServerActor(root,actor,{now:150});assert.equal(root.position.x,20);
});
test('confirmed weapon audio fades with distance and silences invalid or far-away effects',()=>{
 const source={x:0,y:0,z:0};assert.equal(spatialEffectGain(source,source),1);assert.equal(spatialEffectGain(source,{x:40,y:0,z:0}),0);assert.equal(spatialEffectGain(source,{x:20,y:0,z:0}),.25);assert.equal(spatialEffectGain(source,{x:Infinity,y:0,z:0}),0);
});
test('an attack already flashed by its confirmed event is not restarted on the next animation frame',()=>{
 const root=new THREE.Group();let plays=0;root.userData={lastAttack:100,flashToken:100,attackVisualTime:.25,serverController:{attackFlash:{update(){},play(){plays++;}}}};
 animateSharedEnemy(root,.016,1);assert.equal(plays,0);root.userData.lastAttack=101;animateSharedEnemy(root,.016,1.1);assert.equal(plays,1);animateSharedEnemy(root,.016,1.2);assert.equal(plays,1);
});
