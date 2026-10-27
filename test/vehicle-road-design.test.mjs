import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {ROAD_VEHICLES,roadVehicleType} from '../public/js/road-vehicles.js';
import {createVehicleDesignKit} from '../public/js/vehicle-design-kit.js';
import {VEHICLE_ROAD_DESIGN_IDS,finishVehicleRoadDesign} from '../public/js/vehicle-road-design.js';
import {placementBounds} from '../public/js/placed-item-collision.js';

// Run the real authoring factory with the finishing hook replaced by identity,
// so the test compares with its actual pre-upgrade envelope and rig references.
const roadSource=(await readFile(new URL('../public/js/road-vehicle-models.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
const rawRoad=new Function('T','ROAD_VEHICLES','roadVehicleType','updateFreightVisual','finishVehicleDesign',roadSource+'\nreturn {createRoadVehicle,updateRoadVehicle};')(T,ROAD_VEHICLES,roadVehicleType,()=>{},(_,root)=>root);
const builderSource=await readFile(new URL('../public/js/builder-models-3d.js',import.meta.url),'utf8'),quadStart=builderSource.indexOf('const material = '),quadEnd=builderSource.indexOf('// Vertex RGB',quadStart);
assert.ok(quadStart>0&&quadEnd>quadStart);
const rawQuad=new Function('THREE',builderSource.slice(quadStart,quadEnd)+'\nreturn vehicle;')(T);
const createRaw=id=>id==='dune-quad'?rawQuad(id):rawRoad.createRoadVehicle(id);
const pose=node=>[...node.position,...node.quaternion,...node.scale];
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource.dispose();}

test('every road vehicle gains substantial fitted geometry within its original precise envelope',()=>{
 assert.deepEqual([...VEHICLE_ROAD_DESIGN_IDS].sort(),[...Object.entries(ROAD_VEHICLES).filter(([,c])=>!c.siteOnly).map(([id])=>id),'dune-quad'].sort());
 assert.ok(Object.isFrozen(VEHICLE_ROAD_DESIGN_IDS));
 for(const id of VEHICLE_ROAD_DESIGN_IDS){
  const root=createRaw(id),bounds=new T.Box3().setFromObject(root,true),vehicle=structuredClone(root.userData.vehicle),transform=pose(root),kit=createVehicleDesignKit(T,root,id);
  const original=[];root.traverse(node=>{if(node.isMesh)original.push({node,parent:node.parent,material:node.material,pose:pose(node)});});
  try{
   assert.equal(finishVehicleRoadDesign(T,root,id,kit),root);root.updateMatrixWorld(true);
   const finished=new T.Box3().setFromObject(root,true);
   for(const axis of ['x','y','z']){assert.ok(Math.abs(bounds.min[axis]-finished.min[axis])<1e-6,id+' minimum '+axis);assert.ok(Math.abs(bounds.max[axis]-finished.max[axis])<1e-6,id+' maximum '+axis);}
   assert.deepEqual(root.userData.vehicle,vehicle);assert.deepEqual(pose(root),transform);
   for(const record of original){assert.equal(record.node.parent,record.parent);assert.equal(record.node.material,record.material);assert.deepEqual(pose(record.node),record.pose);}
   let count=0,triangles=0,lights=0;
   root.traverse(node=>{
    if(node.isLight)lights++;if(!node.userData.vehicleDesignDetail)return;
    assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.collider,false);assert.equal(node.userData.builderRoot,root);
    if(!node.isMesh)return;count++;const vertices=node.geometry.getAttribute('position');assert.ok([...vertices.array].every(Number.isFinite),id+' finite geometry');assert.ok(node.geometry.getAttribute('uv'),id+' textured surface coordinates');
    triangles+=(node.geometry.index?.count||vertices.count)/3*(node.isInstancedMesh?node.count:1);
   });
   assert.ok(count>=20&&count<=96,id+' meaningful, bounded mesh budget');assert.ok(triangles<12000,id+' detail triangle budget');assert.equal(lights,0,id+' adds no lights');assert.equal(kit.stats().rejectedDetails,0,id+' every intended detail fits');
  }finally{dispose(root);}
 }
});

test('road treads and brake detail follow original moving wheels while lights and steering retain their controls',()=>{
 for(const id of VEHICLE_ROAD_DESIGN_IDS.filter(id=>id!=='dune-quad')){
  const root=createRaw(id),kit=createVehicleDesignKit(T,root,id),wheels=root.children.filter(node=>node.userData.roadWheel),dashboard=root.getObjectByName('ROAD_DIGITAL_DASHBOARD'),lights=root.children.filter(node=>node.userData.roadLight),lightMaterials=lights.map(node=>node.material);
  try{
   finishVehicleRoadDesign(T,root,id,kit);assert.equal(root.getObjectByName('ROAD_DIGITAL_DASHBOARD'),dashboard);
   for(const wheel of wheels){
    const tread=wheel.getObjectByName('CRAFTED_CHEVRON_SHOULDER_TREAD');assert.ok(tread,id+' actual rolling tread');assert.equal(tread.parent,wheel);
    const rotor=wheel.getObjectByName('CRAFTED_VENTILATED_BRAKE_ROTOR');assert.ok(rotor);assert.equal(rotor.parent,wheel);
    assert.equal(wheel.children.find(node=>node.geometry?.name==='CRAFTED_ROUNDED_ROAD_TYRE').geometry.type,'LatheGeometry');
   }
   root.userData.driving={distance:.91,steering:.4,lights:false};rawRoad.updateRoadVehicle(root,3);
   for(const wheel of wheels)assert.equal(wheel.rotation.x,.91/.35);
   lights.forEach((node,index)=>{assert.equal(node.material,lightMaterials[index]);assert.equal(node.material.emissiveIntensity,.05);});
   const steering=root.children.find(node=>node.userData.roadSteering);if(steering)assert.equal(steering.rotation.z,-.2);
  }finally{dispose(root);}
 }
});

test('coachwork, motorcycle tank and dune frame receive distinct authored shapes without replacing screens or glazing',()=>{
 for(const id of VEHICLE_ROAD_DESIGN_IDS){
  const root=createRaw(id),kit=createVehicleDesignKit(T,root,id),protectedMeshes=[];
  root.traverse(node=>{if(node.isMesh&&(node.material?.transparent||/DASHBOARD/.test(node.name)))protectedMeshes.push([node,node.geometry,node.material]);});
  try{
   finishVehicleRoadDesign(T,root,id,kit);for(const [node,geometry,material]of protectedMeshes){assert.equal(node.geometry,geometry);assert.equal(node.material,material);}
   if(id==='dune-quad'){
    assert.ok(root.getObjectByName('CRAFTED_DUNE_QUAD_INSET_FRAME_PANEL'));for(const wheel of root.children.filter(node=>node.userData.vehicleWheel)){assert.ok(wheel.getObjectByName('CRAFTED_DUNE_ALL_TERRAIN_TREAD'));assert.ok(wheel.getObjectByName('CRAFTED_DUNE_BEADLOCK_RIM'));}
   }else if(id==='touring-motorcycle'){
    assert.ok(kit.source.some(node=>node.geometry?.name==='CRAFTED_SCULPTED_MOTORCYCLE_TANK'));assert.equal(root.children.filter(node=>node.name==='CRAFTED_MOTORCYCLE_MUDGUARD').length,2);
   }else assert.ok(kit.source.some(node=>node.geometry?.name==='CRAFTED_SCULPTED_COACHWORK'));
  }finally{dispose(root);}
 }
});

test('the dune quad has upright rolling wheels and transverse axles within its published collision footprint',async()=>{
 const {createBuilderModel,updateBuilderModels}=await import('../public/js/builder-models-3d.js'),root=createBuilderModel('dune-quad'),collection=new T.Group();collection.add(root);
 try{
  const wheels=root.children.filter(node=>node.userData.vehicleWheel);assert.equal(wheels.length,4);
  for(const wheel of wheels){
   assert.equal(wheel.geometry.parameters.radius,.28);assert.equal(wheel.geometry.parameters.tube,.14);assert.equal(wheel.rotation.x,0);assert.equal(wheel.rotation.y,0);
   assert.ok(Math.abs(Math.abs(wheel.position.x)-1.11)<1e-8);assert.equal(wheel.position.y,.63);assert.equal(Math.abs(wheel.position.z),.96);
   const size=new T.Box3().setFromObject(wheel,true).getSize(new T.Vector3());assert.ok(size.y>.83&&size.y<.85,'the tire stands vertically');assert.ok(size.z>.27&&size.z<.29,'the tire has an axle thickness, not a horizontal donut footprint');
  }
  const axles=root.children.filter(node=>node.name==='DUNE_QUAD_TRANSVERSE_AXLE');assert.equal(axles.length,2);
  for(const axle of axles){const axis=new T.Vector3(0,1,0).applyQuaternion(axle.quaternion);assert.ok(Math.abs(axis.z)>.999);assert.equal(axle.position.y,.63);}
  const bounds=new T.Box3().setFromObject(root,true),physical=placementBounds(T,root);
  for(const [key,expected]of [['min',[-1.53,.21,-1.10]],['max',[1.53,1.14,1.10]]])for(let axis=0;axis<3;axis++){
   assert.ok(Math.abs(bounds[key].getComponent(axis)-expected[axis])<1e-6,'published visual '+key);assert.ok(Math.abs(physical[key].getComponent(axis)-expected[axis])<1e-6,'published physical '+key);
  }
  assert.deepEqual(root.userData.vehicle,{mode:'drive',seat:[-.2,.82,0],speed:9,turnSpeed:1.75});
  const treadPoses=wheels.map(wheel=>pose(wheel.getObjectByName('CRAFTED_DUNE_ALL_TERRAIN_TREAD')));updateBuilderModels(collection,.2);
  wheels.forEach((wheel,index)=>{assert.equal(wheel.rotation.z,1);assert.equal(wheel.rotation.x,0);assert.equal(wheel.rotation.y,0);assert.deepEqual(pose(wheel.getObjectByName('CRAFTED_DUNE_ALL_TERRAIN_TREAD')),treadPoses[index]);});
 }finally{dispose(root);}
});
