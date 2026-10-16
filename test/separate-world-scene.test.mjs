import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {transformSceneLayer} from '../public/js/scene-layer-transform.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {builderBaseSpawn} from '../public/js/environments/builder-base.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {replaceServerStreets} from '../public/js/environments/server-streets.js';
test('scene adjustments are reversible and preserve independent world metadata and item identities',()=>{
 const objects=[{id:'a',position:{x:2,y:3,z:4},rotation:{x:.2,y:.3,z:.4},scale:{x:1,y:2,z:3},functionalSettings:{behavior:'seat'}}],original=structuredClone(objects),t={x:20,y:5,z:-30,rotation:90,scale:2};
 const moved=transformSceneLayer(objects,{},t);assert.equal(moved[0].id,'a');assert.equal(moved[0].position.x,28);assert.equal(moved[0].position.z,-34);assert.equal(moved[0].position.y,11);assert.deepEqual(objects,original);assert.equal(moved[0].functionalSettings.behavior,'seat');
 const reset=transformSceneLayer(moved,t,{});for(const key of ['position','rotation','scale'])for(const axis of ['x','y','z'])assert.ok(Math.abs(reset[0][key][axis]-objects[0][key][axis])<1e-9);
});
test('procedural world moves independently of authored scene objects and server floors follow it',()=>{
 const environment={id:'separated',builderScene:{layout:'grand-floor',mapSize:40,baseTransform:{x:140,y:6,z:-90,rotation:90,scale:1.5},objects:[{id:'seat',modelId:'sofa',position:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'seat'}}]}};
 const client=createBuilderLand(environment),collision=new ServerBuilderCollision(),world=collision.world(environment),spawn=builderBaseSpawn(environment),safe=collision.safeSpawn(environment,spawn);
 assert.ok(safe.x>100);assert.ok(safe.z<-50);assert.ok(Math.abs(safe.y-6.02)<1e-5);assert.equal(world.root.children.find(o=>o.userData.builderObjectId==='seat').position.x,0);
 const clientFloor=client.children.find(o=>o.name.startsWith('BUILDER_WALKABLE_FLOOR')),serverFloor=world.floors.find(o=>o.name.startsWith('BUILDER_WALKABLE_FLOOR'));client.updateMatrixWorld(true);assert.deepEqual(clientFloor.matrixWorld.elements,serverFloor.matrixWorld.elements);
 environment.builderScene.baseTransform.x=200;assert.notEqual(collision.world(environment),world,'alignment invalidates cached collision even before timestamp changes');
});
test('live street refresh remains inside the transformed world layer',()=>{
 const outer=new THREE.Group(),land=createBuilderLand({id:'road',builderScene:{baseTransform:{x:100},layout:'grand-floor'}});outer.add(land);replaceServerStreets(outer,[{name:'Test',from:{x:-10,z:0},to:{x:10,z:0},width:5}]);assert.equal(outer.children.length,1);assert.equal(land.getObjectByName('SERVER_STREETS').parent,land);outer.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(land.getObjectByName('SERVER_STREETS')).min.x>80);
});
