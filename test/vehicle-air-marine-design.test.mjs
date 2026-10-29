import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {AIRCRAFT_TYPES} from '../public/js/aircraft-types.js';
import {HARBOR_BOATS} from '../public/js/harbor-water.js';
import {createAircraftModel,updateAircraftModel} from '../public/js/aircraft-model.js';
import {createCivilAircraft} from '../public/js/civil-aircraft-models.js';
import {createHarborBoat,updateHarborBoat} from '../public/js/harbor-models.js';
import {createPatrolBoat} from '../public/js/patrol-boat.js';
import {createFishingBoat} from '../public/js/fishing-models.js';
import {VEHICLE_AIR_MARINE_DESIGN_IDS,finishVehicleAirMarineDesign} from '../public/js/vehicle-air-marine-design.js';

const expectedIds=[...Object.keys(AIRCRAFT_TYPES),...HARBOR_BOATS];
const directFactory=id=>id==='corsair-aircraft'?createAircraftModel():AIRCRAFT_TYPES[id]?createCivilAircraft(id):id==='harbor-patrol'?createPatrolBoat():id==='harbor-fishing-boat'?createFishingBoat():createHarborBoat(id);
function create(id){
 const root=directFactory(id);
 // Direct factories also run the production finish. Remove only that pass's
 // checked additions so this fixture tests the family decorator independently.
 const previous=[];root.traverse(node=>{if(node.userData.vehicleDesignDetail)previous.push(node);});for(const node of previous)node.removeFromParent();
 delete root.userData.vehicleDesign;delete root.userData.vehicleAirMarineDesign;
 return root;
}
const transforms=node=>[...node.position,...node.quaternion,...node.scale];
function kitFor(root){
 root.updateMatrixWorld(true);
 const source=[];root.traverse(node=>source.push(node));
 const bounds=new T.Box3().setFromObject(root,true),added=[],materials=new Map();
 const kit={source,bounds,added,
  material(name,options={}){if(!materials.has(name))materials.set(name,new T.MeshStandardMaterial({name,...options}));return materials.get(name);},
  add(parent,node,name){
   if(added.length>=96){node.geometry?.dispose();return false;}
   node.name=name;node.userData={nativeDesignDetail:true,vehicleDesignDetail:true,collisionDisabled:true,collider:false,builderRoot:root};
   node.castShadow=false;node.receiveShadow=true;parent.add(node);root.updateMatrixWorld(true);
   const fitted=new T.Box3().setFromObject(node,true);
   if(fitted.isEmpty()||['x','y','z'].some(axis=>!Number.isFinite(fitted.min[axis])||fitted.min[axis]<bounds.min[axis]-1e-5||fitted.max[axis]>bounds.max[axis]+1e-5)){
    node.removeFromParent();node.geometry?.dispose();return false;
   }
   added.push(node);return true;
  },
  box(parent,size,position,material,name,rotation=[0,0,0]){const node=new T.Mesh(new T.BoxGeometry(...size),material);node.position.set(...position);node.rotation.set(...rotation);return kit.add(parent,node,name)?node:null;},
  tube(parent,from,to,radius,material,name,segments=10){const start=new T.Vector3(...from),end=new T.Vector3(...to),delta=end.clone().sub(start),node=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),segments),material);node.position.copy(start.add(end).multiplyScalar(.5));node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return kit.add(parent,node,name)?node:null;},
  torus(parent,radius,tube,position,material,name,rotation=[0,0,0]){const node=new T.Mesh(new T.TorusGeometry(radius,tube,6,24),material);node.position.set(...position);node.rotation.set(...rotation);return kit.add(parent,node,name)?node:null;},
  batchBoxes(parent,boxes,material,name){
   if(!boxes.length)return null;
   const node=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,boxes.length),dummy=new T.Object3D();
   boxes.forEach((box,index)=>{dummy.position.set(...box.position);dummy.scale.set(...box.size);dummy.rotation.set(...(box.rotation||[0,0,0]));dummy.updateMatrix();node.setMatrixAt(index,dummy.matrix);});
   node.instanceMatrix.needsUpdate=true;node.computeBoundingBox();node.computeBoundingSphere();return kit.add(parent,node,name)?node:null;
  }
 };
 return kit;
}
function snapshot(root){
 const result=new Map();root.traverse(node=>result.set(node,{parent:node.parent,geometry:node.geometry,attributes:node.geometry?new Map(Object.entries(node.geometry.attributes).map(([name,attribute])=>[name,attribute.array.slice()])):null,index:node.geometry?.index?.array.slice(),material:node.material,transform:transforms(node),visible:node.visible,userData:new Map(Object.entries(node.userData))}));return result;
}
function assertOriginal(root,before,id){
 for(const [node,state]of before){
  assert.equal(node.parent,state.parent,id+' keeps original hierarchy');assert.equal(node.geometry,state.geometry,id+' keeps original geometry');assert.equal(node.material,state.material,id+' keeps original materials');
  for(const [name,array]of state.attributes||[])assert.deepEqual(node.geometry.attributes[name].array,array,id+' keeps original '+name+' vertices');
  if(state.index)assert.deepEqual(node.geometry.index.array,state.index,id+' keeps original face topology');
  assert.deepEqual(transforms(node),state.transform,id+' keeps original transforms');assert.equal(node.visible,state.visible,id+' keeps original visibility');
  for(const [key,value]of state.userData)assert.equal(node.userData[key],value,id+' keeps authored '+key);
 }
}
test('aviation and marine coverage matches every canonical aircraft and watercraft ID',()=>{
 assert.ok(Object.isFrozen(VEHICLE_AIR_MARINE_DESIGN_IDS));assert.equal(VEHICLE_AIR_MARINE_DESIGN_IDS.length,13);
 assert.deepEqual([...VEHICLE_AIR_MARINE_DESIGN_IDS].sort(),expectedIds.toSorted());
 assert.ok(!VEHICLE_AIR_MARINE_DESIGN_IDS.includes('shipping-port-crane'));
});
test('native direct factories complete the requested design after composing smaller hulls',()=>{
 for(const id of expectedIds){const root=directFactory(id);assert.equal(root.userData.vehicleAirMarineDesign?.id,id,id+' receives its own complete family design');assert.equal(root.userData.vehicleDesign?.id,id,id+' records the requested finished vehicle');}
});
test('every direct aircraft and boat receives substantial fittings while original rigs and bounds remain intact',()=>{
 for(const id of expectedIds){
  const root=create(id),kit=kitFor(root),before=snapshot(root),rig=root.userData.aircraftRig||root.userData.boatRig;
  assert.equal(finishVehicleAirMarineDesign(T,root,id,kit),root,id);
  assert.ok(kit.added.length>=6,id+' receives multiple crafted fittings');assert.ok(kit.added.length<=96,id+' stays within the shared decoration budget');
  assertOriginal(root,before,id);assert.equal(root.userData.aircraftRig||root.userData.boatRig,rig,id+' retains the live rig object');
  const afterBounds=new T.Box3().setFromObject(root,true);assert.ok(afterBounds.min.distanceTo(kit.bounds.min)<2e-5,id+' keeps original lower bounds');assert.ok(afterBounds.max.distanceTo(kit.bounds.max)<2e-5,id+' keeps original upper bounds');
  for(const detail of kit.added){assert.ok(detail.isMesh,id+' adds mesh fittings only');assert.equal(detail.userData.collisionDisabled,true);assert.equal(detail.userData.collider,false);assert.equal(detail.userData.builderRoot,root);}
  root.traverse(node=>{if(!before.has(node))assert.ok(kit.added.includes(node),id+' additions use the checked decoration kit');});
  const count=kit.added.length,marker=root.userData.vehicleAirMarineDesign;
  assert.equal(marker?.version,1,id+' records the completed design version');assert.equal(marker?.id,id);
  finishVehicleAirMarineDesign(T,root,id,kit);assert.equal(kit.added.length,count,id+' repeated finishing is idempotent');assert.equal(root.userData.vehicleAirMarineDesign,marker);
 }
});
test('moving aviation controls and marine fittings keep their native animation anchors',()=>{
 for(const id of expectedIds){
  const root=create(id),kit=kitFor(root);finishVehicleAirMarineDesign(T,root,id,kit);
  const rig=root.userData.aircraftRig||root.userData.boatRig;
  if(AIRCRAFT_TYPES[id]){
   const moving=[...rig.ailerons,...rig.flaps,rig.elevator,rig.rudder,...rig.gear],attached=kit.added.filter(node=>moving.some(anchor=>{for(let parent=node.parent;parent;parent=parent.parent)if(parent===anchor)return true;return false;}));
   assert.ok(attached.length>=4,id+' attaches control and gear details to their moving native anchors');
   updateAircraftModel(root,{rpm:2600,bank:.4,pitch:.2,rudder:.5,flaps:.6,gear:false},2);
   assert.notEqual(rig.ailerons[0].rotation.x,0);assert.notEqual(rig.elevator.rotation.x,0);assert.notEqual(rig.rudder.rotation.y,0);
  }else{
   updateHarborBoat(root,{speed:6,rpm:2800,rudder:.5,throttle:.7,wakeStrength:.6},2);
   assert.notEqual(rig.wheel.rotation.z,0);assert.notEqual(rig.throttle.rotation.x,0);
  }
 }
});
