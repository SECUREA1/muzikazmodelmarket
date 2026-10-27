import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {PRISON_ITEMS,prisonItemSettings,prisonNativeItem} from '../public/js/prison-items.js';
import {createBuilderModel,BUILDER_MODEL_INFO} from '../public/js/builder-models-3d.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {deviceDefinition,deviceArtworkUrl,INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';

test('all earned prison keepsakes have one canonical catalog identity and cannot enter purchasable bundles',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8'));
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8'));
 for(const [id,item]of Object.entries(PRISON_ITEMS)){
  const records=catalog.assets.filter(asset=>asset.buildAssetId===id),economy=GAME_ECONOMY.filter(asset=>asset.buildAssetId===id);
  assert.equal(records.length,1,id+' Backpack identity');assert.equal(economy.length,1,id+' economy SKU');
  const registered=registry.assets.find(asset=>asset.assetId===records[0].id);assert.ok(registered,id+' discovery registry');for(const key of ['earnedOnly','earnedWorld','tradable'])assert.equal(registered[key],item[key],id+' registry preserves '+key);
  assert.equal(nativeBuilderItem(id).name,item.name);assert.equal(BUILDER_MODEL_INFO[id][0],item.name);
  assert.equal(economy[0].earnedOnly,true);assert.equal(economy[0].tradable,false);assert.equal(economy[0].priceMzk,0);assert.equal(economy[0].useCostMzk,0);
  assert.ok(!GAME_BUNDLES.some(bundle=>bundle.entries.some(entry=>entry.sku===economy[0].sku)),id+' excluded from purchases');
  const artwork=await readFile(new URL('..'+item.thumbnailUrl,import.meta.url),'utf8');
  assert.match(artwork,/<title[^>]*>[^<]+<\/title>/);assert.match(artwork,/<desc[^>]*>[^<]+<\/desc>/);
 }
 assert.equal(prisonNativeItem('forged'),null);assert.equal(prisonItemSettings('forged'),null);
});

test('earned objects render at their declared portable scale with independent geometry and materials',()=>{
 for(const [id,item]of Object.entries(PRISON_ITEMS)){
  const first=createBuilderModel(id),second=createBuilderModel(id);
  assert.ok(first?.userData.prisonCollectible,id);assert.notEqual(first,second);
  const bounds=new THREE.Box3().setFromObject(first),size=bounds.getSize(new THREE.Vector3()).toArray();
  assert.ok(Math.abs(bounds.min.y)<.035,id+' rests on the floor');
  for(let axis=0;axis<3;axis++)assert.ok(Math.abs(size[axis]-item.dimensions[axis])<.02,id+' declared size '+axis);
  let meshes=0;first.traverse(node=>{if(node.isMesh){meshes++;assert.equal(node.userData.builderRoot,first);assert.ok(node.geometry.attributes.position.count>0);}});
  assert.ok(meshes>=12,id+' detailed authored geometry');assert.ok(meshes<250,id+' bounded geometry');
  const firstMesh=first.children.find(node=>node.isMesh),secondMesh=second.children.find(node=>node.isMesh);
  assert.notEqual(firstMesh.material,secondMesh.material,'instances do not recolor one another');
 }
});

test('the portable radio retains shared audio interaction through Backpack and another world',()=>{
 const id='prison-radio',canonical=prisonNativeItem(id),owned={...canonical,id:'earned-radio-1',source:'prison-earned',type:'prison-item',assetType:'props',configuration:prisonItemSettings(id)};
 const [model]=backpackPlacementModels({}, {ownedAssets:[owned]});
 assert.equal(model.buildAssetId,id);assert.equal(model.behavior,'interact');assert.equal(model.function_data.device,'radio-console');assert.equal(model.sourceId,owned.id);
 const saved=JSON.parse(JSON.stringify({id:'custom-home',layout:'grand-floor',objects:[{id:'portable-radio',modelId:model.id,objectType:'props',asset:{buildAssetId:model.buildAssetId},position:{x:2,y:0,z:3},functionalSettings:model.function_data}]}));
 const actor=compileBuilderScene(saved).actors[0];
 assert.equal(actor.gameplay.behavior,'interact');assert.equal(actor.gameplay.device,'radio-console');
 assert.equal(Object.hasOwn(INTERACTIVE_DEVICES,id),false,'earned radio is a lookup alias, not a freely populated lounge cabinet');assert.equal(deviceDefinition(id).kind,'audio');assert.equal(deviceDefinition(id,actor.gameplay).kind,'audio');assert.equal(deviceArtworkUrl(id),PRISON_ITEMS[id].thumbnailUrl);
 assert.equal(actor.gameplay.damage,0);assert.equal(actor.gameplay.destructible,false);
});
