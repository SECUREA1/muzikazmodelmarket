import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {createInteractiveDevice} from '../public/js/interactive-device-models.js';
import {FITNESS_ITEMS,createFitnessEquipment,updateFitnessScoreboard} from '../public/js/fitness-equipment.js';
import {HOCKEY_ITEMS,createHockeyItem,animateHockeyPose} from '../public/js/hockey-models.js';
import {createArcadePart} from '../public/js/arcade-park.js';
import {createBasketballJersey} from '../public/js/basketball-jerseys.js';
import {createBasketballHoop} from '../public/js/basketball-stadium.js';
import {createPrisonItemModel} from '../public/js/prison-item-models.js';
import {finishGameItem} from '../public/js/game-item-finish.js';
import {DEVICE_DESIGN_IDS,DEVICE_DESIGN_VERSION,supportsDeviceDesign,finishDeviceDesign} from '../public/js/device-design-finish.js';

function create(id){
 if(INTERACTIVE_DEVICES[id])return createInteractiveDevice(THREE,id);
 if(FITNESS_ITEMS[id])return createFitnessEquipment(id);
 if(HOCKEY_ITEMS.some(item=>item.id===id))return createHockeyItem(id);
 if(id.startsWith('arcade-part-'))return createArcadePart(id.slice(12));
 if(id.startsWith('basketball-jersey-'))return createBasketballJersey(THREE,id.endsWith('home')?'home':'away');
 if(id==='basketball-hoop')return createBasketballHoop(THREE);
 if(id==='prison-radio')return createPrisonItemModel(id);
 const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.SphereGeometry(.12,32,24),new THREE.MeshStandardMaterial({color:0xd96b20})));return root;
}
function dispose(root){
 const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();
}
const transform=node=>[...node.position,...node.quaternion,...node.scale];

test('every supported device, sports item and arcade assembly receives bounded visible crafted detail',()=>{
 assert.equal(new Set(DEVICE_DESIGN_IDS).size,DEVICE_DESIGN_IDS.length);
 for(const id of DEVICE_DESIGN_IDS){
  const root=create(id);
  try{
   finishGameItem(THREE,root);
   const placement=transform(root),before=new THREE.Box3().setFromObject(root,true);
   finishDeviceDesign(THREE,root,id);finishGameItem(THREE,root);
   assert.equal(root.userData.deviceDesignFinish,DEVICE_DESIGN_VERSION,id);
   assert.ok(root.userData.deviceDesignDetails>0,id+' receives actual detailing');
   assert.deepEqual(transform(root),placement,id+' keeps its authored placement');
   let meshes=0,triangles=0,details=0;
   root.traverse(node=>{
    if(!node.isMesh)return;meshes++;
    triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);
    assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),id+' finite geometry');
    if(node.userData.nativeDesignDetail){details++;assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.builderRoot,root);assert.equal(node.isLight,undefined);}
   });
   assert.ok(details>0&&details<=3,id+' bounds added draw calls');
   if(INTERACTIVE_DEVICES[id]){assert.ok(meshes<=32,id+' keeps the cabinet mesh budget');assert.ok(triangles<=6000,id+' keeps the cabinet triangle budget');}
   const after=new THREE.Box3().setFromObject(root,true);
   for(const axis of ['x','y','z']){
    assert.ok(Math.abs(before.min[axis]-after.min[axis])<=.005,id+' keeps minimum '+axis);
    assert.ok(Math.abs(before.max[axis]-after.max[axis])<=.005,id+' keeps maximum '+axis);
   }
  }finally{dispose(root);}
 }
});

test('finishing is idempotent and leaves authored media and score geometry untouched',()=>{
 for(const id of ['arcade-slot-machine','shared-video-player','fitness-ring-scoreboard','video-projector']){
  const root=create(id);
  try{
   const protectedNodes=[];root.traverse(node=>{if(node.userData.mediaScreen||node.userData.scoreSegment||/DISPLAY|SCREEN|MARQUEE/.test(node.name||''))protectedNodes.push({node,geometry:node.geometry,material:node.material,pose:transform(node),children:[...node.children]});});
   finishDeviceDesign(THREE,root,id);const count=root.children.length;let detailCount=0;root.traverse(n=>{if(n.userData.nativeDesignDetail)detailCount++;});
   finishDeviceDesign(THREE,root,id);assert.equal(root.children.length,count);
   let repeatedCount=0;root.traverse(n=>{if(n.userData.nativeDesignDetail)repeatedCount++;});assert.equal(repeatedCount,detailCount);
   for(const {node,geometry,material,pose,children}of protectedNodes){assert.equal(node.geometry,geometry,id+' media geometry');assert.equal(node.material,material,id+' media material');assert.deepEqual(transform(node),pose,id+' media anchor');assert.deepEqual(node.children,children,id+' media descendants');}
  }finally{dispose(root);}
 }
});

test('score controls and articulated hockey roles retain their existing named parts and motion',()=>{
 const scoreboard=createFitnessEquipment('fitness-ring-scoreboard'),skater=createHockeyItem('hockey-player');
 try{
  const digit=scoreboard.getObjectByName('FITNESS_SCORE_RED_UNITS'),arm=skater.getObjectByName('HOCKEY_ARM_LEFT');
  finishDeviceDesign(THREE,scoreboard,'fitness-ring-scoreboard');finishDeviceDesign(THREE,skater,'hockey-player');
  assert.equal(scoreboard.getObjectByName('FITNESS_SCORE_RED_UNITS'),digit);assert.equal(skater.getObjectByName('HOCKEY_ARM_LEFT'),arm);
  assert.equal(updateFitnessScoreboard(scoreboard,{red:7,blue:3,seconds:62}),true);assert.equal(digit.userData.scoreValue,7);
  animateHockeyPose(skater,'skate',.7,'goal');assert.equal(arm.rotation.z,-Math.PI/2);assert.ok(skater.getObjectByName('HOCKEY_LEG_LEFT').rotation.x!==0);
 }finally{dispose(scoreboard);dispose(skater);}
});

test('unsupported assets are not claimed as finished devices',()=>{
 const root=new THREE.Group();assert.equal(supportsDeviceDesign('unknown-custom-model'),false);assert.equal(finishDeviceDesign(THREE,root,'unknown-custom-model'),root);assert.equal(root.userData.deviceDesignFinish,undefined);assert.equal(root.children.length,0);
});
