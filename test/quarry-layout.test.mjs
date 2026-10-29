import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {quarryWorld,quarryConveyorPlacement} from '../quarry-world.mjs';
import {QUARRY_MATERIALS} from '../public/js/quarry-config.js';
import {createQuarryModel} from '../public/js/quarry-models.js';
import {placementMeshes} from '../public/js/placed-item-collision.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {stepRoadVehicle} from '../public/js/road-vehicles.js';
import {constructionGroundAt} from '../public/js/construction-collision.js';
import {roadMovementBlocked} from '../server-road-vehicles.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' vs '+b);
const dispose=root=>root.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material?.dispose();});
function placed(item){const root=createQuarryModel(item.modelId);root.position.set(item.position.x,item.position.y,item.position.z);root.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);root.scale.set(item.scale.x,item.scale.y,item.scale.z);root.updateMatrixWorld(true);return root;}

test('the native processing network places every conveyor endpoint at its declared physical joint',async()=>{
 const map=quarryWorld(),objects=new Map(map.builderScene.objects.map(o=>[o.id,o]));
 assert.equal(map.quarry.links.length,13);assert.deepEqual(map.builderScene.layoutMeta.quarry,map.quarry);
 for(const link of map.quarry.links){
  const item=objects.get(link.actorId);assert.equal(item.modelId,'quarry-conveyor');assert.equal(item.placementAnchor,'origin');
  const root=placed(item),a=new THREE.Vector3(0,1.5,-6).applyMatrix4(root.matrixWorld),b=new THREE.Vector3(0,1.5,6).applyMatrix4(root.matrixWorld);
  for(const axis of ['x','y','z']){close(a[axis],link.from[axis]);close(b[axis],link.to[axis]);}dispose(root);
 }
 const registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));assert.deepEqual(registry.find(m=>m.id===map.id),map);
 assert.throws(()=>quarryConveyorPlacement({x:0,y:0,z:0},{x:0,y:4,z:0}),/nonvertical/);
});

test('six segregated output routes terminate above their live material patch rather than creating false ground',()=>{
 const map=quarryWorld(),outputs=map.quarry.links.filter(l=>l.kind==='product-output');
 assert.deepEqual(outputs.map(l=>l.material).sort(),Object.keys(QUARRY_MATERIALS).sort());
 for(const link of outputs){const patch=map.construction.earthworks.patches.find(p=>p.id===map.quarry.outputPatches[link.material]);assert.ok(patch);close(link.to.x,patch.x);close(link.to.z,patch.z);assert.ok(link.to.y>8.9);}
 for(const item of map.builderScene.objects.filter(o=>o.id.startsWith('quarry-bay-marker-')||o.id.startsWith('quarry-bay-'))){
  assert.ok(map.construction.earthworks.patches.every(p=>Math.abs(item.position.x-p.x)>=p.width/2||Math.abs(item.position.z-p.z)>=p.depth/2),item.id+' must not block the mutable pile');
 }
});

test('physical product conveyor structures clear the haul road by at least six metres',()=>{
 const map=quarryWorld(),objects=new Map(map.builderScene.objects.map(o=>[o.id,o]));
 for(const link of map.quarry.links.filter(l=>l.kind==='product-output')){
  const root=placed(objects.get(link.actorId));
  for(const mesh of placementMeshes(root)){const bounds=new THREE.Box3().setFromObject(mesh);assert.ok(bounds.min.y>=6,link.id+' low '+mesh.name+' '+bounds.min.y);}
  dispose(root);
 }
 const outlet=map.quarry.links.find(l=>l.kind==='product-output').from,stacker=map.builderScene.objects.find(o=>o.id==='quarry-stacker'),root=placed(stacker);
 // The native stacker has a raised/tilted conveyor group relative to its tracks.
 const deck=root.getObjectByName('QUARRY_RUBBER_DECK');assert.ok(deck);const deckTip=new THREE.Vector3(0,0,8).applyMatrix4(deck.matrixWorld);
 for(const axis of ['x','y','z'])close(deckTip[axis],outlet[axis]);dispose(root);
});

test('a native haul truck drives beneath the new product conveyor bridge without a collision bypass',()=>{
 const map=quarryWorld(),runtime=new AuthoritativeRooms({now:()=>1000}),room={objects:{}},sim=runtime.initialize(room,map).sim,truck=sim.actors['quarry-truck'];
 sim.construction.crew.enabled=false;truck.position={x:145,y:.02,z:8};truck.rotation={x:0,y:Math.PI/2,z:0};truck.driving={speed:0};
 for(let i=0;i<500&&truck.position.x>58;i++){
  const state=stepRoadVehicle(truck,{forward:.4,side:0},.1,{groundAt:p=>constructionGroundAt(truck,p,q=>runtime.collision.groundAt(map,q,{actors:{...sim.actors,[truck.id]:{...truck,active:false}},objects:{},earthworks:sim.construction.earthworks})),blocked:(from,to,yaw)=>roadMovementBlocked(runtime.collision,map,sim.actors,{},truck,from,to,yaw,{earthworks:sim.construction.earthworks})});
  Object.assign(truck,state);
 }
 assert.ok(truck.position.x<60,'truck blocked by the new network: '+JSON.stringify(truck.position));assert.ok(Math.abs(truck.position.z-8)<.01);assert.ok(!truck.driving.blocked);
});
