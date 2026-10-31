import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {applyForgeVillageFinish,forgePreservesAuthoredElevation,forgeBuilderPlayableScale,forgeVillageGroundColor} from '../public/js/forge-village-finish.js';
import {createLayoutTerrain} from '../public/js/environments/layout-terrain.js';
import {placementBounds,placementMeshes} from '../public/js/placed-item-collision.js';

const meshes=root=>{const result=[];root.traverse(node=>{if(node.isMesh)result.push(node);});return result;};
const draws=root=>meshes(root).filter(node=>node.visible).length;
const floor=(id='forge-village-floor')=>({id,modelId:'material:cube',placementAnchor:'collider-base',position:{x:0,y:-.05,z:0},scale:{x:8,y:.05/1.2,z:6},materialSettings:{accent:'#a58f69',useAccent:true},functionalSettings:{forgeVillageSurface:true,forgeVillageMaterial:'stone',surfaceLayer:2}});

test('village stone, timber and copper use authored colors and reusable textures without moving the walking surface',()=>{
 const item=floor(),root=createBuilderModel(item.modelId);root.scale.set(item.scale.x,item.scale.y,item.scale.z);root.position.y=item.position.y;root.updateMatrixWorld(true);
 const before=new THREE.Box3().setFromObject(root),matrix=root.matrixWorld.clone();applyForgeVillageFinish(THREE,root,item);
 const surface=meshes(root)[0].material;assert.equal(surface.color.getHexString(),'a58f69');assert.ok(surface.map.isDataTexture);assert.equal(surface.map.userData.nativeSurfaceShared,true);assert.ok(surface.polygonOffset&&surface.polygonOffsetUnits<0);assert.equal(surface.roughness,.94);
 assert.deepEqual(root.matrixWorld.elements,matrix.elements);assert.deepEqual(new THREE.Box3().setFromObject(root),before);
 const another=createBuilderModel(item.modelId);applyForgeVillageFinish(THREE,another,item);assert.equal(meshes(another)[0].material.map,surface.map,'same finish and dimensions reuse a bounded texture');
 applyForgeVillageFinish(THREE,root,{...item,materialSettings:{accent:'#a8643d',useAccent:true},functionalSettings:{forgeVillageMaterial:'copper',forgeVillageRoof:true}});
 assert.equal(surface.color.getHexString(),'a8643d');assert.equal(surface.metalness,.54);assert.equal(meshes(root)[0].userData.buildingRoof,true);
 const native=createBuilderModel('forge-lantern'),materials=meshes(native).map(mesh=>[mesh.material,mesh.material.map]);applyForgeVillageFinish(THREE,native,{id:'forge-village-lantern',modelId:'forge-lantern'});assert.deepEqual(meshes(native).map(mesh=>[mesh.material,mesh.material.map]),materials,'finished native items retain their exact appearance');
 const existing=createBuilderModel('material:cube');applyForgeVillageFinish(THREE,existing,floor('forge-bay-pad-heat'));assert.ok(meshes(existing)[0].material.polygonOffset,'tagged existing forge floors also avoid coplanar flicker');
 const foundation=createBuilderModel('material:cube');applyForgeVillageFinish(THREE,foundation,{...floor(),functionalSettings:{forgeVillageSurface:true,forgeVillageFoundation:true,forgeVillageSurfaceLayer:0}});assert.equal(meshes(foundation)[0].material.polygonOffset,false,'buried foundations cannot be pulled in front of the ground by a depth bias');
});

test('village scenery batches preserve exact bounds, collision roles and live canopy animation while cutting draw calls',()=>{
 let saved=0;
 for(const id of ['flower-bed','pine-tree','canopy-tree','lamp-post','bookshelf','wooden-cart','armchair','dining-set','loft-bed','material:barrel']){
  const root=createBuilderModel(id),before=new THREE.Box3().setFromObject(root,true),physical=placementBounds(THREE,root),physicalNodes=placementMeshes(root),count=draws(root),live=[];root.traverse(node=>{if(node.userData.swayPhase!==undefined)live.push(node);});
  applyForgeVillageFinish(THREE,root,{id:'forge-village-test-'+id,modelId:id});saved+=count-draws(root);
  const after=new THREE.Box3().setFromObject(root,true);assert.ok(after.min.distanceTo(before.min)<1e-6&&after.max.distanceTo(before.max)<1e-6,id+' keeps visual bounds');
  const collider=placementBounds(THREE,root);assert.ok(collider.min.distanceTo(physical.min)<1e-6&&collider.max.distanceTo(physical.max)<1e-6,id+' keeps collision bounds');
  assert.deepEqual(placementMeshes(root).map(node=>node.uuid).sort(),physicalNodes.map(node=>node.uuid).sort(),id+' retains the exact physical triangle meshes');
  for(const node of live)assert.ok(node.parent,'a moving crown keeps its original node and pivot');
  const group=new THREE.Group();group.add(root);updateBuilderModels(group,100,{reducedMotion:false});root.updateMatrixWorld(true);assert.ok(root.matrixWorld.elements.every(Number.isFinite));
  const merged=meshes(root).length;applyForgeVillageFinish(THREE,root,{id:'forge-village-test-'+id,modelId:id});assert.equal(meshes(root).length,merged,'reapplying an editor finish does not merge or allocate again');
 }
 assert.ok(saved>100,'cosmetic botanical detail retains geometry with substantially fewer draw calls');
});

test('forge district artwork remains planar and authored structural elevations are honored only by forge templates',()=>{
 const geometry=createLayoutTerrain('forge',224);for(const height of geometry.attributes.position.array.filter((_,index)=>index%3===2))assert.equal(height,0);
 assert.notEqual(forgeVillageGroundColor(56,0),forgeVillageGroundColor(100,100));assert.equal(geometry.userData.planarCollision,true);geometry.dispose();
 assert.equal(forgePreservesAuthoredElevation({layout:'forge'},floor()),true);
 assert.equal(forgePreservesAuthoredElevation({sourceGame:'forge'},{id:'old-dispatch-canopy',placementAnchor:'collider-base'}),true);
 assert.equal(forgePreservesAuthoredElevation({layout:'grand-floor'},floor()),false);
 assert.equal(forgePreservesAuthoredElevation({layout:'forge'},{placementAnchor:'ground'}),false);
 assert.equal(forgeBuilderPlayableScale({layout:'forge',mapSize:224},floor()),true,'a thin architectural floor is valid at its real dimensions');
 assert.equal(forgeBuilderPlayableScale({layout:'forge',mapSize:224},{...floor(),scale:{x:88/1.2,y:.4,z:.6}}),true,'a full-width roof beam is not an oversized handheld prop');
 assert.equal(forgeBuilderPlayableScale({layout:'forge',mapSize:224},{...floor(),scale:{x:Infinity,y:1,z:1}}),false);
 assert.equal(forgeBuilderPlayableScale({layout:'forge',mapSize:224},{...floor(),scale:{x:250,y:1,z:1}}),false);
 assert.equal(forgeBuilderPlayableScale({layout:'grand-floor'},{...floor(),scale:{x:30,y:1,z:1}}),false,'other layouts keep their existing prop rule');
});
