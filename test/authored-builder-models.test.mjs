import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createSavedCustomModel,prepareAuthoredBuilderModel} from '../public/js/authored-builder-models.js';
test('atlas and game rebuild the same saved custom strokes and authored model dimensions',()=>{
 const model=createSavedCustomModel({form:'solid',color:'#aabbcc',strokes:[{tool:'rectangle',points:[{x:240,y:280},{x:340,y:180}]}]});assert.ok(model.children.length);const bounds=new THREE.Box3().setFromObject(model);assert.ok(bounds.getSize(new THREE.Vector3()).x>.9);
 const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial());mesh.position.y=1;group.add(mesh);prepareAuthoredBuilderModel(group,{targetHeight:10});group.updateMatrixWorld(true);const fitted=new THREE.Box3().setFromObject(group);assert.ok(Math.abs(fitted.min.y)<1e-8);assert.ok(Math.abs(fitted.getSize(new THREE.Vector3()).y-10)<1e-8);
});
