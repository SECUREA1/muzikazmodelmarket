import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina,NEON_MARINA_VERSION} from '../neon-marina.mjs';
import {FISHING_GEAR,FISHING_GUIDES,FISH_SPECIES,fishingZones,fishingZoneAt,isFishingBoat,fishingStationPosition} from '../public/js/fishing-config.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftSize} from '../public/js/harbor-water.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import {harborApproach,planBoatNavigation} from '../public/js/boat-navigation.js';
import {boatMovementBlocked} from '../server-boat-assist.mjs';
import {localMapTags} from '../public/js/local-map-tags.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const marina=neonMarina(),world={id:'fishing-world',source:'repository',proceduralLand:true,builderScene:{layout:'community-park',mapSize:1536,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
test('fishing launches fit real saltwater and freshwater berths with two valid side casts',()=>{
 assert.equal(marina.harbor.version,NEON_MARINA_VERSION);
 const boats=marina.objects.filter(isFishingBoat);assert.equal(boats.length,3);
 for(const boat of boats){
  assert.ok(isWatercraft(boat));assert.deepEqual(watercraftSize(boat),[1.35,3.15]);
  assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(point=>harborWaterAt(world,point,.25)));
  for(const side of ['port','starboard']){
   const station=fishingStationPosition(boat,side),yaw=boat.rotation.y,sign=side==='port'?-1:1;
   const cast={x:station.x+Math.cos(yaw)*sign*5,z:station.z-Math.sin(yaw)*sign*5};
   assert.ok(harborWaterAt(world,cast),boat.name+' '+side+' casts into water');
   assert.ok(fishingZoneAt(world,cast),boat.name+' '+side+' is in a configured fishing zone');
  }
 }
 const collision=new ServerBuilderCollision();
 for(const guide of FISHING_GUIDES){assert.equal(harborWaterAt(world,guide.position),false);const approach=collision.groundAt(world,{...guide.position,x:guide.position.x+1.5,y:1});assert.ok(approach&&approach.y>=0,guide.name+' has a solid nearby approach');}
});
test('boat rods have reels, guides and live tip references that survive runtime cloning',()=>{
 const boat=createBuilderModel('harbor-fishing-boat');assert.ok(boat.getObjectByName('INSULATED_CATCH_LIVEWELL'));assert.ok(boat.getObjectByName('ONBOARD_TACKLE_LOCKER'));
 for(const rod of boat.userData.fishingRig.rods){assert.ok(rod.getObjectByName('SPINNING_REEL_SPOOL'));assert.ok(rod.getObjectByName('REEL_BAIL'));assert.ok(rod.getObjectByName('ROD_LINE_GUIDE'));assert.ok(rod.getObjectByName('THREADED_FISHING_LINE'));}
 const copy=cloneBuilderRuntime(boat),nodes=new Set();copy.traverse(node=>nodes.add(node));
 for(const node of [...copy.userData.fishingRig.rods,...copy.userData.fishingRig.tips])assert.ok(nodes.has(node));
 assert.notEqual(copy.userData.fishingRig.rods[0],boat.userData.fishingRig.rods[0]);
 assert.equal(copy.userData.boatRig.fishingRig.rods[0],copy.userData.fishingRig.rods[0]);
 for(const gear of FISHING_GEAR)assert.ok(createBuilderModel(gear.id),gear.id+' is a real placeable 3D model');
});
test('fishing maps, routes and native markets share canonical boat and tackle identities',()=>{
 assert.deepEqual(fishingZones({}),[]);assert.equal(fishingZoneAt(world,{x:NaN,z:0}),null);
 const tags=localMapTags(world),boat=marina.objects.find(isFishingBoat),destinations=harborDestinations(world,boat);
 for(const zone of fishingZones(world)){
  const tag=tags.find(tag=>tag.locationId===zone.id);assert.equal(tag.kind,'fishing');assert.ok(harborWaterAt(world,zone));
  assert.ok(FISH_SPECIES.some(species=>species.water===zone.water));
  if(zone.water==='salt'){assert.ok(destinations.some(destination=>destination.id===zone.id));assert.ok(harborApproach(world,zone.id,boat));}
 }
 assert.ok(tags.some(tag=>tag.entityId===boat.id));
 const actors=Object.fromEntries(marina.objects.filter(isWatercraft).map(craft=>[craft.id,craft]));
 assert.ok(planBoatNavigation(boat,world,{destinationId:'open-water',actors,blocked:boatMovementBlocked(world,boat,actors,new ServerBuilderCollision())}),'new berth has a clear launch passage around authored piers and vessels');
 const catalog=nativeMarketCatalog(GAME_ECONOMY,[world]),parts=catalog.maps[0].components;
 assert.equal(parts.find(part=>part.buildAssetId==='harbor-fishing-boat').count,3);
 assert.ok(GAME_ECONOMY.find(item=>item.buildAssetId==='harbor-fishing-boat').function_data.behavior==='vehicle');
});
