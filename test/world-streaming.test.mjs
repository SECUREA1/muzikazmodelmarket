import {isCleanCommonsEnvironment} from '../public/js/rad-tox-rules.js';
import {isFactoryEnvironment} from '../public/js/missile-factory-config.js';
import {builderBaseEnvironment,applyBuilderBaseTransform,builderBaseSpawn} from '../public/js/environments/builder-base.js';
import {isFiringRangeEnvironment} from '../public/js/firing-range.js';
import {isBasketballEnvironment} from '../public/js/basketball-rules.js';
import {isCleanSportsEnvironment} from '../public/js/sports-worlds.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
const source=readFileSync(new URL('../public/js/environments/environment-loader.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class EnvironmentLoader','class EnvironmentLoader')+'\nglobalThis.Loader=EnvironmentLoader;';
function fixture(compileAsync){
 const created=[],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 class AssetLoader{setDecoderPath(){return this;}setTranscoderPath(){return this;}detectSupport(){return this;}setDRACOLoader(){}setKTX2Loader(){}setMeshoptDecoder(){}}
 const context=vm.createContext({isCleanCommonsEnvironment,isFactoryEnvironment,THREE,builderBaseEnvironment,applyBuilderBaseTransform,builderBaseSpawn,isFiringRangeEnvironment,isBasketballEnvironment,isCleanSportsEnvironment,GLTFLoader:AssetLoader,DRACOLoader:AssetLoader,KTX2Loader:AssetLoader,MeshoptDecoder:{},Octree:class{},createBuilderLand(){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);created.push({mesh,disposed:()=>disposed});return mesh;},replaceServerStreets(){},applyWorldQuality:()=>({}),buildCollision:()=>({visibleMeshes:[{}],collisionMeshes:[],floorMeshes:[],octree:{}}),resolveSafeSpawn:()=>({bounds:new THREE.Box3()}),collectSlimeFloorMeshes:()=>[],createSlimeFloor:()=>({dispose(){},update(){}})});
 vm.runInContext(source,context);
 const renderer={compileAsync};const loader=new context.Loader({scene,renderer,camera});
 return {loader,scene,camera,created};
}
const environment=id=>({id,rotation:{},builderScene:{}});
test('world shaders finish preparing before a streamed world replaces the current one',async()=>{
 let release,compiled;
 const f=fixture((...args)=>{compiled=args;return new Promise(resolve=>{release=resolve;});});
 const old=new THREE.Group();f.loader.world=old;f.scene.add(old);
 const pending=f.loader.load(environment('next'));
 assert.equal(f.loader.world,old);assert.equal(compiled[1],f.camera);assert.equal(compiled[2],f.scene);
 release();const loaded=await pending;
 assert.equal(f.loader.world,loaded.world);assert.equal(old.parent,null);assert.equal(loaded.world.parent,f.scene);
});
test('overlapping world streams discard canceled geometry and install only the latest world',async()=>{
 const releases=[];const f=fixture(()=>new Promise(resolve=>releases.push(resolve)));
 const first=f.loader.load(environment('first')),second=f.loader.load(environment('second'));
 releases[0]();assert.equal(await first,null);assert.equal(f.created[0].disposed(),1);assert.equal(f.loader.world,null);
 releases[1]();const result=await second;assert.equal(f.loader.world,result.world);assert.equal(result.world.name,'WORLD_second');assert.equal(f.created[1].disposed(),0);
});
test('shader preparation errors dispose the failed stream and retain the current world',async()=>{
 const f=fixture(async()=>{throw Error('compile failed');});const old=new THREE.Group();f.loader.world=old;f.scene.add(old);
 await assert.rejects(f.loader.load(environment('broken')),/compile failed/);
 assert.equal(f.loader.world,old);assert.equal(old.parent,f.scene);assert.equal(f.created[0].disposed(),1);
});
test('browsers without async shader compilation can still load a world',async()=>{
 const f=fixture(undefined);const result=await f.loader.load(environment('fallback'));assert.equal(f.loader.world,result.world);
});
test('a model download completed after a world switch is disposed without replacing the new world',async()=>{
 const f=fixture(undefined),releases=[];f.loader.loadOne=()=>new Promise(resolve=>releases.push(resolve));
 const obsolete=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());let disposed=0;obsolete.geometry.addEventListener('dispose',()=>disposed++);
 const first=f.loader.load({id:'download',rotation:{},modelUrl:'/old.glb'});
 const current=await f.loader.load(environment('current'));
 releases[0]({scene:obsolete});assert.equal(await first,null);
 assert.equal(disposed,1);assert.equal(f.loader.world,current.world);assert.equal(current.world.parent,f.scene);
});
