import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {environmentGeometry} from '../server-glb-geometry.mjs';
import {furnishBuildings} from '../public/js/building-furnishing.js';
import {createBuildingDistrict,BUILDING_DISTRICTS} from '../public/js/building-districts.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';
const threeUrl=new URL('../public/vendor/three/three.module.min.js',import.meta.url).href;
const source=(await readFile(new URL('../public/js/environments/environment-collision.js',import.meta.url),'utf8')).replace("'../walking-triangles.js'",JSON.stringify(new URL('../public/js/walking-triangles.js',import.meta.url).href)).replace("'./layout-terrain.js'",JSON.stringify(new URL('../public/js/environments/layout-terrain.js',import.meta.url).href)).replace("'../../vendor/three/three.module.min.js'",JSON.stringify(threeUrl)).replace(/https:\/\/cdn.jsdelivr.net\/npm\/three@0.160.0\/\+esm/g,threeUrl).replace(/import \{ Octree \} from '[^']+';/,"class Octree {fromGraphNode(){}}" );
const {buildCollision,resolveSafeSpawn}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('empty builder and urban maps retain visible terrain, colliders and a safe spawn',()=>{
 for(const layout of ['grand-floor','urban-downtown',...Object.keys(BUILDING_DISTRICTS)]){
  const root=createBuilderLand({id:layout,builderScene:{layout,mapSize:160,objects:[]}});root.updateMatrixWorld(true);
  for(const authoritative of [false,true]){
   const result=buildCollision(root,'auto',[],{buildOctree:!authoritative});
   assert.ok(result.visibleMeshes.length>0,layout);assert.ok(result.floorMeshes.length>0);assert.equal(root.children[0].visible,true);
   const spawn=resolveSafeSpawn(root,result.floorMeshes,{x:0,y:1,z:2});assert.ok(Number.isFinite(spawn.position.y));
  }
 }
});
test('explicit invisible collider helpers stay hidden and do not count as rendered geometry',()=>{
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(4,1,4),new THREE.MeshBasicMaterial());mesh.name='COLLIDER_TEST';root.add(mesh);root.updateMatrixWorld(true);
 const result=buildCollision(root,'auto',[],{buildOctree:false});assert.equal(result.visibleMeshes.length,0);assert.equal(mesh.visible,false);assert.ok(result.collisionMeshes.includes(mesh));
});
test('entire repository playlist has finite triangle geometry and collision spawn floors',async()=>{
 const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
 for(const record of records){
  const root=record.proceduralLand||record.builderScene?createBuilderLand(record):environmentGeometry(record);let triangles=0;root.traverse(mesh=>{if(mesh.isMesh)triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position?.count||0)/3;});assert.ok(triangles>0,record.id);
  const collision=buildCollision(root,'auto',[],{buildOctree:false});assert.ok(collision.visibleMeshes.length,record.id);assert.ok(collision.floorMeshes.length,record.id);
  const spawn=resolveSafeSpawn(root,collision.floorMeshes,record.spawn);assert.ok(Number.isFinite(spawn.position.y),record.id);
  root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});
 }
});
test('automatic furnishing is deterministic, compiles interactive actors and preserves ownership',()=>{
 const scene=createBuildingDistrict('urban-building-showcase');const added=furnishBuildings(scene);assert.ok(added.length>25);scene.objects.push(...added);assert.equal(furnishBuildings(scene).length,0);
 const manifest=compileBuilderScene(scene);assert.ok(manifest.actors.some(actor=>actor.gameplay.device==='video-poker-table'));assert.ok(manifest.actors.some(actor=>actor.gameplay.device==='arcade-slot-machine'));
 const bare={objects:[{id:'bank',modelId:'civic-bank',position:{x:12,y:2,z:9},rotation:{y:Math.PI/2},scale:{x:1,y:2,z:1}}]};
 assert.equal(furnishBuildings(bare,{backpack:true,models:[]}).length,0);
 const owned=furnishBuildings(bare,{backpack:true,models:[{id:'owned-atm',buildAssetId:'market-atm',category:'backpack'},{id:'unowned',buildAssetId:'cinema-screen',category:'interactive'}]});assert.equal(owned.length,1);assert.equal(owned[0].modelId,'owned-atm');assert.equal(owned[0].position.y,2.36);assert.equal(owned[0].functionalSettings.device,'market-atm');
});
function testLoader(){return Object.assign(Object.create(EnvironmentLoader.prototype),{token:0,scene:new THREE.Scene(),renderer:{capabilities:{getMaxAnisotropy:()=>8}},serverAuthoritative:()=>true,onProgress:()=>{},mixers:[],supplementalCollisionRoots:[],refreshFloorEffects(){},clearFloorEffects(){},createBuilderLand});}
test('loader enters empty saved builder maps and keeps the previous world if a new asset fails',async()=>{
 const loader=testLoader();const result=await loader.load({id:'empty',builderScene:{layout:'urban-downtown',objects:[]}});assert.ok(result.meshes.length);assert.ok(result.collision.floorMeshes.length);const previous=loader.world;
 loader.loadOne=async()=>{throw Error('offline');};await assert.rejects(loader.load({id:'broken',modelUrl:'missing.glb'}),/offline/);assert.equal(loader.world,previous);assert.ok(loader.scene.children.includes(previous));
});
test('model requests retry a transient error once',async()=>{
 const loader=testLoader();let calls=0;loader.loader={load(url,success,progress,error){calls++;if(calls===1)error(Error('temporary'));else success({scene:new THREE.Group()});}};
 const result=await loader.loadOne('test.glb',0,1);assert.ok(result.scene);assert.equal(calls,2);
});
test('a superseded map failure cannot interrupt the newly loaded map',async()=>{
 const loader=testLoader();let rejectOld;loader.loadOne=()=>new Promise((resolve,reject)=>{rejectOld=reject;});const old=loader.load({id:'slow',modelUrl:'slow.glb',scale:9});
 await loader.load({id:'new',builderScene:{layout:'grand-floor'},scale:1});rejectOld(Error('offline'));assert.equal(await old,null);assert.equal(loader.activeEnvironment.id,'new');assert.equal(loader.baseScale,1);
});
test('unloading cancels a pending model so it cannot reattach after leaving a page',async()=>{
 const loader=testLoader();let finish;loader.loadOne=()=>new Promise(resolve=>{finish=resolve;});const pending=loader.load({id:'old',modelUrl:'slow.glb'});loader.unload();const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));finish({scene});assert.equal(await pending,null);assert.equal(loader.world,null);assert.equal(loader.scene.children.length,0);
});
test('saved authored base loads the original meshes with the custom identity and matching scale',async()=>{
 const record=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url))).find(record=>!record.proceduralLand&&!record.builderScene&&record.modelUrl);
 const loader=testLoader();let loaded=0;
 loader.loadOne=async url=>{loaded++;return {scene:environmentGeometry({modelUrl:url}),animations:[]};};
 const environment={id:'my-edited-map',builderScene:{layout:'repository-'+record.id,baseEnvironment:record,objects:[]}};
 const result=await loader.load(environment);
 assert.ok(loaded>0);assert.equal(loader.activeEnvironment.id,'my-edited-map');
 assert.ok(result.meshes.length);assert.ok(result.collision.floorMeshes.length);
 const expected=environmentGeometry(record),a=new THREE.Box3().setFromObject(expected),b=new THREE.Box3().setFromObject(result.world);
 for(const axis of ['x','z'])assert.ok(Math.abs(a.getSize(new THREE.Vector3())[axis]-b.getSize(new THREE.Vector3())[axis])<.01);
 loader.unload();expected.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});
});

test('safety floor remains entirely beneath the visible floor and player entry stays above it',()=>{
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.position.y=4;root.add(floor);root.updateMatrixWorld(true);
 const collision=buildCollision(root,'auto',[],{buildOctree:false}),safety=new THREE.Box3().setFromObject(collision.containment.floor);
 assert.ok(Math.abs(safety.max.y-4)<1e-8);assert.ok(safety.min.y<4);assert.equal(collision.containment.floor.material.visible,false);
 const entry=resolveSafeSpawn(root,collision.floorMeshes,{x:0,y:4,z:0});assert.ok(Math.abs(entry.position.y-4.02)<1e-8);
});
