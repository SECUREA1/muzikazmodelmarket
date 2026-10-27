import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {updateConstructionModel} from '../public/js/construction-models.js';
import {getArcadePartRuntime,animateArcadePart} from '../public/js/arcade-park.js';
import {createVehicleDesignKit} from '../public/js/vehicle-design-kit.js';
import {VEHICLE_INDUSTRIAL_DESIGN_IDS,finishVehicleIndustrialDesign} from '../public/js/vehicle-industrial-design.js';

function originalBounds(root){
 const result=new T.Box3(),point=new T.Vector3(),instance=new T.Matrix4(),matrix=new T.Matrix4();root.updateMatrixWorld(true);
 root.traverse(node=>{
  if(!node.isMesh||node.userData.vehicleDesignDetail)return;
  const positions=node.geometry?.attributes.position;if(!positions)return;
  for(let instanceId=0;instanceId<(node.isInstancedMesh?node.count:1);instanceId++){
   if(node.isInstancedMesh){node.getMatrixAt(instanceId,instance);matrix.multiplyMatrices(node.matrixWorld,instance);}else matrix.copy(node.matrixWorld);
   for(let i=0;i<positions.count;i++)result.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(matrix));
  }
 });
 return result;
}
function dispose(root){
 const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource.dispose();
}

test('all fifteen industrial, service and ride vehicles receive visible bounded bodywork',()=>{
 assert.equal(VEHICLE_INDUSTRIAL_DESIGN_IDS.length,15);
 for(const id of VEHICLE_INDUSTRIAL_DESIGN_IDS){
  const root=createBuilderModel(id);
  try{
   let hasFinish=false;root.traverse(node=>{if(node.userData.vehicleIndustrialDesign==='crafted-industrial-vehicles-1')hasFinish=true;});assert.ok(hasFinish,id+' contains its finished native assembly');
   assert.equal(root.userData.vehicleDesign.family,'industrial-rides',id);
   assert.ok(root.userData.vehicleDesign.detailMeshes>0&&root.userData.vehicleDesign.detailMeshes<=96,id+' has a bounded cosmetic mesh budget');
   const authored=originalBounds(root),finished=new T.Box3().setFromObject(root,true);
   for(const axis of ['x','y','z']){
    assert.ok(Math.abs(finished.min[axis]-authored.min[axis])<=1e-5,id+' retains minimum '+axis);
    assert.ok(Math.abs(finished.max[axis]-authored.max[axis])<=1e-5,id+' retains maximum '+axis);
   }
   root.traverse(node=>{
    if(node.userData.vehicleDesignDetail){assert.equal(node.userData.collisionDisabled,true,id+' decoration does not add collision');assert.equal(node.userData.collider,false);assert.equal(node.userData.builderRoot,root);}
    if(node.isMesh)assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),id+' has finite bodywork');
   });
   if(['arcade-part-train-engine','arcade-part-train-carriage','arcade-part-coaster-car'].includes(id)){
    assert.ok(root.userData.vehicleDesign.meshCount<=32,id+' retains handheld ride-part draw budget');
    assert.ok(root.userData.vehicleDesign.triangles<=6000,id+' retains ride-part triangle budget');
   }
   let oldCount=0;root.traverse(node=>{if(node.isMesh)oldCount++;});
   const kit=createVehicleDesignKit(T,root,id);finishVehicleIndustrialDesign(T,root,id,kit);assert.equal(kit.stats().detailMeshes,0,id+' repeated finishing adds no duplicate bodywork');
   let count=0;root.traverse(node=>{if(node.isMesh)count++;});assert.equal(count,oldCount);
  }finally{dispose(root);}
 }
});

test('industrial graphics follow original articulated and ride assemblies',()=>{
 for(const id of ['site-dumptruck','site-bulldozer','site-excavator','tower-crane']){
  const root=createBuilderModel(id);
  try{
   const parts=root.userData.constructionParts,original=parts,idBefore=root.userData.modelId;
   root.userData.construction={bed:.65,blade:.7,boom:1,stick:-.9,bucket:.3,slew:.7,trolley:26,hoist:32};
   assert.doesNotThrow(()=>updateConstructionModel(root,3));assert.equal(root.userData.constructionParts,original);assert.equal(root.userData.modelId,idBefore);
   for(const ram of parts.hydraulics)assert.ok(ram.body.scale.y>0&&ram.rod.scale.y>0,id+' retains hydraulic references');
   if(id==='site-dumptruck')assert.ok(parts.bed.getObjectByName('HAULER_RAISED_SIDE_LIVERY'));
   if(id==='site-excavator')assert.ok(parts.boom.getObjectByName('EXCAVATOR_BOOM_DIVISION_STRIPES'));
  }finally{dispose(root);}
 }
 for(const id of ['arcade-part-train','arcade-part-coaster']){
  const root=createBuilderModel(id);
  try{
   const runtime=getArcadePartRuntime(root),vehicle=id.endsWith('train')?runtime.trains[0]:runtime.cart,position=vehicle.position.clone();
   animateArcadePart(root,12);assert.ok(!vehicle.position.equals(position),id+' keeps its native moving vehicle');
   let parts=0;vehicle.traverse(node=>{if(node.userData.vehicleDesignDetail)parts++;});assert.ok(parts>0,id+' graphics travel with the ride');
  }finally{dispose(root);}
 }
});

test('ride bodywork has a locomotive face, supported passenger canopy and racing-car graphics',()=>{
 const requirements={
  'arcade-part-train-engine':['PARK_TRAIN_CIRCULAR_SMOKEBOX','PARK_TRAIN_SMOKEBOX_RIM','PARK_TRAIN_FRONT_HEADLAMP','PARK_TRAIN_CAB_WINDOWS','PARK_TRAIN_FORMED_CAB_ROOF'],
  'arcade-part-train-carriage':['PARK_TRAIN_TWO_TONE_COACH_APRON','PARK_TRAIN_PASSENGER_CANOPY_JOINERY','PARK_TRAIN_PASSENGER_END_APRON'],
  'arcade-part-coaster-car':['COASTER_SWEPT_RACING_NOSE_APRON','COASTER_FRONT_RACING_CHEVRON','COASTER_FRONT_HEADLAMP']
 };
 for(const [id,names]of Object.entries(requirements)){
  const root=createBuilderModel(id);
  try{
   for(const name of names){const part=root.getObjectByName(name);assert.ok(part,id+' includes '+name);assert.equal(part.material.depthTest,true,id+' graphics respect nearer scenery');}
   if(id==='arcade-part-train-engine')assert.ok(root.getObjectByName('PARK_TRAIN_FRONT_HEADLAMP').renderOrder>root.getObjectByName('PARK_TRAIN_CIRCULAR_SMOKEBOX').renderOrder,'front inlays have an explicit stable layer order');
  }finally{dispose(root);}
 }
});
