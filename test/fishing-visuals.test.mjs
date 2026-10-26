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

for(const side of ['port','starboard'])test(side+' landed catch lifts to visible net height with its mouth attached to the real rod line',()=>{
 const scene=new THREE.Scene(),boat=createFishingBoat(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(74,390/844,.025,700),yaw=.85,sign=side==='port'?-1:1,origin=new THREE.Vector3(145,0,-38),turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
 boat.userData.builderObjectId='angler';boat.position.copy(origin);boat.quaternion.copy(turn);scene.add(boat,rig);rig.add(camera);
 const station=new THREE.Vector3(sign*1.15,.55,.8).applyQuaternion(turn).add(origin),castPoint=new THREE.Vector3(sign*6.15,.05,.8).applyQuaternion(turn).add(origin),session={id:'visible-catch',status:'reeling',reeling:true,side,boatId:'angler',position:{x:station.x,y:station.y,z:station.z},castPoint:{x:castPoint.x,y:castPoint.y,z:castPoint.z},tension:.55,progress:.98},snapshot={players:{self:{position:{...session.position},fishing:{session}}},actors:{angler:{position:{x:origin.x,y:origin.y,z:origin.z},rotation:{y:yaw}}}};
 const before=JSON.stringify(snapshot),visuals=createFishingScene(scene,{getRoots:()=>[boat]});visuals.update(snapshot);visuals.animate(1);assert.equal(JSON.stringify(snapshot),before,'cosmetics cannot modify authoritative session data');
 session.status='caught';session.fish={weightKg:30,rarity:'legendary'};visuals.animate(1.1);const fish=scene.getObjectByName('LANDED_FISH'),startHeight=fish.position.y;visuals.animate(1.4);assert.ok(fish.position.y>startHeight,'catch rises in a short lift rather than appearing at the rod tip');visuals.animate(1.8);
 const expected=new THREE.Vector3(sign*2.45,1.3,1.3).applyQuaternion(turn).add(origin);assert.ok(fish.position.distanceTo(expected)<1e-8);assert.ok(fish.visible);assert.ok(fish.scale.x<=1);
 const controller=createHarborCamera({camera,playerRig:rig});controller.update({boat:{id:'angler',modelId:'harbor-fishing-boat',rotation:{y:yaw}},origin,view:'fishing-'+side,fishingTarget:session.castPoint,immediate:true});
 const projected=fish.position.clone().project(camera);assert.ok(Math.abs(projected.x)<.6&&Math.abs(projected.y)<.7,'catch center stays within the narrow mobile side view');
 fish.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(fish);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const corner=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(corner.x)<1&&Math.abs(corner.y)<1,'the largest cosmetic catch fits without clipping: '+corner.toArray().join(','));}
 const line=scene.getObjectByName('Fishing_cast_self').children.find(node=>node.isLine),points=line.geometry.attributes.position,tip=boat.userData.fishingRig.tips[side==='port'?0:1].getWorldPosition(new THREE.Vector3()),mouth=new THREE.Vector3(-.4,.025,0).multiplyScalar(fish.scale.x).applyQuaternion(fish.quaternion).add(fish.position);
 assert.ok(new THREE.Vector3().fromBufferAttribute(points,0).distanceTo(tip)<.0001);assert.ok(new THREE.Vector3().fromBufferAttribute(points,2).distanceTo(mouth)<.0001);
 // A standing/seated XR eye uses its own level head pose, not the desktop's
 // downward fishing pitch. The same world-space catch remains in its frustum.
 const xrEye=new THREE.Vector3(sign*.38,1.8,1.65).applyQuaternion(turn).add(origin),xrCamera=new THREE.PerspectiveCamera(90,1,.025,700);scene.add(xrCamera);xrCamera.position.copy(xrEye);xrCamera.lookAt(castPoint.x,xrEye.y,castPoint.z);xrCamera.updateMatrixWorld(true);const xrProjected=fish.position.clone().project(xrCamera);assert.ok(Math.abs(xrProjected.x)<1&&Math.abs(xrProjected.y)<1);
 session.status='released';visuals.update(snapshot);assert.equal(scene.getObjectByName('LANDED_FISH'),undefined);visuals.dispose();
});

test('shore catches use the standing angler position and stay near hand height after a reconnect',()=>{
 const scene=new THREE.Scene(),visuals=createFishingScene(scene),session={id:'shore-catch',status:'caught',position:{x:24,y:.2,z:-10},castPoint:{x:24,y:.05,z:-16},fish:{weightKg:.8},tension:.2},snapshot={players:{self:{position:{x:24,y:.2,z:-10},yaw:0,fishing:{session}}},actors:{}};
 const before=JSON.stringify(snapshot);visuals.update(snapshot);visuals.animate(10);visuals.animate(10.7);const fish=scene.getObjectByName('LANDED_FISH');assert.ok(fish.position.distanceTo(new THREE.Vector3(24,.95,-11.6))<1e-8);assert.equal(JSON.stringify(snapshot),before);visuals.dispose();
});
