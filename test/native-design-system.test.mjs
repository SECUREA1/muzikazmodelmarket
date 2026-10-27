import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {placementBounds,placementMeshes} from '../public/js/placed-item-collision.js';
import {NATIVE_DESIGN_VERSION,finishNativeDesign} from '../public/js/native-design-system.js';
import {auditNativeDesigns,nativeRenderStats,disposeNativeAuditModel} from '../scripts/audit-native-designs.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {HELD_TOOL_DESIGN_IDS,createHeldToolModel} from '../public/js/held-tool-design-finish.js';
import {NATIVE_TEMPLATE_LAYOUT_IDS} from '../public/js/environments/native-world-design-finish.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';

function rootTransform(root){return [...root.position,...root.quaternion,...root.scale];}

test('every canonical item, held tool, map template and native offer has a real current design',async()=>{
 const report=await auditNativeDesigns();
 assert.equal(report.counts.catalog,Object.keys(NATIVE_BUILDER_ITEMS).length);
 assert.equal(report.counts.rendered,report.counts.catalog);
 assert.equal(report.counts.materials,Object.keys(NATIVE_BUILDER_ITEMS).filter(id=>id.startsWith('material:')).length);
 assert.deepEqual(report.failures,[]);
 assert.ok(report.items.every(item=>item.family!=='unclassified'),'every native family has a declared finish path');
 assert.equal(report.counts.heldTools,HELD_TOOL_DESIGN_IDS.length);
 assert.equal(report.counts.templateLayouts,NATIVE_TEMPLATE_LAYOUT_IDS.length);
 assert.equal(report.counts.uniqueDesigns,report.counts.catalog+HELD_TOOL_DESIGN_IDS.length+NATIVE_TEMPLATE_LAYOUT_IDS.length,'physical gear and world templates extend coverage without inflating the canonical definition count');
 assert.equal(report.counts.nativeOffers,GAME_ECONOMY.filter(item=>item.native).length);
 assert.equal(report.counts.nativeOfferAliases,report.counts.nativeOffers-report.counts.uniqueDesigns);
 assert.ok(report.supplementary.heldTools.every(item=>item.texturedSurfaces>0));
 assert.ok(report.supplementary.templateLayouts.every(item=>item.texturedSurfaces>0));
});

test('all physical held-tool SKUs preserve their existing equipment prices and action costs',()=>{
 const basic=new Set(['laser','bat','spray','brick','repair-tool','recycler']);
 const prices={jetpack:[750,1],dynamite:[300,25],toxin:[250,5],flamethrower:[400,2],taser:[175,1],medkit:[100,5],'shield-kit':[180,5],scanner:[150,2]};
 for(const id of HELD_TOOL_DESIGN_IDS){
  const offer=GAME_ECONOMY.find(item=>item.sku==='tool:'+id),root=createHeldToolModel(THREE,id);
  try{
   assert.ok(offer&&root,id+' keeps its existing native tool and physical preview');
   assert.equal(offer.toolId,id);
   assert.equal(offer.kind,'tool');
   assert.equal(offer.priceMzk,basic.has(id)?0:prices[id]?.[0]??200,id+' keeps its purchase price');
   assert.equal(offer.useCostMzk,basic.has(id)?0:prices[id]?.[1]??1,id+' keeps its action cost');
   assert.equal(root.userData.heldToolDesign.version,NATIVE_DESIGN_VERSION);
   assert.equal(root.userData.heldToolDesign.id,id);
   assert.ok(nativeRenderStats(root).texturedSurfaces>0,id+' upgrades actual tool surfaces');
  }finally{disposeNativeAuditModel(root);}
 }
});

test('all native map-template SKUs retain their source layouts, price and authored physical world',()=>{
 for(const layout of NATIVE_TEMPLATE_LAYOUT_IDS){
  const offer=GAME_ECONOMY.find(item=>item.builderLayoutId===layout),environment={id:'native-audit-'+layout,source:'repository',proceduralLand:true,builderScene:{layout,mapSize:40}},original=JSON.stringify(environment),root=createBuilderLand(environment);
  try{
   assert.ok(offer&&root,layout+' keeps its native world renderer and offer');
   assert.equal(offer.sku,'backpack:builder-land-'+layout);
   assert.equal(offer.priceMzk,500,layout+' preserves the map template price');
   assert.equal(offer.useCostMzk,1,layout+' preserves the map use cost');
   assert.equal(root.userData.nativeWorldDesign.version,NATIVE_DESIGN_VERSION);
   assert.equal(root.userData.nativeWorldDesign.layout,layout);
   assert.equal(JSON.stringify(environment),original,layout+' does not rewrite saved world configuration');
   const stats=nativeRenderStats(root);assert.ok(stats.meshes&&stats.texturedSurfaces,layout+' renders a textured physical world');
  }finally{disposeNativeAuditModel(root);}
 }
});

test('native finishing preserves physical colliders, media geometry and saved placement',()=>{
 const root=new THREE.Group();root.position.set(4,1,-6);root.rotation.y=.3;root.scale.setScalar(1.2);
 const shell=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.8,.8),new THREE.MeshStandardMaterial({color:0x416074,roughness:.72}));shell.name='CABINET_BODY';shell.position.y=.9;root.add(shell);
 const screen=new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.03),new THREE.MeshBasicMaterial({color:0x123456}));screen.name='DEVICE_SCREEN';screen.userData.mediaScreen=true;screen.position.set(0,1.2,-.42);root.add(screen);
 const collider=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.8,.8),new THREE.MeshBasicMaterial());collider.name='COLLIDER';collider.position.y=.9;collider.visible=false;collider.userData.collider=true;collider.userData.collisionOnly=true;root.add(collider);
 const screenGeometry=screen.geometry,screenMaterial=screen.material,screenUv=Array.from(screen.geometry.attributes.uv.array),colliderGeometry=collider.geometry,transform=rootTransform(root),physical=placementBounds(THREE,root).clone(),physicalMeshes=placementMeshes(root);
 try{
  finishNativeDesign(THREE,root,'blackjack-cabinet');
  assert.deepEqual(rootTransform(root),transform);
  assert.equal(screen.geometry,screenGeometry);
  assert.equal(screen.material,screenMaterial);
  assert.deepEqual(Array.from(screen.geometry.attributes.uv.array),screenUv);
  assert.equal(collider.geometry,colliderGeometry);
  assert.equal(collider.visible,false);
  assert.deepEqual(placementMeshes(root),physicalMeshes);
  const after=placementBounds(THREE,root);
  assert.ok(after.min.distanceTo(physical.min)<1e-6&&after.max.distanceTo(physical.max)<1e-6,'added details do not become physical support or obstacles');
  assert.equal(root.userData.nativeDesign.version,NATIVE_DESIGN_VERSION);
  let tangible=false;
  root.traverse(node=>{if(node.userData.nativeDesignDetail||node.geometry?.name==='MZK_BEVELLED_BOX'||[].concat(node.material||[]).some(material=>material.map||material.bumpMap||material.normalMap))tangible=true;});
  assert.ok(tangible,'the design changes real geometry or surface rendering');
 }finally{disposeNativeAuditModel(root);}
});

test('native finishing is idempotent across materials, rigs and decorated families',()=>{
 for(const id of ['material:wood','grand-tourer','harbor-yacht','timber-cabin','blackjack-cabinet','hockey-stick','funhouse-entry-sign','world-resident','portal-door']){
  if(!NATIVE_BUILDER_ITEMS[id])continue;
  const root=createBuilderModel(id);
  try{
   const before=nativeRenderStats(root),geometry=[],materials=[];
   root.traverse(node=>{if(node.isMesh){geometry.push(node.geometry);materials.push(node.material);}});
   finishNativeDesign(THREE,root,id);
   assert.deepEqual(nativeRenderStats(root),before,id+' does not accumulate decorative geometry or surface changes');
   const nextGeometry=[],nextMaterials=[];root.traverse(node=>{if(node.isMesh){nextGeometry.push(node.geometry);nextMaterials.push(node.material);}});
   assert.deepEqual(nextGeometry,geometry,id+' retains geometry objects on a repeated finish');
   assert.deepEqual(nextMaterials,materials,id+' retains material objects on a repeated finish');
  }finally{disposeNativeAuditModel(root);}
 }
});

test('copies of upgraded specialist items own their editable material state',()=>{
 for(const id of ['grand-tourer','harbor-yacht','blackjack-cabinet','fitness-bench','world-resident','material:wood']){
  if(!NATIVE_BUILDER_ITEMS[id])continue;
  const root=createBuilderModel(id),copy=cloneBuilderRuntime(root),originals=[],copies=[];
  try{
   if(id==='world-resident'){
    assert.equal(copy.userData.residentMaterials.outfit,copy.getObjectByName('RESIDENT_TORSO').material,'resident appearance controls retain the cloned palette');
    assert.notEqual(copy.userData.residentMaterials.outfit,root.userData.residentMaterials.outfit);
   }
   root.traverse(node=>{if(node.isMesh&&!node.userData.mediaScreen&&!node.userData.collisionOnly)originals.push(node);});
   copy.traverse(node=>{if(node.isMesh&&!node.userData.mediaScreen&&!node.userData.collisionOnly)copies.push(node);});
   assert.equal(copies.length,originals.length);
   for(let i=0;i<originals.length;i++){
    const sourceMaterials=[].concat(originals[i].material),copyMaterials=[].concat(copies[i].material);
    for(let j=0;j<sourceMaterials.length;j++)assert.notEqual(copyMaterials[j],sourceMaterials[j],id+' copies own editable material state');
   }
   const source=originals.find(node=>[].concat(node.material).some(material=>material.color)),target=copies[originals.indexOf(source)];
   const sourceMaterial=[].concat(source.material).find(material=>material.color),targetMaterial=[].concat(target.material).find(material=>material.color),color=sourceMaterial.color.getHex();
   targetMaterial.color.setHex(color^0xffffff);targetMaterial.opacity=.25;
   assert.equal(sourceMaterial.color.getHex(),color,id+' recolouring a copy preserves its source');
  }finally{disposeNativeAuditModel(root);disposeNativeAuditModel(copy);}
 }
});
