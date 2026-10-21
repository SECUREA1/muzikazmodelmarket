import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createAircraftModel,updateAircraftModel,AIRCRAFT_COCKPIT_POSE} from '../public/js/aircraft-model.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
test('detailed Corsair preserves airport wheel datum, wing span and an unobstructed cockpit eye',()=>{
 const aircraft=createAircraftModel(),bounds=new THREE.Box3().setFromObject(aircraft);assert.ok(Math.abs(bounds.min.y+.395)<1e-6);assert.equal(bounds.min.x,-5.25);assert.equal(bounds.max.x,5.25);assert.ok(bounds.max.y<2.5);assert.ok(bounds.min.z>=-4.2&&bounds.max.z<4.1);
 for(const name of ['TAPERED_MONOCOQUE_FUSELAGE','PORT_GULL_WING','STARBOARD_GULL_WING','FOUR_BLADE_PROPELLER','COCKPIT_INSTRUMENT_PANEL','OPEN_COCKPIT','RETRACTABLE_GEAR_-1','RETRACTABLE_GEAR_1','RUDDER','ELEVATOR','AIRFRAME_RIVETS'])assert.ok(aircraft.getObjectByName(name),name);
 const eye=new THREE.Vector3(...AIRCRAFT_COCKPIT_POSE.position),solids=[];aircraft.traverse(node=>{if(node.isMesh&&!node.userData.collisionDisabled)solids.push(node);});
 const throughWindscreen=new THREE.Raycaster(eye,new THREE.Vector3(0,0,-1),0,6).intersectObjects(solids,false);assert.equal(throughWindscreen.length,0,'pilot eye looks over the cowl through clear glass');
 const hull=aircraft.getObjectByName('TAPERED_MONOCOQUE_FUSELAGE');assert.ok(hull.geometry.attributes.position.count>300);assert.equal(aircraft.userData.vehicle.mode,'fly');
});
test('server flight state animates propulsion, control surfaces, gear and cockpit instruments',()=>{
 const aircraft=createBuilderModel('corsair-aircraft'),container=new THREE.Group();container.add(aircraft);assert.ok(aircraft.userData.aircraftModel);
 aircraft.userData.aircraftFlight={throttle:.85,rpm:2700,airspeed:22,altitude:40,pitch:.22,bank:-.35,rudder:.4,verticalSpeed:3.2,heading:120,flaps:.5,gear:false,airborne:true};updateBuilderModels(container,3);
 const rig=aircraft.userData.aircraftRig;assert.notEqual(rig.propeller.rotation.z,0);assert.ok(rig.blur.visible);assert.ok(rig.ailerons[0].rotation.x>0);assert.ok(rig.ailerons[1].rotation.x<0);assert.equal(rig.flaps[0].rotation.x,.3);assert.ok(rig.elevator.rotation.x<0);assert.ok(rig.rudder.rotation.y>0);assert.ok(rig.gear[0].rotation.z<0);assert.ok(rig.needles.find(needle=>needle.userData.instrument==='altitude').rotation.z<0);
 updateAircraftModel(aircraft,{rpm:700,gear:true,flaps:0},4);assert.equal(rig.gear[0].rotation.z,0);assert.equal(rig.flaps[0].rotation.x,0);assert.equal(rig.blur.visible,false);
});
