import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {ownedBuilderModel} from '../public/js/shared-game-inventory.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {GameEconomy} from '../public/js/game-economy-client.js';

test('owned native boat keeps its rig settings and remains a vehicle through Backpack and scene compilation',()=>{
 const purchased={id:'economy:backpack:yacht',economySku:'backpack:yacht',name:'Yacht',type:'game-upgrade',assetType:'vehicles',buildAssetId:'harbor-yacht',format:'svg',thumbnailUrl:'/yacht.svg',behavior:'vehicle',action:'boat',animation:'sail',vehicleSettings:{mode:'boat',speed:9,turnSpeed:.3},function_data:{behavior:'vehicle',interactionDistance:24,prompt:'Board superyacht'}};
 const [model]=backpackPlacementModels({}, {ownedAssets:[purchased]});
 assert.equal(model.type,'vehicle');assert.equal(model.renderKind,null,'native geometry wins over thumbnail format');assert.equal(model.action,'boat');assert.equal(model.economySku,purchased.economySku);
 const roundtrip=JSON.parse(JSON.stringify({objects:[{id:'boat',modelId:model.id,objectType:model.type,asset:{buildAssetId:model.buildAssetId},functionalSettings:model.function_data,vehicleSettings:model.vehicleSettings}]}));
 const actor=compileBuilderScene(roundtrip).actors[0];
 assert.equal(actor.gameplay.behavior,'vehicle');assert.equal(actor.gameplay.interactionDistance,24);assert.deepEqual(actor.vehicle,purchased.vehicleSettings);
});

test('instance functions override defaults without losing portals, devices, quests or animation',()=>{
 const configuration={behavior:'quest',prompt:'Supplies needed',quest:{title:'Supply run',requiredItems:['crate']},portal:{targetMapId:'commons'},cooldown:12};
 const model=normalizeCatalogModel({id:'keeper',modelUrl:'/keeper.glb',type:'avatar',animation:'idle',animationState:{clip:'wave',speed:.8},interaction_data:{interactionDistance:6},function_data:{behavior:'talk',device:'community-noticeboard',cooldown:1},configuration,movementSettings:{speed:2},aiSettings:{detectionRange:9},dialogueSettings:{text:'Welcome'},environmentSettings:{weather:'clear'}},0);
 assert.equal(model.function_data.device,'community-noticeboard');assert.equal(model.function_data.cooldown,12);assert.equal(model.function_data.interactionDistance,6);assert.deepEqual(model.questSettings,configuration.quest);assert.deepEqual(model.function_data.portal,configuration.portal);assert.deepEqual(model.animationState,{clip:'wave',speed:.8});
 const actor=compileBuilderScene({objects:[{id:'keeper',modelId:model.id,objectType:model.type,functionalSettings:model.function_data,questSettings:model.questSettings,aiSettings:model.aiSettings,movementSettings:model.movementSettings,dialogueSettings:model.dialogueSettings,environmentSettings:model.environmentSettings}]}).actors[0];
 assert.equal(actor.behavior,'quest');assert.equal(actor.quest.title,'Supply run');assert.equal(actor.gameplay.portal.targetMapId,'commons');assert.equal(actor.ai.detectionRange,9);assert.equal(actor.movement.speed,2);assert.equal(actor.dialogue.text,'Welcome');
});

test('member builder assets retain native model aliases, configuration and configured seat offsets',()=>{
 const model=ownedBuilderModel({id:'seat-owned',name:'Camp seat',asset_type:'interactive_prop',function_data:{modelId:'camp-log-bench',behavior:'seat',seatOffset:[0,.55,0]},configuration:{prompt:'Rest here',exitOffset:[0,0,1.4]},vehicleSettings:{mode:'boat'}});
 assert.equal(model.sourceId,'seat-owned');assert.equal(model.ownedBuilder,true);assert.equal(model.buildAssetId,'camp-log-bench');assert.equal(model.behavior,'seat');assert.equal(model.function_data.prompt,'Rest here');assert.deepEqual(model.function_data.exitOffset,[0,0,1.4]);assert.deepEqual(model.function_data.seatOffset,[0,.55,0]);assert.equal(model.vehicleSettings.mode,'boat');
});

test('material models resolve the canonical paid material SKU',()=>{
 const client=new GameEconomy({inventory:{},announce(){},shop(){}});
 client.items=[{kind:'material',id:'glass-wall',materialId:'glass-wall',sku:'material:glass-wall',owned:true}];
 assert.equal(client.skuForAsset({id:'catalog-glass',buildAssetId:'material:glass-wall'}),'material:glass-wall');
});
