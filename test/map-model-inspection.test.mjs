import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {inspectMapModels} from '../public/js/map-model-inspection.js';

const box=()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
function placed(id){const root=new THREE.Group();root.userData.builderObjectId=id;root.add(box());return root;}

test('model inspection verifies authored placement identities and real installed geometry',()=>{
 const world=new THREE.Group(),decor=new THREE.Group();world.add(box());decor.add(placed('crane'),placed('truck'));
 const report=inspectMapModels({world,decor,expected:[{id:'crane',modelId:'tower-crane'},{id:'truck',modelId:'site-dumptruck'}],
  renderer:{info:{render:{calls:8,triangles:36},memory:{geometries:3,textures:2}}},pending:{environment:1}});
 assert.equal(report.environment.meshes,1);assert.equal(report.placed.meshes,2);
 assert.equal(report.environment.triangles,12);assert.equal(report.placed.triangles,24);
 assert.equal(report.placements.loaded,2);assert.deepEqual(report.placements.missing,[]);assert.deepEqual(report.placements.empty,[]);
 assert.deepEqual(report.pending,{environment:1,authored:0,actors:0});assert.equal(report.render.triangles,36);
});

test('missing and empty models fail population evidence while deferred stations remain explicit',()=>{
 const decor=new THREE.Group();decor.add(placed('valid'));const empty=new THREE.Group();empty.userData.builderObjectId='empty';decor.add(empty);
 const report=inspectMapModels({decor,expected:[{id:'valid',modelId:'crate'},{id:'missing',modelId:'upload'},{id:'empty',modelId:'empty'},{id:'casino',casinoStation:true}]});
 assert.deepEqual(report.placements.missing,['missing']);assert.deepEqual(report.placements.empty,['empty']);
 assert.deepEqual(report.placements.deferred,['casino']);assert.equal(report.placements.expected,3);
 assert.deepEqual(report.embedded.missing,['casino']);
});

test('inspection catches invalid vertices and transforms instead of accepting a nonempty scene',()=>{
 const world=new THREE.Group(),broken=box(),invalid=box();broken.name='broken-vertices';broken.geometry.attributes.position.array[7]=NaN;
 invalid.name='broken-transform';invalid.position.x=Infinity;world.add(broken,invalid);
 const report=inspectMapModels({world});
 assert.deepEqual(report.environment.invalid.map(item=>item.issue),['non-finite vertices','non-finite transform']);
});

test('inspection counts active instances and preserves dynamic visibility and culling state',()=>{
 const world=new THREE.Group(),batch=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),5);
 batch.frustumCulled=false;const hidden=box();hidden.visible=false;world.add(batch,hidden);
 const report=inspectMapModels({world});assert.equal(report.environment.meshes,2);assert.equal(report.environment.visibleMeshes,1);
 assert.equal(report.environment.triangles,72);assert.equal(batch.frustumCulled,false);assert.equal(hidden.visible,false);
});

test('installed actor identities do not remain pending when the load registry retains them',()=>{
 const decor=new THREE.Group();decor.add(placed('installed'));
 const report=inspectMapModels({decor,pending:{actors:new Set(['installed','loading'])}});
 assert.equal(report.pending.actors,1);
});

test('native stations embedded in the world and spawned models are inspected rather than silently excluded',()=>{
 const world=new THREE.Group(),decor=new THREE.Group(),station=placed('irrelevant');station.name='casino-table-1';world.add(station);
 decor.add(placed('spawned'));
 const report=inspectMapModels({world,decor,expected:[{id:'casino-table-1',casinoStation:true}],
  actors:[{id:'spawned',spawned:true},{id:'missing-actor',spawned:true},{id:'managed-target',spawned:true,rangeManaged:true}]});
 assert.equal(report.embedded.expected,1);assert.equal(report.embedded.loaded,1);assert.deepEqual(report.embedded.missing,[]);
 assert.equal(report.actors.expected,2);assert.equal(report.actors.loaded,1);assert.deepEqual(report.actors.missing,['missing-actor']);
});
