import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {BUILDING_MATERIALS,createBuildingBlock} from '../public/js/building-materials.js';
import {BUILDER_MODEL_INFO,createBuilderModel} from '../public/js/builder-models-3d.js';
import {placementBounds} from '../public/js/placed-item-collision.js';
import {alignStackableObject} from '../public/js/stack-placement.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
function release(root){root.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});}
test('every solid building material aligns its physical base and rises over an occupied floor',()=>{
 const support=new THREE.Mesh(new THREE.BoxGeometry(100,2,100),new THREE.MeshBasicMaterial());support.position.y=1;
 for(const material of BUILDING_MATERIALS){
  const root=createBuildingBlock(THREE,material.id);root.scale.set(.8,1.3,.7);root.rotation.y=.6;
  alignStackableObject(THREE,root,new THREE.Vector3(0,1,0),[support]);
  const bounds=placementBounds(THREE,root);if(material.solid!==false){near(bounds.min.y,2,material.id);assert.ok(bounds.max.y>bounds.min.y,material.id);}
  else assert.ok(bounds.isEmpty(),material.id+' remains non-solid');release(root);
 }
 release(support);
});
test('every catalog model with physical geometry shares base alignment and stacking',()=>{
 const support=new THREE.Mesh(new THREE.BoxGeometry(1000,2,1000),new THREE.MeshBasicMaterial());support.position.y=1;
 for(const id of Object.keys(BUILDER_MODEL_INFO)){
  const root=createBuilderModel(id);assert.ok(root,id);root.scale.set(1.1,.8,.9);root.rotation.y=.4;
  alignStackableObject(THREE,root,new THREE.Vector3(0,3,0));
  const bounds=placementBounds(THREE,root);if(!bounds.isEmpty()){near(bounds.min.y,3,id);alignStackableObject(THREE,root,new THREE.Vector3(0,1,0),[support]);near(placementBounds(THREE,root).min.y,2,id+' stacked');}release(root);
 }
});
test('direct server inventory drops stack without requiring a client placement panel',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'universal-stack',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[]}},asset={id:'floor',buildAssetId:'grand-floor'},rotation={x:0,y:0,z:0},scale={x:1,y:1,z:1};
 const first=collision.stackAsset(environment,asset,{x:0,y:0,z:0},rotation,scale);
 const actors={one:{id:'one',spawned:true,active:true,asset,position:first,rotation,scale}};
 const second=collision.stackAsset(environment,asset,{x:0,y:0,z:0},rotation,scale,actors);
 assert.ok(second.y>first.y+.23);near(second.y-first.y,.24,'floor-to-floor stacking');
});

test('saved editor collider-base anchors retain elevation after rotation, scaling and reload',()=>{
 const object={id:'saved',modelId:'grand-floor',placementAnchor:'collider-base',position:{x:4,y:3,z:2},rotation:{x:.2,y:.6,z:.3},scale:{x:2,y:1.5,z:.8}};
 const collision=new ServerBuilderCollision(),world=collision.world({id:'saved-anchor',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[object]}});
 const root=world.root.children.find(root=>root.userData.builderObjectId==='saved');assert.ok(root);near(placementBounds(THREE,root).min.y,3,'saved collider floor');
});
