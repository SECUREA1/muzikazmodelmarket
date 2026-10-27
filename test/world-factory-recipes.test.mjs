import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY,CARE_SUPPLIES} from '../game-economy.mjs';
import {worldFactoryRecipe,worldFactoryPlan} from '../public/js/world-factory-recipes.js';
import {AIRCRAFT_TYPES} from '../public/js/aircraft-types.js';
import {ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {SHIPPING_VESSELS} from '../public/js/shipping-vessel-specs.js';

function validPlan(item,quantity,options){
 const plan=worldFactoryPlan(item,quantity,options);
 assert.ok(Number.isSafeInteger(plan.buildMs));assert.ok(plan.buildMs>=4&&plan.buildMs<=120000);
 assert.equal(plan.stages.length,4);assert.deepEqual(plan.stages.map(stage=>stage.id),['sourcing','assembly','quality','packing']);
 let elapsed=0;
 for(const stage of plan.stages){assert.equal(stage.startedOffsetMs,elapsed);assert.ok(Number.isSafeInteger(stage.durationMs)&&stage.durationMs>0);assert.ok(stage.name&&stage.description);elapsed+=stage.durationMs;}
 assert.equal(elapsed,plan.buildMs);return plan;
}

test('every native, GLB and care item has a deterministic valid four-phase manufacturing plan',()=>{
 for(const item of [...GAME_ECONOMY,...CARE_SUPPLIES,{id:'unrecognized-glb',modelUrl:'/uploads/future-item.glb',format:'glb'}]){
  const before=JSON.stringify(item),plan=validPlan(item,10);
  assert.deepEqual(worldFactoryPlan(item,10),plan);assert.equal(JSON.stringify(item),before);
  assert.ok(plan.recipe.minimumBuildMs>=8000&&plan.recipe.minimumBuildMs<=16000);
  assert.ok(Number.isSafeInteger(plan.recipe.unitBuildMs)&&plan.recipe.unitBuildMs>0);
  assert.ok(Number.isSafeInteger(plan.recipe.unitsPerContainer)&&plan.recipe.unitsPerContainer>0);
 }
 for(const item of CARE_SUPPLIES)assert.equal(worldFactoryRecipe(item).id,'care');
});

test('trusted item metadata selects packaging density and assembly class independently of GLB format',()=>{
 const cases=[
  [{kind:'material',materialId:'steel'},'materials',1000],
  [{kind:'tool',toolId:'scanner'},'tools',1000],
  [{kind:'care',sku:'care:medkit'},'care',1000],
  [{buildAssetId:'modern-sofa',behavior:'seat'},'furniture',50],
  [{kind:'asset',assetType:'props'},'props',100],
  [{buildAssetId:'factory-control-console'},'electronics',250],
  [{buildAssetId:'factory-cargo-rocket'},'rocket-collectibles',1],
  [{buildAssetId:'factory-training-missile'},'rocket-collectibles',1],
  [{assetType:'vehicles'},'vehicles',4],
  [{assetType:'aircraft'},'aircraft',1],
  [{assetType:'watercraft'},'watercraft',1],
  [{builderCategory:'buildings'},'buildings',1],
  [{assetType:'environments'},'environments',1],
  [{builderLayoutId:'neon-docks'},'environments',1],
  [{assetType:'avatars'},'avatars',100]
 ];
 for(const [item,id,capacity] of cases){
  const recipe=worldFactoryRecipe(item);assert.equal(recipe.id,id);assert.equal(recipe.unitsPerContainer,capacity);
  assert.equal(worldFactoryRecipe({...item,format:'glb',modelUrl:'/models/item.glb'}).id,id);
 }
 assert.equal(worldFactoryRecipe({format:'glb',modelUrl:'/models/jet-aircraft-ship.glb'}).id,'props','filenames do not change assembly class');
 for(const buildAssetId of Object.keys(AIRCRAFT_TYPES))assert.equal(worldFactoryRecipe({buildAssetId}).id,'aircraft');
 for(const buildAssetId of Object.keys(SHIPPING_VESSELS))assert.equal(worldFactoryRecipe({buildAssetId}).id,'watercraft');
 for(const buildAssetId of Object.keys(ROAD_VEHICLES))assert.equal(worldFactoryRecipe({buildAssetId}).id,'vehicles');
 for(const buildAssetId of ['harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat'])assert.equal(worldFactoryRecipe({buildAssetId}).id,'watercraft');
});

test('batch timelines scale with complexity and quantity, remain bounded and have exact contiguous positive phases',()=>{
 const material=validPlan({kind:'material'},1),vehicle=validPlan({assetType:'vehicle'},1);
 assert.ok(material.buildMs>=8000);assert.ok(vehicle.buildMs>material.buildMs);
 assert.ok(validPlan({kind:'material'},100).buildMs>material.buildMs);
 assert.equal(validPlan({assetType:'environments'},10000).buildMs,120000);
 assert.equal(validPlan({kind:'tool'},1000,{minimumBuildMs:3000,maximumBuildMs:20000}).buildMs,20000);
 assert.equal(validPlan({kind:'material'},1,{minimumBuildMs:30000,maximumBuildMs:60000}).buildMs,30000);
 assert.equal(validPlan({kind:'material'},1,{minimumBuildMs:0,maximumBuildMs:4}).buildMs,4);
 assert.equal(validPlan({kind:'material'},10000,{maximumBuildMs:999999}).buildMs<=120000,true);
});

test('request recipe overrides are ignored and invalid quantities/timing cannot produce malformed plans',()=>{
 const item={kind:'material'},base=worldFactoryPlan(item,10);
 assert.deepEqual(worldFactoryPlan({...item,recipe:{id:'aircraft'},recipeId:'aircraft',unitsPerContainer:100000,unitBuildMs:0,minimumBuildMs:0,stages:[{id:'done',durationMs:0}]},10),base);
 for(const quantity of [0,-1,1.2,NaN,Infinity,10001,'10'])assert.throws(()=>worldFactoryPlan(item,quantity),RangeError);
 for(const options of [{minimumBuildMs:-1},{minimumBuildMs:1.1},{maximumBuildMs:0},{maximumBuildMs:3},{maximumBuildMs:Infinity}])assert.throws(()=>worldFactoryPlan(item,1,options),RangeError);
 assert.equal(worldFactoryRecipe(null).id,'props');assert.equal(worldFactoryRecipe().id,'props');
});
