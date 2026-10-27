import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {AIRCRAFT_TYPES} from '../public/js/aircraft-types.js';
import {HARBOR_BOATS} from '../public/js/harbor-water.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {placementBounds,placementMeshes} from '../public/js/placed-item-collision.js';
import {VEHICLE_DESIGN_IDS,VEHICLE_DESIGN_VERSION,finishVehicleDesign} from '../public/js/vehicle-design-system.js';
import {supportsTransportDesign} from '../public/js/transport-design-finish.js';
import {createRoadVehicle} from '../public/js/road-vehicle-models.js';
import {createConstructionModel} from '../public/js/construction-models.js';
import {createAircraftModel} from '../public/js/aircraft-model.js';
import {createCivilAircraft} from '../public/js/civil-aircraft-models.js';
import {createHarborBoat} from '../public/js/harbor-models.js';
import {createPatrolBoat} from '../public/js/patrol-boat.js';
import {createFishingBoat} from '../public/js/fishing-models.js';
import {createFreightModel} from '../public/js/freight-models.js';
import {createEquipmentPropModel} from '../public/js/equipment-prop-models.js';
import {createCampModel} from '../public/js/summer-camp-models.js';
import {createFunhouseModel} from '../public/js/clown-funhouse-models.js';
import {createArcadePart} from '../public/js/arcade-park.js';
import {createFactoryModel} from '../public/js/missile-factory-model.js';
import {auditVehicleDesigns,disposeVehicleModel,vehicleVisualStats,vehicleTransform} from '../scripts/audit-vehicle-designs.mjs';

const related=['funhouse-clown-car','wooden-cart','camp-canoe-rack','arcade-part-train','arcade-part-coaster','arcade-part-train-engine','arcade-part-train-carriage','arcade-part-coaster-car','factory-training-missile','factory-cargo-rocket'];
const close=(a,b,tolerance=1e-6)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<=tolerance);

test('the crafted vehicle registry includes every native mobile, towed, attraction and display craft',async()=>{
 const expected=new Set([...Object.keys(ROAD_VEHICLES),'dune-quad',...Object.keys(AIRCRAFT_TYPES),...HARBOR_BOATS,'utility-cargo-trailer',...related]);
 assert.equal(new Set(VEHICLE_DESIGN_IDS).size,VEHICLE_DESIGN_IDS.length,'vehicle identities are unique');
 assert.deepEqual([...VEHICLE_DESIGN_IDS].sort(),[...expected].sort());
 for(const item of Object.values(NATIVE_BUILDER_ITEMS))if(item.behavior==='vehicle'||item.vehicleSettings)assert.ok(expected.has(item.id),item.id+' remains covered even when catalog categories differ');
 const report=await auditVehicleDesigns();assert.equal(report.counts.rendered,expected.size);assert.deepEqual(report.failures,[]);
});

test('custom hulls, wings, fuselages and sails expose finite normalized UV coordinates',()=>{
 const targets={
  'corsair-aircraft':['TAPERED_MONOCOQUE_FUSELAGE','PORT_GULL_WING','STARBOARD_GULL_WING'],
  'diamond-da40':['TAPERED_FUSELAGE','LOW_COMPOSITE_WING'],'piper-cub':['TAPERED_FUSELAGE','HIGH_FABRIC_WING'],
  'harbor-skiff':['SHAPED_DEEP_V_HULL'],'harbor-sailboat':['SHAPED_DEEP_V_HULL','CAMBERED_MAINSAIL','CAMBERED_HEADSAIL'],
  'harbor-yacht':['SUPERYACHT_SHAPED_HULL'],'harbor-patrol':['SHAPED_DEEP_V_HULL'],'harbor-fishing-boat':['SHAPED_DEEP_V_HULL'],
  'shipping-feeder':['SHIPPING_SHAPED_DISPLACEMENT_HULL'],'shipping-container':['SHIPPING_SHAPED_DISPLACEMENT_HULL'],'shipping-tanker':['SHIPPING_SHAPED_DISPLACEMENT_HULL']
 };
 for(const [id,names]of Object.entries(targets)){
  const root=createBuilderModel(id);try{for(const name of names){const matches=[];root.traverse(node=>{if(node.name===name&&node.isMesh)matches.push(node);});assert.ok(matches.length,id+' retains '+name);
   for(const mesh of matches){const uv=mesh.geometry.attributes.uv;assert.ok(uv&&uv.count===mesh.geometry.attributes.position.count,id+' '+name+' has a texture coordinate per vertex');for(const value of uv.array)assert.ok(Number.isFinite(value)&&value>=-.00001&&value<=1.00001,id+' '+name+' has bounded finite UVs');}
  }}finally{disposeVehicleModel(root);}
 }
});

test('vehicle finishing preserves explicit colliders, instrument feeds, grip poses and live rig references',()=>{
 const root=new THREE.Group();root.position.set(3,1,-5);root.rotation.y=.38;root.scale.setScalar(1.3);
 const body=new THREE.Mesh(new THREE.BoxGeometry(2,1.2,4),new THREE.MeshStandardMaterial({color:0x3e7183,metalness:.6,roughness:.4}));body.name='VEHICLE_BODY';body.position.y=.8;root.add(body);
 const wheel=new THREE.Group();wheel.name='ROAD_WHEEL';wheel.userData.roadWheel=true;wheel.position.set(.8,.45,-1.1);root.add(wheel);const tyre=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.25,20),new THREE.MeshStandardMaterial({color:0x101820,roughness:.95}));tyre.rotation.z=Math.PI/2;wheel.add(tyre);
 const display=new THREE.Mesh(new THREE.BoxGeometry(.5,.2,.025),new THREE.MeshBasicMaterial({color:0x123456}));display.userData.mediaScreen=true;display.name='ROAD_DIGITAL_DASHBOARD';display.position.set(-.3,1.1,-.5);root.add(display);
 const collider=new THREE.Mesh(new THREE.BoxGeometry(2,1.6,4),new THREE.MeshBasicMaterial());collider.visible=false;collider.position.y=.8;collider.name='COLLIDER';collider.userData={collisionOnly:true,collider:true};root.add(collider);
 const muzzle=new THREE.Object3D();muzzle.name='VEHICLE_ACTION_ANCHOR';muzzle.position.set(0,.7,-2);root.add(muzzle);
 const seat=[-.4,.8,.1],rig={wheel,display,muzzle},configuration={mode:'drive',speed:21,seat};root.userData.roadVehicle=true;root.userData.vehicle=configuration;root.userData.boatRig=rig;
 const transform=vehicleTransform(root),wheelPose=vehicleTransform(wheel),bounds=placementBounds(THREE,root).clone(),physicalMeshes=placementMeshes(root),displayGeometry=display.geometry,displayMaterial=display.material,uv=Array.from(display.geometry.attributes.uv.array),colliderGeometry=collider.geometry;
 try{
  assert.equal(finishVehicleDesign(THREE,root,'grand-tourer'),root);
  assert.deepEqual(vehicleTransform(root),transform);assert.deepEqual(vehicleTransform(wheel),wheelPose);
  assert.equal(root.userData.boatRig,rig);assert.equal(rig.wheel,wheel);assert.equal(rig.display,display);assert.equal(rig.muzzle,muzzle);assert.equal(root.userData.vehicle,configuration);assert.equal(root.userData.vehicle.seat,seat);
  assert.equal(display.geometry,displayGeometry);assert.equal(display.material,displayMaterial);assert.deepEqual(Array.from(display.geometry.attributes.uv.array),uv);assert.equal(collider.geometry,colliderGeometry);assert.equal(collider.visible,false);
  assert.deepEqual(placementMeshes(root),physicalMeshes);const next=placementBounds(THREE,root);assert.ok(next.min.distanceTo(bounds.min)<1e-6&&next.max.distanceTo(bounds.max)<1e-6);
 }finally{disposeVehicleModel(root);}
});

function directVehicle(id){
 if(id==='dune-quad')return createBuilderModel(id); // Private open-frame recipe.
 if(ROAD_VEHICLES[id])return ROAD_VEHICLES[id].siteOnly?createConstructionModel(id):createRoadVehicle(id);
 if(id==='corsair-aircraft')return createAircraftModel();
 if(AIRCRAFT_TYPES[id])return createCivilAircraft(id);
 if(id==='harbor-patrol')return createPatrolBoat();if(id==='harbor-fishing-boat')return createFishingBoat();if(HARBOR_BOATS.includes(id))return createHarborBoat(id);
 if(id==='utility-cargo-trailer')return createFreightModel(id);
 if(id==='wooden-cart')return createEquipmentPropModel(id);if(id==='camp-canoe-rack')return createCampModel(THREE,id);if(id==='funhouse-clown-car')return createFunhouseModel(id);
 if(id.startsWith('arcade-part-'))return createArcadePart(id.slice(12));
 if(id.startsWith('factory-'))return createFactoryModel(id);
}

test('direct world constructors and native placement use the same idempotent crafted vehicle system',()=>{
 for(const id of VEHICLE_DESIGN_IDS){
  const root=directVehicle(id);try{assert.ok(root,id+' has a direct world constructor');assert.equal(root.userData.vehicleDesign?.version,VEHICLE_DESIGN_VERSION,id+' direct projections receive the upgrade');assert.equal(root.userData.vehicleDesign.id,id);
   if(supportsTransportDesign(id))assert.equal(root.userData.transportDesign?.id,id,id+' composed transport identity matches its outer vehicle');
   const stats=vehicleVisualStats(root),geometry=[],materials=[];root.traverse(node=>{if(node.isMesh){geometry.push(node.geometry);materials.push(node.material);}});finishVehicleDesign(THREE,root,id);
   assert.deepEqual(vehicleVisualStats(root),stats,id+' does not accumulate repeat-pass details');let index=0;root.traverse(node=>{if(node.isMesh){assert.equal(node.geometry,geometry[index]);assert.equal(node.material,materials[index++]);}});
  }finally{disposeVehicleModel(root);}
 }
});

test('vehicle detail geometry stays parented to the moving wheels and ride carriages it decorates',()=>{
 for(const [id,find]of [['grand-tourer',node=>node.userData.roadWheel],['arcade-part-train',node=>node.name==='ARCADE_TRAIN_ENGINE'],['arcade-part-coaster',node=>node.name==='ARCADE_COASTER_CAR']]){
  const root=createBuilderModel(id);try{let owner;root.traverse(node=>{if(!owner&&find(node))owner=node;});assert.ok(owner,id+' keeps its animated assembly');const details=[];owner.traverse(node=>{if(node.isMesh&&node.userData.vehicleDesignDetail)details.push(node);});assert.ok(details.length,id+' attaches new detail to its moving assembly');
   const detail=details[0],local=vehicleTransform(detail);root.updateMatrixWorld(true);const before=detail.getWorldPosition(new THREE.Vector3());owner.position.x+=.5;root.updateMatrixWorld(true);const after=detail.getWorldPosition(new THREE.Vector3());assert.ok(after.distanceTo(before)>.1,id+' details follow confirmed assembly movement');assert.deepEqual(vehicleTransform(detail),local,id+' keeps authored detail coordinates inside the moving assembly');
  }finally{disposeVehicleModel(root);}
 }
});

test('owned vehicle copies isolate paint materials and rebind their animated rigs',()=>{
 for(const id of ['grand-tourer','diamond-da40','harbor-sailboat','harbor-fishing-boat','site-excavator','utility-cargo-trailer','funhouse-clown-car','wooden-cart']){
  const source=createBuilderModel(id),copy=cloneBuilderRuntime(source);try{
   const originals=[],copies=[];source.traverse(node=>{if(node.isMesh&&!node.userData.mediaScreen)originals.push(node);});copy.traverse(node=>{if(node.isMesh&&!node.userData.mediaScreen)copies.push(node);});assert.equal(originals.length,copies.length);
   for(let i=0;i<originals.length;i++)for(const [j,material]of [].concat(originals[i].material).entries())assert.notEqual([].concat(copies[i].material)[j],material,id+' does not share editable paint');
   const sourceRig=source.userData.aircraftRig||source.userData.boatRig||source.userData.constructionParts,copyRig=copy.userData.aircraftRig||copy.userData.boatRig||copy.userData.constructionParts;
   if(sourceRig){assert.ok(copyRig);const visited=new Set();const inspect=(a,b)=>{if(a?.isObject3D){assert.notEqual(a,b,id+' rebinds moving rig nodes');assert.ok(b?.isObject3D);return;}if(!a||typeof a!=='object'||visited.has(a)||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(a)))return;visited.add(a);for(const key of Object.keys(a))inspect(a[key],b?.[key]);};inspect(sourceRig,copyRig);}
   const sourceMaterial=originals.map(node=>[].concat(node.material)).flat().find(material=>material.color),index=originals.findIndex(node=>[].concat(node.material).includes(sourceMaterial)),materialIndex=[].concat(originals[index].material).indexOf(sourceMaterial),copyMaterial=[].concat(copies[index].material)[materialIndex],before=sourceMaterial.color.getHex();copyMaterial.color.setHex(before^0xffffff);assert.equal(sourceMaterial.color.getHex(),before);
  }finally{disposeVehicleModel(source);disposeVehicleModel(copy);}
 }
});
