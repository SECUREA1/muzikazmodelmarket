import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {ARCADE_PARTS,arcadeSettings,createArcadeSession,enterArcadeAttraction} from '../public/js/arcade-rules.js';
import {createArcadePark,createArcadePart,getArcadePartRuntime,animateArcadePart,animateArcadePark,updateArcadeParkPart} from '../public/js/arcade-park.js';

function dispose(root){root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material]){material?.map?.dispose();material?.dispose();}});}
const near=(actual,expected)=>assert.ok(actual.distanceTo(expected)<1e-7,`${actual.toArray()} vs ${expected.toArray()}`);

test('all built-in park groups and individual palette props have stable discoverable definitions',()=>{
 const ids=ARCADE_PARTS.map(part=>part.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['hockey','shooting','basketball','air-hockey','billiards','train','coaster','ground','paths','trees','lamps','fountain','benches','train-station','signs','tree','lamp','bench','path','sign','train-carriage','coaster-car'])assert.ok(ids.includes(id),id);
 for(const definition of ARCADE_PARTS){assert.ok(definition.name&&definition.label&&definition.category&&definition.description);assert.ok(/^#[0-9a-f]{6}$/i.test(definition.color));}
 const park=createArcadePark();try{assert.deepEqual(Object.keys(park.parts),ARCADE_PARTS.filter(part=>!part.placeableOnly).map(part=>part.id));for(const [id,root] of Object.entries(park.parts)){assert.equal(root.userData.arcadePart,id);assert.equal(root.parent,park.root);}assert.doesNotThrow(()=>JSON.stringify(park.root.userData));}finally{dispose(park.root);}
});

test('part transforms, tint and route dimensions survive normalization with bounded finite values',()=>{
 const raw={trainRadiusX:Infinity,trainRadiusZ:99,coasterWidth:1,coasterDepth:39,parts:{trees:{x:999,z:-999,rotation:999,scale:999,color:'#AABBCC',enabled:false}},placements:{hockey:{x:-2,z:3,rotation:45,scale:1.2,color:'#123456'}}};
 const config=arcadeSettings(raw);
 assert.equal(config.trainRadiusX,24);assert.equal(config.trainRadiusZ,23);assert.equal(config.coasterWidth,30);assert.equal(config.coasterDepth,39);
 assert.deepEqual(config.parts.trees,{enabled:false,x:50,z:-50,rotation:180,scale:1.75,color:'#aabbcc'});
 assert.deepEqual(config.placements.hockey,{x:-2,z:3,rotation:45,scale:1.2,color:'#123456'});
 assert.equal(config.parts.hockey.rotation,45);
 assert.deepEqual(arcadeSettings(config),config,'normalized settings can be saved and restored without drift');
 assert.equal(raw.parts.trees.x,999);
});

test('individual palette parts contain only the chosen assembly and expose interactive station metadata',()=>{
 for(const definition of ARCADE_PARTS){const root=createArcadePart(definition.id);try{assert.equal(root.userData.arcadePart,definition.id);assert.equal(root.position.length(),0);assert.ok(root.children.length>0||definition.id==='signs');if(definition.attraction){assert.equal(root.userData.arcadeAttraction,definition.attraction);assert.equal(root.userData.attractionId,definition.attraction);assert.equal(getArcadePartRuntime(root).clickMeshes.length,1);}if(definition.id==='bench')assert.equal(root.children.length,1);if(definition.id==='hockey')assert.equal(root.getObjectByName('ARCADE_TRAIN_ENGINE'),undefined);}finally{dispose(root);}}
 assert.throws(()=>createArcadePart('unknown'),/Unknown arcade part/);
});

test('builder-extracted attraction remains visible and active when its built-in original is disabled',()=>{
 const config={parts:{basketball:{enabled:false},train:{enabled:false}}};
 const session=createArcadeSession(config);assert.equal(enterArcadeAttraction(session,'basketball'),false);assert.equal(enterArcadeAttraction(session,'train'),false);
 for(const id of ['basketball','train']){const root=createArcadePart(id,{arcade:config});try{assert.equal(root.visible,true);assert.equal(getArcadePartRuntime(root).clickMeshes[0].userData.arcadeAttraction,id);}finally{dispose(root);}}
});

test('train and coaster camera curves follow transformed assemblies and saved builder ancestors',()=>{
 for(const id of ['train','coaster']){
  const ancestor=new T.Group();ancestor.position.set(8,2,-4);ancestor.rotation.set(.25,.8,-.3);ancestor.scale.setScalar(1.4);
  const root=createArcadePart(id,{x:-5,z:3,rotation:35,scale:1.2,arcade:{trainLapSeconds:20,coasterLapSeconds:15,trainRadiusX:30,coasterWidth:50}});ancestor.add(root);ancestor.updateMatrixWorld(true);
  try{
   const runtime=getArcadePartRuntime(root),curve=id==='train'?runtime.trainCurve:runtime.coaster;
   assert.ok(runtime.rideScale>1.6&&runtime.rideScale<1.7);
   near(runtime.rideUp,new T.Vector3(0,1,0).transformDirection(root.matrixWorld));
   assert.ok(Math.abs(runtime.rideUp.length()-1)<1e-8);
   const phase=animateArcadePart(root,5);
   const vehicle=id==='train'?runtime.trains[0]:runtime.cart;
   near(vehicle.getWorldPosition(new T.Vector3()),curve.getPointAt(id==='train'?phase.trainT:phase.coasterT));
   const before=curve.getPointAt(.25);ancestor.position.x+=4;ancestor.updateMatrixWorld(true);const after=curve.getPointAt(.25);assert.ok(Math.abs(after.x-before.x-4)<1e-8);
   const tangent=curve.getTangentAt(.25);assert.ok(Math.abs(tangent.length()-1)<1e-8);
   near(curve.getPointAt(0),curve.getPointAt(1));
  }finally{dispose(root);}
 }
});

test('built-in part customization preserves vehicle instances and keeps transformed track and vehicle together',()=>{
 const config={parts:{train:{x:4,z:2,rotation:30,scale:1.25},benches:{x:3,z:-2,color:'#ff0000',enabled:false}},placements:{basketball:{x:-4,z:5,rotation:90,scale:.7,color:'#0000ff'}}};
 const park=createArcadePark(config);try{
  const vehicle=park.trains[0];animateArcadePark(park.root,7);
  near(vehicle.getWorldPosition(new T.Vector3()),park.trainCurve.getPointAt(7/55));
  assert.equal(park.parts.benches.visible,false);
  assert.equal(park.parts.basketball.rotation.y,Math.PI/2);
  assert.equal(park.parts.basketball.position.x,-4);
  const changed=arcadeSettings(config);changed.parts.train.x=-7;changed.parts.train.rotation=-60;
  assert.equal(updateArcadeParkPart(park.root,'train',changed),true);
  animateArcadePark(park.root,7,changed);
  assert.equal(park.trains[0],vehicle);
  near(vehicle.getWorldPosition(new T.Vector3()),park.trainCurve.getPointAt(7/55));
  assert.equal(updateArcadeParkPart(park.root,'not-a-part',changed),false);
 }finally{dispose(park.root);}
});

test('all twelve equipment props have finite bounded mesh geometry and remain decorative',()=>{
 const ids=['basketball-hoop','basketball-ball','hockey-goal','hockey-puck','air-hockey-mallet','billiard-cue','billiard-balls','arcade-target','train-engine','rail-segment','coaster-support','safety-bar'];
 for(const id of ids){
  const definition=ARCADE_PARTS.find(part=>part.id===id);assert.equal(definition?.placeableOnly,true,id);
  const root=createArcadePart(id,{color:'#12abef'});try{
   let count=0;root.traverse(node=>{if(!node.isMesh)return;count++;const positions=node.geometry.attributes.position.array;assert.ok([...positions].every(Number.isFinite),id);assert.ok(node.material);});assert.ok(count>0,id);
   const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0&&value<8),id);
   assert.equal(root.userData.arcadeAttraction,undefined,id);assert.equal(getArcadePartRuntime(root).clickMeshes.length,0,id);
  }finally{dispose(root);}
 }
 for(const [station,equipmentId] of [['basketball','basketball-hoop'],['hockey','hockey-goal'],['shooting','arcade-target'],['air-hockey','air-hockey-mallet'],['billiards','billiard-cue']]){
  const root=createArcadePart(station);try{assert.ok(root.getObjectByName('ARCADE_EQUIPMENT_'+equipmentId.toUpperCase().replaceAll('-','_')),station);}finally{dispose(root);}
 }
});
