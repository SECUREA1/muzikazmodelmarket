import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_PORTS,SHIPPING_ROUTES,SHIPPING_VESSELS as CATALOG_VESSELS} from '../public/js/shipping-config.js';
import {SHIPPING_VESSELS} from '../public/js/shipping-vessel-specs.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {updateHarborBoat,HARBOR_HELM_POSES} from '../public/js/harbor-models.js';
import {harborWaterAt,watercraftSize,watercraftFootprint,watercraftOverlap,isWatercraft} from '../public/js/harbor-water.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {createHarborLand} from '../public/js/environments/harbor-land.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';

const world=shippingWorld();
for(const[id,spec]of Object.entries(SHIPPING_VESSELS))test(id+' has a usable bridge, distinct hull and shared collision dimensions',()=>{
 const root=createBuilderModel(id);assert.ok(root);assert.equal(isWatercraft({modelId:id}),true);assert.deepEqual(watercraftSize({modelId:id}),[spec.beam/2,spec.length/2]);assert.deepEqual(root.userData.dimensions,[spec.beam,spec.height,spec.length]);assert.equal(spec.capacity,CATALOG_VESSELS.find(s=>s.modelId===id).capacity);
 for(const name of ['SHIPPING_SHAPED_DISPLACEMENT_HULL','CARGO_WORKING_DECK','BRIDGE_CONTROL_CONSOLE','BRIDGE_PANORAMIC_WINDOW','LIVE_CARGO_CHART_DISPLAY','SHIPPING_HELM_WHEEL','SHIPPING_ENGINE_TELEGRAPH','NAV_LIGHT_PORT','NAV_LIGHT_STARBOARD','ROTATING_SHIPPING_RADAR','BOAT_WAKE_FOAM'])assert.ok(root.getObjectByName(name),name);
 root.updateMatrixWorld(true);const physical=[];root.traverse(node=>{if(node.isMesh&&!node.userData.collisionDisabled)physical.push(node);});const eye=new THREE.Vector3(...HARBOR_HELM_POSES[id].position),ray=new THREE.Raycaster(eye,new THREE.Vector3(0,0,-1),0,spec.length*2);assert.equal(ray.intersectObjects(physical,false).length,0,'bridge horizon remains clear');
 for(const port of SHIPPING_PORTS)assert.ok(watercraftFootprint({x:port.x,z:port.z},Math.PI/2,{modelId:id}).every(point=>harborWaterAt(world,point,.25)),port.name+' fits full hull');
});
test('the cargo extension has water at the former main island and retains physical coastlines',()=>{
 assert.equal(harborWaterAt(world,{x:0,z:0}),true);const land=createHarborLand(world);assert.equal(land.getObjectByName('BUILDER_WALKABLE_FLOOR_HARBOR_MAIN_ISLAND'),undefined);assert.ok(land.getObjectByName('BUILDER_WALKABLE_FLOOR_HARBOR_SWIM'));assert.equal(harborWaterAt(world,{x:180,z:680}),false);
 const legacy={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};assert.equal(harborWaterAt(legacy,{x:0,z:0}),false,'legacy main island remains land');assert.equal(harborWaterAt(legacy,{x:180,z:0}),true);
});
test('all contract legs clear the full largest cargo hull between checkpoints',()=>{
 const boat={modelId:'shipping-tanker'};for(const route of SHIPPING_ROUTES){let previous=SHIPPING_PORTS.find(port=>port.id===route.from);for(const point of route.waypoints){const yaw=Math.atan2(previous.x-point.x,previous.z-point.z),distance=Math.hypot(point.x-previous.x,point.z-previous.z),steps=Math.max(1,Math.ceil(distance/4));for(let step=0;step<=steps;step++){const t=step/steps,position={x:previous.x+(point.x-previous.x)*t,z:previous.z+(point.z-previous.z)*t};assert.ok(watercraftFootprint(position,yaw,boat).every(vertex=>harborWaterAt(world,vertex,.25)),route.id+' → '+point.name);}previous=point;}}
});
test('loaded container visibility and marine animations follow confirmed state on independent clones',()=>{
 const original=createBuilderModel('shipping-feeder'),copy=cloneBuilderRuntime(original);updateHarborBoat(copy,{cargoCount:3,speed:5,throttle:.7,rudder:.5,rpm:3000,wakeStrength:.7},3);
 assert.equal(copy.userData.boatRig.cargoSlots.filter(slot=>slot.visible).length,3);assert.equal(original.userData.boatRig.cargoSlots.filter(slot=>slot.visible).length,0);assert.notEqual(copy.userData.boatRig.wheel,original.userData.boatRig.wheel);assert.ok(copy.userData.boatRig.wake.visible);assert.ok(copy.userData.boatRig.radar.rotation.y>0);assert.ok(copy.userData.boatRig.wheel.rotation.z<0);updateHarborBoat(copy,{cargoCount:0,speed:0,wakeStrength:0},4);assert.equal(copy.userData.boatRig.cargoSlots.filter(slot=>slot.visible).length,0);
 updateHarborBoat(copy,{cargoCount:2,cargoCapacity:4,cargoPortCount:2,cargoStarboardCount:0},5);const visible=copy.userData.boatRig.cargoSlots.filter(slot=>slot.visible);assert.equal(visible.length,2);assert.ok(visible.every(slot=>slot.userData.shippingSide==='port'));assert.ok(copy.userData.boatRig.cargoIndicator.scale.y>.4&&copy.userData.boatRig.cargoIndicator.scale.y<.6);
});
test('freighter engines and docking thrusters move safely but anchor prevents powered rotation',()=>{
 let boat={id:'test-ship',modelId:'shipping-container',position:{x:-600,y:0,z:0},rotation:{x:0,y:0,z:0},boating:{anchor:false,speed:0}};for(let n=0;n<120;n++)Object.assign(boat,stepBoatSimulation(boat,{throttle:.75},.1,{environment:world,now:n*100}));assert.ok(boat.boating.speed>5);assert.ok(boat.position.z<-30);assert.equal(boat.boating.impactDamage,0);
 boat={...boat,boating:{anchor:false,speed:0,throttle:0},rotation:{x:0,y:0,z:0}};const turning=stepBoatSimulation(boat,{throttle:0,side:1,bowThruster:true},.25,{environment:world});assert.ok(turning.rotation.y<0);const anchored=stepBoatSimulation({...boat,boating:{anchor:true,speed:0}},{throttle:0,side:1,bowThruster:true},.25,{environment:world});assert.equal(anchored.rotation.y,0);
 assert.equal(watercraftOverlap({x:0,z:0},0,{x:0,z:30},0,.1,{modelId:'shipping-container'},{modelId:'shipping-tanker'}),true,'large stern envelopes overlap');
});
test('dock equipment uses detailed container locks and an actual loading gantry',()=>{
 const crane=createBuilderModel('shipping-port-crane'),container=createBuilderModel('shipping-container-box');for(const name of ['GANTRY_STEEL_LEG','GANTRY_BOOM','CRANE_LIFT_CABLE','CONTAINER_SPREADER','CRANE_OPERATOR_CAB'])assert.ok(crane.getObjectByName(name));for(const name of ['CONTAINER_STEEL_BODY','CONTAINER_CORRUGATION','CONTAINER_LOCKING_BAR','CONTAINER_CASTING'])assert.ok(container.getObjectByName(name));
});
test('a full hold accelerates more slowly and needs more room to stop',()=>{
 const vessel=mass=>({modelId:'shipping-container',position:{x:-600,y:0,z:0},rotation:{y:0},boating:{anchor:false,speed:6,throttle:0,cargoMass:mass}}),empty=vessel(0),loaded=vessel(30);
 const stoppedEmpty=stepBoatSimulation(empty,{throttle:0,brake:true},.25,{environment:world}),stoppedLoaded=stepBoatSimulation(loaded,{throttle:0,brake:true},.25,{environment:world});assert.ok(stoppedLoaded.boating.speed>stoppedEmpty.boating.speed);assert.ok(stoppedLoaded.position.z<stoppedEmpty.position.z);
 empty.boating.speed=loaded.boating.speed=0;const acceleratingEmpty=stepBoatSimulation(empty,{throttle:1},.25,{environment:world}),acceleratingLoaded=stepBoatSimulation(loaded,{throttle:1},.25,{environment:world});assert.ok(acceleratingEmpty.boating.speed>acceleratingLoaded.boating.speed);
});
for(const route of SHIPPING_ROUTES)test('largest cargo hull physically completes '+route.id+' without clipping its quay',()=>{
 const origin=SHIPPING_PORTS.find(port=>port.id===route.from),destination=SHIPPING_PORTS.find(port=>port.id===route.to),points=structuredClone(route.waypoints);if(Math.hypot(points.at(-1).x-destination.x,points.at(-1).z-destination.z)>1)points.push(destination.berth);
 const boat={id:'physical-tanker',modelId:'shipping-tanker',position:{x:origin.x,y:0,z:origin.z},rotation:{x:0,y:Math.PI/2,z:0},boating:{speed:0,anchor:false,cargoMass:12,assist:'navigate',assistRoute:points.map((point,index)=>({...point,radius:index===points.length-1?2.5:8})),routeIndex:0}};
 let frame=0;for(;frame<12000&&boat.boating.assist;frame++){const controls=boatAssistedInput(boat,{},world,100000+frame*100),next=stepBoatSimulation(boat,controls,.1,{environment:world,now:100000+frame*100});assert.notEqual(next.boating.phase,'hold');assert.equal(next.boating.impactDamage,0);Object.assign(boat,next);}
 assert.ok(frame<12000,'cargo manoeuvring and final approach must complete');assert.equal(boat.boating.assistStage,'arrived');assert.equal(boat.boating.anchor,true);assert.ok(Math.hypot(boat.position.x-destination.x,boat.position.z-destination.z)<2.5);assert.ok(Math.abs(boat.boating.speed)<.15);
});
