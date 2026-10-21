import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commonsNeighborhood,COMMONS_NEIGHBORHOOD_VERSION} from '../commons-neighborhood.mjs';
import {generatedExperience} from '../generated-world-experiences.mjs';
import {landscapedEnvironment,WorldAtlas} from '../world-atlas.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {Box3} from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
function dispose(root){root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
test('Commons uses catalog materials and props for nine connected locations and walk-in brick buildings',()=>{
 const {objects,locations}=commonsNeighborhood();assert.equal(locations.length,9);assert.ok(objects.length>600&&objects.length<760);assert.equal(new Set(objects.map(o=>o.id)).size,objects.length);
 for(const id of new Set(objects.map(o=>o.modelId))){const model=createBuilderModel(id);assert.ok(model,id);if(id.startsWith('material:'))assert.ok(Math.abs(new Box3().setFromObject(model).min.y)<1e-6,id+' is floor anchored');dispose(model);}
 for(const item of objects){assert.ok(Object.values(item.position).every(Number.isFinite));assert.ok(Math.abs(item.position.x)>3);assert.ok(Math.abs(item.position.z)>3);}
 const world=landscapedEnvironment('public-commons','Public Commons');world.builderScene.objects=objects;
 const collision=new ServerBuilderCollision();
 for(const building of locations.slice(0,4)){
  const origin={x:building.x,y:1.5,z:building.z+6};
  assert.equal(collision.blocksShot(world,origin,[0,0,-1],7,{}),false,'open doorway '+building.id);
  assert.equal(collision.blocksShot(world,{...origin,x:building.x+2.4},[0,0,-1],7,{}),true,'brick front '+building.id);
 }
});
test('saved Commons upgrade is repeatable and preserves routes and member placements',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'commons-upgrade-'));t.after(()=>rm(dir,{recursive:true,force:true}));const atlas=new WorldAtlas(join(dir,'atlas.json'));
 let data=await atlas.synchronize();const commons=Object.values(data.cells).find(cell=>cell.mapId==='public-commons');assert.ok(commons.environment.builderScene.objects.some(o=>o.id==='public-experience-commons-workshop-floor-0-0'));
 const before=data.revision;data=await atlas.synchronize();assert.equal(data.revision,before);assert.ok(Object.values(data.cells).find(cell=>cell.mapId==='public-commons').portalTargets.length>=8);
});
test('authoritative mesh hits destroy one brick, open its collider, and persist without rewarding enemy kills',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'commons-damage-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const object=commonsNeighborhood().objects.find(o=>o.id==='public-experience-commons-workshop-front-3-1');
 const world={id:'commons-brick-test',updatedAt:'1',proceduralLand:true,spawn:{x:object.position.x,y:0,z:object.position.z+3},builderScene:{layout:'grand-floor',mapSize:256,objects:[object]}};
 const store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,count=0;const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'builder',walletId:'builder',username:'Builder',stats:{health:100}};
 const send=(action,extra={})=>runtime.command(world.id,world,identity,{action,requestId:'piece-'+ ++count,...extra});await send('join',{radToxEnabled:false});
 assert.ok(runtime.collision.destructibleHit(world,{...world.spawn,y:1.5},[0,0,-1],10,(await runtime.snapshot(world.id,world)).actors));
 let result;for(let i=0;i<2;i++){now+=1000;result=await send('fire',{tool:'laser',direction:[0,0,-1]});}
 assert.equal(result.actors[object.id].active,false);assert.equal(result.result.targetType,'building');assert.equal(result.players['account:builder'].combat.enemyKills,0);
 assert.equal(runtime.collision.blocksShot(world,{...world.spawn,y:1.5},[0,0,-1],10,result.actors),false);
 const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});assert.equal((await reloaded.snapshot(world.id,world)).actors[object.id].active,false);
});

test('Commons landscape upgrades once and keeps member placements, streets, pins and other districts',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'commons-landscape-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json'));let data=await atlas.synchronize();
 const commons=data.cells['0,0'],district=Object.values(data.cells).find(cell=>cell.mapId!=='public-commons'),districtObjects=JSON.stringify(district.environment.builderScene.objects),districtContent=district.environment.contentUpdatedAt;
 await atlas.transaction(state=>{
  const cell=state.cells['0,0'];cell.environment.builderScene.commonsNeighborhoodVersion=1;
  cell.environment.builderScene.objects=cell.environment.builderScene.objects.filter(object=>!object.id.startsWith('public-experience-commons-woodland-'));
  cell.environment.builderScene.objects.push({id:'member-placed-planter',modelId:'material:planter',position:{x:20,y:0,z:-12},functionalSettings:{behavior:'decor'}});
  cell.streets.push({id:'member-garden-walk',name:'Member walk',createdBy:'Builder',from:{x:10,z:40},to:{x:20,z:40},width:3});
  cell.meetings.push({id:'member-meet',name:'Garden meeting',position:{x:20,y:0,z:40}});
  state.pins={'account:builder':{'public-commons:entry':{id:'public-commons:entry',mapId:'public-commons',place:'Saved commons'}}};state.revision++;
 });
 data=await atlas.synchronize();const upgraded=data.cells['0,0'];
 assert.equal(upgraded.environment.builderScene.commonsNeighborhoodVersion,COMMONS_NEIGHBORHOOD_VERSION);
 assert.ok(upgraded.environment.builderScene.objects.some(object=>object.id==='public-experience-commons-woodland-tree-0'));
 assert.ok(upgraded.environment.builderScene.objects.some(object=>object.id==='member-placed-planter'));
 assert.ok(upgraded.streets.some(street=>street.id==='member-garden-walk'));assert.ok(upgraded.meetings.some(meeting=>meeting.id==='member-meet'));
 assert.equal(data.pins['account:builder']['public-commons:entry'].place,'Saved commons');
 const unchanged=Object.values(data.cells).find(cell=>cell.mapId===district.mapId);assert.equal(JSON.stringify(unchanged.environment.builderScene.objects),districtObjects);assert.equal(unchanged.environment.contentUpdatedAt,districtContent);
 const revision=data.revision;data=await atlas.synchronize();assert.equal(data.revision,revision,'an unchanged landscape must not rebuild the world on every request');
});
