import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {clone as cloneGameSkeleton} from '../public/vendor/three/addons/utils/SkeletonUtils.js';
import {prepareGameItems} from '../public/js/game-load-work.js';
import {disposeGameModel} from '../public/js/game-model-loader.js';
import {createNativeModelCache} from '../public/js/native-model-cache.js';
import {resolveRuntimeNativeModel} from '../public/js/runtime-native-model.js';

const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const functionSource=source.slice(source.indexOf('  async function loadBuilderDecor('),source.indexOf('\n\n  const avatarLoader'));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const model=()=>{const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));return {scene,animations:[]};};

function fixture(load){
  const decor=new THREE.Group(),calls=[],progress=[],collisions=[];
  const context=vm.createContext({
    THREE,cloneGameSkeleton,disposeGameModel,createNativeModelCache,resolveRuntimeNativeModel,worldLoadGeneration:1,builderDecor:decor,prepareGameItems,
    AbortController,builderDecorLoad:null,loadGameModel:(loader,url,options)=>loader.loadAsync(url,options),
    serverHostedRoom:false,console,clearBuilderDecor(){context.builderDecorLoad?.abort();context.builderDecorLoad=null;decor.clear();},
    envLoader:{bounds:new THREE.Box3(new THREE.Vector3(-10,0,-10),new THREE.Vector3(10,2,10)),setSupplementalCollisionRoots(roots){collisions.push({roots,count:decor.children.length});}},
    compileBuilderScene:built=>({objects:built.objects,spawn:null}),
    BuilderGameplayRuntime:class{interact(){}},
    createBuilderModel:id=>id==='native'?model().scene:null,createSavedCustomModel:()=>null,
    avatarLoader:{loadAsync(url,options){calls.push(url);return load(url,options);}},
    prepareAuthoredBuilderModel:root=>root,
    applyBuilderObject(root,item,index){root.userData.builderObjectId=item.id;root.children[0].material.color.setHex(index?0x00ff00:0xff0000);decor.add(root);},
    updateLevelLoader:(value,text)=>progress.push({value,text}),setStatus(){},
  });
  vm.runInContext(functionSource+';globalThis.populate=loadBuilderDecor;',context);
  return {context,decor,calls,progress,collisions,load:scene=>context.populate({id:'world',builderScene:scene})};
}
const scene=(count=1)=>({objects:Array.from({length:count},(_,index)=>({id:'placed-'+index,modelId:'uploaded'})),placedModels:[{id:'uploaded',name:'Advanced ship',modelUrl:'/uploads/models/ship.glb'}]});

test('game startup waits for authored model population and collision before reporting ready',async()=>{
  const gate=defer(),f=fixture(()=>gate.promise);let ready=false;
  const loading=f.load(scene()).then(result=>{ready=true;return result;});
  await Promise.resolve();await Promise.resolve();
  assert.equal(ready,false);assert.equal(f.decor.children.length,0);assert.equal(f.progress.length,0);
  gate.resolve(model());await loading;
  assert.equal(f.decor.children.length,1);assert.equal(f.collisions.at(-1).count,1);
  assert.equal(f.progress.at(-1).value,95);
});

test('repeated authored placements load once and retain independent materials and transforms',async()=>{
  const template=model(),f=fixture(async()=>template);await f.load(scene(3));
  assert.deepEqual(f.calls,['/uploads/models/ship.glb']);assert.equal(f.decor.children.length,3);
  const [first,second]=f.decor.children;
  assert.notEqual(first,second);assert.notEqual(first,template.scene);
  assert.equal(first.children[0].geometry,second.children[0].geometry);
  assert.notEqual(first.children[0].material,second.children[0].material);
  assert.equal(first.children[0].material.color.getHex(),0xff0000);
  assert.equal(second.children[0].material.color.getHex(),0x00ff00);
  assert.equal(template.scene.children[0].material.color.getHex(),0xffffff);
});

test('a canceled world cannot install a late model or clear its replacement world',async()=>{
  const gate=defer(),f=fixture(()=>gate.promise),template=model();let disposals=0;
  template.scene.children[0].geometry.addEventListener('dispose',()=>disposals++);
  const loading=f.load(scene());await Promise.resolve();
  f.context.worldLoadGeneration++;const replacement=model().scene;f.decor.add(replacement);
  gate.resolve(template);assert.equal(await loading,null);
  assert.deepEqual(f.decor.children,[replacement]);assert.equal(disposals,1);assert.equal(f.collisions.length,0);
});

test('failed authored models surface item context and discard partially prepared objects for retry',async()=>{
  const f=fixture(async()=>{throw Object.assign(Error('Service unavailable'),{status:503,code:'MODEL_ASSET_REQUEST_FAILED'});});
  const built=scene();built.objects.unshift({id:'native-first',modelId:'native'});
  await assert.rejects(f.load(built),{message:'Unable to load Advanced ship: Service unavailable',status:503,code:'MODEL_ASSET_REQUEST_FAILED'});
  assert.equal(f.decor.children.length,0);assert.equal(f.collisions.length,0);
});

test('starting a replacement world aborts the obsolete authored download without polling',async()=>{
  let oldSignal;
  const f=fixture((url,{signal})=>{
    if(url.includes('new.glb'))return Promise.resolve(model());
    oldSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true}));
  });
  const obsolete=f.load(scene());await new Promise(resolve=>setImmediate(resolve));assert.ok(oldSignal,'the obsolete model request has started before replacing it');
  f.context.worldLoadGeneration++;
  const next=scene();next.placedModels[0].modelUrl='/uploads/models/new.glb';
  const current=await f.load(next);
  assert.equal(oldSignal.aborted,true);assert.equal(await obsolete,null);
  assert.ok(current);assert.equal(f.decor.children.length,1);
});

test('missing saved authored definitions fail explicitly instead of opening a world with holes',async()=>{
  const f=fixture(async()=>model());
  await assert.rejects(f.load({objects:[{id:'missing',modelId:'missing-model'}]}),/missing-model.*saved 3D model definition/);
  assert.equal(f.decor.children.length,0);
});
