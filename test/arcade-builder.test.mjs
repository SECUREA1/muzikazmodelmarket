import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ARCADE_PARTS} from '../public/js/arcade-rules.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {getArcadePartRuntime} from '../public/js/arcade-park.js';

function dispose(root){root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material]){material?.map?.dispose();material?.dispose();}});}

test('every Neon Junction kit item is deposited in the Backpack and builds real selectable geometry',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8'));
 assert.equal(ARCADE_PARTS.length,34);
 for(const part of ARCADE_PARTS){
  const id=`arcade-part-${part.id}`,record=manifest.assets.find(item=>item.buildAssetId===id);
  assert.ok(record,`${id} is available to the shared Backpack`);
  assert.equal(record.visibility,'public');assert.equal(record.builderCategory,'arcade');
  const root=createBuilderModel(id);let meshes=0;
  assert.equal(root.userData.arcadePart,part.id);assert.equal(root.userData.builderObject,true);
  root.traverse(node=>{if(node.isMesh){meshes++;assert.equal(node.userData.builderRoot,root);}});
  assert.ok(meshes>0,`${id} has a 3D assembly`);
  if(part.attraction){assert.equal(root.userData.attractionId,part.id);assert.equal(record.function_data.action,'arcade');assert.equal(record.function_data.value,part.id);}
  assert.doesNotThrow(()=>JSON.stringify(root.userData),`${id} metadata is serializable`);dispose(root);
 }
 assert.equal(createBuilderModel('arcade-part-missing'),null);
});

test('separately placed train assemblies retain separate animation contexts and transformed ride paths',()=>{
 const group=new THREE.Group(),first=createBuilderModel('arcade-part-train'),second=createBuilderModel('arcade-part-train',{arcade:{trainRadiusX:30,trainRadiusZ:20}});
 group.add(first,second);second.position.set(9,2,-7);second.rotation.y=Math.PI/3;second.scale.setScalar(.7);group.updateMatrixWorld(true);
 const a=getArcadePartRuntime(first),b=getArcadePartRuntime(second);assert.notEqual(a.trains[0],b.trains[0]);
 updateBuilderModels(group,0);const start=a.trains[0].position.clone();updateBuilderModels(group,10);
 assert.ok(a.trains[0].position.distanceTo(start)>1,'palette train moves after placement');
 const ridePoint=b.trainCurve.getPointAt(.3),expected=second.localToWorld(b.localTrainCurve.getPointAt(.3));
 assert.ok(ridePoint.distanceTo(expected)<1e-8,'camera route follows the placed model transform');
 const previous=a.trains[0].position.clone();first.userData.arcadeAnimationEnabled=false;updateBuilderModels(group,20);
 assert.ok(a.trains[0].position.distanceTo(previous)<1e-8,'builder animation switch pauses the ride');
 dispose(first);dispose(second);
});

test('placed coaster receives saved route height and dimensions instead of resetting to default',()=>{
 const custom=createBuilderModel('arcade-part-coaster',{arcade:{coasterPeak:20,coasterWidth:55,coasterDepth:35}}),standard=createBuilderModel('arcade-part-coaster');
 const customCurve=getArcadePartRuntime(custom).coaster,standardCurve=getArcadePartRuntime(standard).coaster;
 const points=Array.from({length:101},(_,i)=>customCurve.getPointAt(i/100)),defaults=Array.from({length:101},(_,i)=>standardCurve.getPointAt(i/100));
 assert.ok(Math.max(...points.map(p=>p.y))>Math.max(...defaults.map(p=>p.y))+4);
 assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>45);
 dispose(custom);dispose(standard);
});

test('builder publishes full customization controls and can reopen an existing arcade map',async()=>{
 const [html,source]=await Promise.all(['environment-builder.html','environment-builder.js'].map(file=>readFile(new URL(`../${file}`,import.meta.url),'utf8')));
 assert.match(html,/id="arcade-part-list"/);assert.match(html,/data-library-filter="arcade"/);
 for(const name of ['trainRadiusX','trainRadiusZ','coasterWidth','coasterDepth'])assert.match(html,new RegExp(`name="${name}"`));
 assert.match(source,/async function importPublishedEnvironment/);assert.match(source,/sourceEnvironmentId:id/);
 assert.match(source,/data-arcade-extract/);assert.match(source,/object\.arcadeSettings=config/);
 assert.match(source,/updateArcadeParkPart\(park,id,config\)/);
});
