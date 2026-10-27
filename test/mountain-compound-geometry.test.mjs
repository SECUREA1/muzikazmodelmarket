import test from 'node:test';
import assert from 'node:assert/strict';
import {mountainCompoundWorld} from '../factory-testing-world.mjs';
import {COMPOUND_STATIONS,COMPOUND_GATE} from '../public/js/factory-test-config.js';
import {createMountainCompoundLand} from '../public/js/mountain-compound-model.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import * as THREE from '../public/vendor/three/three.module.min.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
function walk(collision,map,position,waypoints,label){
 for(const [x,z]of waypoints){const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.25),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};}assert.ok(Math.hypot(position.x-x,position.z-z)<.15,label+' reaches '+x+','+z+'; actual '+position.x+','+position.z);}
 return position;
}

test('compound station approaches, observation gallery and deep entry have physical floor and body clearance',()=>{
 const map=mountainCompoundWorld(),collision=new ServerBuilderCollision();
 const spawn=collision.safeSpawn(map,map.spawn);assert.ok(Math.hypot(spawn.x,spawn.y-.02,spawn.z-35)<.001);
 for(const entry of [...COMPOUND_STATIONS,{id:'observation',position:{x:24,y:.02,z:-20}},{id:'deep-entry',position:COMPOUND_GATE.deepEntry}]){
  const floor=collision.groundAt(map,entry.position,{entry:true});assert.ok(floor,entry.id+' has a floor');assert.ok(collision.hasBodyClearance(map,floor,.38),entry.id+' has player clearance');assert.ok(Math.abs(floor.y-.02)<.04,entry.id+' is on the main level');
 }
 const wall=collision.resolve(map,{x:7,y:.02,z:20},{x:9,y:.02,z:20});assert.ok(wall.x<8,'corridor side walls contain walking movement');
 dispose(collision.world(map).root);
});

test('lift, containment puzzle, deep hatch and observation gallery connect through clear walking aisles',()=>{
 const map=mountainCompoundWorld(),collision=new ServerBuilderCollision();
 const containment=walk(collision,map,{...map.spawn},[[3.1,35],[3.1,27],[0,27],[0,8]],'containment');
 // Walk beside the control desk before passing through its broad security arch.
 const hatch=walk(collision,map,containment,[[3.1,8],[3.1,0],[0,0],[0,-20]],'deep hatch');
 assert.ok(Math.hypot(hatch.x,hatch.z+20)<.15);
 walk(collision,map,{...hatch},[[24,-20]],'observation');
 // The live server separately verifies deep clearance at the -26m boundary.
 walk(collision,map,{...hatch},[[3.1,-20],[3.1,-28],[0,-28],[0,-42]],'deep hall');
 dispose(collision.world(map).root);
});

test('compound cutaway retains visible detail and bounded state-driven effects without duplicate editable equipment',()=>{
 const scene=createMountainCompoundLand();scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(scene);
 assert.equal(bounds.max.x-bounds.min.x,160);assert.equal(bounds.max.z-bounds.min.z,160);
 assert.ok(scene.getObjectByName('COMPOUND_CONTAINMENT_CORE'),'standalone scenery includes a power core');
 assert.ok(scene.getObjectByName('COMPOUND_OBSERVATION_FRAME'));assert.ok(scene.getObjectByName('COMPOUND_DEEP_SECURITY_ARCH_JAMB'));
 assert.equal(scene.getObjectByName('COMPOUND_CEILING'),undefined,'opaque ceilings do not hide the playable floor');
 scene.userData.setTestingState({player:{testing:{clearance:{deep:true},containment:{status:'solved'}}}},1234);
 for(const t of [0,1,100000])scene.userData.updateTestingEffects(t,true);
 assert.equal(scene.userData.testingVisualState.deepOpen,true);assert.equal(scene.userData.testingVisualState.containmentState,'solved');
 let invalid=0;scene.traverse(node=>{if(![...node.position.toArray(),...node.scale.toArray(),...node.rotation.toArray().slice(0,3)].every(Number.isFinite))invalid++;});assert.equal(invalid,0);
 const editable=createMountainCompoundLand({builderScene:{layoutMeta:{factoryTesting:{editableEquipment:true}}}});
 assert.equal(editable.getObjectByName('COMPOUND_CONTAINMENT_CORE'),undefined);assert.equal(editable.getObjectByName('COMPOUND_CONTAINMENT_CONSOLE_BASE'),undefined,'editable objects supply their own station console');
 const canonical=createMountainCompoundLand(mountainCompoundWorld());assert.equal(canonical.getObjectByName('COMPOUND_CONTAINMENT_CORE'),undefined,'placed core is rendered once by the normal item pipeline');
 dispose(scene);dispose(editable);dispose(canonical);
});
