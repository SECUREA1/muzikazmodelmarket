import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldAtlas,attachAtlas} from '../world-atlas.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {createServerStreets} from '../public/js/environments/server-streets.js';
test('public destinations, generated roads and coordinate meeting IDs are durable and unique',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'world-atlas-'));const owner={accountId:'alice',username:'Alice'},guest={accountId:'bob',username:'Bob'};
 try{const atlas=new WorldAtlas(join(dir,'atlas.json'));const initial=await atlas.synchronize();const commons=initial.cells['0,0'];assert.equal(commons.mapId,'public-commons');assert.equal(commons.size,256);assert.equal(new Set(commons.streets.map(street=>street.name)).size,commons.streets.length);
 const [first,second]=await Promise.all([atlas.resolve(1000,1000,owner),atlas.resolve(1000,1000,guest)]);assert.equal(first.cell.mapId,second.cell.mapId);assert.equal(first.meeting.id,second.meeting.id);assert.equal([first,second].filter(result=>result.created).length,1);assert.equal(first.cell.ownerName,'Alice');
 const reloaded=new WorldAtlas(atlas.file),data=await reloaded.read();assert.equal(Object.values(data.cells).length,Object.keys(initial.cells).length+1);assert.deepEqual(data.cells['4,4'].streets,first.cell.streets);
 const added=await reloaded.addStreet('public-commons',{from:{x:-16,z:12},to:{x:16,z:12},width:4},guest);assert.ok(added.street.name);assert.equal(added.street.createdBy,'Bob');
 const map={id:'alice-map',name:'Alice town',ownerId:'account:alice',ownerName:'Alice',visibility:'public',updatedAt:'2026-01-01',builderScene:{mapSize:40,layout:'grand-floor',objects:[]}};let updated=await reloaded.synchronize([map]);const cell=Object.values(updated.cells).find(cell=>cell.mapId===map.id);assert.ok(cell);assert.notDeepEqual([cell.column,cell.row],[0,0]);
 await assert.rejects(reloaded.addStreet(map.id,{from:{x:-10,z:8},to:{x:10,z:8}},guest),{statusCode:403});
 await assert.rejects(reloaded.resolve(Infinity,0,owner),{statusCode:400});await assert.rejects(reloaded.addStreet(map.id,{from:{x:-30,z:0},to:{x:10,z:8}},owner),{statusCode:400});
 await reloaded.addStreet(map.id,{from:{x:-10,z:8},to:{x:10,z:8}},owner);updated=await reloaded.read();const environment=attachAtlas(map,updated);assert.equal(environment.streets.length,1);assert.equal(environment.contentUpdatedAt,map.updatedAt);
 const stableRevision=(await reloaded.synchronize([map])).revision;assert.equal((await reloaded.synchronize([map])).revision,stableRevision,'unchanged maps do not create artificial updates');assert.equal(attachAtlas(environment,await reloaded.read()).contentUpdatedAt,map.updatedAt);
 const point=await reloaded.resolve(6,8,owner);const joinedMap=attachAtlas(commons.environment,await reloaded.read());const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),capacity:1});
 const one=await runtime.command('public-commons',joinedMap,{...owner,walletId:'a',stats:{health:100}},{action:'join',requestId:'join-alice',meetingId:point.meeting.id});const two=await runtime.command('public-commons',joinedMap,{...guest,walletId:'b',stats:{health:100}},{action:'join',requestId:'join-bob',meetingId:point.meeting.id});assert.deepEqual(one.players['account:alice'].position,two.players['account:bob'].position);assert.equal(Object.keys(two.players).length,2);assert.equal(two.streets.length,7);
 await assert.rejects(runtime.command('public-commons',joinedMap,{...guest,walletId:'b'},{action:'join',requestId:'bad-point',meetingId:'invented'}),{statusCode:404});
 await runtime.store.mutate('public-commons','account:alice',{id:'meeting-obstacle',revision:0,object:{materialId:'wood',position:[6,.2,8],rotation:[0,0,0],scale:[1,1,1],paint:[]}});const relocated=await runtime.command('public-commons',joinedMap,{...guest,walletId:'b'},{action:'join',requestId:'safe-arrival',meetingId:point.meeting.id});assert.notDeepEqual(relocated.players['account:bob'].position,one.players['account:alice'].position,'arrival avoids newly placed building pieces');
 await runtime.store.update('public-commons',room=>{room.simulation.actors['public-seat-0'].position.x=30;});await reloaded.addStreet('public-commons',{from:{x:-30,z:30},to:{x:30,z:30}},guest);const streetUpdate=attachAtlas(commons.environment,await reloaded.read());const refreshed=await runtime.snapshot('public-commons',streetUpdate);assert.equal(refreshed.streets.length,8);assert.equal(refreshed.actors['public-seat-0'].position.x,30,'street updates do not reset existing gameplay actors');
 await runtime.command('alice-map',environment,{...guest,walletId:'b'},{action:'join',requestId:'move-room'});await assert.rejects(runtime.command('public-commons',streetUpdate,{...guest,walletId:'b'},{action:'input',requestId:'stale-tab',input:{}}),{statusCode:409,code:'ROOM_SWITCHED'});
 const geometry=createServerStreets(environment.streets);assert.equal(geometry.children.filter(item=>item.isMesh).length,3,'roads, paving and lane markings are merged into three draw calls');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('new published destinations become physical portal buildings and connect back to the public hub',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-gateways-'));
 try{
  const atlas=new WorldAtlas(join(dir,'atlas.json'));let data=await atlas.synchronize([{id:'house',name:'Main House',visibility:'public',modelUrl:'/house.glb'},{id:'tower',name:'Tower',visibility:'public',modelUrl:'/tower.glb'}]);
  const commons=Object.values(data.cells).find(cell=>cell.mapId==='public-commons');const portals=commons.environment.builderScene.objects.filter(object=>object.atlasDestination);
  assert.ok(['house','tower'].every(id=>portals.some(object=>object.atlasDestination===id)));assert.equal(portals.filter(object=>object.atlasDestination.startsWith('world-district-')).length,8);assert.ok(portals.every(object=>object.functionalSettings.portal.targetMapId===object.atlasDestination));
  const revision=data.revision;assert.equal((await atlas.synchronize([{id:'house',name:'Main House',visibility:'public',modelUrl:'/house.glb'},{id:'tower',name:'Tower',visibility:'public',modelUrl:'/tower.glb'}])).revision,revision,'unchanged directory does not rebuild portal geometry');
  const district=await atlas.resolve(2000,2000,{accountId:'a',username:'Alice'});data=await atlas.synchronize([{id:'house',name:'Main House',visibility:'public',modelUrl:'/house.glb'}]);const generated=Object.values(data.cells).find(cell=>cell.mapId===district.cell.mapId);assert.ok(generated.environment.builderScene.objects.some(object=>object.atlasDestination==='public-commons'),'generated districts have a portal back to the shared hub');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a public-hub portal enters the canonical shared destination through an authoritative interaction',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-live-gateway-'));let now=100000;
 try{const atlas=new WorldAtlas(join(dir,'atlas.json')),data=await atlas.synchronize([{id:'main-house',name:'Main House',visibility:'public'}]);
 const commons=Object.values(data.cells).find(cell=>cell.mapId==='public-commons'),environment=attachAtlas(commons.environment,data),gateway=environment.builderScene.objects.find(object=>object.atlasDestination==='main-house');
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),alice={accountId:'alice',username:'Alice',stats:{health:100}};
 await runtime.command(environment.id,environment,alice,{action:'join',requestId:'join-hub'});
 await store.update(environment.id,room=>{room.simulation.players['account:alice'].position={x:gateway.position.x,y:0,z:gateway.position.z-4.5};});
 const state=await runtime.command(environment.id,environment,alice,{action:'interact',requestId:'enter-house'});assert.equal(state.result.destination,'main-house');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('selected builder designs exclude atlas defaults while preserving authored streets and public worlds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'isolated-builder-'));
 try{
 const atlas=new WorldAtlas(join(dir,'atlas.json')),map={id:'my-design',name:'My design',source:'custom-builder',ownerId:'account:alice',visibility:'public',builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'my-sofa',modelId:'sofa',position:{x:3,y:0,z:4},functionalSettings:{behavior:'seat'}}]}};
 let state=await atlas.synchronize([map]);const cell=Object.values(state.cells).find(cell=>cell.mapId===map.id);assert.equal(cell.streets.length,6,'atlas index data stays intact');
 const design=attachAtlas(map,state);assert.deepEqual(design.streets,[]);assert.deepEqual(design.builderScene.objects,map.builderScene.objects);assert.equal(design.publicDestination,false);
 const {createBuilderLand}=await import('../public/js/environments/builder-land.js');const root=createBuilderLand(design);assert.equal(root.getObjectByName('SERVER_STREETS').children.length,0,'no generic public road geometry is built');
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});const snapshot=await runtime.snapshot(map.id,design);assert.deepEqual(snapshot.streets,[]);assert.deepEqual(Object.values(snapshot.actors).filter(actor=>!actor.loot&&!actor.runtimeMachine&&!actor.resident).map(actor=>actor.id),['my-sofa']);
 const road={id:'designed-road',name:'My path',from:{x:-5,z:2},to:{x:5,z:2},width:3};const withRoad=attachAtlas({...map,builderScene:{...map.builderScene,streets:[road]}},state);assert.deepEqual(withRoad.streets,[road]);assert.deepEqual(attachAtlas(withRoad,state).streets,[road],'repeated atlas attachment does not duplicate authored data');
 const publicMap=attachAtlas(state.cells['0,0'].environment,state);assert.equal(publicMap.streets.length,6);assert.ok(publicMap.builderScene.objects.some(object=>object.id==='public-seat-0'),'public content remains available by explicit selection');
 await atlas.addStreet(map.id,{from:{x:-10,z:0},to:{x:10,z:0}},{accountId:'alice',username:'Alice'});state=await atlas.read();const edited=attachAtlas(map,state);assert.equal(edited.streets.length,1);assert.equal(edited.streets[0].createdBy,'Alice');
 }finally{await rm(dir,{recursive:true,force:true});}
});
