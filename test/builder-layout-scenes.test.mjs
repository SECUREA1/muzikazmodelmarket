import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {LAYOUT_SCENES,isLayoutSceneObject} from '../public/js/builder-layout-scenes.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {retainedInlayMaps} from '../public/js/builder-map-lists.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

test('activity layouts are independent placeable modules with real floors and saved transforms',()=>{
 assert.equal(Object.keys(LAYOUT_SCENES).length,14);
 for(const item of Object.values(LAYOUT_SCENES)){
  const root=createBuilderModel(item.id);assert.ok(root.userData.placementSurface);assert.equal(root.userData.layoutScene,item.layout);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(root).min.y)<.00001);
  const object={id:item.id,modelId:item.id,asset:{buildAssetId:item.id},builderLayer:'scene',position:{x:12,y:.08,z:7},rotation:{x:0,y:Math.PI/4,z:0},scale:{x:.5,y:.5,z:.5},groundOffset:.08,functionalSettings:{behavior:'decor'}};
  assert.ok(isLayoutSceneObject(object));assert.deepEqual(retainedInlayMaps({objects:[object]}),[object]);
  const saved=compileBuilderScene({layout:'urban-downtown',objects:[object]}).objects[0];assert.deepEqual(saved.transform.position,object.position);assert.deepEqual(saved.transform.scale,object.scale);
 }
});
test('translated and scaled firing-range collision follows the module rather than the map center',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'movable-range',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:160,objects:[{id:'range',modelId:'scene-firing-range',asset:{buildAssetId:'scene-firing-range'},position:{x:25,y:.08,z:10},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:.5,y:.5,z:.5},functionalSettings:{behavior:'decor'}}]}};
 const world=collision.world(environment),module=world.root.children.find(root=>root.userData.builderObjectId==='range');assert.ok(module);
 assert.deepEqual(module.position.toArray(),[25,.08,10]);assert.equal(module.scale.x,.5);
 const targets=[];module.traverse(n=>{if(n.userData.rangeTarget)targets.push(n);});assert.ok(targets.length>=15);
 for(const target of targets){const position=target.getWorldPosition(new THREE.Vector3());assert.ok(position.x>15&&position.x<35);}
 const center=collision.safeSpawn(environment,{x:0,y:0,z:0});assert.ok(Math.abs(center.x)<.1&&Math.abs(center.z)<.1,'Moving the range leaves the map center clear');
});
