import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {BUILDING_MATERIALS,buildingMaterial,buildingDimensions,createBuildingBlock,buildingIcon,buildingType,matchesBuildingItem} from '../public/js/building-materials.js';
import {placementTriangles,placementBounds} from '../public/js/placed-item-collision.js';
import {alignStackableObject} from '../public/js/stack-placement.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {materialBulkQuote} from '../public/js/game-item-pricing.js';
import {marketFacets} from '../public/js/market-facets.js';
const added=['smooth-plastic','neon','rubber-tile','baseplate','half-brick','long-brick','cube','thin-plate','support-beam','round-column','round-plate','sphere','dome','wedge','corner-wedge','glass-wall','wood-log','paving-tile','metal-truss','stage-platform','stage-steps','crowd-barrier','stage-canopy','dance-floor','neon-wall','display-plinth','tiered-seating','race-curb'];
const dispose=root=>root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
test('all 28 new materials have exact models, stackable bases, SVG artwork and existing-market one-piece pricing',()=>{
 assert.equal(added.length,28);assert.equal(BUILDING_MATERIALS.length,102);
 for(const id of added){const profile=buildingMaterial(id),root=createBuildingBlock(THREE,id);assert.equal(profile.id,id);assert.ok(buildingIcon(THREE,id).includes('<path'));assert.ok(matchesBuildingItem(profile,buildingType(profile),profile.name));
  alignStackableObject(THREE,root,new THREE.Vector3(0,2,0));let bounds=placementBounds(THREE,root);assert.ok(Math.abs(bounds.min.y-2)<1e-6,id+' feet align');assert.ok(placementTriangles(THREE,[root]).length>0);
  const top=createBuildingBlock(THREE,'studs');alignStackableObject(THREE,top,new THREE.Vector3(0,bounds.max.y,0),[root]);assert.ok(placementBounds(THREE,top).min.y>=bounds.max.y-1e-6,id+' supports stacked items');
  const sku=GAME_ECONOMY.find(item=>item.sku==='material:'+id);assert.ok(sku);assert.equal(sku.materialId,id);assert.ok(Number.isSafeInteger(sku.unitPriceMzk)&&sku.unitPriceMzk>0);assert.equal(materialBulkQuote(sku,1).priceMzk,sku.unitPriceMzk);dispose(root);dispose(top);
 }
});
test('smooth wedge top follows a true sloped mesh instead of a full-height box',()=>{
 const root=createBuildingBlock(THREE,'wedge');root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,2,-.3),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(root,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y+.15)<1e-6);const normal=hit.face.normal;assert.ok(normal.y>.55&&normal.y<1);dispose(root);
});
test('glass and neon finishes render as configured; event pieces are discoverable through build and play filters',()=>{
 const glass=createBuildingBlock(THREE,'glass-wall'),neon=createBuildingBlock(THREE,'neon');assert.equal(glass.children[0].material.transparent,true);assert.equal(glass.children[0].material.opacity,.3);assert.ok(neon.children[0].material.emissiveIntensity>0);
 for(const id of ['stage-platform','stage-steps','crowd-barrier','stage-canopy','dance-floor','neon-wall','tiered-seating','race-curb']){const item=GAME_ECONOMY.find(value=>value.materialId===id),facts=marketFacets(item);assert.equal(facts.category,'materials');assert.equal(facts.subcategory,'event-building');assert.ok(facts.uses.includes('build')&&facts.uses.includes('play'));}
 dispose(glass);dispose(neon);
});
