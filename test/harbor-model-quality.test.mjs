import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createHarborBoat,updateHarborBoat,HARBOR_HELM_POSES} from '../public/js/harbor-models.js';
function physicalBounds(root){root.updateMatrixWorld(true);const bounds=new THREE.Box3();root.traverse(node=>{if(node.isMesh&&!node.userData.collisionDisabled){node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));}});return bounds;}
for(const id of ['harbor-skiff','harbor-sailboat'])test(id+' has a shaped, waterline-safe hull and open helm view',()=>{
 const boat=createHarborBoat(id),bounds=physicalBounds(boat);assert.equal(boat.userData.watercraft,true);assert.equal(boat.userData.modelId,id);assert.equal(boat.userData.vehicle.mode,'boat');assert.ok(bounds.min.y>=-.421&&bounds.min.y<=-.419);assert.ok(bounds.min.x>=-1&&bounds.max.x<=1);assert.ok(bounds.min.z>=-2.4&&bounds.max.z<=2.4);
 assert.ok(boat.getObjectByName('SHAPED_DEEP_V_HULL').geometry.attributes.position.count>70);for(const name of ['OPEN_COAMING_DECK','MARINE_HELM_CONSOLE','HELM_STEERING_WHEEL','NAV_LIGHT_PORT','NAV_LIGHT_STARBOARD','DOCK_FENDER','MOORING_CLEAT','BOW_WINDLASS','BOAT_WAKE_FOAM'])assert.ok(boat.getObjectByName(name),name);
 const eye=new THREE.Vector3(...HARBOR_HELM_POSES[id].position),solids=[];boat.traverse(node=>{if(node.isMesh&&!node.userData.collisionDisabled)solids.push(node);});assert.equal(new THREE.Raycaster(eye,new THREE.Vector3(0,0,-1),0,6).intersectObjects(solids,false).length,0);
 const names=id==='harbor-sailboat'?['OPEN_COMPANIONWAY_CABIN','CAMBERED_MAINSAIL','CAMBERED_HEADSAIL','TRIMMABLE_MAIN_BOOM','ALUMINIUM_MAST','SAILBOAT_RUDDER']:['FRAMED_HELM_WINDSCREEN','STEERABLE_OUTBOARD','MARINE_PROPELLER'];for(const name of names)assert.ok(boat.getObjectByName(name),name);
});
test('confirmed boating state animates fittings and wake without changing the world pose or collider bounds',()=>{
 for(const id of ['harbor-skiff','harbor-sailboat']){const boat=createHarborBoat(id);boat.position.set(144,0,24);boat.rotation.set(.02,-Math.PI/2,.01);const position=boat.position.toArray(),rotation=boat.rotation.toArray(),before=physicalBounds(boat);updateHarborBoat(boat,{speed:8,throttle:.85,rpm:4400,rudder:.55,heading:130,sailTrim:.8,sailPower:.75,wakeStrength:.8},3);
 assert.deepEqual(boat.position.toArray(),position);assert.deepEqual(boat.rotation.toArray(),rotation);const rig=boat.userData.boatRig;assert.ok(rig.wheel.rotation.z<0);assert.ok(rig.rudder.rotation.y<0);assert.ok(rig.throttle.rotation.x<0);assert.ok(rig.wake.visible);assert.ok(rig.foam.some(mesh=>mesh.material.opacity>0));rig.wake.traverse(node=>{if(node.isMesh)assert.equal(node.userData.collisionDisabled,true);});assert.ok(physicalBounds(boat).min.distanceTo(before.min)<.02);assert.ok(physicalBounds(boat).max.distanceTo(before.max)<.02);
 if(id==='harbor-skiff')assert.ok(rig.propeller.rotation.z>0);else {assert.ok(rig.boom.rotation.y>.2);assert.ok(rig.sail.geometry.attributes.position.count>80);}
 updateHarborBoat(boat,{speed:0,throttle:0,rpm:0,rudder:0,wakeStrength:0},4);assert.equal(rig.wake.visible,false);assert.ok(Math.abs(rig.wheel.rotation.z)<1e-9);
 }
});
