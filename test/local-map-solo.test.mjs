import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {localMapLocations} from '../public/js/local-map-locations.js';

const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const adapter=source.match(/async function localMapCommand\(action,fields=\{\}\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(adapter,'the game mounts a map adapter for shared and solo worlds');

test('the actual explorer adapter keeps shared teleports authoritative and validates solo landings before resetting movement',async()=>{
 const environment={id:'solo-land',spawn:{x:0,z:0},builderScene:{mapSize:80,layoutMeta:{locations:[{id:'garden',name:'Garden',x:20,z:20,arrival:{x:18,y:1,z:19}}]}}},events=[];
 const context={serverHostedRoom:true,serverCommand:async(action,fields)=>{events.push({type:'server',action,fields});return 'shared-result';},activeEnvironment:environment,envLoader:{world:{scale:{x:1}},bounds:{min:{x:-40,y:0,z:-40},max:{x:40,y:10,z:40}},floorMeshes:['real-map-floor'],octree:{real:true}},vehicleController:{active:false},seatedBuilderObject:null,builderGameplay:{player:{}},localMapLocations,player:{height:1.7,radius:.3,yaw:.5},findLocalMapLanding:options=>{events.push({type:'validate',options});return {x:18,y:1.02,z:19};},lockMenuInput:()=>events.push({type:'clear-input'}),resetPlayer:(position,yaw)=>events.push({type:'reset',position,yaw}),setStatus:message=>events.push({type:'status',message})};
 const dynamicGroups=[{triangles:['placed-brick']}];context.walkingSurfaces=()=>dynamicGroups;
 context.resetPlayer=(position,yaw,options)=>events.push({type:'reset',position,yaw,options});
 const command=vm.runInNewContext('('+adapter+')',context);
 assert.equal(await command('map-access',{locationId:'garden'}),'shared-result');assert.equal(events.length,1);assert.equal(events[0].type,'server');
 context.serverHostedRoom=false;events.length=0;const result=await command('map-access',{locationId:'garden'});
 assert.match(result.result.message,/Garden/);assert.deepEqual(events.map(e=>e.type),['validate','clear-input','reset','status']);assert.deepEqual(JSON.parse(JSON.stringify(events[0].options.position)),{x:18,y:1,z:19});assert.equal(events[0].options.floorMeshes,context.envLoader.floorMeshes);assert.equal(events[0].options.octree,context.envLoader.octree);assert.equal(events[0].options.triangleGroups,dynamicGroups);assert.equal(events[0].options.nearby,true);assert.equal(events[2].yaw,.5);
 assert.equal(events[2].options.alignFloor,false,'a verified landing cannot be realigned onto a different storey');
 events.length=0;context.findLocalMapLanding=()=>null;await assert.rejects(command('map-access',{position:{x:3,z:4}}),/supported floor/);assert.equal(events.length,0,'unsupported travel never resets the player');
 context.vehicleController.active=true;await assert.rejects(command('map-access',{locationId:'garden'}),/Exit/);context.vehicleController.active=false;
 context.seatedBuilderObject={};await assert.rejects(command('map-access',{locationId:'garden'}),/Exit/);context.seatedBuilderObject=null;
 await assert.rejects(command('map-access',{locationId:'unknown'}),/unavailable/);assert.equal(events.length,0);
});
