import test from 'node:test';
import assert from 'node:assert/strict';
import {questInteraction} from '../public/js/rpg-quests.js';
import {cleanCustomItem} from '../custom-item-rules.mjs';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
test('collection quests require acceptance and every item, and award bounded score once',()=>{
 const player={inventory:[],score:0},quest={id:'supplies',title:'Supplies',requiredItems:['supply-crate','treasure-crystal'],rewardScore:999};
 questInteraction(player,quest);assert.equal(player.quests.supplies,'active');
 questInteraction(player,quest);assert.equal(player.score,0);
 player.inventory.push('supply-crate');questInteraction(player,quest);assert.equal(player.score,0);
 player.inventory.push('treasure-crystal');questInteraction(player,quest);assert.equal(player.score,50);assert.equal(player.quests.supplies,'complete');
 questInteraction(player,quest);assert.equal(player.score,50);
});
test('custom GLB behavior and quest survive validation and editor catalog normalization',()=>{
 const item=cleanCustomItem({name:'Neighborhood guide',requestId:'custom-quest-123',format:'glb',modelUrl:'/owned.glb',configuration:{behavior:'quest',prompt:'Find supplies',quest:{title:'Supplies',requiredItems:['supply-crate','supply-crate'],rewardScore:1000}}},[{id:'owned',modelUrl:'/owned.glb'}]);
 assert.equal(item.configuration.behavior,'quest');assert.deepEqual(item.configuration.quest.requiredItems,['supply-crate']);assert.equal(item.configuration.quest.rewardScore,50);
 const model=normalizeCatalogModel(item,0);assert.equal(model.behavior,'quest');assert.equal(model.function_data.prompt,'Find supplies');
 assert.throws(()=>cleanCustomItem({...item,modelUrl:'/unowned.glb'},[]),/Purchase/);
});
test('drop-in compounds have meshes and clear ground-level entrance paths',()=>{
 for(const id of ['estate-house','estate-yard','drive-in-garage','open-office']){
 const model=createBuilderModel(id);assert.ok(model);let meshes=0;model.traverse(node=>{if(node.isMesh)meshes++;});assert.ok(meshes>5);
 const collision=new ServerBuilderCollision(),environment={id,proceduralLand:true,builderScene:{mapSize:80,layout:'urban-downtown',objects:[{id:'building',modelId:id,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'}}]}};
 const spawn=collision.safeSpawn(environment,{x:0,y:.16,z:id==='drive-in-garage'?-5:-7});assert.ok(spawn);assert.ok(Math.abs(spawn.x)<1,'entrance remains accessible');
 }
});
