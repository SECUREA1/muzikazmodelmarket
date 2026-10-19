import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {populateWorldPreviewContent} from '../public/js/world-preview-scene.js';
import {worldPreviewData} from '../public/js/world-preview-data.js';

const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
const mesh=(width=2,height=2,depth=2)=>new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshBasicMaterial());
const placement={id:'sofa',modelId:'sofa',position:{x:4,y:3,z:-6},rotation:{x:0,y:.2,z:0},scale:{x:1.5,y:2,z:1}};

test('complete authored house loads every floor and keeps placed objects outside its transformed base',async()=>{
 const base=records.find(record=>record.id==='muzikaz-full-house'),world={id:'saved-house',builderScene:{layout:'repository-'+base.id,baseEnvironment:base,baseTransform:{x:9,z:12,rotation:90,scale:2},objects:[placement]}};
 const calls=[],content=new THREE.Group();
 const built=await populateWorldPreviewContent(content,THREE,world,{loadModel:async url=>{calls.push(url);return mesh();},createBuilderModel:()=>mesh(),createBuilderLand:()=>{throw Error('Authored house replaced by terrain');}});
 assert.deepEqual(calls,base.modelUrls);
 assert.equal(built.base.children.length,2);
 assert.equal(built.overlays.children.length,1);
 const object=built.overlays.children[0];
 assert.equal(built.base.position.x,9);assert.equal(built.base.position.z,12);
 assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(),[4,3,-6]);
 assert.deepEqual(object.getWorldScale(new THREE.Vector3()).toArray(),[1.5,2,1]);
});

test('saved priority sports bases retain their actual layout plus placed models',async()=>{
 for(const id of ['basketball-arena','hockey-arena','firing-range','force-training-range']){
  const base=records.find(record=>record.id===id),world={id:'saved-'+id,builderScene:{layout:'repository-'+id,baseEnvironment:base,baseTransform:{x:5,rotation:45},objects:[placement]}},seen=[];
  const data=worldPreviewData(world);assert.equal(data.base,base,id);assert.equal(data.procedural,true,id);assert.deepEqual(data.models,[],id);
  const built=await populateWorldPreviewContent(new THREE.Group(),THREE,world,{loadModel:async()=>{throw Error('Procedural base requested a GLB');},createBuilderLand:environment=>{seen.push(environment);return mesh(20,1,20);},createBuilderModel:()=>mesh()});
  assert.deepEqual(seen,[base],id);
  assert.equal(built.base.position.x,5,id);
  assert.equal(built.overlays.children.length,1,id);
  assert.deepEqual(built.overlays.children[0].getWorldPosition(new THREE.Vector3()).toArray(),[4,3,-6],id);
 }
});

test('authored placed GLBs keep their target height and saved world position',async()=>{
 const base=records.find(record=>record.id==='hockey-arena'),world={id:'saved-props',builderScene:{baseEnvironment:base,objects:[{...placement,modelId:'imported',scale:{x:1,y:1,z:1}}],placedModels:[{id:'imported',modelUrl:'/exact-prop.glb',targetHeight:4}]}},calls=[];
 const built=await populateWorldPreviewContent(new THREE.Group(),THREE,world,{loadModel:async url=>{calls.push(url);return mesh();},createBuilderLand:()=>mesh(),createBuilderModel:()=>null});
 assert.deepEqual(calls,['/exact-prop.glb']);
 const bounds=new THREE.Box3().setFromObject(built.overlays);
 assert.ok(Math.abs(bounds.min.y-3)<1e-9);
 assert.ok(Math.abs(bounds.max.y-7)<1e-9);
 assert.equal(built.overlays.children[0].position.x,4);
});
