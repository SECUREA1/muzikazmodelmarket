import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {buildWorldConnectivity,planWorldJourney} from '../world-connectivity.mjs';
import {WORLD_DISTRICTS} from '../world-districts.mjs';

test('regional graph includes every public room and deed with a directed gateway journey',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'regional-world-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),maps=Array.from({length:50},(_,index)=>({id:'connected-'+index,name:'Connected destination '+index,worldId:'volt-city',ownerName:'Alex',visibility:'public',source:'custom-builder',builderScene:{layout:'grand-floor',mapSize:40,objects:[]}}));
 maps.push({id:'private-room',name:'Private room',visibility:'private'});
 const deeds=[{id:'regional-deed',name:'Regional deed',ownerId:'private-wallet',ownerName:'Alex',worldId:'echo-gardens',hostedSpace:{environmentId:maps[0].id}}];
 const result=await synchronizeWorldDirectory(atlas,maps,deeds),{connectivity,environments}=result;
 assert.equal(connectivity.version,1);assert.equal(connectivity.revision,result.atlas.revision);assert.equal(connectivity.regions.length,WORLD_DISTRICTS.length);assert.equal(connectivity.locations.length,environments.length);
 assert.ok(!connectivity.locations.some(place=>place.mapId==='private-room'));assert.ok(!JSON.stringify(connectivity).includes('private-wallet'));
 for(const region of connectivity.regions){assert.ok(region.hubMapId);assert.ok(region.description);assert.ok(region.locationIds.includes(region.hubMapId));}
 for(const place of connectivity.locations){const journey=planWorldJourney(connectivity,{fromMapId:'public-commons',stops:[place.mapId]});assert.equal(journey.reachable,true,place.mapId);assert.ok(journey.steps.every(step=>step.mode==='map-transfer'));assert.equal(environments.find(map=>map.id===place.mapId).regionId,place.regionId);}
 assert.ok(connectivity.locations.some(place=>place.mapId==='world-district-volt-city-3'));
 const stops=['connected-0','plot-regional-deed','muzikaz-airport','hormuz-shipping'],journey=planWorldJourney(connectivity,{fromMapId:'public-commons',stops,mode:'plane'});
 assert.equal(journey.reachable,true);assert.deepEqual(journey.stops,stops);assert.equal(journey.legs.length,4);assert.equal(journey.legs.at(-1).toMapId,'hormuz-shipping');assert.equal(journey.preferredMode,'plane');assert.ok(journey.steps.every(step=>step.mode==='map-transfer'),'room gateways never pretend that a physical flight completed');
 const same=await synchronizeWorldDirectory(atlas,maps,deeds);assert.deepEqual(same.connectivity,connectivity,'unchanged catalogue and ids remain stable');
 deeds[0].ownerName='Sam';const transferred=await synchronizeWorldDirectory(atlas,maps,deeds);assert.equal(transferred.connectivity.locations.find(place=>place.mapId==='plot-regional-deed').ownerName,'Sam');
});

test('Strait geography exposes only authored shore roads and approved sea and air paths',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'regional-strait-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {connectivity}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),strait=connectivity.locations.find(place=>place.mapId==='hormuz-shipping');
 assert.deepEqual(strait.modes,['foot','road','boat','plane']);
 assert.equal(strait.localPlaces.filter(place=>place.kind==='port').length,6);assert.equal(strait.localPlaces.filter(place=>place.kind==='airfield').length,5);
 assert.ok(!strait.localPlaces.some(place=>place.portId==='qeshm'&&place.modes.includes('plane')));
 const flights=connectivity.localLinks.filter(link=>link.mode==='plane');assert.equal(flights.length,5);assert.ok(flights.every(link=>link.mapId==='hormuz-shipping'&&!link.fromLocationId.includes('qeshm')&&!link.toLocationId.includes('qeshm')));
 for(const road of connectivity.localLinks.filter(link=>link.mode==='road'&&link.mapId==='hormuz-shipping')){const from=road.fromLocationId.split(':').at(-1);if(road.id.startsWith('dock-road:'))assert.equal(road.toLocationId,'bay:'+from);assert.ok(road.waypoints.length>=2);}
 assert.ok(connectivity.localLinks.some(link=>link.mode==='boat'&&link.toLocationId==='port:qeshm'));assert.ok(connectivity.links.some(link=>link.from==='hormuz-shipping'&&link.to==='muzikaz-airport'&&link.mode==='map-transfer'));
});

test('planner does not skip unavailable rooms or fabricate gateway paths',()=>{
 const connectivity={locations:[{mapId:'a'},{mapId:'b'},{mapId:'c'}],links:[{id:'a-b',from:'a',to:'b',mode:'map-transfer'},{id:'fake-flight',from:'b',to:'c',mode:'plane'}]};
 assert.equal(planWorldJourney(connectivity,{fromMapId:'a',stops:['b']}).reachable,true);
 const missing=planWorldJourney(connectivity,{fromMapId:'a',stops:['missing','b']});assert.equal(missing.reachable,false);assert.deepEqual(missing.unreachable,['missing','b']);assert.deepEqual(missing.steps,[]);
 assert.equal(planWorldJourney(connectivity,{fromMapId:'b',stops:['a']}).reachable,false,'gateway direction is authoritative');assert.equal(planWorldJourney(connectivity,{fromMapId:'a',stops:['c']}).reachable,false,'local flight is not a room connection');
 assert.equal(planWorldJourney(connectivity,{fromMapId:'secret',stops:['a']}).reachable,false);
 assert.equal(planWorldJourney(connectivity,{fromMapId:'a',stops:['a']}).steps.length,0);
});

test('published local transport places preserve real ground metadata without account fields',()=>{
 const graph=buildWorldConnectivity([{id:'dispatch',name:'Dispatch',ownerId:'never-publish-wallet',visibility:'public',portalTargets:[],builderScene:{layoutMeta:{locations:[{id:'regional-dispatch',name:'Regional dispatch',kind:'transport',modes:['foot','road','map-transfer','teleport-flight'],x:10,z:-44},{id:'hidden',name:'Hidden',visibility:'private',x:0,z:0}]}}}]);
 const places=graph.locations[0].localPlaces;assert.equal(places.length,1);assert.equal(places[0].kind,'transport');assert.deepEqual(places[0].modes,['foot','road','map-transfer']);assert.ok(!JSON.stringify(graph).includes('never-publish-wallet'));
});

test('every local transport link resolves within its own map including sparse airport metadata',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'regional-link-endpoints-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {connectivity}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),byId=new Map(connectivity.locations.map(place=>[place.mapId,new Map(place.localPlaces.map(local=>[local.id,local]))]));
 for(const link of connectivity.localLinks){const places=byId.get(link.mapId);assert.ok(places,link.id+' has a live map');assert.ok(places.has(link.fromLocationId),link.id+' has a source');assert.ok(places.has(link.toLocationId),link.id+' has a destination');}
 const airportRoad=connectivity.localLinks.find(link=>link.id==='international-airport-cargo-road'),airportPlaces=byId.get('muzikaz-airport');
 assert.deepEqual(airportRoad.waypoints.at(-1),airportPlaces.get(airportRoad.toLocationId).position,'road ends at the actual truck bay rather than unrelated aircraft stands');assert.ok(airportPlaces.has('airport-cargo-apron'));
 const regional=connectivity.localLinks.filter(link=>link.id.startsWith('regional-courier:'));assert.equal(regional.length,8);assert.ok(regional.every(link=>link.mode==='road'&&link.bidirectional));
 const sparse=buildWorldConnectivity([{id:'muzikaz-airport',name:'Airport',airport:{enabled:true},portalTargets:[]}]);for(const link of sparse.localLinks){const ids=new Set(sparse.locations[0].localPlaces.map(place=>place.id));assert.ok(ids.has(link.fromLocationId));assert.ok(ids.has(link.toLocationId));}
});
