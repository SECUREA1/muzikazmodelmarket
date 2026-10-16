import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WORLD_DISTRICTS} from '../world-districts.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {atlasPortalRoute,atlasBuildingPath} from '../public/js/atlas-building-art.js';

test('all listed repository, uploaded and saved maps have durable reachable district buildings beyond 128 destinations',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'complete-world-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json'));
 const maps=Array.from({length:145},(_,i)=>({id:'map-'+String(i).padStart(3,'0'),name:'Saved world '+i,source:i%3===0?'repository':i%3===1?'upload':'custom-builder',ownerId:'account:alice',ownerName:'Alice',worldId:'volt-city',visibility:'public',multiplayer:false,builderScene:{layout:'grand-floor',mapSize:40,objects:[]}}));
 maps.push({id:'secret',name:'Secret',visibility:'private',builderScene:{objects:[]}});
 const deeds=[{id:'deed-volt-city',name:'Alice estate',ownerId:'account:alice',ownerName:'Alice',worldId:'volt-city',hostedSpace:{environmentId:maps[0].id,name:'Alice private game room'}}];
 let result=await synchronizeWorldDirectory(atlas,maps,deeds);const indexed=new Map(result.environments.map(map=>[map.id,map]));
 assert.equal(indexed.has('secret'),false);
 for(const region of WORLD_DISTRICTS)assert.ok(indexed.has('world-district-'+region.id));
 assert.ok(indexed.has('world-district-volt-city-5'),'districts paginate rather than dropping locations');
 const reachable=new Set(),visit=id=>{if(reachable.has(id))return;reachable.add(id);for(const target of indexed.get(id)?.portalTargets||[])visit(target);};visit('public-commons');
 for(const map of maps.filter(map=>map.visibility==='public')){
  assert.ok(reachable.has(map.id),map.id+' is connected');assert.equal(indexed.get(map.id).multiplayer,true);assert.equal(indexed.get(map.id).sharedWorld,true);assert.equal(indexed.get(map.id).roomId,map.id);assert.equal(indexed.get(map.id).travelPortals.length,2);assert.match(indexed.get(map.id).playUrl,/mode=multiplayer/);
  const district=indexed.get(indexed.get(map.id).districtId),building=district.builderScene.objects.find(object=>object.atlasDestination===map.id);
  assert.ok(building,map.id+' has a physical building');assert.equal(building.functionalSettings.portal.targetMapId,map.id);
 }
 for(const region of WORLD_DISTRICTS){const hub=indexed.get('world-district-'+region.id);for(const other of WORLD_DISTRICTS)if(other.id!==region.id)assert.ok(hub.portalTargets.includes('world-district-'+other.id));}
 const plot=indexed.get('plot-deed-volt-city');assert.ok(reachable.has(plot.id));assert.equal(plot.baseEnvironmentId,maps[0].id);assert.deepEqual(atlasPortalRoute({...plot,mapId:plot.id}),['public-commons',plot.districtId,plot.id]);
 for(const district of result.environments.filter(map=>map.atlasDistrict))assert.ok(district.builderScene.objects.filter(object=>object.atlasDestination).length<=35,'bounded district geometry');
 const revision=result.atlas.revision;result=await synchronizeWorldDirectory(atlas,maps,deeds);assert.equal(result.atlas.revision,revision,'unchanged registry stays stable');
 const reloaded=await new WorldAtlas(atlas.file).read();assert.equal(Object.keys(reloaded.cells).length,Object.keys(result.atlas.cells).length);
 const fixed=result.environments.find(map=>map.id==='map-100'),fixedBuilding=result.environments.find(map=>map.id===fixed.districtId).builderScene.objects.find(object=>object.atlasDestination===fixed.id);
 const expanded=await synchronizeWorldDirectory(atlas,[...maps,{...maps[0],id:'aaa-new-location',name:'New location'}],deeds),same=expanded.environments.find(map=>map.id===fixed.id);
 assert.equal(same.districtId,fixed.districtId,'new publications do not move existing maps between districts');assert.deepEqual(expanded.environments.find(map=>map.id===same.districtId).builderScene.objects.find(object=>object.atlasDestination===same.id).position,fixedBuilding.position,'existing building portals retain their frontage');
 const removed=maps[20].id;result=await synchronizeWorldDirectory(atlas,maps.filter(map=>map.id!==removed),deeds);
 assert.ok(!result.environments.some(map=>map.id===removed));assert.ok(!result.environments.some(map=>map.builderScene?.objects.some(object=>object.atlasDestination===removed)),'deleted maps leave no broken doors');
 deeds[0].ownerId='account:bob';deeds[0].ownerName='Bob';result=await synchronizeWorldDirectory(atlas,maps,deeds);const estate=result.environments.find(map=>map.id===plot.id);assert.equal(estate.ownerName,'Bob');assert.equal(estate.id,plot.id,'deed room survives transfers');
});

test('deed visits include persisted placement transforms and gameplay without replacing their GLB interior',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'world-deed-scenes-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json'));await db.put('alice',{tokens:{MZK:5000},memory:{profile:{displayName:'Alice'}}});
 const deed=await db.claimLand({walletId:'alice',worldId:'echo-gardens',name:'Garden',priceMzk:4000,requestId:'buy-garden'});
 const {asset}=await db.createBuilderAsset('alice',{name:'Saved home',asset_type:'building',builder_category:'BUILDINGS',glb_url:'/uploads/home.glb',function_data:{behavior:'decor'}});
 const placement=await db.placeBuilderAsset('alice',{worldId:'echo-gardens',assetId:asset.id,transform:{position:[4,0,7],rotation:[0,.5,0],scale:[2,2,2]},functional_settings:{behavior:'door',interactionDistance:3}});
 const atlas=new WorldAtlas(join(dir,'atlas.json')),base={id:'muzikaz-main',name:'Main',source:'repository',visibility:'public',modelUrl:'/main.glb'};
 let world=await synchronizeWorldDirectory(atlas,[base],await db.memberPlots());let plot=world.environments.find(map=>map.deedId===deed.id);
 assert.equal(plot.modelUrl,'/main.glb');assert.equal(plot.builderScene,undefined,'saved GLB stays the actual loaded world');
 const object=plot.placementScene.objects.find(object=>object.id===placement.placement_id);assert.deepEqual(object.position,{x:4,y:0,z:7});assert.equal(object.functionalSettings.behavior,'door');assert.equal(object.asset.modelUrl,'/uploads/home.glb');
 await db.updateBuilderPlacement('alice',placement.placement_id,{},true);world=await synchronizeWorldDirectory(atlas,[base],await db.memberPlots());plot=world.environments.find(map=>map.deedId===deed.id);assert.equal(plot.placementScene,undefined,'removed buildings disappear from the saved location');
 assert.notEqual(atlasBuildingPath('deed'),atlasBuildingPath('district'));
});


test('district portals enter the exact deed room and persist the member position on return',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'district-travel-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),base={id:'saved-template',name:'Saved game layout',source:'custom-builder',visibility:'public',builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'my-building',modelId:'timber-cabin',position:{x:10,y:0,z:10},functionalSettings:{behavior:'decor'}}]}};
 const {environments}=await synchronizeWorldDirectory(atlas,[base],[{id:'deed-travel',name:'My deed',worldId:'echo-gardens',ownerId:'alice',hostedSpace:{environmentId:base.id}}]);
 const byId=new Map(environments.map(map=>[map.id,map])),plot=byId.get('plot-deed-travel'),district=byId.get(plot.districtId),commons=byId.get('public-commons');
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000}),identity={accountId:'alice',walletId:'alice',username:'Alice'};let request=0;
 const send=(map,action)=>runtime.command(map.id,map,identity,{action,requestId:'travel-'+ ++request});
 for(const [from,to]of [[commons,district],[district,plot]]){
  await send(from,'join');const gateway=from.builderScene.objects.find(object=>object.atlasDestination===to.id);assert.ok(gateway);
  await store.update(from.id,room=>{room.simulation.players['account:alice'].position={x:gateway.position.x,y:0,z:gateway.position.z-4.5};});
  const result=await send(from,'interact');assert.equal(result.result.destination,to.id);
 }
 const arrival=await send(plot,'join');assert.ok(arrival.actors['my-building']);assert.notEqual(plot.id,base.id);
 const position={x:3,y:0,z:6};await store.update(plot.id,room=>{room.simulation.players['account:alice'].position=position;});await send(commons,'join');
 const rejoined=await send(plot,'join');assert.deepEqual(rejoined.players['account:alice'].position,position);
 const restarted=new SharedRoomStore(store.file);assert.deepEqual((await restarted.get(plot.id)).simulation.players['account:alice'].position,position);
});
