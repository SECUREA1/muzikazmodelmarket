import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFishingBoat} from '../public/js/fishing-models.js';
import {createFishingScene} from '../public/js/fishing-scene.js';
import {createHarborCamera} from '../public/js/harbor-camera.js';

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
