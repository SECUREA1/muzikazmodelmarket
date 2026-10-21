import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {neonMarina} from '../neon-marina.mjs';
import {harborWaterAt,isWatercraft,watercraftFootprint} from '../public/js/harbor-water.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
const marina=neonMarina();
const world={id:'marina-test',updatedAt:'1',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor},objects:marina.objects}};
test('harbor has real sea outside the mainland, three land destinations, and six catalog boats at accessible slips',()=>{
 assert.equal(marina.harbor.islands.length,3);const boats=marina.objects.filter(isWatercraft);assert.equal(boats.length,6);
 for(const boat of boats){assert.ok(watercraftFootprint(boat.position,boat.rotation.y).every(p=>harborWaterAt(world,p)));assert.ok(createBuilderModel(boat.modelId));}
 const land=createBuilderLand(world);assert.ok(land.getObjectByName('HARBOR_WATER_VISUAL').userData.collisionDisabled);const collision=new ServerBuilderCollision();
 assert.ok(Math.abs(collision.groundAt(world,{x:10,y:1,z:10}).y)<.1);
 assert.ok(collision.groundAt(world,{x:155,y:1,z:75}).y<-.5,'sea does not hide a mainland floor at y=0');
 for(const island of marina.harbor.islands){assert.equal(harborWaterAt(world,island),false);assert.ok(Math.abs(collision.groundAt(world,{x:island.x+island.width/2-3,z:island.z+island.depth/2-3,y:1}).y)<.1);}
});
test('boats board without moving the mooring, cruise on the waterline, stop at land, and support clean exits',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'boat-sailing-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,count=0;const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'sailor',walletId:'sailor',username:'Sailor',stats:{health:100}},actorId='account:sailor';
 const send=(action,extra={})=>runtime.command(world.id,world,identity,{action,requestId:'boat-'+ ++count,...extra});await send('join',{radToxEnabled:false});
 const boat=marina.objects.find(o=>o.id.endsWith('boat-0'));
 await store.update(world.id,room=>{room.simulation.players[actorId].position={x:144,y:.22,z:16.8};});
 let state=await send('interact',{entityId:boat.id});assert.equal(state.players[actorId].vehicleId,boat.id);assert.equal(state.players[actorId].position.x,boat.position.x);assert.equal(state.actors[boat.id].position.y,0);
 // Head east out of the slip into open water.
 state=await send('input',{input:{forward:1,yaw:-Math.PI/2}});for(let i=0;i<10;i++){now+=100;state=await send('input',{input:{forward:1,yaw:-Math.PI/2}});}
 assert.ok(state.players[actorId].position.x>boat.position.x+3);assert.equal(state.players[actorId].position.y,.35);assert.equal(state.actors[boat.id].position.y,0);
 // Position beside the actual eastern island shore; a boat cannot drive onto land.
 await store.update(world.id,room=>{const p=room.simulation.players[actorId];p.position={x:155,y:.35,z:36};room.simulation.actors[boat.id].position={x:155,y:0,z:36};});
 for(let i=0;i<20;i++){now+=100;state=await send('input',{input:{forward:1,yaw:-Math.PI/2}});}
 assert.ok(state.players[actorId].position.x<161);assert.ok(watercraftFootprint(state.players[actorId].position,-Math.PI/2).every(p=>harborWaterAt(world,p)));
 state=await send('interact');assert.equal(state.players[actorId].vehicleId,null);assert.equal(state.actors[boat.id].holderId,null);
 const restored=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now}).snapshot(world.id,world);assert.equal(restored.actors[boat.id].position.x,state.actors[boat.id].position.x);
});
