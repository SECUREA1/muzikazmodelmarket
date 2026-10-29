import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {planResidentFurnishings,createResidentFurnishing,RESIDENT_FURNISHING_MODELS} from '../public/js/resident-furnishings.js';
import {ensureResidentFurnishings} from '../server-resident-furnishings.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const world=()=>({id:'saved-library-lobby',name:'Saved Library',updatedAt:'1',proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[],layoutMeta:{locations:[{id:'lobby',name:'Library Lobby',x:18,y:0,z:10,width:16,depth:14}]}}});
const simple={groundAt:(_env,p)=>({...p,y:0}),hasBodyClearance:()=>true,resolve:(_env,_from,p)=>p};
function dispose(root){const resources=new Set();root.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)resources.add(m);});for(const resource of resources)resource.dispose();}
test('safe indoor furniture plans are bounded, deterministic, native-sized and leave authored save data unchanged',()=>{
 // Fitted, rotated cushion surfaces can have conservative child boxes outside
 // their actual mesh. Keep the planner limits and measure the physical vertices.
 const map=world(),saved=structuredClone(map),records=planResidentFurnishings(map,{collision:simple});assert.ok(records.length>=3&&records.length<=6);assert.deepEqual(map,saved);assert.deepEqual(records,planResidentFurnishings(map,{collision:simple}));for(const record of records){assert.ok(record.position.x>6||record.position.z>6);const root=createResidentFurnishing(record);try{assert.ok(root);const size=new T.Box3().setFromObject(root,true).getSize(new T.Vector3()),limit=RESIDENT_FURNISHING_MODELS[record.modelId];assert.ok(size.x<=limit.width+.001);assert.ok(size.z<=limit.depth+.001);assert.ok(size.y<=limit.height+.001);}finally{dispose(root);}}
});
test('courts, runways, water, tiny or unknown GLBs, occupied floors and unreachable approaches get no furniture',()=>{
 const map=world();for(const name of ['Basketball court','Airport runway','Marina water','Firing range']){const blocked=world();blocked.builderScene.layoutMeta.locations[0].name=name;assert.deepEqual(planResidentFurnishings(blocked,{collision:simple}),[]);}
 assert.deepEqual(planResidentFurnishings({...map,game:'hockey'},{collision:simple}),[]);const embedded=world();embedded.builderScene.objects.push({id:'saved-range',modelId:'scene-firing-range',position:{x:18,y:0,z:10},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});assert.deepEqual(planResidentFurnishings(embedded,{collision:simple}),[]);
 assert.deepEqual(planResidentFurnishings({...map,builderScene:null,proceduralLand:false,modelUrl:'/tiny.glb',layoutMeta:{locations:map.builderScene.layoutMeta.locations}},{collision:simple}),[]);
 assert.deepEqual(planResidentFurnishings(map,{collision:{...simple,groundAt:()=>null}}),[]);assert.deepEqual(planResidentFurnishings(map,{collision:{...simple,hasBodyClearance:()=>false}}),[]);assert.deepEqual(planResidentFurnishings(map,{collision:{...simple,resolve:(_env,from)=>from}}),[]);
 const central=world();Object.assign(central.builderScene.layoutMeta.locations[0],{x:0,z:0,width:8,depth:8});assert.deepEqual(planResidentFurnishings(central,{collision:simple}),[]);
});
test('runtime fixtures use shared solid native actors and never replace authored actors or duplicate on rejoin',()=>{
 const map=world(),saved=structuredClone(map),collision=new ServerBuilderCollision(),authored={id:'authored-chair',modelId:'armchair',position:{x:-20,y:0,z:0},asset:{buildAssetId:'armchair'},active:true,spawned:true},sim={actors:{[authored.id]:authored},players:{}},objects={};const created=ensureResidentFurnishings(sim,map,collision,objects,10000);assert.ok(created.length>=3);assert.deepEqual(map,saved);assert.equal(sim.actors[authored.id],authored);const before=JSON.stringify(created);ensureResidentFurnishings(sim,map,collision,objects,20000);assert.equal(JSON.stringify(Object.values(sim.actors).filter(a=>a.runtimeResidentFurnishing)),before);const placed=collision.placedWorld(sim.actors,objects,map);assert.ok(placed.boxes.length>0);for(const actor of created){assert.equal(actor.spawned,true);assert.equal(actor.trafficAI,undefined);assert.equal(actor.definition.gameplay.behavior,'decor');assert.equal(actor.destructible,false);assert.ok(placed.boxes.some(box=>box.objectId===actor.id));}
 const oldIds=created.map(a=>a.id);map.updatedAt='2';map.builderScene.layoutMeta.locations[0].name='Firing range';assert.deepEqual(ensureResidentFurnishings(sim,map,collision,objects,30000),[]);assert.ok(oldIds.every(id=>!sim.actors[id]));assert.equal(sim.actors[authored.id],authored);assert.deepEqual(objects,{});
});
test('protected arrival portals, roads and footprint holes cannot be covered by a runtime furnishing batch',()=>{
 const map=world(),zone=map.builderScene.layoutMeta.locations[0];map.travelPortals=[{position:{x:18,z:10}}];map.streets=[{from:{x:8,z:10},to:{x:28,z:10},width:18}];assert.deepEqual(planResidentFurnishings(map,{collision:simple}),[]);
 const hole={...simple,groundAt:(_e,p)=>Number.isInteger(p.x)&&Number.isInteger(p.z)?{...p,y:0}:null};assert.deepEqual(planResidentFurnishings(world(),{collision:hole}),[]);
});
