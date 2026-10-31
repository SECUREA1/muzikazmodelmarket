import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {forgeWorld} from '../forge-world.mjs';
import {editableForgeScene} from '../public/js/forge-builder.js';
import {FORGE_STATIONS,FORGE_CREW} from '../public/js/forge-config.js';
import {FORGE_VILLAGE_ROOMS} from '../public/js/forge-village-architecture.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {placementBounds} from '../public/js/placed-item-collision.js';

const close=(a,b,tolerance=.16)=>Math.hypot(a.x-b.x,a.z-b.z)<=tolerance;
const point=([x,z])=>({x,y:.02,z});

async function fixture(t,{forgeState}={}){
 const directory=await mkdtemp(join(tmpdir(),'forge-village-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=forgeWorld(),store=new SharedRoomStore(join(directory,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>1000000,...(forgeState?{forgeState}:{})});
 t.after(()=>runtime.collision.clearPlacedWorlds());
 const identity={accountId:'village-walker',username:'Village walker'};
 const state=await runtime.command(world.id,world,identity,{action:'join',requestId:'village-arrival',radToxEnabled:false,deferRadTox:true});
 return {world,runtime,state,identity};
}

function walk(f,from,route){
 let current={...from};
 for(const target of route){
  const origin={...current},steps=Math.max(1,Math.ceil(Math.hypot(target.x-origin.x,target.z-origin.z)/.3));
  for(let step=1;step<=steps;step++){
   const fraction=step/steps,next={x:origin.x+(target.x-origin.x)*fraction,y:current.y-.04,z:origin.z+(target.z-origin.z)*fraction};
   current=f.runtime.collision.resolve(f.world,current,next,f.state.actors,f.state.objects);
   assert.ok(close(current,next),'continuous village walk blocked before '+JSON.stringify(target)+' at '+JSON.stringify(current));
   assert.ok(Math.abs(current.y-.02)<.08,'walk stays on the grounded village floor at '+JSON.stringify(current));
  }
  assert.ok(close(current,target),'walk reaches '+JSON.stringify(target));
 }
 return current;
}

test('the forge village has an explorable architectural footprint using real market-compatible pieces',async t=>{
 const f=await fixture(t),{world,state}=f,scene=world.builderScene;
 assert.equal(world.playableSize,224);assert.equal(scene.mapSize,224);assert.ok(scene.objects.length>300);
 assert.ok(FORGE_VILLAGE_ROOMS.length>=5);
 const ids=new Set(scene.objects.map(object=>object.id));assert.equal(ids.size,scene.objects.length,'every editable component has a stable unique identity');
 const catalog=new Set(GAME_ECONOMY.map(item=>item.buildAssetId));
 for(const object of scene.objects){
  assert.ok(catalog.has(object.asset?.buildAssetId||object.modelId),object.id+' resolves a canonical market model');
  assert.ok(Math.abs(object.position.x)<=112&&Math.abs(object.position.z)<=112,object.id+' stays in the village footprint');
  if(object.id.startsWith('forge-village-'))assert.ok(!['pickup','collectible','collect','reward'].includes(object.functionalSettings?.behavior),object.id+' is scenery or an interaction, not a free owned item');
 }
 assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.forge).length,FORGE_CREW.length);
 for(const station of FORGE_STATIONS)assert.ok(scene.objects.some(object=>object.id===station.id&&object.position.x===station.position.x&&object.position.z===station.position.z),'the existing paid work bay stays connected');
 const offline=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')).find(map=>map.id===world.id);
 assert.equal(offline.builderScene.mapSize,224);assert.equal(offline.builderScene.objects.length,scene.objects.length);
});

test('continuous floor routes connect paid work bays, the village ring and all five furnished interiors',async t=>{
 const f=await fixture(t),start=f.state.players[f.state.selfId].position;
 let current=walk(f,start,[[0,20],[0,0],...FORGE_STATIONS.flatMap(station=>[[station.position.x,0],[station.approach.x,station.approach.z],[station.position.x,0]]),[0,0],[0,37],[0,49]].map(point));
 const room=(x,z)=>FORGE_VILLAGE_ROOMS.find(value=>value.position.x===x&&value.position.z===z);
 const visit=(value)=>{assert.ok(value);current=walk(f,current,[value.approach,value.door,value.interior,value.door,value.approach]);};
 current=walk(f,current,[[-56,49],[-56,-10]].map(point));visit(room(-76,-10));
 current=walk(f,current,[[-56,-10],[-56,-54],[0,-54]].map(point));visit(room(0,-70));
 current=walk(f,current,[[56,-54],[56,-10]].map(point));visit(room(76,-10));
 current=walk(f,current,[[56,-10],[56,49],[72,49]].map(point));visit(room(72,66));
 current=walk(f,current,[[72,49],[-72,49]].map(point));visit(room(-72,66));
 current=walk(f,current,[[-72,49],[0,49],[0,75],[0,99],[0,75],[0,49],[0,37]].map(point));
 assert.ok(close(current,start),'the complete exploration loop returns to the workshop arrival');
});

test('room thresholds and central aisles have level floors and full player headroom below their real roofs',async t=>{
 const f=await fixture(t),options={entry:true,actors:f.state.actors,objects:f.state.objects};
 for(const room of FORGE_VILLAGE_ROOMS){
  for(const target of [room.approach,room.door,room.interior,...[-3,0,3].flatMap(z=>[-1,1].map(x=>({x:room.position.x+x*Math.cos(room.yaw)+z*Math.sin(room.yaw),y:.02,z:room.position.z-x*Math.sin(room.yaw)+z*Math.cos(room.yaw)})))]){
   const floor=f.runtime.collision.groundAt(f.world,target,options);
   assert.ok(floor,room.name+' has a real ground floor at '+JSON.stringify(target));
   assert.ok(Math.abs(floor.y-.02)<.08,room.name+' enters at the street level instead of its roof');
   assert.ok(f.runtime.collision.hasBodyClearance(f.world,floor,.38,options),room.name+' has an open player capsule below its beams');
  }
 }
});

test('pitched rafters meet the great forge frame after the real collider-base grounding transform',()=>{
 const objects=forgeWorld().builderScene.objects;
 for(const [side,expected]of [['west',[[-44,8,-21],[0,13.3,-21]]],['east',[[0,13.3,-21],[44,8,-21]]]]){
  const item=objects.find(object=>object.id==='forge-village-hall-rafter-'+side+'--21');assert.ok(item);
  const model=createBuilderModel(item.modelId);model.position.set(item.position.x,item.position.y,item.position.z);model.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);model.scale.set(item.scale.x,item.scale.y,item.scale.z);model.updateMatrixWorld(true);
  const bounds=placementBounds(THREE,model);model.position.y+=item.position.y-bounds.min.y;model.updateMatrixWorld(true);
  const ends=[new THREE.Vector3(-.6,.6,0),new THREE.Vector3(.6,.6,0)].map(value=>model.localToWorld(value));
  for(let index=0;index<2;index++)assert.ok(ends[index].distanceTo(new THREE.Vector3(...expected[index]))<.002,side+' rafter endpoint '+index+' remains joined at '+JSON.stringify(ends[index].toArray()));
 }
});

test('village components stay editable and deliberate deletions survive Builder restoration',()=>{
 const source=forgeWorld(),draft=structuredClone(source.builderScene),part=draft.objects.find(object=>object.id.startsWith('forge-village-'));
 assert.ok(part);const deleted=draft.objects.find(object=>object.id.startsWith('forge-village-')&&object.id!==part.id);assert.ok(deleted);
 part.position.x+=1;part.materialSettings={accent:'#765432',useAccent:true};draft.objects=draft.objects.filter(object=>object.id!==deleted.id);
 const restored=editableForgeScene(editableForgeScene(draft));
 assert.deepEqual(restored.objects,draft.objects);assert.ok(!restored.objects.some(object=>object.id===deleted.id));
 assert.equal(restored.mapSize,224);assert.deepEqual(source.builderScene.objects.find(object=>object.id===part.id).position,forgeWorld().builderScene.objects.find(object=>object.id===part.id).position,'Builder editing does not mutate the permanent village');
});

test('a moved room anchor moves its marker and deleting the anchor removes its room navigation',()=>{
 const draft=structuredClone(forgeWorld().builderScene),original=draft.layoutMeta.forgeVillage.rooms[0],anchor=draft.objects.find(object=>object.id===original.anchorId);
 anchor.position.x+=7;anchor.position.z-=3;
 const moved=editableForgeScene(draft),room=moved.layoutMeta.forgeVillage.rooms.find(value=>value.id===original.id);
 assert.ok(Math.abs(room.position.x-original.position.x-7)<1e-8);assert.ok(Math.abs(room.position.z-original.position.z+3)<1e-8);
 draft.objects=draft.objects.filter(object=>object.id!==original.anchorId);
 const deleted=editableForgeScene(editableForgeScene(draft));
 assert.ok(!deleted.layoutMeta.forgeVillage.rooms.some(value=>value.id===original.id));
 assert.ok(!deleted.layoutMeta.locations.some(value=>value.villageAnchorId===original.anchorId));
 assert.ok(deleted.objects.some(object=>object.functionalSettings?.villageRoomId===original.id),'independently editable remaining components are not silently deleted');
});

test('saved workshop rooms receive the larger village without resetting an existing paid workpiece',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-village-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const current=forgeWorld(),previous=structuredClone(current);previous.contentUpdatedAt='2026-10-30T00:00:00.000Z';previous.playableSize=128;previous.builderScene.mapSize=128;previous.builderScene.objects=previous.builderScene.objects.filter(object=>!object.id.startsWith('forge-village-'));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1000000,forgeState:async()=>({job:{id:'paid-before-village',stage:'temper'},progress:{completedItems:7}})});t.after(()=>runtime.collision.clearPlacedWorlds());
 const identity={accountId:'returning-village-smith',username:'Returning smith'};
 const before=await runtime.command(current.id,previous,identity,{action:'join',requestId:'old-workshop'});assert.ok(!Object.values(before.actors).some(actor=>actor.id.startsWith('forge-village-')));
 const after=await runtime.command(current.id,current,identity,{action:'join',requestId:'new-village'});
 assert.ok(after.actors[FORGE_VILLAGE_ROOMS[0].anchorId]?.active);assert.equal(after.players[after.selfId].forge.job.id,'paid-before-village');assert.equal(after.players[after.selfId].forge.progress.completedItems,7);assert.notEqual(after.sceneVersion,before.sceneVersion);
});
