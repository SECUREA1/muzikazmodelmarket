import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFishingBoat} from '../public/js/fishing-models.js';
import {createFishingScene} from '../public/js/fishing-scene.js';
import {createHarborCamera} from '../public/js/harbor-camera.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {HARBOR_HELM_POSES} from '../public/js/harbor-models.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';

test('live fishing lines follow each modeled rod tip, bend under tension and disappear after settlement',()=>{
 const scene=new THREE.Scene(),boat=createFishingBoat();boat.userData.builderObjectId='angler';boat.position.set(145,0,-38);scene.add(boat);
 const visuals=createFishingScene(scene,{getRoots:()=>[boat]}),round={id:'cast',status:'waiting',side:'starboard',boatId:'angler',castPoint:{x:151,y:.05,z:-38},tension:0,progress:0},snapshot={players:{self:{position:{x:146,y:.55,z:-37},fishing:{session:round}}},actors:{angler:{position:{x:145,y:0,z:-38}}}};
 visuals.update(snapshot);visuals.animate(1);const lineGroup=scene.getObjectByName('Fishing_cast_self'),line=lineGroup.children.find(node=>node.isLine),tip=boat.userData.fishingRig.tips[1].getWorldPosition(new THREE.Vector3()),values=line.geometry.attributes.position;
 assert.ok(new THREE.Vector3().fromBufferAttribute(values,0).distanceTo(tip)<.0001);
 const pivot=boat.userData.fishingRig.rods[1],base=pivot.rotation.z;round.status='reeling';round.tension=.9;round.progress=.5;visuals.animate(2);assert.ok(Math.abs(pivot.rotation.z-base)>.1);
 round.status='caught';round.fish={weightKg:2};visuals.animate(3);assert.ok(lineGroup.children.some(child=>child.isGroup&&child.visible));
 round.status='kept';visuals.update(snapshot);assert.equal(scene.getObjectByName('Fishing_cast_self'),undefined);assert.equal(pivot.rotation.z,base);visuals.dispose();assert.equal(scene.getObjectByName('SHARED_FISHING_LINES'),undefined);
});
for(const [side,direction]of [['port',-1],['starboard',1]])test(side+' boat camera faces the cast water across the gunwale',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(70,1,.05,700);scene.add(rig);rig.add(camera);const controller=createHarborCamera({camera,playerRig:rig}),boat={id:'angler',modelId:'harbor-fishing-boat',rotation:{y:0}},origin=new THREE.Vector3(145,0,-38);
 controller.update({boat,origin,view:'fishing-'+side,immediate:true});const gaze=camera.getWorldDirection(new THREE.Vector3());assert.ok(gaze.x*direction>.9);assert.ok(gaze.y<0);controller.reset();assert.equal(camera.fov,70);assert.equal(camera.near,.05);
});

test('Angler working deck, helm and canopy fit the existing collision hull and leave clear side stations',()=>{
 const boat=createFishingBoat();boat.updateMatrixWorld(true);
 const wheel=boat.userData.boatRig.wheel.getWorldPosition(new THREE.Vector3()),eye=new THREE.Vector3(...HARBOR_HELM_POSES['harbor-fishing-boat'].position);
 assert.ok(wheel.z<eye.z-.3,'the helm eye is behind the relocated forward wheel');assert.ok(wheel.y<eye.y);
 for(const name of ['ANGLER_FISHFINDER','ANGLER_SUN_CANOPY','CANOPY_SOLAR_PANEL','PORT_NONSLIP_FOOT_PAD','STARBOARD_NONSLIP_FOOT_PAD','ANGLER_LIFERING'])assert.ok(boat.getObjectByName(name),name);
 const bounds=new THREE.Box3();boat.traverse(mesh=>{if(!mesh.isMesh)return;for(let node=mesh;node;node=node.parent)if(node.userData.collisionDisabled||node.userData.collider===false)return;bounds.union(new THREE.Box3().setFromObject(mesh));});
 assert.ok(bounds.min.x>=-1.35&&bounds.max.x<=1.35);assert.ok(bounds.min.z>=-3.15&&bounds.max.z<=3.15);
});

test('articulated rods and reel handles animate on cloned boats without moving original parts or retaining a settled cast',()=>{
 const original=createFishingBoat(),boat=cloneBuilderRuntime(original),scene=new THREE.Scene();boat.userData.builderObjectId='angler';boat.rotation.y=.7;boat.position.set(20,0,35);scene.add(boat);
 const visuals=createFishingScene(scene,{getRoots:()=>[boat]}),session={id:'first',status:'reeling',reeling:true,side:'port',boatId:'angler',castPoint:{x:15,y:.05,z:39},tension:.8,progress:.2},snapshot={players:{self:{fishing:{session},position:{x:19,y:.55,z:36}}},actors:{angler:{}}};
 const tipBefore=boat.userData.fishingRig.tips[0].getWorldPosition(new THREE.Vector3());visuals.update(snapshot);visuals.animate(1);visuals.animate(1.1);
 assert.ok(boat.userData.fishingRig.flexJoints[0].every(joint=>joint.rotation.z<0));assert.ok(boat.userData.fishingRig.tips[0].getWorldPosition(new THREE.Vector3()).distanceTo(tipBefore)>.1);
 assert.ok(boat.userData.fishingRig.rotors[0].rotation.x>0);assert.ok(boat.userData.fishingRig.cranks[0].rotation.x>0);
 assert.ok(original.userData.fishingRig.flexJoints[0].every(joint=>joint.rotation.z===0));assert.equal(original.userData.fishingRig.rotors[0].rotation.x,0);
 session.reeling=false;const angle=boat.userData.fishingRig.rotors[0].rotation.x;visuals.animate(2);assert.equal(boat.userData.fishingRig.rotors[0].rotation.x,angle,'release stops the reel animation');
 session.status='released';visuals.update(snapshot);assert.ok(boat.userData.fishingRig.flexJoints[0].every(joint=>joint.rotation.z===0));assert.equal(boat.userData.fishingRig.rotors[0].rotation.x,0);assert.equal(scene.getObjectByName('Fishing_cast_self'),undefined);visuals.dispose();
});

test('fishing camera uses the hull origin and actual cast target with a rotated side-standing player rig',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(70,1,.05,700),boat=createFishingBoat();scene.add(boat,rig);rig.position.set(144.6,.55,-37);rig.rotation.y=.9;rig.add(camera);
 const origin=new THREE.Vector3(145,0,-38),rotation={x:.02,y:.9,z:.01},body=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x,rotation.y,rotation.z,'YXZ')),target=new THREE.Vector3(-6.15,.05,.8).applyQuaternion(body).add(origin),controller=createHarborCamera({camera,playerRig:rig});
 controller.update({boat:{id:'angler',modelId:'harbor-fishing-boat',rotation},model:boat,origin,view:'fishing-port',fishingTarget:target,immediate:true});
 assert.ok(boat.position.distanceTo(origin)<1e-8,'the model remains on its real waterline rather than the standing player offset');
 const eye=new THREE.Vector3(-.38,1.8,1.65).applyQuaternion(body).add(origin);assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(eye)<1e-8);assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(target.sub(eye).normalize())>1-1e-10);
 controller.reset();assert.equal(camera.near,.05);
});

test('fishing docking thruster aligns a stopped launch without moving or enlarging its hull, and anchor/manual controls retain normal steering',()=>{
 const environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}},boat=(x=145)=>({modelId:'harbor-fishing-boat',position:{x,y:0,z:-40},rotation:{y:0},boating:{speed:0}});
 const turning=boat();for(let i=0;i<40;i++)Object.assign(turning,stepBoatSimulation(turning,{bowThruster:true,side:1,throttle:0},.1,{environment}));assert.ok(turning.rotation.y<-1.5);assert.deepEqual(turning.position,{x:145,y:0,z:-40});assert.equal(turning.boating.impactDamage,0);
 for(const input of [{side:1,throttle:0},{bowThruster:true,side:1,throttle:0,anchor:true}]){const held=boat();Object.assign(held,stepBoatSimulation(held,input,.25,{environment}));assert.equal(held.rotation.y,0);}
 const shoreline=boat(130);for(let i=0;i<80;i++)Object.assign(shoreline,stepBoatSimulation(shoreline,{bowThruster:true,side:1,throttle:0},.1,{environment}));assert.ok(watercraftFootprint(shoreline.position,shoreline.rotation.y,shoreline).every(point=>harborWaterAt(environment,point,.25)));assert.equal(shoreline.boating.impactDamage,0);assert.ok(Math.abs(shoreline.rotation.y)<.5,'the rotated hull cannot sweep through land');
});
