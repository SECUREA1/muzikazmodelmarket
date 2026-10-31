import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {FORGE_ITEMS,forgeItemSettings,forgeNativeItem} from '../public/js/forge-items.js';
import {createBuilderModel,BUILDER_MODEL_INFO} from '../public/js/builder-models-3d.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {FORGE_RECIPES,FORGE_MATERIALS} from '../public/js/forge-recipes.js';
import {FORGE_EQUIPMENT} from '../public/js/forge-equipment.js';
import {updateForgeModel} from '../public/js/forge-models.js';
import {projectServerActor} from '../public/js/server-scene-projection.js';
import {marketFacets} from '../public/js/market-facets.js';

test('forge assets share a single purchasable MZK identity across Backpack, Builder and native maps',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8'));
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8'));
 for(const [id,definition] of Object.entries(FORGE_ITEMS)){
  const records=GAME_ECONOMY.filter(item=>item.buildAssetId===id);
  assert.equal(records.length,1,id+' has one market record');
  assert.equal(records[0].sku,'native:'+id);assert.equal(records[0].priceMzk,definition.priceMzk);assert.equal(records[0].useCostMzk,0);
  assert.equal(nativeBuilderItem(id).buildAssetId,id);assert.equal(BUILDER_MODEL_INFO[id][0],definition.name);
  assert.equal(catalog.assets.filter(item=>item.buildAssetId===id).length,1);
  assert.ok(registry.assets.some(item=>item.buildAssetId===id&&item.native&&item.runtimeCompatible),id+' registry');
  const facts=marketFacets(records[0]);assert.equal(facts.category,'factory');assert.ok(facts.uses.includes('craft'));
  const image=await readFile(new URL('..'+records[0].thumbnailUrl,import.meta.url),'utf8');assert.match(image,/<title[^>]*>.+<\/title>/);assert.match(image,/<desc[^>]*>.+<\/desc>/);
 }
 assert.equal(forgeItemSettings('unknown'),null);assert.equal(forgeNativeItem('unknown'),null);
});

test('forge native models are grounded, dimensionally portable and bounded for live rendering',()=>{
 for(const [id,definition] of Object.entries(FORGE_ITEMS)){
  const root=createBuilderModel(id),resources=new Set();
  try{
   assert.ok(root.userData.forgeModel,id);let triangles=0;
   root.traverse(node=>{
    assert.ok([...node.position,...node.scale,node.rotation.x,node.rotation.y,node.rotation.z].every(Number.isFinite));
    if(node.isMesh){assert.equal(node.userData.builderRoot,root);triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;resources.add(node.geometry);}
    for(const material of [].concat(node.material||[]))resources.add(material);
   });
   assert.ok(triangles>0&&triangles<30000,id+' bounded geometry');
   const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()).toArray();
   assert.ok(Math.abs(bounds.min.y)<.01,id+' ground anchor');
   size.forEach((value,axis)=>assert.ok(Math.abs(value-definition.dimensions[axis])<.025,id+' dimensions axis '+axis));
  }finally{for(const resource of resources)resource.dispose?.();}
 }
});

test('purchased or forged portable station keeps its operation in another saved map',()=>{
 for(const id of ['forge-hearth','forge-anvil','forge-quench-tank','forge-tempering-oven','forge-finishing-bench']){
  const native=forgeNativeItem(id),[model]=backpackPlacementModels({}, {ownedAssets:[{...native,id:'owned-'+id,economySku:'native:'+id,assetType:'props',format:'procedural-3d'}]});
  assert.equal(model.buildAssetId,id);assert.equal(model.function_data.forgeStation,FORGE_ITEMS[id].station);
  const scene={id:'custom-forge',layout:'grand-floor',objects:[{id:'portable-'+id,modelId:model.id,asset:{buildAssetId:id},functionalSettings:model.function_data,position:{x:3,y:0,z:2}}]};
  const actor=compileBuilderScene(JSON.parse(JSON.stringify(scene))).actors[0];
  assert.equal(actor.gameplay.forgeStation,FORGE_ITEMS[id].station);assert.equal(actor.gameplay.damage,0);assert.equal(actor.gameplay.destructible,false);
 }
});


test('expanded metallurgy recipes retain exact catalogue materials, distinct SVG drawings and meaningful portable actions',async()=>{
 assert.equal(FORGE_RECIPES.length,10);assert.equal(Object.keys(FORGE_ITEMS).length,28);
 const drawings=new Set();
 for(const recipe of FORGE_RECIPES){
  assert.equal(FORGE_ITEMS[recipe.buildAssetId].kind,'product');assert.equal(recipe.name,FORGE_ITEMS[recipe.buildAssetId].name);
  assert.equal(recipe.costMzk,recipe.materials.reduce((total,line)=>total+line.quantity*FORGE_MATERIALS[line.id].priceMzk,0));
  for(const line of recipe.materials){assert.ok(Number.isInteger(line.quantity)&&line.quantity>0);assert.equal(FORGE_MATERIALS[line.id].priceMzk,FORGE_ITEMS[line.id].priceMzk);}
 }
 for(const id of Object.keys(FORGE_ITEMS)){
  const svg=await readFile(new URL('../public/images/native-designs/'+id+'.svg',import.meta.url),'utf8');
  assert.ok(svg.includes('data-forge-artwork="'+id+'"'));assert.match(svg,/viewBox="0 0 480 400"/);assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)=["']https?:|onload=/i);
  const drawing=svg.match(/<g data-forge-drawing="[^"]+">([\s\S]+)<\/g>/)?.[1];assert.ok(drawing?.length>150,id+' authored geometry');assert.ok(!drawings.has(drawing),id+' is recognizably distinct');drawings.add(drawing);
 }
 for(const id of ['forge-spear','forge-dagger','forge-pickaxe']){assert.equal(forgeItemSettings(id).behavior,'pickup');assert.equal(FORGE_EQUIPMENT[id].kind,'melee');}
 assert.equal(forgeItemSettings('forge-iron-gate').behavior,'door');assert.equal(forgeItemSettings('forge-lantern').behavior,'switch');assert.equal(forgeItemSettings('forge-bronze-bell').action,'use');
});

test('the lantern responds to confirmed switch state and the bell has a bounded strike animation',()=>{
 const lantern=createBuilderModel('forge-lantern'),flame=lantern.getObjectByName('FORGE_LANTERN_FLAME'),actor={id:'lamp',active:true,position:{x:0,y:0,z:0},rotation:{},health:100,switched:false};
 projectServerActor(lantern,actor);assert.equal(flame.material.emissiveIntensity,0);
 actor.switched=true;projectServerActor(lantern,actor);assert.ok(flame.material.emissiveIntensity>=1.5);
 actor.switched=false;projectServerActor(lantern,actor);assert.equal(flame.material.emissiveIntensity,0);
 const bell=createBuilderModel('forge-bronze-bell'),swing=bell.getObjectByName('FORGE_BELL_SWING');bell.userData.forgeBellRungAt=10;
 updateForgeModel(bell,10.1);assert.ok(Math.abs(swing.rotation.z)>.01);updateForgeModel(bell,14);assert.equal(swing.rotation.z,0);
 for(const root of [lantern,bell])root.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose();});
});
