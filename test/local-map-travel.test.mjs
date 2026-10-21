import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {localMapLocations} from '../public/js/local-map-locations.js';
test('ordinary maps support local landmarks, fallback arrival and full-map floor selection without crossing walls on foot',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'local-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));const world={id:'ordinary-open-map',proceduralLand:true,spawn:{x:-160,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:512,objects:[],layoutMeta:{locations:[{id:'lookout',name:'Lookout',x:180,z:0,width:8,depth:8}]}}},store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store});const user={accountId:'walker',username:'Walker',stats:{health:100}};let sequence=0;const send=(action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'local-map-'+ ++sequence,...fields});
 await send('join',{radToxEnabled:false});await store.update(world.id,room=>{room.objects.wall={id:'wall',materialId:'brick',position:[0,2,0],rotation:[0,0,0],scale:[5,5,5],paint:[1,1,1,1,1,1]};});
 let state=await send('map-access',{position:{x:180,z:0}});assert.equal(state.players['account:walker'].position.x,180);assert.ok(state.players['account:walker'].position.y>=0);
 state=await send('map-access',{locationId:'lookout'});assert.equal(state.players['account:walker'].position.x,180);
 for(const place of localMapLocations(world,runtime.collision.world(world).bounds).filter(place=>place.teleportal&&place.id!=='map-arrival')){
  const before=state.players['account:walker'].movementRevision;
  state=await send('map-access',{locationId:place.id});const player=state.players['account:walker'];
  assert.ok(Math.hypot(player.position.x-place.x,player.position.z-place.z)<=12,place.name+' lands in its map region');assert.ok(player.position.y>=0);assert.equal(player.movementRevision,before+1);
 }
 await assert.rejects(send('map-access',{position:{x:10000,z:0}}));await assert.rejects(send('map-access',{position:{x:NaN,z:0}}));await assert.rejects(send('map-access',{position:{x:0,z:0}}));
 const fallback={...world,id:'local-arrival',builderScene:{...world.builderScene,layoutMeta:{}}};assert.equal(localMapLocations(fallback)[0].id,'map-arrival');await runtime.command(fallback.id,fallback,user,{action:'join',requestId:'fallback-join',radToxEnabled:false});state=await runtime.command(fallback.id,fallback,user,{action:'map-access',locationId:'map-arrival',requestId:'fallback-port'});assert.equal(state.players['account:walker'].position.x,-160);
});
