import test from 'node:test';
import assert from 'node:assert/strict';
import {stepWorldResidents} from '../server-world-residents.mjs';
import {createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';

const collision={groundAt:(_environment,point)=>({...point,y:0}),hasBodyClearance:()=>true,resolve:(_environment,_from,to)=>to};
const environment={id:'muzikaz-clown-funhouse',name:'Midnight Laughs',game:'funhouse',spawn:{x:0,y:0,z:0},builderScene:{layout:'clown-funhouse',mapSize:120,objects:[],layoutMeta:{locations:[{id:'house',name:'Horror house',x:0,z:0},{id:'court',name:'Clown car court',x:20,z:0},{id:'gallery',name:'Water gallery',x:0,z:20}]}}};
const dispose=root=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){for(const value of Object.values(material))if(value?.isTexture)resources.add(value);resources.add(material);}});for(const resource of resources)resource.dispose();};

test('every fresh and restored funhouse resident receives a creepy clown appearance without changing AI identity',()=>{
 for(const map of [environment,{...environment,id:'builder-funhouse-copy',game:undefined,builderScene:{...environment.builderScene,layout:'repository-copy',sourceLayout:'clown-funhouse'}}]){
  const sim={actors:{},players:{},events:[]};stepWorldResidents(sim,map,100000,.1,{collision});
  const cast=Object.values(sim.actors).filter(actor=>actor.resident);assert.ok(cast.length>=3);
  for(const npc of cast){assert.equal(npc.resident.funhouseClown,true);assert.match(npc.resident.funhouseClownModelId,/^funhouse-(ringmaster|juggler|greeter|driver|scare-clown)-avatar$/);}
  const npc=cast[0],name=npc.resident.name,role=npc.resident.role;
  npc.resident.customMemory={friend:'Remember this guest'};delete npc.resident.funhouseClown;delete npc.resident.funhouseClownModelId;
  // A restored actor is repaired even during the normal AI update throttle.
  stepWorldResidents(sim,map,100050,.05,{collision});
  assert.equal(npc.resident.funhouseClown,true);assert.equal(npc.resident.name,name);assert.equal(npc.resident.role,role);assert.deepEqual(npc.resident.customMemory,{friend:'Remember this guest'});
  const ordinary={...map,id:'ordinary-neighborhood',game:undefined,builderScene:{...map.builderScene,layout:'grand-floor',sourceLayout:undefined}};
  stepWorldResidents(sim,ordinary,100060,.01,{collision});
  for(const actor of cast){assert.equal(actor.resident.funhouseClown,undefined);assert.equal(actor.resident.funhouseClownModelId,undefined);}
 }
});

test('funhouse locals display the native creepy clown while speech, movement and the normal resident rig remain available',()=>{
 const root=createWorldResident();
 try{
  const state={name:'Resident host',role:'Local explorer',ageGroup:'adult',moving:true,speaking:true,speech:'The gallery is on the west midway.',funhouseClown:true,funhouseClownModelId:'funhouse-scare-clown-avatar'};
  root.userData.residentState=state;updateWorldResident(root,1);
  const visual=root.userData.funhouseResidentVisual;
  assert.ok(visual?.model.userData.funhouseModel);assert.equal(visual.model.visible,true);assert.equal(root.getObjectByName('RESIDENT_BODY').visible,false);
  assert.equal(root.userData.residentState,state);assert.equal(state.speech,'The gallery is on the west midway.');assert.ok(visual.arms.length>=2);
  const firstArm=visual.arms[0].rotation.x;updateWorldResident(root,1.3);assert.notEqual(visual.arms[0].rotation.x,firstArm);assert.equal(root.userData.funhouseResidentVisual,visual,'reuse the native visual between snapshots');
  delete state.funhouseClown;delete state.funhouseClownModelId;updateWorldResident(root,1.5);
  assert.equal(visual.model.visible,false);assert.equal(root.getObjectByName('RESIDENT_BODY').visible,true);assert.equal(root.userData.residentState,state);
 }finally{dispose(root);}
});

test('ordinary-map residents keep their authored forms and do not allocate a clown model',()=>{
 const root=createWorldResident();
 try{root.userData.residentState={name:'Harbor worker',role:'Dock crew',identity:{form:'foxfolk'}};updateWorldResident(root,1);assert.equal(root.userData.funhouseResidentVisual,undefined);assert.equal(root.getObjectByName('RESIDENT_BODY').visible,true);assert.equal(root.getObjectByName('RESIDENT_FOX_TAIL').visible,true);}finally{dispose(root);}
});
