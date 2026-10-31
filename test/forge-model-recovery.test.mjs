import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {resolveRuntimeNativeModel} from '../public/js/runtime-native-model.js';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {FORGE_ITEMS} from '../public/js/forge-items.js';
import {createForgeModel} from '../public/js/forge-models.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';
import {nativeDesignThumbnail} from '../public/js/native-design-profile.js';

test('fresh forge station definitions load real models when the browser native catalogue is from an older deployment',async()=>{
 const oldCatalogue=id=>id==='material:cube'?new THREE.Group():null;
 for(const station of FORGE_STATIONS){
  const result=await resolveRuntimeNativeModel(station.modelId,{create:oldCatalogue});
  assert.ok(result?.isObject3D,station.name);assert.equal(result.userData.modelId,station.modelId);
  assert.equal(result.userData.nativeDesign.id,station.modelId);assert.equal(result.userData.forgeModel,true);
  assert.ok(!new THREE.Box3().setFromObject(result).isEmpty());disposeModelResources(result);
 }
});

test('fallback covers every forge item while unknown identities remain unavailable instead of becoming placeholders',async()=>{
 const loaded=[];
 for(const id of Object.keys(FORGE_ITEMS)){
  const result=await resolveRuntimeNativeModel(id,{create:()=>null,loadForgeModels:async()=>{loaded.push(id);return {createForgeModel};}});
  assert.ok(result?.isObject3D,id);disposeModelResources(result);
 }
 assert.equal(loaded.length,Object.keys(FORGE_ITEMS).length);
 assert.equal(await resolveRuntimeNativeModel('forge-not-a-real-item',{create:()=>null}),null);
 assert.equal(await resolveRuntimeNativeModel('missing-upload',{create:()=>null,loadForgeModels:()=>{throw Error('Unrelated imports must not be attempted');}}),null);
 const native=new THREE.Group();assert.equal(await resolveRuntimeNativeModel('forge-anvil',{create:()=>native,loadForgeModels:()=>{throw Error('Existing models must not be replaced');}}),native);
});

test('forge entry points version the engine and native catalogue so retry loads a current release',async()=>{
 const root=new URL('../',import.meta.url),version='forge-atelier-20261031',engineVersion='world-requests-20261031';
 for(const page of ['model-explorer.html','model-market.html','index.html'])assert.ok((await readFile(new URL(page,root),'utf8')).includes('rad-tox-launcher.js?v='+engineVersion),page);
 const launcher=await readFile(new URL('public/js/rad-tox-launcher.js',root),'utf8');assert.ok(launcher.includes('house-explorer-glb.js?v='+engineVersion));
 const engine=await readFile(new URL('public/js/house-explorer-glb.js',root),'utf8');assert.ok(engine.includes('builder-models-3d.js?v='+version));
 const worker=await readFile(new URL('service-worker.js',root),'utf8');assert.ok(worker.includes('v2.6.33-world-requests'));
 assert.equal(nativeDesignThumbnail('forge-stock-rack'),'/public/images/native-designs/forge-stock-rack.svg?v='+version);
 const modules=new URL('public/js/',root);
 for(const file of (await readdir(modules)).filter(name=>name.endsWith('.js'))){
  const source=await readFile(new URL(file,modules),'utf8');
  for(const match of source.matchAll(/\b(?:from\s*|import\s*\()(['"])(\.\/forge-[a-z-]+\.js(?:\?[^'"]*)?)\1/g))assert.ok([version,engineVersion].some(release=>match[2].includes('?v='+release)),file+' must import a current version of its forge dependency: '+match[2]);
 }
});
