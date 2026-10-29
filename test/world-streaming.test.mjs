import {isWorldItemFactoryEnvironment} from '../public/js/world-item-factory-config.js';
import {isTropicalIslandEnvironment} from '../public/js/tropical-island-config.js';
import {isFitnessEnvironment} from '../public/js/fitness-config.js';
import {isProvingEnvironment,isCompoundEnvironment} from '../public/js/factory-test-config.js';
import {isPrisonEnvironment} from '../public/js/prison-config.js';
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
import {disposeGameModel} from '../public/js/game-model-loader.js';
const source=readFileSync(new URL('../public/js/environments/environment-loader.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class EnvironmentLoader','class EnvironmentLoader')+'\nglobalThis.Loader=EnvironmentLoader;';
function fixture(compileAsync,overrides={}){
 const created=[],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 class AssetLoader{setDecoderPath(){return this;}setTranscoderPath(){return this;}detectSupport(){return this;}setDRACOLoader(){}setKTX2Loader(){}setMeshoptDecoder(){}}
 const context=vm.createContext({isWorldItemFactoryEnvironment,isTropicalIslandEnvironment,isFitnessEnvironment,isProvingEnvironment,isCompoundEnvironment,isPrisonEnvironment,isCleanCommonsEnvironment,isFactoryEnvironment,THREE,builderBaseEnvironment,applyBuilderBaseTransform,builderBaseSpawn,isFiringRangeEnvironment,isBasketballEnvironment,isCleanSportsEnvironment,createGameModelLoader:()=>new AssetLoader(),loadGameModel:()=>{throw Error('Unexpected model request');},disposeGameModel,AbortController,DOMException,setTimeout,clearTimeout,Octree:class{},createBuilderLand(){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);created.push({mesh,disposed:()=>disposed});return mesh;},replaceServerStreets(){},applyWorldQuality:()=>({}),buildCollision:()=>({visibleMeshes:[{}],collisionMeshes:[],floorMeshes:[],octree:{}}),resolveSafeSpawn:()=>({bounds:new THREE.Box3()}),collectSlimeFloorMeshes:()=>[],createSlimeFloor:()=>({dispose(){},update(){}}),...overrides});
 vm.runInContext(source,context);
 const renderer={compileAsync};const loader=new context.Loader({scene,renderer,camera});
 return {loader,scene,camera,created};
}
const environment=id=>({id,rotation:{},builderScene:{}});
test('world installation leaves shader warming to the gameplay display after the spawn camera is ready',async()=>{
 let compiled=0;
 const f=fixture(()=>{compiled++;throw Error('Do not compile the whole world at the old camera');});
 const old=new THREE.Group();f.loader.world=old;f.scene.add(old);
 const pending=f.loader.load(environment('next'));
 assert.equal(f.loader.world,old);const loaded=await pending;assert.equal(compiled,0);
 assert.equal(f.loader.world,loaded.world);assert.equal(old.parent,null);assert.equal(loaded.world.parent,f.scene);
});
test('overlapping world streams discard canceled geometry and install only the latest world',async()=>{
 const f=fixture(undefined);
 const first=f.loader.load(environment('first')),second=f.loader.load(environment('second'));
 assert.equal(await first,null);assert.equal(f.created[0].disposed(),1);
 const result=await second;assert.equal(f.loader.world,result.world);assert.equal(result.world.name,'WORLD_second');assert.equal(f.created[1].disposed(),0);
});
test('world preparation errors dispose the failed stream and retain the current world',async()=>{
 const f=fixture(undefined,{applyWorldQuality:()=>{throw Error('material preparation failed');}});const old=new THREE.Group();f.loader.world=old;f.scene.add(old);
 await assert.rejects(f.loader.load(environment('broken')),/material preparation failed/);
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

test('a timed-out map request aborts and settles before its retry starts',async()=>{
 let timeout,firstSignal,finishAbort,attempts=0,active=0;
 const f=fixture(undefined,{
  setTimeout:callback=>{timeout=callback;return 1;},clearTimeout(){},
  loadGameModel:async(loader,url,{signal})=>{
   attempts++;assert.equal(active,0,'never overlap timed-out model requests');active++;
   if(attempts===1){firstSignal=signal;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{finishAbort=()=>{active--;reject(new DOMException('Canceled','AbortError'));};},{once:true});});}
   active--;return {scene:new THREE.Group()};
  }
 });
 const pending=f.loader.loadOne('/large.glb',0,1);timeout();
 assert.equal(firstSignal.aborted,true);await Promise.resolve();assert.equal(attempts,1,'wait for transport/decoder cleanup before retry');
 finishAbort();await pending;assert.equal(attempts,2);assert.equal(f.loader.pendingLoads.size,0);
});

test('unloading a world aborts in-flight assets and never retries canceled work',async()=>{
 let signal,attempts=0;
 const f=fixture(undefined,{loadGameModel:(loader,url,options)=>{attempts++;signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true}));}});
 const pending=f.loader.loadOne('/obsolete.glb',0,1);f.loader.unload();
 assert.equal(signal.aborted,true);await assert.rejects(pending,{name:'AbortError'});
 assert.equal(attempts,1);assert.equal(f.loader.pendingLoads.size,0);
});

test('starting a newer world aborts its obsolete model and preserves the newer installation',async()=>{
 let signal,attempts=0;
 const f=fixture(undefined,{loadGameModel:(loader,url,options)=>{attempts++;signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true}));}});
 const obsolete=f.loader.load({id:'obsolete',rotation:{},modelUrl:'/large.glb'});
 const current=await f.loader.load(environment('replacement'));
 assert.equal(signal.aborted,true);assert.equal(await obsolete,null);assert.equal(attempts,1);
 assert.equal(f.loader.world,current.world);assert.equal(current.world.parent,f.scene);
});
