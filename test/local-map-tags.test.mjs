import test from 'node:test';
import assert from 'node:assert/strict';
import {localMapTags} from '../public/js/local-map-tags.js';
import {airportWorld} from '../airport-world.mjs';
import {neonMarina} from '../neon-marina.mjs';
test('all runways, docks and portals retain their authored coordinates and identities',()=>{
 const airport=airportWorld(),tags=localMapTags(airport);
 for(const runway of airport.airport.runways){const tag=tags.find(tag=>tag.locationId===runway.id);assert.equal(tag.kind,'runway');assert.equal(tag.x,runway.x);assert.equal(tag.z,runway.z);assert.ok(tag.icon);}
 const marina=neonMarina(),environment={id:'docks',spawn:{x:5,y:0,z:6},builderScene:{objects:[...marina.objects,{id:'portal',name:'Owner plot',atlasDestination:'plot-123',atlasDeedId:'deed-1',position:{x:23,y:1,z:45}}],layoutMeta:{locations:marina.locations,harbor:marina.harbor}}},dockTags=localMapTags(environment);
 for(const dock of marina.harbor.docks){const tag=dockTags.find(tag=>tag.locationId===dock.id);assert.equal(tag.x,dock.x);assert.equal(tag.z,dock.z);assert.equal(tag.kind,'dock');}
 assert.equal(dockTags.find(tag=>tag.id==='portal:portal').mapId,'plot-123');assert.equal(dockTags.find(tag=>tag.id==='portal:portal').kind,'deed');
 assert.deepEqual(dockTags.find(tag=>tag.id==='arrival').arrival,true);
});
test('mountain campground, lodge and walking lookout have distinct local map markers',()=>{
 const tags=localMapTags(airportWorld());
 for(const [id,kind]of [['mountain-runway','runway'],['alpine-camp','camp'],['alpine-lodge','lodge'],['alpine-lookout','trail'],['alpine-rest-cabin','lodge'],['alpine-ranger','landmark']]){const tag=tags.find(row=>row.locationId===id);assert.ok(tag,id);assert.equal(tag.kind,kind);assert.ok(tag.description);assert.ok(tag.icon);}
});
test('moving vehicles and players use live positions and suppress stale authored and inactive craft',()=>{
 const world=airportWorld(),craft=world.builderScene.objects.find(o=>o.modelId==='corsair-aircraft'),live={actors:{[craft.id]:{...craft,position:{x:90,y:25,z:-70},holderId:'pilot'}},players:{pilot:{username:'Pilot',position:{x:90,y:25,z:-70}},friend:{username:'Friend',position:{x:1,y:0,z:2}}}};
 const tags=localMapTags(world,live,'pilot'),plane=tags.filter(tag=>tag.entityId===craft.id);assert.equal(plane.length,1);assert.equal(plane[0].x,90);assert.equal(plane[0].y,25);assert.equal(plane[0].occupied,true);assert.equal(tags.find(tag=>tag.id==='player:pilot').kind,'self');
 live.actors[craft.id].active=false;assert.equal(localMapTags(world,live).filter(tag=>tag.entityId===craft.id).length,0);
});
test('local maps open before the first room snapshot and in solo play',()=>{
 const environment={id:'startup-map',spawn:{x:3,y:0,z:4},builderScene:{objects:[{id:'startup-car',modelId:'grand-tourer',position:{x:10,y:0,z:10}}]}};
 const tags=localMapTags(environment,null);assert.ok(tags.some(tag=>tag.id==='arrival'&&tag.x===3&&tag.z===4));assert.ok(tags.some(tag=>tag.entityId==='startup-car'));
});
