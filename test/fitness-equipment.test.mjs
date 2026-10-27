import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FITNESS_ITEMS,FITNESS_MODEL_INFO,createFitnessEquipment,fitnessItemSettings,updateFitnessScoreboard} from '../public/js/fitness-equipment.js';
import {FITNESS_GAMES} from '../public/js/fitness-rules.js';

const close=(a,b)=>Math.abs(a-b)<1e-6;
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const m of [].concat(node.material||[]))if(m)resources.add(m);});for(const resource of resources)resource.dispose();}

test('all31 gym upgrade models have physical geometry, exact grounded bounds and gold material',()=>{
 assert.equal(Object.keys(FITNESS_ITEMS).length,31);
 for(const [id,info]of Object.entries(FITNESS_ITEMS)){
  const root=createFitnessEquipment(id);assert.ok(root?.isGroup,id);assert.deepEqual(root.scale.toArray(),[1,1,1],id+' lets Builder own its public scale');
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()).toArray(),centre=bounds.getCenter(new THREE.Vector3());
  assert.ok(close(bounds.min.y,0),id+' rests on floor');assert.ok(close(centre.x,0)&&close(centre.z,0),id+' centred footprint');
  size.forEach((value,i)=>assert.ok(close(value,info.dimensions[i]),id+' matches published dimension '+i));
  const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});assert.ok(meshes.length>=3,id+' detailed geometry');assert.ok(meshes.some(node=>node.material.metalness>.5),id+' gold finish');
  assert.deepEqual(FITNESS_MODEL_INFO[id],[info.name,info.description,info.dimensions]);assert.ok(Number.isSafeInteger(info.priceMzk)&&info.priceMzk>0,id+' purchase price');
  root.scale.set(2,.5,1.5);const scaled=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray();scaled.forEach((value,i)=>assert.ok(close(value,info.dimensions[i]*[2,.5,1.5][i]),id+' Builder scaling preserves authored size'));dispose(root);
 }
 assert.equal(createFitnessEquipment('not-gym-equipment'),null);
});

test('upgrade placement settings expose only valid fitness station kinds and safe approach coordinates',()=>{
 for(const [id,item]of Object.entries(FITNESS_ITEMS)){
  const settings=fitnessItemSettings(id);assert.equal(settings.destructible,false);assert.equal(settings.behavior,item.kind?'interact':'decor');
  if(item.kind){assert.ok(FITNESS_GAMES[item.kind],id+' supports a playable game');assert.equal(settings.fitnessStation,item.kind);assert.equal(settings.interactionDistance,4);assert.ok(['x','y','z'].every(axis=>Number.isFinite(settings.fitnessApproach[axis])));assert.ok(Math.hypot(settings.fitnessApproach.x,settings.fitnessApproach.z)>1);}
  else assert.equal(settings.fitnessStation,undefined);
 }
 assert.equal(fitnessItemSettings('missing'),null);
});


function physicalMeshes(root){const found=[];root.traverse(node=>{if(!node.isMesh)return;for(let parent=node;parent;parent=parent.parent)if(parent.userData.collisionDisabled)return;found.push(node);});return found;}
function blocked(root,from,to){const origin=new THREE.Vector3(...from),destination=new THREE.Vector3(...to),direction=destination.clone().sub(origin),length=direction.length();root.updateMatrixWorld(true);return new THREE.Raycaster(origin,direction.normalize(),.001,length-.001).intersectObjects(physicalMeshes(root),false).length>0;}

test('championship ring has four rope levels, distinct corners and a physically clear south entrance',()=>{
 const root=createFitnessEquipment('fitness-boxing-ring'),heights=new Set(),colours=new Set();root.updateMatrixWorld(true);
 root.traverse(mesh=>{if(mesh.name.startsWith('FITNESS_RING_ROPE_SIDE_'))heights.add(mesh.getWorldPosition(new THREE.Vector3()).y.toFixed(2));if(mesh.name==='FITNESS_CORNER_PAD')colours.add(mesh.material.color.getHex());});
 assert.equal(heights.size,4);assert.ok(colours.has(0xd34d57)&&colours.has(0x4c82c6),'red and blue corners are distinct');
 assert.equal(blocked(root,[0,1.03,8],[0,1.03,0]),false,'entry gap has no invisible rope collider');
 assert.equal(blocked(root,[4,1.03,8],[4,1.03,0]),true,'ropes beside the opening remain solid');
 assert.ok(root.getObjectByName('FITNESS_RING_ACCESS_STEP'));assert.ok(root.getObjectByName('FITNESS_RING_ACCESS_TREAD'));
 const apron=new THREE.Box3().setFromObject(root.getObjectByName('FITNESS_RING_APRON'));assert.ok(close(apron.max.y,.16),'low apron remains directly walkable');dispose(root);
});

test('competition equipment preserves regulation dimensions and clear running lanes',()=>{
 const hoop=createFitnessEquipment('fitness-basketball-hoop');hoop.updateMatrixWorld(true);assert.ok(close(hoop.getObjectByName('FITNESS_REGULATION_BASKETBALL_RIM').getWorldPosition(new THREE.Vector3()).y,3.05),'regulation rim height');
 const table=createFitnessEquipment('fitness-table-tennis');table.updateMatrixWorld(true);const top=new THREE.Box3().setFromObject(table.getObjectByName('FITNESS_TABLE_TENNIS_TOP')),net=new THREE.Box3().setFromObject(table.getObjectByName('FITNESS_TABLE_NET'));
 assert.ok(close(top.max.y,.76));assert.ok(close(top.max.x-top.min.x,2.74));assert.ok(close(top.max.z-top.min.z,1.525));assert.ok(close(net.max.y-net.min.y,.1525));
 const sprint=createFitnessEquipment('fitness-sprint-gates');
 assert.equal(blocked(sprint,[0,.65,16],[0,.65,-16]),false,'middle sprint lane remains clear through both timing gates');
 assert.equal(blocked(sprint,[3.1,.65,10],[3.1,.65,-10]),true,'right training lane includes real hurdle crossbars');
 for(const root of [hoop,table,sprint])dispose(root);
});

test('physical ring scoreclock follows shared scores, round and time after cloning',()=>{
 const root=createFitnessEquipment('fitness-ring-scoreboard'),copy=root.clone(true);
 assert.equal(updateFitnessScoreboard(copy,{red:12,blue:8,round:3,seconds:89}),true);
 for(const [name,value]of Object.entries({RED_TENS:1,RED_UNITS:2,BLUE_TENS:0,BLUE_UNITS:8,ROUND_TENS:0,ROUND_UNITS:3,TIME_MIN_TENS:0,TIME_MIN_UNITS:1,TIME_SEC_TENS:2,TIME_SEC_UNITS:9})){const digit=copy.getObjectByName('FITNESS_SCORE_'+name);assert.equal(digit.userData.scoreValue,value);assert.ok(digit.children.some(mesh=>mesh.visible));}
 assert.equal(root.getObjectByName('FITNESS_SCORE_RED_TENS').userData.scoreValue,0,'updating a clone leaves source display unchanged');
 updateFitnessScoreboard(copy,{red:-9,blue:123,round:Infinity,seconds:Infinity});assert.equal(copy.getObjectByName('FITNESS_SCORE_RED_UNITS').userData.scoreValue,0);assert.equal(copy.getObjectByName('FITNESS_SCORE_BLUE_TENS').userData.scoreValue,9);
 assert.equal(updateFitnessScoreboard(createFitnessEquipment('fitness-cone'),{}),false);dispose(root);
});
