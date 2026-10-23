import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FITNESS_ITEMS,FITNESS_MODEL_INFO,createFitnessEquipment,fitnessItemSettings} from '../public/js/fitness-equipment.js';
import {FITNESS_GAMES} from '../public/js/fitness-rules.js';

const close=(a,b)=>Math.abs(a-b)<1e-6;
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const m of [].concat(node.material||[]))if(m)resources.add(m);});for(const resource of resources)resource.dispose();}

test('all26 gym upgrade models have physical geometry, exact grounded bounds and gold material',()=>{
 assert.equal(Object.keys(FITNESS_ITEMS).length,26);
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
