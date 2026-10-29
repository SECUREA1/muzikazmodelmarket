import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createNativeModelCache,nativeModelCacheEligibility} from '../public/js/native-model-cache.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';
import {airportWorld} from '../airport-world.mjs';

function fixture(id='plain-prop'){
 const root=new THREE.Group();root.userData={nativeDesign:{version:'test',id},builderObject:true};
 const material=new THREE.MeshStandardMaterial({color:0x437a91}),geometry=new THREE.BoxGeometry(2,1,3);
 for(const x of [-2,2]){const node=new THREE.Mesh(geometry,material);node.position.x=x;node.userData.builderRoot=root;root.add(node);}
 return root;
}

test('private native templates share immutable geometry while every placement owns its nodes and paint',()=>{
 let template,calls=0;const cache=createNativeModelCache({create:id=>{calls++;return template=fixture(id);}});
 const first=cache.create('plain-prop'),second=cache.create('plain-prop');
 try{
  assert.equal(calls,1);assert.notEqual(first,template);assert.notEqual(second,template);assert.notEqual(first,second);
  assert.notEqual(first.children[0],second.children[0]);assert.equal(first.children[0].geometry,second.children[0].geometry);assert.equal(first.children[0].geometry,template.children[0].geometry);
  assert.equal(first.children[0].material,first.children[1].material,'authored palette aliases remain local to a placement');assert.notEqual(first.children[0].material,second.children[0].material);assert.notEqual(first.children[0].material,template.children[0].material);
  assert.equal(first.children[0].userData.builderRoot,first);assert.equal(second.children[0].userData.builderRoot,second);
  first.children[0].material.color.setHex(0xff0000);first.children[0].position.x=20;assert.equal(second.children[0].material.color.getHex(),0x437a91);assert.equal(template.children[0].material.color.getHex(),0x437a91);assert.equal(second.children[0].position.x,-2);
  assert.deepEqual(cache.stats(),{requests:2,factoryCalls:1,cacheHits:1,clonedInstances:2,bypassed:0,templates:1,excluded:{}});
 }finally{cache.clear();const all=new THREE.Group();all.add(first,second);disposeModelResources(all);}
});

test('template teardown releases only private materials and bulk scene teardown disposes shared geometry once',()=>{
 let template;const cache=createNativeModelCache({create:id=>template=fixture(id)}),first=cache.create('plain-prop'),second=cache.create('plain-prop');
 let templateMaterials=0,geometry=0,instanceMaterials=0;template.children[0].material.addEventListener('dispose',()=>templateMaterials++);template.children[0].geometry.addEventListener('dispose',()=>geometry++);first.children[0].material.addEventListener('dispose',()=>instanceMaterials++);
 cache.clear();cache.clear();assert.equal(templateMaterials,1);assert.equal(geometry,0,'live placements retain the shared geometry');assert.equal(instanceMaterials,0,'live placement paint remains usable');
 const scene=new THREE.Group();scene.add(first,second);disposeModelResources(scene);assert.equal(geometry,1,'the world disposer deduplicates shared geometry');assert.equal(instanceMaterials,1);assert.equal(cache.stats().templates,0);
});

test('cached static instance batches own their transform buffers',()=>{
 const cache=createNativeModelCache({create:id=>{const root=fixture(id);root.clear();const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,0,0));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0));root.add(instances);return root;}}),a=cache.create('plain-batch'),b=cache.create('plain-batch');
 try{assert.notEqual(a.children[0].instanceMatrix,b.children[0].instanceMatrix);a.children[0].setMatrixAt(0,new THREE.Matrix4().makeTranslation(50,0,0));const matrix=new THREE.Matrix4();b.children[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[12],1);assert.equal(a.children[0].geometry,b.children[0].geometry);}finally{cache.clear();const all=new THREE.Group();all.add(a,b);disposeModelResources(all);}
});

test('closures, runtime rigs, media, characters and imported resources keep fresh factory ownership',()=>{
 const cases=[
  root=>{root.userData.update=()=>root;},root=>{root.children[0].userData.state={nested:{update:()=>root}};},
  root=>{root.userData.state=new THREE.Vector3();},root=>{root.userData.state=new Map();},root=>{root.userData.unknownRig={mesh:root.children[0]};},
  root=>{root.userData.aircraftModel=true;root.userData.aircraftRig={propeller:root.children[0]};},root=>{root.userData.craftedCharacterModel=true;},root=>{root.userData.proceduralLand=true;},
  root=>{root.children[0].userData.mediaScreen=true;},root=>{root.children[0].material.map=new THREE.Texture();},
  root=>{root.children[0].onBeforeRender=()=>{};},root=>{root.children[0].material.onBeforeCompile=()=>{};},
  root=>{root.children[0].geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);},root=>{root.children[0].isSkinnedMesh=true;},
  root=>{root.userData.state={};root.userData.state.self=root.userData.state;},root=>{root.userData.state=Infinity;},root=>{root.userData[Symbol('state')]=1;},
  root=>{Object.defineProperty(root.children[0].userData,'mediaScreen',{get(){throw new Error('Caching must not invoke runtime accessors.');}});}
 ];
 for(const alter of cases){let calls=0;const cache=createNativeModelCache({create:id=>{calls++;const root=fixture(id);alter(root);return root;}}),a=cache.create('plain-prop'),b=cache.create('plain-prop');try{assert.equal(calls,2);assert.notEqual(a,b);assert.notEqual(a.children[0].geometry,b.children[0].geometry);assert.equal(cache.stats().templates,0);}finally{cache.clear();disposeModelResources(a);disposeModelResources(b);}}
 let calls=0;const cache=createNativeModelCache({create:id=>{calls++;return fixture(id);}});for(const id of ['scene-mountain-pass','layout:mountain-pass','uploaded:model','forest-ranger']){const a=cache.create(id),b=cache.create(id);disposeModelResources(a);disposeModelResources(b);}assert.equal(calls,8);cache.clear();
});

test('factory options bypass template reuse and actual aircraft keep independent live rig references',()=>{
 let calls=0;const cache=createNativeModelCache({create:(id,options)=>{calls++;const root=fixture(id);root.userData.option=options?.tone;return root;}}),a=cache.create('plain-prop',{tone:'red'}),b=cache.create('plain-prop',{tone:'red'}),c=cache.create('plain-prop',{tone:'blue'});assert.equal(calls,3);assert.equal(a.userData.option,'red');assert.equal(c.userData.option,'blue');for(const root of [a,b,c])disposeModelResources(root);cache.clear();
 const aircraft=createNativeModelCache({create:createBuilderModel}),first=aircraft.create('corsair-aircraft'),second=aircraft.create('corsair-aircraft');try{assert.notEqual(first.userData.aircraftRig.propeller,second.userData.aircraftRig.propeller);assert.equal(first.getObjectByName('FOUR_BLADE_PROPELLER'),first.userData.aircraftRig.propeller);assert.equal(aircraft.stats().templates,0);}finally{aircraft.clear();disposeModelResources(first);disposeModelResources(second);}
});

test('native scenery copies retain their data-driven animation state and the airport reuses repeated factory work',()=>{
 const cache=createNativeModelCache({create:createBuilderModel}),first=cache.create('pine-tree'),second=cache.create('pine-tree'),group=new THREE.Group();group.add(first,second);updateBuilderModels(group,1.25);
 assert.deepEqual(new THREE.Box3().setFromObject(first,true).min.toArray(),new THREE.Box3().setFromObject(second,true).min.toArray());assert.equal(cache.stats().factoryCalls,1);cache.clear();disposeModelResources(group);
 const calls=new Map(),airport=createNativeModelCache({create:id=>{calls.set(id,(calls.get(id)||0)+1);return createBuilderModel(id);}}),scene=new THREE.Group();
 try{for(const item of airportWorld().builderScene.objects)scene.add(airport.create(item.asset?.buildAssetId||item.modelId));const stats=airport.stats();assert.equal(stats.requests,airportWorld().builderScene.objects.length);assert.equal(stats.factoryCalls,new Set(airportWorld().builderScene.objects.map(item=>item.asset?.buildAssetId||item.modelId)).size,'repeated scenery constructs each factory ID only once');assert.ok(stats.cacheHits>900);assert.equal(calls.get('path-tile'),1);assert.equal(calls.get('pine-tree'),1);assert.equal(calls.get('material:baseplate'),1);assert.equal(nativeModelCacheEligibility(scene.children[0],'material:rubber-tile').eligible,true);}finally{airport.clear();disposeModelResources(scene);}
});
