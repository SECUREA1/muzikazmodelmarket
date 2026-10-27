import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {shippingWorld,SHIPPING_HARBOR_ID} from '../shipping-world.mjs';
import {SHIPPING_ID,SHIPPING_PORTS,SHIPPING_ROUTES,SHIPPING_LANES,SHIPPING_VESSELS} from '../public/js/shipping-config.js';
import {harborWaterAt,isWatercraft,watercraftFootprint} from '../public/js/harbor-water.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {neonMarina} from '../neon-marina.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {localMapLocations} from '../public/js/local-map-locations.js';

test('shipping academy is a permanent shared sea destination with a matching static catalogue',async()=>{
 const world=shippingWorld(),rows=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.deepEqual(rows.find(row=>row.id===SHIPPING_ID),world);
 assert.equal(world.builderScene.mapSize,2800);assert.equal(world.permanent,true);assert.equal(world.multiplayer,true);assert.equal(world.builderScene.layoutMeta.harbor.mainIsland,false);
 assert.equal(world.builderScene.layoutMeta.harbor.fishingEnabled,false);assert.deepEqual(world.builderScene.layoutMeta.harbor.fishingZones,[]);
 assert.ok(harborWaterAt(world,{x:0,z:0}),'the narrow strait has no invented origin island');
 assert.equal(new Set(world.builderScene.objects.map(item=>item.id)).size,world.builderScene.objects.length);
 const manifest=compileBuilderScene(world.builderScene);assert.ok(manifest.actors.filter(item=>item.gameplay.behavior==='vehicle').length>=5);
});

test('all six ports have real accessible dock floors and large boats in clear berths',()=>{
 const world=shippingWorld(),collision=new ServerBuilderCollision(),harbor=world.builderScene.layoutMeta.harbor;
 const spawn=collision.safeSpawn(world,world.spawn);assert.ok(Math.hypot(spawn.x-world.spawn.x,spawn.z-world.spawn.z)<.1);assert.ok(spawn.y>=0);
 assert.equal(SHIPPING_PORTS.length,6);assert.equal(harbor.docks.length,6);
 for(const port of SHIPPING_PORTS){
  const location=world.builderScene.layoutMeta.locations.find(location=>location.id===port.id),floor=collision.groundAt(world,{...location.arrival,y:1});
  assert.ok(floor&&floor.y>=0,port.id+' has a walkable quay');assert.equal(harborWaterAt(world,location.arrival),false);
  for(const vessel of SHIPPING_VESSELS)assert.ok(watercraftFootprint(port.berth,port.berth.yaw,vessel).every(point=>harborWaterAt(world,point,.35)),port.id+' '+vessel.modelId+' fits');
  assert.ok(harborWaterAt(world,port.entry,.35));
 }
 for(const actor of world.builderScene.objects.filter(isWatercraft))assert.ok(watercraftFootprint(actor.position,actor.rotation.y,actor).every(point=>harborWaterAt(world,point,.35)),actor.id);
 assert.deepEqual(harborDestinations(world).map(port=>port.id),SHIPPING_PORTS.map(port=>port.id),'planner routes to the selected cargo port');
});

test('ports connect through recognizable separated shipping lanes and a short induction circuit',()=>{
 assert.equal(SHIPPING_LANES.length,2);assert.equal(SHIPPING_LANES[0].direction,'westbound');assert.equal(SHIPPING_LANES[1].direction,'eastbound');
 const tutorial=SHIPPING_ROUTES[0];assert.equal(tutorial.id,'dock-induction');assert.equal(tutorial.from,tutorial.to);
 const origin=SHIPPING_PORTS.find(port=>port.id===tutorial.from),path=[origin.berth,...tutorial.waypoints];
 let distance=0;for(let index=1;index<path.length;index++)distance+=Math.hypot(path[index].x-path[index-1].x,path[index].z-path[index-1].z);
 assert.ok(distance>=400&&distance<=600,'induction teaches handling in a short, complete basin circuit');
 for(const route of SHIPPING_ROUTES){assert.ok(SHIPPING_PORTS.some(port=>port.id===route.from));assert.ok(SHIPPING_PORTS.some(port=>port.id===route.to));assert.ok(route.waypoints.length>=4);assert.ok(route.rewardMzk>0&&route.rewardMzk<=100);}
});

test('Neon Harbor sea portal and shipping return portal both target hosted shared worlds',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shipping-world-directory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),world=environments.find(map=>map.id===SHIPPING_ID),harbor=environments.find(map=>map.id===SHIPPING_HARBOR_ID);
 assert.ok(world&&harbor);assert.equal(world.roomId,SHIPPING_ID);assert.equal(world.sharedWorld,true);assert.ok(world.portalTargets.includes(harbor.id));
 const outbound=harbor.builderScene.objects.find(item=>item.functionalSettings?.portal?.targetMapId===SHIPPING_ID),inbound=world.builderScene.objects.find(item=>item.functionalSettings?.portal?.targetMapId===harbor.id);
 assert.ok(outbound,'an actual sea-extension arch is reachable from Neon Marina');assert.ok(inbound,'an actual reciprocal arch returns to Neon Harbor');
 const collision=new ServerBuilderCollision();for(const [map,gate]of [[harbor,outbound],[world,inbound]]){const floor=collision.groundAt(map,{...gate.position,y:1});assert.ok(floor&&floor.y>=0,'portal is on an actual dock or shore floor');}
 assert.ok(neonMarina().locations.some(location=>location.id==='hormuz-shipping-portal'));
});

test('every shipping dock and academy location supports actual populated-room travel after durable reload',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shipping-location-travel-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')),directory=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 const world=directory.environments.find(world=>world.id===SHIPPING_ID),file=join(dir,'room.json'),visitor={accountId:'map-visitor',username:'Map visitor',stats:{health:100}};
 let runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>100000}),sequence=0;
 const send=(action,fields={})=>runtime.command(world.id,world,visitor,{action,requestId:'shipping-location-'+ ++sequence,...fields});
 assert.deepEqual(world.streets,[],'the atlas retains the sea world’s authored absence of roads');assert.ok(localMapLocations(world).every(place=>place.kind!=='freight'),'road freight bays are not invented in open water');
 const first=await send('join',{deferRadTox:true,radToxEnabled:false});runtime.collision.clearPlacedWorlds();
 runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>100000});const rejoined=await send('join',{deferRadTox:true,radToxEnabled:false});
 assert.deepEqual(Object.keys(rejoined.actors).sort(),Object.keys(first.actors).sort());
 for(const place of localMapLocations(world)){
  let state;try{state=await send('map-access',{locationId:place.id});}catch(error){error.message=place.id+': '+error.message;throw error;}const point=state.players[state.selfId].position,options={actors:state.actors,objects:state.objects};
  const floor=runtime.collision.groundAt(world,point,options),target=place.arrival||place,reach=Math.max(13,Math.min(128,Math.hypot(Number(place.width)||0,Number(place.depth)||0)/2+2));
  assert.match(state.result.message,/^Arrived at /,place.id);assert.ok(floor&&Math.abs(floor.y-point.y)<.05,place.id+' has real floor support');
  assert.ok(runtime.collision.hasBodyClearance(world,point,.38,options),place.id+' leaves room for the player');
  assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<=reach+.01,place.id+' arrives at its own footprint: '+JSON.stringify(point));
  assert.ok(point.y>=-.05,place.id+' avoids harbor water');
 }
 runtime.collision.clearPlacedWorlds();
});
