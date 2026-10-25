import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {isCleanSportsEnvironment,canonicalWorldId,legacyArcadeDestination,BASKETBALL_SOURCE_COMMIT} from '../public/js/sports-worlds.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {replaceServerStreets} from '../public/js/environments/server-streets.js';
import {collectSlimeFloorMeshes} from '../public/js/environments/slime-floor.js';
import {selectedWorldId} from '../public/js/world-navigation.js';
import {FIRING_RANGE_TARGETS,firingRangeTargetOffset} from '../public/js/firing-range.js';
const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
const streets=[{id:'crossing',name:'Crossing',width:5,from:{x:-20,z:0},to:{x:20,z:0}}];
for(const id of ['basketball-arena','hockey-arena','firing-range','neon-junction'])test(`${id} rejects roads and slime even after a map refresh`,()=>{
 const env={...maps.find(m=>m.id===id),streets};assert.ok(isCleanSportsEnvironment(env));
 const root=createBuilderLand(env);replaceServerStreets(root,streets);assert.equal(root.getObjectByName('SERVER_STREETS'),undefined);
 const world=new THREE.Group();world.add(root);replaceServerStreets(world,streets);assert.equal(world.getObjectByName('SERVER_STREETS'),undefined);
 assert.equal(collectSlimeFloorMeshes(world).length,0);
 root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});
});
test('ordinary worlds retain their roads and slime floor effects',()=>{
 const root=createBuilderLand({id:'ordinary',builderScene:{layout:'grand-floor',mapSize:40},streets});
 replaceServerStreets(root,streets);assert.ok(root.getObjectByName('SERVER_STREETS'));assert.ok(collectSlimeFloorMeshes(root).length);
});
test('legacy basketball links return to the original native arena, and arcade-only games resolve inside Neon Junction',()=>{
 assert.equal(canonicalWorldId('basketball'),'basketball-arena');
 const registry={find:id=>maps.find(m=>m.id===id),all:()=>maps};
 assert.equal(selectedWorldId(registry,new URLSearchParams('environment=basketball')),'basketball-arena');
 assert.match(legacyArcadeDestination('basketball'),/^model-explorer.html\?environment=basketball-arena/);
 for(const id of ['shooting','air-hockey','billiards'])assert.match(legacyArcadeDestination(id),/arcade.html\?environment=neon-junction&attraction=/);
 assert.equal(legacyArcadeDestination('neon-junction'),null);
 assert.equal(maps.find(m=>m.id==='basketball-arena').sourceCommit,BASKETBALL_SOURCE_COMMIT);
});
test('range silhouettes follow authoritative target motion without moving floor geometry',()=>{
 const root=createBuilderLand(maps.find(m=>m.id==='firing-range')),targets=[];
 root.traverse(node=>{if(node.isGroup&&node.userData.rangeTargetId)targets.push(node);});assert.equal(targets.length,10);
 const floors=[];root.updateMatrixWorld(true);root.traverse(mesh=>{if(mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'))floors.push({mesh,matrix:mesh.matrixWorld.clone()});});assert.ok(floors.length);
 const settings={mode:'moving',targetSpeed:1};root.userData.setFiringRangeState({state:'live',settings},{serverTime:1000});root.userData.updateFiringRangeEffects(2000);
 for(const target of targets){const definition=FIRING_RANGE_TARGETS.find(item=>item.id===target.userData.rangeTargetId),expected=firingRangeTargetOffset(definition,2000,settings);assert.ok(Math.abs(target.position.x-expected.x)<1e-9,definition.id);if(definition.moving)assert.notEqual(target.position.x,definition.position.x);}
 root.updateMatrixWorld(true);for(const {mesh,matrix}of floors)assert.deepEqual(mesh.matrixWorld.elements,matrix.elements);
});
