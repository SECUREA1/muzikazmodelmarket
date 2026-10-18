import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {applyBuilderBaseTransform,normalizedBaseTransform,builderBaseSpawn} from '../public/js/environments/builder-base.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
test('alignment is absolute and resetting restores authored geometry without changing placed objects',()=>{
 const world=new THREE.Group(),base=new THREE.Group(),item=new THREE.Object3D();base.scale.setScalar(2);base.rotation.x=.2;item.position.set(3,4,5);world.add(base,item);
 const settings={x:18,y:3,z:-8,rotation:90,scale:1.5};base.updateMatrix();const authored=base.matrix.clone();
 applyBuilderBaseTransform(base,settings);const moved=base.matrix.clone();applyBuilderBaseTransform(base,settings);assert.deepEqual(base.matrix.elements,moved.elements);
 assert.deepEqual(item.position.toArray(),[3,4,5]);applyBuilderBaseTransform(base,{});assert.deepEqual(base.matrix.elements,authored.elements);
 assert.equal(normalizedBaseTransform({scale:0}).scale,.1);assert.equal(normalizedBaseTransform({x:Infinity}).x,0);assert.equal(normalizedBaseTransform(null).scale,1);
});
test('saved moved worlds keep collision floors and arrival points aligned beyond the original map boundary',async()=>{
 const base=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url))).find(environment=>environment.modelUrl||environment.modelUrls?.length);
 const environment={id:'aligned-world',builderScene:{baseEnvironment:base,baseTransform:{x:180,y:6,z:-120,rotation:90,scale:1.25},mapSize:80,objects:[]}};
 const collision=new ServerBuilderCollision(),spawn=builderBaseSpawn(environment),world=collision.world(environment);
 const safe=collision.safeSpawn(environment,spawn);assert.ok(safe.x>100);assert.ok(safe.z<-50);const flat={...environment,id:'aligned-flat',builderScene:{...environment.builderScene,baseTransform:{...environment.builderScene.baseTransform,y:0}}};const flatSpawn=collision.safeSpawn(flat,builderBaseSpawn(flat));assert.ok(Math.abs(safe.y-flatSpawn.y-6)<.01);
 const floor=collision.groundAt(environment,safe);assert.ok(floor);assert.ok(Math.abs(floor.y-safe.y)<.05);
 const position=collision.resolve(environment,safe,{...safe,y:safe.y-.1},{});assert.ok(position.y>=safe.y-.05);
 assert.ok(world.bounds.containsPoint(new THREE.Vector3(safe.x,safe.y,safe.z)));
});
test('publishing a changed alignment refreshes old coin sites and relocates active players to its entry',async()=>{
 const {AuthoritativeRooms}=await import('../authoritative-room.mjs');
 const runtime=new AuthoritativeRooms({store:{},now:()=>100000});runtime.prepareEncounter=()=>{};runtime.collision.safeSpawn=(_environment,point)=>({...point});
 const base={id:'base',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:0,z:2}},environment={id:'aligned-room',builderScene:{baseEnvironment:base,objects:[],baseTransform:{x:10}}};
 const room={};runtime.initialize(room,environment);const original=new Set(Object.keys(room.simulation.actors));
 room.simulation.players.alice={position:{x:10,y:0,z:2},velocityY:-5};
 environment.builderScene.baseTransform={x:180,y:6,z:-120};runtime.initialize(room,environment);
 const coins=Object.values(room.simulation.actors).filter(actor=>actor.loot?.currency==='MZK');assert.ok(coins.length);assert.ok(coins.every(coin=>!original.has(coin.id)&&coin.position.x>150));
 assert.equal(room.simulation.players.alice.position.x,180);assert.equal(room.simulation.players.alice.velocityY,0);
});
