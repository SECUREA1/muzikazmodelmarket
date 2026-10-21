import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);
async function glbFixture(run){
 const directory=await mkdtemp(join(process.cwd(),'public/models/local-map-fixture-'));
 try{
  // One mesh contains both the floor and the thin dividing wall. Its named
  // join spawn intentionally differs from the requested local destination.
  const vertices=new Float32Array([
   -5,0,-5,-5,0,5,5,0,5, -5,0,-5,5,0,5,5,0,-5,
   -5,0,0,5,0,0,5,3,0, -5,0,0,5,3,0,-5,3,0
  ]),binary=Buffer.from(vertices.buffer),document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'MERGED_ROOM',mesh:0},{name:'SPAWN_PLAYER',translation:[2,0,3]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteLength:binary.length}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3'}]};
  const json=Buffer.from(JSON.stringify(document)),padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binaryHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+binary.length,8);jsonHeader.writeUInt32LE(padded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binaryHeader.writeUInt32LE(binary.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  const file=join(directory,'local-room.glb');await writeFile(file,Buffer.concat([header,jsonHeader,padded,binaryHeader,binary]));
  const base={id:'local-glb-base',modelUrl:'/'+relative(process.cwd(),file),spawn:{x:2,y:0,z:3},playableSize:10},environment={...base,id:'local-glb-landmarks',name:'GLB landmarks',builderScene:{baseEnvironment:base,objects:[],layoutMeta:{locations:[{id:'far-room',name:'Far room',x:-3,y:0,z:-3,width:2,depth:2}]}}};
  return await run(environment);
 }finally{await rm(directory,{recursive:true,force:true});}
}

test('local GLB destinations use the requested floor across walls rather than the named join spawn',()=>glbFixture(async environment=>{
 const collision=new ServerBuilderCollision(),origin=collision.safeSpawn(environment,{x:-3,y:0,z:-3});near(origin.x,2);near(origin.z,3);
 const target={x:-3,y:0,z:-3},arrival=collision.localMapPosition(environment,origin,target);
 near(arrival.x,-3);near(arrival.z,-3);near(arrival.y,.02);
 const delta=[arrival.x-origin.x,arrival.y-origin.y,arrival.z-origin.z],span=Math.hypot(...delta);
 assert.equal(collision.blocksShot(environment,{x:origin.x,y:1.5,z:origin.z},delta.map(value=>value/span),span),true,'a physical wall separates the rooms');
 assert.throws(()=>collision.localMapPosition(environment,origin,{x:-3,y:0,z:.1}),/floor|clear|landing/i,'a click too close to an actual GLB wall is rejected');
 assert.throws(()=>collision.localMapPosition(environment,origin,{x:50,y:0,z:50}),/floor|clear|landing/i);
}));

for(const kind of ['spawned actor','placed brick'])test(kind+' blocks an embedded landing while a named location finds nearby physical ground',()=>glbFixture(async environment=>{
 const collision=new ServerBuilderCollision(),origin={x:2,y:.02,z:3},actors={},objects={};
 if(kind==='spawned actor')actors.solid={id:'solid',spawned:true,active:true,health:100,asset:{buildAssetId:'material:wall'},position:{x:-3,y:0,z:-3},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
 else objects.brick={id:'brick',materialId:'brick',revision:1,position:[-3,.9,-3],rotation:[0,0,0],scale:[2,3,2]};
 const physical=collision.placedWorld(actors,objects),bounds=new THREE.Box3();for(const box of physical.boxes)bounds.union(box);assert.equal(bounds.isEmpty(),false);
 // Feet stand on the floor, but the body overlaps the nearby solid side.
 const requested={x:-3,y:0,z:bounds.max.z+.1};
 assert.throws(()=>collision.localMapPosition(environment,origin,requested,actors,objects),/floor|clear|landing/i);
 const arrival=collision.localMapPosition(environment,origin,requested,actors,objects,{searchRadius:12});
 assert.ok(Math.hypot(arrival.x-requested.x,arrival.z-requested.z)>0.1);assert.ok(Math.hypot(arrival.x-requested.x,arrival.z-requested.z)<=12);near(arrival.y,.02);assert.ok(arrival.z<-.38,'the nearby landing stays in the requested room');assert.ok(Math.hypot(arrival.x-origin.x,arrival.z-origin.z)>2,'nearby search does not fall back to the join marker');
 assert.doesNotThrow(()=>collision.teleportPosition(environment,origin,arrival,actors,objects,{localMap:true}));
 if(kind==='spawned actor'){
  actors.solid.open=true;const opened=collision.localMapPosition(environment,origin,requested,actors,objects);near(opened.x,requested.x);near(opened.z,requested.z);
  actors.solid.open=false;actors.solid.active=false;const inactive=collision.localMapPosition(environment,origin,requested,actors,objects);near(inactive.x,requested.x);near(inactive.z,requested.z);
 }else{
  objects.brick.open=true;const opened=collision.localMapPosition(environment,origin,requested,actors,objects);near(opened.x,requested.x);near(opened.z,requested.z);
 }
}));

test('confirmed local map travel preserves the live room and player progress while resetting only relocation motion',()=>glbFixture(async environment=>{
 const directory=await mkdtemp(join(tmpdir(),'local-map-room-'));
 try{
  const store=new SharedRoomStore(join(directory,'rooms.json'));let now=100000,request=0;const runtime=new AuthoritativeRooms({store,now:()=>now}),alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}},send=(user,action,fields={})=>runtime.command(environment.id,environment,user,{action,requestId:'safe-map-'+ ++request,...fields});
  await send(alice,'join',{radToxEnabled:false});await send(bob,'join',{radToxEnabled:false});
  await store.update(environment.id,room=>{const player=room.simulation.players['account:alice'];Object.assign(player,{score:321,health:83,ammo:47,fuel:65,input:{forward:1,side:.4,jump:true},velocityY:-3,grounded:false,lastInputSequence:17});player.inventory=['kept-item'];player.quests={kept:true};player.progress={explore:9};});
  const before=await store.get(environment.id),previous=before.simulation.players['account:alice'],other=before.simulation.players['account:bob'];
  let state=await send(alice,'map-access',{locationId:'far-room'});const player=state.players['account:alice'];near(player.position.x,-3);near(player.position.z,-3);near(player.position.y,.02);assert.equal(player.movementRevision,(previous.movementRevision||0)+1);assert.equal(player.grounded,true);assert.deepEqual(Object.keys(state.players).sort(),['account:alice','account:bob']);
  const after=await store.get(environment.id),saved=after.simulation.players['account:alice'];
  for(const key of ['score','health','ammo','fuel','inventory','quests','progress','inputEpoch','lastInputSequence'])assert.deepEqual(saved[key],previous[key],key+' survives a local port');
  assert.deepEqual(saved.input,{});assert.equal(saved.velocityY,0);near(saved.floor,.02);assert.equal(saved.grounded,true);assert.deepEqual(after.simulation.players['account:bob'],other,'the other live member stays in the same room');
  await assert.rejects(send(alice,'map-access',{position:{x:-3,z:.1}}),/floor|clear|landing/i);
  const rejected=await store.get(environment.id);assert.deepEqual(rejected.simulation.players['account:alice'].position,saved.position);assert.equal(rejected.simulation.players['account:alice'].movementRevision,saved.movementRevision);
  state=await send(alice,'map-access',{position:{x:3,z:3}});near(state.players['account:alice'].position.x,3);near(state.players['account:alice'].position.z,3);assert.equal(Object.keys(state.players).length,2);assert.equal(state.players['account:alice'].score,321);
 }finally{await rm(directory,{recursive:true,force:true});}
}));

test('offset transformed GLB map portals retain the authored footprint when distant Builder decorations enlarge collision bounds',()=>glbFixture(async original=>{
 const {environmentGeometry}=await import('../server-glb-geometry.mjs'),{applyBuilderBaseTransform}=await import('../public/js/environments/builder-base.js'),{localMapLocations}=await import('../public/js/local-map-locations.js');
 const environment={...original,id:'local-glb-decorated-bounds',builderScene:{...original.builderScene,baseTransform:{x:20,y:0,z:-10,rotation:30,scale:1.4},objects:[{id:'far-decor-wall',modelId:'material:wall',placementAnchor:'collider-base',position:{x:100,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100}}]}},clientBase=environmentGeometry(environment.builderScene.baseEnvironment);
 applyBuilderBaseTransform(clientBase,environment.builderScene.baseTransform);const clientBounds=new THREE.Box3().setFromObject(clientBase),collision=new ServerBuilderCollision(),world=collision.world(environment);
 assert.ok(world.bounds.max.x>99,'distant physical Builder geometry remains in the collision world');assert.ok(world.mapBounds,'the server retains a distinct authored map footprint');assert.ok(world.mapBounds.max.x<31,'a distant Builder wall cannot enlarge the portal footprint');
 for(const side of ['min','max'])for(const axis of ['x','y','z'])near(world.mapBounds[side][axis],clientBounds[side][axis]);
 const displayed=localMapLocations(environment,clientBounds).find(place=>place.id==='map-east'),server=localMapLocations(environment,world.mapBounds).find(place=>place.id==='map-east');assert.ok(displayed&&server);for(const axis of ['x','y','z'])near(server[axis],displayed[axis]);
 const directory=await mkdtemp(join(tmpdir(),'local-map-glb-bounds-'));
 try{
  const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000}),identity={accountId:'bounds-walker',username:'Bounds walker',stats:{health:100}};
  await runtime.command(environment.id,environment,identity,{action:'join',requestId:'decor-bounds-join',radToxEnabled:false});
  const state=await runtime.command(environment.id,environment,identity,{action:'map-access',locationId:'map-east',requestId:'decor-bounds-port'}),arrival=state.players['account:bounds-walker'].position;near(arrival.x,displayed.x);near(arrival.z,displayed.z);near(arrival.y,.02);assert.ok(arrival.x<31,'the confirmed landing uses the displayed room, not the distant decoration or void');
 }finally{await rm(directory,{recursive:true,force:true});}
}));
