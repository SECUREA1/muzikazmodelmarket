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
