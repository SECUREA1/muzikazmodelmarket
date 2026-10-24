import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {FACTORY_STATIONS,FACTORY_CREW} from '../public/js/missile-factory-config.js';
import {FACTORY_MODEL_INFO,createFactoryModel,createMissileFactoryLand,updateFactoryModel} from '../public/js/missile-factory-model.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import * as T from '../public/vendor/three/three.module.min.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const mat of [].concat(node.material||[]))resources.add(mat);});for(const resource of resources)resource?.dispose();}

test('permanent factory matches the authored world and every workstation and crew member has clear floor',async()=>{
 const world=missileFactoryWorld(),registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url))),collision=new ServerBuilderCollision();
 assert.deepEqual(registry.find(row=>row.id===world.id),world);
 const spawn=collision.safeSpawn(world,world.spawn);assert.equal(spawn.x,0);assert.equal(spawn.z,56);assert.ok(Math.abs(spawn.y-.02)<1e-8);
 for(const value of [...FACTORY_STATIONS,...FACTORY_CREW]){const floor=collision.groundAt(world,value.position,{entry:true});assert.ok(floor,value.id+' is supported');assert.ok(collision.hasBodyClearance(world,floor,.38),value.id+' has capsule clearance');}
 const machines=world.builderScene.objects.filter(object=>object.functionalSettings.behavior==='vehicle');
 assert.deepEqual(machines.map(machine=>machine.modelId),['site-dumptruck','tower-crane','site-excavator','site-bulldozer']);
 dispose(collision.world(world).root);
});

test('walking routes reach all six production and freight stations from the south entrance',()=>{
 const world=missileFactoryWorld(),collision=new ServerBuilderCollision();
 for(const station of FACTORY_STATIONS){
  let current={...world.spawn};const target=station.position,waypoints=target.z<20?[[0,10],[target.x,10],[target.x,target.z]]:[[0,46],[target.x,46],[target.x,target.z]];
  for(const [x,z]of waypoints){const span=Math.hypot(x-current.x,z-current.z),steps=Math.ceil(span/.3),dx=(x-current.x)/steps,dz=(z-current.z)/steps;for(let i=0;i<steps;i++){const next=collision.resolve(world,current,{x:current.x+dx,y:current.y,z:current.z+dz});current={x:next.x,y:next.floorY??next.y,z:next.z};}assert.ok(Math.hypot(current.x-x,current.z-z)<.15,station.id+' reaches '+x+','+z+' (actual '+current.x+','+current.z+')');}
 }
 // Truck footprints need a broad unobstructed lane, not a capsule-sized path.
 for(let z=-26;z<=43;z+=2)for(const x of [38.25,40,41.75])assert.ok(collision.hasBodyClearance(world,{x,y:.02,z},.45),'clear freight lane '+x+','+z);
 dispose(collision.world(world).root);
});

test('crafted models render from Backpack IDs and the shared work-order display reflects assembly progress',()=>{
 for(const id of Object.keys(FACTORY_MODEL_INFO)){const model=createBuilderModel(id);assert.ok(model,id+' has a procedural game model');model.updateMatrixWorld(true);const size=new T.Box3().setFromObject(model).getSize(new T.Vector3());assert.ok(size.x>0&&size.y>0&&size.z>0);assert.doesNotThrow(()=>updateFactoryModel(model,123));dispose(model);}
 const land=createMissileFactoryLand();assert.equal(land.getObjectByName('FACTORY_OPAQUE_ROOF'),undefined);
 const display=land.getObjectByName('FACTORY_LIVE_WORK_ORDER');assert.ok(display);
 land.userData.setFactoryState({jobs:[{job:{recipeId:'cargo-rocket',stepIndex:0,status:'processing'}}]});
 const rocket=display.children.find(model=>model.name==='factory-cargo-rocket');assert.equal(rocket.visible,true);assert.equal(rocket.getObjectByName('FACTORY_PAYLOAD_FAIRING').visible,false);
 land.userData.setFactoryState({jobs:[{job:{recipeId:'cargo-rocket',stepIndex:2,status:'haul'}}]});assert.equal(rocket.getObjectByName('FACTORY_PAYLOAD_FAIRING').visible,true);
 assert.doesNotThrow(()=>land.userData.updateFactoryEffects(200));land.userData.setFactoryState({jobs:[]});assert.equal(rocket.visible,false);dispose(land);
});
