import test from 'node:test';
import assert from 'node:assert/strict';
import {registerOwnedPlacement} from '../public/js/owned-item-placement.js';
import {BuilderGameplayRuntime} from '../public/js/builder-gameplay-pipeline.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
const placement=x=>({position:[x,0,0],rotation:[0,.2,0],scale:[1,1,1]});

test('a locally dropped market seat becomes interactive and moving it replaces the original actor',()=>{
 const runtime=new BuilderGameplayRuntime({manifest:{version:2,objects:[],actors:[]}}),asset={id:'owned-seat',name:'Camp seat',buildAssetId:'camp-log-bench',function_data:{behavior:'seat',prompt:'Rest',seatOffset:[0,.55,0],exitOffset:[0,0,1.4]}};
 let seated=false;
 const item=registerOwnedPlacement(runtime,asset,placement(0),'drop-seat');
 runtime.register(item.id,{setSeated:value=>{seated=value;}});
 assert.equal(runtime.interact('e',{x:0,y:0,z:0}).seated,true);assert.equal(seated,true);
 assert.deepEqual(runtime.actor('drop-seat').gameplay.seatOffset,[0,.55,0]);
 registerOwnedPlacement(runtime,asset,placement(10),'drop-seat');runtime.register('drop-seat',{});
 assert.equal(runtime.manifest.actorCount,1);assert.equal(runtime.manifest.objectCount,1);assert.equal(runtime.nearest({x:0,y:0,z:0}),null);assert.equal(runtime.nearest({x:10,y:0,z:0}).actor.objectId,'drop-seat');
});

test('locally placed pickups and portals execute the same gameplay contract as map objects',()=>{
 let jumped;
 const runtime=new BuilderGameplayRuntime({manifest:{version:2,objects:[],actors:[]},effects:{teleport:portal=>{jumped=portal.targetMapId;}}});
 registerOwnedPlacement(runtime,{id:'owned-crystal',name:'Crystal',buildAssetId:'treasure-crystal',function_data:{behavior:'pickup',action:'score',value:7}},placement(0),'drop-crystal');
 let held=false;runtime.register('drop-crystal',{setHeld:value=>{held=value;}});
 runtime.interact('e',{x:0,y:0,z:0});assert.equal(held,true);assert.equal(runtime.player.score,7);
 registerOwnedPlacement(runtime,{id:'owned-portal',name:'Portal',buildAssetId:'portal-door',function_data:{behavior:'door',action:'teleport',portal:{enabled:true,destinationType:'map',targetMapId:'public-commons'}}},placement(10),'drop-portal');
 runtime.register('drop-portal',{setDoorOpen(){}});runtime.interact('e',{x:10,y:0,z:0});assert.equal(jumped,'public-commons');
});

test('local aircraft registration preserves authored settings for the vehicle controller',()=>{
 const runtime=new BuilderGameplayRuntime({manifest:{version:2,objects:[],actors:[]}}),vehicleSettings={mode:'fly',speed:24,turnSpeed:1.1,seat:[0,1.2,.3]};
 const item=registerOwnedPlacement(runtime,{id:'plane',name:'Aircraft',assetType:'vehicles',buildAssetId:'diamond-da40',behavior:'vehicle',vehicleSettings,function_data:{behavior:'vehicle',interactionKey:'f'}},placement(5),'drop-plane');
 assert.deepEqual(item.vehicleSettings,vehicleSettings);assert.deepEqual(runtime.actor('drop-plane').vehicle,vehicleSettings);assert.equal(runtime.nearest({x:5,y:0,z:0},'f').actor.objectId,'drop-plane');
});

test('the live Builder adapter can hold and drop items using its own floor and ground offset',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const adapterSource=source.slice(source.indexOf('  function registerBuilderObjectAdapter('),source.indexOf('  async function loadBuilderDecor('));
 const object=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()),builderDecor=new THREE.Group(),playerRig=new THREE.Group();
 const calls=[],instances=new Map();let refreshes=0;
 const context=vm.createContext({THREE,builderDecor,playerRig,player:{yaw:.2},builderGameplay:{register:(id,adapter)=>instances.set(id,adapter)},floorPointAt:point=>{calls.push(point.clone());return new THREE.Vector3(point.x,2,point.z);},refreshBuilderCollision:()=>{refreshes++;}});
 vm.runInContext(adapterSource+';globalThis.registerAdapter=registerBuilderObjectAdapter;',context);
 context.registerAdapter(object,{id:'dropped',position:{x:0,y:3,z:0},groundOffset:.4});
 const adapter=instances.get('dropped');
 adapter.setHeld(true);assert.equal(object.parent,playerRig);
 adapter.setDropped({x:4,y:0,z:6});assert.equal(object.parent,builderDecor);
 assert.equal(calls[0].y,3,'item elevation supplies the floor fallback for a zero-height drop');
 assert.equal(object.position.x,4);assert.equal(object.position.z,6);assert.ok(Math.abs(new THREE.Box3().setFromObject(object).min.y-2.4)<1e-8);
 adapter.setHeld(true);adapter.setHeld(false);assert.equal(object.parent,builderDecor);assert.equal(refreshes,4);
 context.registerAdapter(object,{id:'map-item',position:{x:0,y:1,z:0}},null,[],null,9);
 instances.get('map-item').setDropped({x:0,y:0,z:0});assert.equal(calls.at(-1).y,9,'authored map objects retain the original map floor fallback');
 object.geometry.dispose();object.material.dispose();
});
