import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {BUILDING_MATERIALS,EXPANDED_BUILDING_PIECES,buildingMaterial,buildingDimensions,createBuildingBlock,buildingIcon,matchesBuildingItem,toggleBuildingObject} from '../public/js/building-materials.js';
import {placementMeshes,placementTriangles,placementBounds} from '../public/js/placed-item-collision.js';
import {alignStackableObject} from '../public/js/stack-placement.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {materialBulkQuote} from '../public/js/game-item-pricing.js';

const dispose=root=>root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
const rayHits=(root,origin,direction)=>{
  root.updateWorldMatrix(true,true);
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObjects(placementMeshes(root),false);
};

test('28 native building pieces have real compound models, fitting dimensions, collision and matching artwork',()=>{
  assert.equal(EXPANDED_BUILDING_PIECES.length,28);
  assert.equal(new Set(BUILDING_MATERIALS.map(item=>item.id)).size,BUILDING_MATERIALS.length);
  for(const piece of EXPANDED_BUILDING_PIECES){
    const root=createBuildingBlock(THREE,piece.id),bounds=placementBounds(THREE,root),size=bounds.getSize(new THREE.Vector3());
    assert.equal(buildingMaterial(piece.id).id,piece.id);
    assert.deepEqual(buildingDimensions(piece.id),piece.dimensions);
    assert.ok(root.children.length>1,piece.id+' has compound geometry');
    for(let axis=0;axis<3;axis++){
      assert.ok(Number.isFinite(size.getComponent(axis))&&size.getComponent(axis)>0,piece.id+' has finite geometry');
      assert.ok(size.getComponent(axis)<=piece.dimensions[axis]+.001,piece.id+' fits its declared footprint');
    }
    assert.ok(placementTriangles(THREE,[root]).length>0,piece.id+' participates in collision');
    assert.match(buildingIcon(THREE,piece.id),/<path d=/,piece.id+' projects real artwork');
    alignStackableObject(THREE,root,new THREE.Vector3(0,2,0));
    assert.ok(Math.abs(placementBounds(THREE,root).min.y-2)<1e-5,piece.id+' anchors to the selected floor');
    dispose(root);
  }
});

test('full-height staircases use walkable tread rises instead of an enclosing solid box',()=>{
  for(const id of ['storey-staircase','service-staircase','garden-staircase']){
    const piece=buildingMaterial(id),root=createBuildingBlock(THREE,id),[width,height,depth]=piece.dimensions;
    const treadMeshes=root.children.filter(mesh=>mesh.geometry.type==='BoxGeometry'&&mesh.geometry.parameters.width===width&&mesh.geometry.parameters.depth>.1);
    let previous=-height/2;
    assert.ok(treadMeshes.length>=4,id);
    for(let index=0;index<treadMeshes.length;index++){
      const z=-depth/2+depth*(index+.5)/treadMeshes.length,hit=rayHits(root,[0,height,z],[0,-1,0])[0];
      assert.ok(hit,id+' has a support surface');
      assert.ok(hit.point.y>previous&&hit.point.y-previous<=.221,id+' has a walkable rise');
      previous=hit.point.y;
    }
    dispose(root);
  }
});

test('double doors toggle their actual blocking leaves and preserve the clear opening',()=>{
  for(const id of ['double-entry-doors','warehouse-loading-gate']){
    const root=createBuildingBlock(THREE,id),before=placementTriangles(THREE,[root]).length;
    assert.ok(rayHits(root,[.35,0,3],[0,0,-1]).length>0,id+' starts closed');
    assert.equal(toggleBuildingObject(root),true);
    assert.ok(placementTriangles(THREE,[root]).length<before,id+' removes leaf collision');
    assert.equal(rayHits(root,[.35,0,3],[0,0,-1]).length,0,id+' opens a genuine passage');
    assert.equal(toggleBuildingObject(root),true);
    assert.ok(rayHits(root,[.35,0,3],[0,0,-1]).length>0,id+' closes again');
    dispose(root);
  }
});

test('walkways, gantries, bollards and corner planting beds retain intended empty space',()=>{
  for(const [id,origin,direction]of [
    ['covered-walkway',[0,-.2,4],[0,0,-1]],
    ['utility-gantry',[0,-.2,2],[0,0,-1]],
    ['safety-bollard-row',[0,0,2],[0,0,-1]],
    ['corner-garden-bed',[.8,2,-.8],[0,-1,0]],
    ['warehouse-pallet-rack',[0,-.8,2],[0,0,-1]],
  ]){
    const root=createBuildingBlock(THREE,id);
    assert.equal(rayHits(root,origin,direction).length,0,id+' has no invisible bounding-box solid');
    dispose(root);
  }
  for(const id of ['framed-window-grid','shopfront-glazing','street-bus-shelter']){
    const root=createBuildingBlock(THREE,id),panes=root.children.filter(mesh=>mesh.material.transparent);
    assert.ok(panes.length>0,id+' has transparent glazing');
    assert.ok(panes.every(mesh=>mesh.material.opacity===.28&&!mesh.material.depthWrite),id);
    dispose(root);
  }
});

test('native pieces use canonical material ownership and one-piece pricing and support descriptive searches',()=>{
  for(const piece of EXPANDED_BUILDING_PIECES){
    const item=GAME_ECONOMY.find(entry=>entry.sku==='material:'+piece.id);
    assert.ok(item,piece.id+' has an authoritative SKU');
    assert.equal(item.materialId,piece.id);
    assert.equal(item.native,true);
    assert.ok(Number.isSafeInteger(item.unitPriceMzk)&&item.unitPriceMzk>0);
    assert.equal(materialBulkQuote(item,1).priceMzk,item.unitPriceMzk);
  }
  assert.equal(matchesBuildingItem(buildingMaterial('service-staircase'),'access','stairs industrial'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('industrial-pipe-rack'),'props','factory utility'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('framed-window-grid'),'access','glass facade'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('warehouse-pallet-rack'),'market','warehouse storage'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('service-staircase'),'market','stairs'),false);
});
