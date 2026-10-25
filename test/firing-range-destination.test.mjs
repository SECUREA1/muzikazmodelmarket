import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {worldTravelObjects,portalArrivalPosition} from '../server-world-travel.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {sortWorlds,filterWorlds} from '../public/js/world-map-picker.js';
import {filterAtlasLocations,atlasLocationPosition} from '../public/js/index-atlas-directory.js';
import {worldPreviewData} from '../public/js/world-preview-data.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {replaceServerStreets} from '../public/js/environments/server-streets.js';
import {FIRING_RANGE_LANES,firingRangeLocations,rangeWorldToLocal} from '../public/js/firing-range.js';

const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const canonical=records.find(map=>map.id==='firing-range');

test('the live firing range remains a permanent public destination after directory refresh and restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'permanent-firing-range-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'atlas.json');
 let result=await synchronizeWorldDirectory(new WorldAtlas(file),[]),range=result.environments.find(map=>map.id==='firing-range');
 assert.ok(range);assert.equal(range.builderScene.layout,'firing-range');assert.equal(range.builderScene.mapSize,64);
 assert.ok(range.permanent&&range.publicDestination&&range.sharedWorld&&range.multiplayer);assert.equal(range.visibility,'public');
 assert.equal(range.canDelete,false);assert.equal(range.canEdit,false);assert.equal(range.roomId,'firing-range');
 assert.match(range.playUrl,/mode=multiplayer/);assert.match(range.playUrl,/house=firing-range/);
 const district=result.environments.find(map=>map.id===range.districtId);
 assert.ok(district.builderScene.objects.some(object=>object.atlasDestination===range.id));
 assert.ok(range.travelPortals.some(portal=>portal.mapId===district.id));
 const original=Object.values(result.atlas.cells).find(cell=>cell.mapId===range.id);
 result=await synchronizeWorldDirectory(new WorldAtlas(file),[{id:'firing-range',name:'Private override',visibility:'private',playable:false,roomId:'different-room'}]);
 range=result.environments.find(map=>map.id==='firing-range');const restored=Object.values(result.atlas.cells).find(cell=>cell.mapId===range.id);
 assert.equal(range.name,canonical.name);assert.equal(range.roomId,'firing-range');assert.ok(restored.permanent);
 assert.deepEqual([restored.column,restored.row],[original.column,original.row]);
});

test('the firing range is listed and searchable in map selectors and website locations without active players',()=>{
 const place={...canonical,mapId:canonical.id,column:1,row:0};
 const worlds=[{env:{id:'empty-world',name:'Quiet map'},count:0},{env:place,count:0},{env:{id:'busy-world'},count:2}];
 assert.deepEqual(sortWorlds(worlds).map(item=>item.env.id),['firing-range','busy-world','empty-world']);
 assert.equal(filterWorlds(worlds,'firing range')[0].env.id,place.id);
 assert.equal(filterAtlasLocations([place],'firing range')[0].mapId,place.id);
 assert.equal(atlasLocationPosition(place).mapId,place.id);
 const preview=worldPreviewData(place);assert.ok(preview.firingRange&&preview.procedural);assert.equal(preview.basketball,false);
 assert.equal(preview.image,'/public/images/backpack/firing-range.svg');
 assert.equal(worldPreviewData({mapId:'firing-range',name:place.name}).firingRange,true);
 assert.equal(worldPreviewData({id:'placed-range',builderScene:{layout:'grand-floor',objects:[{modelId:'scene-firing-range'}]}}).firingRange,false);
});

test('range travel portals and incoming players arrive behind the firing line, outside active target lanes',()=>{
 const environment={...canonical,travelPortals:[{mapId:'public-commons',name:'Public Commons'},{mapId:'world-district-sports',name:'Sports District'}]};
 const collision=new ServerBuilderCollision(),portals=worldTravelObjects(environment,collision);assert.equal(portals.length,2);
 for(const portal of portals){assert.ok(portal.position.z>=14);assert.ok(Math.abs(portal.position.x)>=10);assert.equal(portal.functionalSettings.portal.enabled,true);}
 assert.ok(Math.hypot(portals[0].position.x-portals[1].position.x,portals[0].position.z-portals[1].position.z)>2.2);
 const arrival=portalArrivalPosition(environment,compileBuilderScene({objects:portals}),'public-commons',collision,{},{});
 assert.ok(arrival.z>=14);assert.ok(Math.abs(arrival.x)<18.5);
});

test('full firing range maps keep atlas road overlays off the firing lanes while other map streets remain available',()=>{
 const streets=[{id:'atlas-road',name:'District Avenue',from:{x:-20,z:0},to:{x:20,z:0},width:5}],range=createBuilderLand({...canonical,streets});
 assert.equal(range.getObjectByName('SERVER_STREETS'),undefined);
 replaceServerStreets(range,streets);assert.equal(range.getObjectByName('SERVER_STREETS'),undefined);
 const surrounding=createBuilderLand({id:'park-with-range',builderScene:{layout:'grand-floor',mapSize:80,objects:[{modelId:'scene-firing-range'}]},streets});
 assert.ok(surrounding.getObjectByName('SERVER_STREETS').children.length>0);
 replaceServerStreets(surrounding,streets);assert.ok(surrounding.getObjectByName('SERVER_STREETS').children.length>0);
});

test('range portal safety follows a translated, rotated and scaled dedicated range',()=>{
 const environment={...canonical,id:'moved-range',builderScene:{...canonical.builderScene,baseTransform:{x:60,y:1,z:-40,rotation:90,scale:.75}},travelPortals:[{mapId:'public-commons',name:'Public Commons'}]};
 const collision={safeSpawn:(_environment,point)=>point,meetingPosition:(_environment,point)=>point,blocksShot:()=>false};
 const location=firingRangeLocations(environment).find(item=>item.id==='main'),portal=worldTravelObjects(environment,collision)[0];
 const local=rangeWorldToLocal(location,portal.position);assert.ok(Math.abs(local.x-17)<1e-6);assert.ok(Math.abs(local.z-17.2)<1e-6);
 const arrival=rangeWorldToLocal(location,portalArrivalPosition(environment,{objects:[]},'public-commons',collision,{},{}));
 assert.ok(Math.abs(arrival.z-16.2)<1e-6);assert.ok(Math.abs(arrival.x)<1e-6);
});


test('range exits cannot activate from a shooting bay and remain usable from the lobby',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'range-exit-distance-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const environment={...canonical,travelPortals:[{mapId:'public-commons',name:'Public Commons'},{mapId:'world-district-sports',name:'Sports District'}]};
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000}),identity={accountId:'alice',username:'Alice'};
 let request=0;const send=extra=>runtime.command(environment.id,environment,identity,{requestId:'range-exit-'+ ++request,...extra});
 const state=await send({action:'join'}),gateways=Object.values(state.actors).filter(actor=>actor.worldGateway);
 assert.equal(gateways.length,2);
 for(const portal of worldTravelObjects(environment,new ServerBuilderCollision()))assert.equal(portal.functionalSettings.interactionDistance,2.5);
 await store.update(environment.id,room=>{room.simulation.players['account:alice'].position={...FIRING_RANGE_LANES[0].position};});
 for(const gateway of gateways)await assert.rejects(send({action:'interact',entityId:gateway.id}),{statusCode:409});
 assert.equal((await store.get(environment.id)).simulation.players['account:alice'].pendingTravel,undefined);
 const gateway=gateways.find(portal=>portal.position.x<0);await store.update(environment.id,room=>{room.simulation.players['account:alice'].position={...gateway.position,z:gateway.position.z-1.9};});
 assert.equal((await send({action:'interact',entityId:gateway.id})).result.destination,gateway.worldGateway.destination);
 const ordinary={id:'ordinary-map',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:64,objects:[]},travelPortals:environment.travelPortals};
 for(const portal of worldTravelObjects(ordinary,new ServerBuilderCollision()))assert.equal(portal.functionalSettings.interactionDistance,5);
});
