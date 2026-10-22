import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {neonMarina,NEON_MARINA_VERSION} from '../neon-marina.mjs';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import {planBoatNavigation} from '../public/js/boat-navigation.js';
import {boatMovementBlocked} from '../server-boat-assist.mjs';

const marina=neonMarina(),world={id:'expanded-docks',updatedAt:'expansion-2',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:1536,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
test('freshwater lakes have real swim floors, solid shores, accessible piers and safe arrivals',()=>{
 const collision=new ServerBuilderCollision();
 assert.equal(marina.harbor.extent,768);assert.equal(marina.harbor.lakes.length,2);
 for(const lake of marina.harbor.lakes){
  assert.equal(harborWaterAt(world,lake),true);
  assert.ok(Math.abs(collision.groundAt(world,{...lake,y:1}).y+.65)<.03,'lake has no invisible land floor');
  const shore={x:lake.x-lake.width/2-6,z:lake.z,y:1};
  assert.equal(harborWaterAt(world,shore),false);assert.ok(Math.abs(collision.groundAt(world,shore).y)<.03);
  const boat=marina.objects.find(object=>object.id.endsWith(lake.id+'-boat'));
  assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(point=>harborWaterAt(world,point,.35)));
  const destinations=harborDestinations(world,boat);assert.equal(destinations.length,2);
  for(const destination of destinations){const route=planBoatNavigation(boat,world,{destinationId:destination.id});assert.ok(route,'local lake route exists');for(const point of route.points)assert.ok(harborWaterAt(world,point,.35));}
  const arrival=marina.locations.find(place=>place.id===lake.id).arrival;
  assert.ok(collision.hasBodyClearance(world,arrival,.3));
 }
 for(const island of marina.harbor.islands.slice(3)){
  const shore={x:island.x-island.width/2+8,y:1,z:island.z+12};
  assert.equal(harborWaterAt(world,shore),false);assert.ok(Math.abs(collision.groundAt(world,shore).y)<.03);
  assert.ok(Math.abs(island.x)+island.width/2<marina.harbor.extent);
 }
});

test('all outer docks have routes clear of actual land, piers and moored boats',()=>{
 const collision=new ServerBuilderCollision(),actors=Object.fromEntries(marina.objects.filter(object=>object.placementAnchor==='waterline').map(object=>[object.id,{...object,active:true}]));
 for(const modelId of ['harbor-skiff','harbor-yacht']){
  const boat={id:'route-probe',modelId,active:true,position:{x:184,y:0,z:80},rotation:{y:0}};
  const blocked=boatMovementBlocked(world,boat,actors,collision,{});
  for(const dock of marina.harbor.docks.slice(2))assert.ok(planBoatNavigation(boat,world,{destinationId:dock.id,actors,blocked}),modelId+' reaches '+dock.name);
 }
});

test('saved Neon Docks upgrades once without changing other districts or custom objects',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'docks-expansion-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'atlas.json'),atlas=new WorldAtlas(file),initial=await atlas.synchronize();
 const cell=Object.values(initial.cells).find(cell=>cell.mapId==='world-district-neon-docks');
 assert.ok(cell);assert.equal(cell.environment.builderScene.mapSize,1536);
 const data=JSON.parse(await readFile(file,'utf8')),saved=Object.values(data.cells).find(value=>value.mapId===cell.mapId),other=data.cells['0,0'].environment;
 saved.environment.builderScene.layoutMeta.harbor.version=1;
 saved.environment.builderScene.layoutMeta.harbor.extent=512;
 saved.environment.builderScene.mapSize=256;
 saved.environment.builderScene.objects.push({id:'owner-keeps-this',modelId:'lamp-post',position:{x:4,y:0,z:4}});
 await writeFile(file,JSON.stringify(data));
 const updated=await new WorldAtlas(file).synchronize(),next=Object.values(updated.cells).find(value=>value.mapId===cell.mapId);
 assert.equal(next.environment.builderScene.layoutMeta.harbor.version,NEON_MARINA_VERSION);
 assert.equal(next.environment.builderScene.mapSize,1536);
 assert.ok(next.environment.builderScene.objects.some(object=>object.id==='owner-keeps-this'));
 assert.deepEqual(updated.cells['0,0'].environment,other);
 assert.equal((await new WorldAtlas(file).synchronize()).revision,updated.revision,'no repeated world rebuild');
});
