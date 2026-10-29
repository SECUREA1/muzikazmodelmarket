import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {FOREST_SPECIES,FOREST_TREES} from '../public/js/forest-harvest-config.js';
import {createForestTrunkGeometry,createForestCanopyGeometry} from '../public/js/forest-tree-geometry.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {forestHarvestWorld} from '../forest-harvest-world.mjs';

function dispose(root){const geometry=new Set(),materials=new Set();root.traverse(node=>{if(node.geometry)geometry.add(node.geometry);for(const material of [].concat(node.material||[]))materials.add(material);});for(const value of geometry)value.dispose();for(const value of materials)value.dispose();}
test('tree silhouettes use shared botanical branches, root flares and alpha-tested leaf sprays',()=>{
 for(const species of Object.values(FOREST_SPECIES)){
  const trunk=createForestTrunkGeometry(species),crown=createForestCanopyGeometry(species),upper=createForestCanopyGeometry(species,true);
  try{
   assert.equal(trunk.userData.forestryBotanicalGeometry,'root-flare-and-branch-trunk');
   assert.match(crown.userData.forestryBotanicalGeometry,/boughs|sprays/);
   for(const geometry of [trunk,crown,upper]){
    for(const attribute of Object.values(geometry.attributes))assert.ok([...attribute.array].every(Number.isFinite),species.id+' has finite geometry');
    assert.ok(geometry.attributes.uv?.count>0);assert.ok(geometry.attributes.normal?.count>0);
    const triangles=(geometry.index?.count||geometry.attributes.position.count)/3;
    assert.ok(triangles>70&&triangles<7000,species.id+' has bounded useful detail');
   }
   trunk.computeBoundingBox();assert.ok(trunk.boundingBox.max.x-trunk.boundingBox.min.x>1.5,'branches extend beyond the trunk');
  }finally{trunk.dispose();crown.dispose();upper.dispose();}
 }
});

test('forestry PBR detail survives the common world finisher without changing its collision floor',()=>{
 const root=createBuilderLand(forestHarvestWorld());
 try{
  assert.equal(root.userData.forestryGraphics.version,'timberland-realism-v2');assert.equal(root.userData.forestTreeCount,48);assert.ok(root.userData.forestDrawBatches<=36);
  const soil=root.getObjectByName('BUILDER_WALKABLE_FLOOR_forest-harvest'),trunk=root.getObjectByName('FOREST_pine_trunk'),crown=root.getObjectByName('FOREST_pine_crown');
  for(const mesh of [soil,trunk]){assert.ok(mesh.material.map);assert.ok(mesh.material.normalMap);assert.ok(mesh.material.roughnessMap);assert.equal(mesh.material.map.userData.forestryResolution,2048);}
  assert.ok(crown.material.alphaTest>=.18&&crown.material.alphaTest<=.35);assert.equal(crown.material.alphaToCoverage,true);assert.equal(crown.material.side,T.DoubleSide);assert.equal(crown.material.map.userData.forestryResolution,1024);
  soil.geometry.computeBoundingBox();assert.ok(Math.abs(soil.geometry.boundingBox.max.y-.1)<1e-5);assert.ok(soil.geometry.attributes.uv.array.some(value=>value>10),'ground detail repeats at metres rather than across the entire map');
  const cover=root.getObjectByName('FOREST_UNDERSTOREY'),faces=root.getObjectByName('FOREST_TIMBER_CUT_FACES');assert.equal(cover.count,FOREST_TREES.length*9);assert.equal(faces.material.userData.forestrySurface,'endgrain');assert.equal(cover.userData.collisionDisabled,true);
 }finally{dispose(root);}
});

test('felling, clearing and regrowth still update the detailed instanced forest',()=>{
 const root=createBuilderLand(forestHarvestWorld()),tree=FOREST_TREES[0],matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
 try{
  root.userData.setForestHarvestState({trees:{[tree.id]:{...tree,phase:'felled',felledAt:1000}},logs:{}},{serverTime:1800});
  root.getObjectByName('FOREST_pine_fallen').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.ok(Math.abs(scale.x-1)<1e-6);assert.ok(position.y>1,'freshly felled trunk falls about its base');
  root.userData.updateForestEffects(3,false,4000);root.getObjectByName('FOREST_pine_fallen').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.ok(position.y<1,'trunk settles on the forest floor');
  root.userData.setForestHarvestState({trees:{[tree.id]:{...tree,phase:'cleared'}},logs:{}});root.getObjectByName('FOREST_UNDERSTOREY').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.equal(scale.x,0,'cleared land removes undergrowth');
  root.userData.setForestHarvestState({trees:{[tree.id]:{...tree,speciesId:'oak',phase:'growing',growthEndsAt:94000}},logs:{}},{serverTime:49000});root.getObjectByName('FOREST_oak_trunk').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.equal(scale.x,.5,'replacement species grows from the saved clock');
 }finally{dispose(root);}
});
