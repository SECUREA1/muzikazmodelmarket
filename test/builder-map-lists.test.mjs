import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {INLAY_MAPS,isInlayMapObject,retainedInlayMaps} from '../public/js/builder-map-lists.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';

test('the inlay list contains real, placeable room and compound meshes',()=>{
 assert.equal(new Set(INLAY_MAPS.map(item=>item.id)).size,INLAY_MAPS.length);
 for(const entry of INLAY_MAPS){
  const root=createBuilderModel(entry.id);assert.ok(root,entry.id);assert.ok(root.userData.placementSurface);assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length()>0);
  const object={id:'inlay-'+entry.id,modelId:entry.id,builderLayer:'inlay',asset:{buildAssetId:entry.id},position:{x:3,y:0,z:4},rotation:{x:0,y:.4,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'}};
  const manifest=compileBuilderScene({layout:'grand-floor',mapSize:80,objects:[object]});const saved=manifest.objects.find(item=>item.objectId===object.id);
  assert.equal(saved.asset.buildAssetId,entry.id);assert.deepEqual(saved.transform.position,object.position);assert.equal(isInlayMapObject(object),true);
 }
});

test('world replacement retains independent inlays without retaining generated world buildings',()=>{
 const room={id:'room',modelId:'open-studio',position:{x:2,y:0,z:5}},compound={id:'house',modelId:'estate-house',builderLayer:'inlay',position:{x:12,y:0,z:4}},generated={id:'urban-safehouse',modelId:'estate-house',position:{x:0,y:0,z:0}};
 const scene={layout:'urban-downtown',objects:[room,compound,generated,{id:'chair',modelId:'armchair'}]},retained=retainedInlayMaps(scene);
 assert.deepEqual(retained,[room,compound]);retained[0].position.x=99;assert.equal(room.position.x,2);assert.equal(scene.layout,'urban-downtown');
 assert.equal(isInlayMapObject({modelId:'backpack-room',asset:{buildAssetId:'open-studio'}}),true);
});
