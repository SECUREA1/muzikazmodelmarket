import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {builderBaseEnvironment} from '../public/js/environments/builder-base.js';
import {refreshMzkCoins} from '../server-mzk-coins.mjs';
test('every repository map remains a solid playable base after saving as a builder scene',async()=>{
 const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
 const collision=new ServerBuilderCollision();
 for(const base of records){
  const map={id:'built-'+base.id,builderScene:{layout:'repository-'+base.id,mapSize:160,baseEnvironment:base,objects:[{id:'placed-atm',modelId:'market-atm',position:{x:3,y:1,z:2},scale:{x:1,y:1,z:1}}]}};
  assert.equal(builderBaseEnvironment(map),base);
  const world=collision.world(map);assert.equal(world.glb,true,base.id);assert.ok(world.floors.length,base.id);const placed=world.root.children.find(object=>object.userData.builderObjectId==='placed-atm');assert.ok(placed);assert.equal(placed.matrixWorld.elements[12],3);assert.equal(placed.matrixWorld.elements[13],1);
  const spawn=collision.safeSpawn(map,base.spawn||{x:0,y:0,z:2});assert.ok(Number.isFinite(spawn.y),base.id);
  const next=collision.resolve(map,spawn,{...spawn,y:spawn.y-.1},{});assert.ok(next.y>=spawn.y-.05,base.id);
  const sim={actors:{}};
  refreshMzkCoins(sim,map,100000,(point,occupied)=>collision.encounterSpawn(map,point,spawn,occupied),()=>.3);
  const coins=Object.values(sim.actors);assert.ok(coins.length>0,base.id);
  for(const coin of coins)assert.ok(collision.groundAt(map,coin.position),base.id+' coin has floor');
 }
});
test('failed coin placement backs off rather than scanning blocked geometry every tick',()=>{
 const sim={actors:{}};let queries=0;
 const blocked=()=>{queries++;return null;};
 refreshMzkCoins(sim,{},1000,blocked);assert.equal(queries,8);
 refreshMzkCoins(sim,{},1100,blocked);assert.equal(queries,8);
 refreshMzkCoins(sim,{},3000,blocked);assert.equal(queries,16);
});
test('custom enemies use world collision without leaving a frozen collider at their spawn',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {SharedRoomStore}=await import('../shared-room-store.mjs'),{AuthoritativeRooms}=await import('../authoritative-room.mjs');
 const dir=await mkdtemp(join(tmpdir(),'builder-enemy-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000;
 const map={id:'enemy-test',builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'moving-enemy',modelId:'robot-scout',position:{x:0,y:0,z:-4},functionalSettings:{behavior:'hostile',health:100},movementSettings:{speed:2}}]}};
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now});
 assert.ok(!runtime.collision.world(map).walls.some(wall=>wall.objectId==='moving-enemy'));
 const identity={accountId:'walker',username:'Walker',stats:{health:100}};
 const first=await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
 const initial={...first.actors['moving-enemy'].position};let checked=0;
 const resolve=runtime.collision.resolve.bind(runtime.collision);
 runtime.collision.resolve=(environment,previous,next,actors)=>{if(previous.z===initial.z&&previous.x===initial.x){checked++;return previous;}return resolve(environment,previous,next,actors);};
 now+=100;const second=await runtime.snapshot(map.id,map);
 assert.ok(checked>0);assert.deepEqual(second.actors['moving-enemy'].position,initial);
});
