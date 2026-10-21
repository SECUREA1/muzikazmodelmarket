import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import {isCleanCommonsEnvironment} from '../public/js/rad-tox-rules.js';
import {isCleanSportsEnvironment} from '../public/js/sports-worlds.js';
import {supportsRadTox,startRadTox} from '../rad-tox-campaign.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

const identity={accountId:'commons-builder',username:'Commons Builder',walletId:'commons-builder-wallet',stats:{health:73}};
const selfId='account:'+identity.accountId,targetId='commons-test-wall';
function commonsFixture(){
 return {id:'public-commons',name:'Public Commons',updatedAt:'clean-ground-test-v1',publicDestination:true,playable:true,multiplayer:true,proceduralLand:true,spawn:{x:0,y:0,z:4,rotationY:0},
  builderScene:{id:'commons-clean-ground',layout:'grand-floor',mapSize:40,gameplay:{multiplayer:true},objects:[
   {id:targetId,modelId:'material:wall',placementAnchor:'collider-base',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100}},
   {id:'commons-test-arcade',modelId:'arcade-slot-machine',position:{x:12,y:0,z:12},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'interact',device:'arcade-slot-machine',interactionDistance:3}}
  ]}};
}
function makeRuntime(store,now){return new AuthoritativeRooms({store,now,charge:async()=>{},reward:async()=>{},telemetry:async()=>{}});}
async function withRoom(run){
 const directory=await mkdtemp(join(tmpdir(),'commons-clean-ground-'));let clock=100000,sequence=0;
 const map=commonsFixture(),store=new SharedRoomStore(join(directory,'rooms.json')),now=()=>clock,runtime=makeRuntime(store,now);
 const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'commons-'+ ++sequence,...fields});
 try{return await run({map,store,runtime,now,advance:milliseconds=>{clock+=milliseconds;},send});}finally{await rm(directory,{recursive:true,force:true});}
}
function assertClean(snapshot){
 assert.equal(snapshot.radTox,null);assert.equal(snapshot.match,null);assert.deepEqual(snapshot.projectiles,{});
 assert.equal(Object.values(snapshot.actors).some(actor=>actor.radTox===true),false);
 const self=snapshot.players[selfId];assert.ok(self);assert.equal(self.radToxReady,true);assert.equal(self.radToxEnabled,false);return self;
}
test('Commons refresh restores authored floor materials and preserves visible geometry and the real floor collider',()=>{
 const root=new THREE.Group(),geometry=new THREE.BoxGeometry(12,.2,12),material=new THREE.MeshStandardMaterial({color:0x73885c,roughness:.9});
 const floor=new THREE.Mesh(geometry,material);floor.name='BUILDER_WALKABLE_FLOOR_grand-floor';floor.position.y=-.1;root.add(floor);root.updateMatrixWorld(true);
 const loader={world:root,activeEnvironment:{id:'campaign-floor-fixture',proceduralLand:true},floorSlime:null,clearFloorEffects:EnvironmentLoader.prototype.clearFloorEffects};
 const refresh=()=>EnvironmentLoader.prototype.refreshFloorEffects.call(loader),ray=new THREE.Ray(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0)),before=buildCollision(root).octree.rayIntersect(ray);
 const positions=Array.from(geometry.attributes.position.array),normals=Array.from(geometry.attributes.normal.array),indices=Array.from(geometry.index.array);
 try{
  assert.ok(before);refresh();assert.ok(loader.floorSlime);assert.notEqual(floor.material,material);
  loader.activeEnvironment=commonsFixture();refresh();assert.equal(loader.floorSlime,null);assert.equal(floor.material,material);
  refresh();assert.equal(loader.floorSlime,null);assert.equal(floor.material,material);
  assert.equal(floor.visible,true);assert.equal(root.children.length,1);assert.equal(floor.geometry,geometry);
  assert.deepEqual(Array.from(geometry.attributes.position.array),positions);assert.deepEqual(Array.from(geometry.attributes.normal.array),normals);assert.deepEqual(Array.from(geometry.index.array),indices);
  const after=buildCollision(root).octree.rayIntersect(ray);assert.ok(after);assert.ok(Math.abs(after.position.y-before.position.y)<1e-7);assert.ok(Math.abs(after.position.y)<1e-7);
 }finally{loader.clearFloorEffects();geometry.dispose();material.dispose();}
});
test('fresh Commons joins cannot auto-start an encounter or defer ordinary tool readiness',async()=>{
 for(const flags of [{},{deferRadTox:true,radToxEnabled:true}])await withRoom(async({map,runtime,send,advance})=>{
  const joined=await send('join',flags),initialHealth=identity.stats.health;assert.equal(assertClean(joined).health,initialHealth);
  const toggled=await send('rad-tox-toggle',{enabled:true});assert.equal(assertClean(toggled).health,initialHealth);
  const started=await send('start-rad-tox');assert.equal(assertClean(started).health,initialHealth);
  await send('input',{input:{side:1,forward:0,yaw:0}});let snapshot=joined;
  for(let frame=0;frame<8;frame++){advance(250);snapshot=await runtime.snapshot(map.id,map);assert.equal(assertClean(snapshot).health,initialHealth);}
  assert.ok(snapshot.players[selfId].position.x>joined.players[selfId].position.x);assert.ok(snapshot.players[selfId].position.y>=-.001);
 });
});
test('persisted Commons campaign cleanup preserves member objects, deployed props and existing player health',()=>withRoom(async({map,store,runtime,send,now,advance})=>{
 await send('join');
 const piece={id:'member-brick',ownerId:selfId,revision:1,materialId:'brick',hits:2,position:[10,.2,10],rotation:[0,0,0],scale:[1,1,1],paint:[0x123456],open:false};
 const prop={id:'member-prop',spawned:true,ownerId:selfId,active:true,health:67,modelId:'supply-crate',asset:{buildAssetId:'supply-crate'},position:{x:-10,y:0,z:8},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
 await store.update(map.id,room=>{
  const sim=room.simulation,self=sim.players[selfId];room.objects[piece.id]=structuredClone(piece);room.revision++;sim.actors[prop.id]=structuredClone(prop);
  self.health=61;self.radToxEnabled=true;self.radToxReady=false;self.spawnProtectedUntil=0;
  sim.radTox={level:1,wave:1,state:'active',remaining:1,targetCount:1};
  sim.match={id:'old-commons-match',level:1,state:'finished',participants:{[selfId]:{id:selfId,username:identity.username,joinedAt:now()}},startedAt:now()-5000,endedAt:now(),outcome:'defeat',results:[]};
  sim.actors['old-commons-enemy']={id:'old-commons-enemy',radTox:true,kind:'ghost',active:true,health:1,spawnVersion:2,spawnedAt:now()-5000,attackStartedAt:now()-5000,position:{...self.position},rotation:{y:0},definition:{objectId:'old-commons-enemy',position:{...self.position},gameplay:{behavior:'hostile',health:1,damage:6},movement:{speed:2},ai:{detectionRange:40}}};
  sim.projectiles={'old-commons-projectile':{id:'old-commons-projectile',actorId:'old-commons-enemy',kind:'ghost',position:{x:self.position.x,y:self.position.y+.9,z:self.position.z+1},velocity:[0,0,-6],bornAt:now(),expiresAt:now()+2500}};
 });
 const reopenedStore=new SharedRoomStore(store.file),reopened=makeRuntime(reopenedStore,now);advance(250);
 let snapshot=await reopened.snapshot(map.id,map);assert.equal(assertClean(snapshot).health,61);assert.deepEqual(snapshot.objects[piece.id],piece);
 assert.ok(snapshot.actors[prop.id]);assert.equal(snapshot.actors[prop.id].health,67);assert.equal(snapshot.actors[prop.id].ownerId,selfId);
 for(let tick=0;tick<4;tick++){advance(500);snapshot=await reopened.snapshot(map.id,map);assert.equal(assertClean(snapshot).health,61);}
 const fired=await reopened.command(map.id,map,identity,{action:'fire',requestId:'after-persisted-cleanup',tool:'laser',direction:[1,0,0]});
 assert.equal(fired.result.tool,'laser');assert.equal(assertClean(fired).health,61);assert.deepEqual(fired.objects[piece.id],piece);assert.equal(fired.actors[prop.id].health,67);
}));
test('Commons keeps authoritative laser damage, paint, solid drawing and destructible Builder pieces',()=>withRoom(async({map,runtime,send,advance})=>{
 let snapshot=await send('join',{deferRadTox:true,radToxEnabled:true});const originalHealth=snapshot.actors[targetId].health;
 const paint=await send('fire',{tool:'spray',direction:[0,0,-1],color:0x44aaff});
 assert.equal(paint.result.tool,'spray');assert.equal(paint.result.hitId,targetId);assert.equal(paint.result.color,0x44aaff);assert.ok(paint.result.paintNormal?.every(Number.isFinite));
 assert.equal(paint.actors[targetId].paint,0x44aaff);assert.equal(paint.actors[targetId].health,originalHealth);
 advance(500);snapshot=await send('fire',{tool:'laser',direction:[0,0,-1]});assert.equal(snapshot.result.hitId,targetId);assert.equal(snapshot.result.targetType,'building');assert.ok(snapshot.actors[targetId].health<originalHealth);
 for(let shot=0;shot<20&&snapshot.actors[targetId].active!==false;shot++){advance(500);snapshot=await send('fire',{tool:'laser',direction:[0,0,-1]});}
 assert.equal(snapshot.actors[targetId].health,0);assert.equal(snapshot.actors[targetId].active,false);assertClean(snapshot);
 advance(500);const drawn=await send('draw-paint',{direction:[0,-1,-1],color:0xee55aa}),stroke=Object.values(drawn.actors).find(actor=>actor.ownerId===selfId&&actor.asset?.renderKind==='paint-stroke');
 assert.ok(stroke);assert.equal(stroke.asset.color,0xee55aa);assert.equal(stroke.active,true);
 const cleared=await send('clear-paint',{lastOnly:true});assert.equal(cleared.actors[stroke.id],undefined);
 const ground=runtime.collision.groundAt(map,{x:0,y:.02,z:0},{actors:cleared.actors,objects:cleared.objects});
 assert.ok(ground&&Math.abs(ground.y-.02)<1e-6);assert.equal(assertClean(cleared).health,identity.stats.health);
}));
test('the clean Commons policy stays scoped and normal campaign worlds retain RAD-TOX',()=>{
 const commons=commonsFixture(),normal={...commons,id:'ordinary-campaign-world'};
 assert.equal(isCleanCommonsEnvironment(commons),true);assert.equal(isCleanCommonsEnvironment(normal),false);assert.equal(isCleanCommonsEnvironment(undefined),false);
 assert.equal(isCleanSportsEnvironment(commons),false);assert.equal(supportsRadTox(commons),false);assert.equal(supportsRadTox(normal),true);
 const cleanSim={players:{},actors:{},events:[]},normalSim={players:{},actors:{},events:[]};
 assert.equal(startRadTox(cleanSim,commons,100000,{x:0,y:.02,z:4}),false);assert.equal(cleanSim.radTox,undefined);assert.deepEqual(cleanSim.actors,{});
 assert.equal(startRadTox(normalSim,normal,100000,{x:0,y:.02,z:4}),true);assert.ok(normalSim.radTox);assert.ok(Object.values(normalSim.actors).some(actor=>actor.radTox));
 assert.equal(supportsRadTox({...normal,airport:{enabled:true}}),false);assert.equal(supportsRadTox({...normal,builderScene:{...normal.builderScene,layoutMeta:{harbor:{extent:128}}}}),false);
});
