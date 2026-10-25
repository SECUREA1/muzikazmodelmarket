import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {localMapLocations} from '../public/js/local-map-locations.js';

// Exercise the actual server command, collision geometry and populated rooms.
// A list-only assertion misses destinations whose pin sits inside a solid tower.
test('every listed public explorer location accepts travel onto clear supported ground after load and reload',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'all-map-locations-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 // These two native games load their own simulations rather than map-access.
 const worlds=environments.filter(world=>!['hockey','arcade'].includes(world.game));
 assert.ok(worlds.some(world=>world.id==='skyscraper-construction'));
 assert.ok(worlds.some(world=>world.modelUrl||world.modelUrls?.length));
 let locationCount=0;
 for(const environment of worlds)await t.test(environment.id,async()=>{
  const file=join(directory,environment.id+'.json'),visitor={accountId:'map-visitor',username:'Map visitor',stats:{health:100}};
  let runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>100000}),sequence=0;
  const send=(action,fields={})=>runtime.command(environment.id,environment,visitor,{action,requestId:'location-'+ ++sequence,...fields});
  const joined=await send('join',{deferRadTox:true,radToxEnabled:false});
  const ids=Object.keys(joined.actors).sort();
  const before=localMapLocations(environment).map(place=>place.id);
  assert.ok(before.length);
  // Reload from the durable room record, just as a returning player does. AI,
  // vehicles and saved objects must not remove or duplicate listed locations.
  runtime.collision.clearPlacedWorlds();
  runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>100000});
  const rejoined=await send('join',{deferRadTox:true,radToxEnabled:false});
  assert.deepEqual(Object.keys(rejoined.actors).sort(),ids);
  assert.deepEqual(localMapLocations(environment).map(place=>place.id),before);
  for(const place of localMapLocations(environment)){
   const state=await send('map-access',{locationId:place.id}),point=state.players[state.selfId].position;
   locationCount++;
   assert.match(state.result.message,/^Arrived at /,place.id);
   assert.ok(['x','y','z'].every(axis=>Number.isFinite(point[axis])),place.id+' has finite coordinates');
   const options={actors:state.actors,objects:state.objects,earthworks:state.construction?.earthworks};
   const floor=runtime.collision.groundAt(environment,point,options);
   assert.ok(floor&&Math.abs(floor.y-point.y)<.05,place.id+' has real floor support');
   assert.ok(runtime.collision.hasBodyClearance(environment,point,.38,options),place.id+' leaves room for the player capsule');
   const target=place.arrival||place,reach=Math.max(13,Math.min(128,Math.hypot(Number(place.width)||0,Number(place.depth)||0)/2+2));
   assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<=reach+.01,place.id+' arrives at its own footprint');
   if(environment.builderScene?.layoutMeta?.harbor)assert.ok(point.y>=-.05,place.id+' avoids harbor water');
  }
  runtime.collision.clearPlacedWorlds();
 });
 t.diagnostic(`${worlds.length} public explorer worlds, ${locationCount} listed locations, with durable reloads and populated actors.`);
});
