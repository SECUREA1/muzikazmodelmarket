import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY,CARE_SUPPLIES} from '../game-economy.mjs';
import {worldFactoryRecipe,worldFactoryPlan} from '../public/js/world-factory-recipes.js';
import {AIRCRAFT_TYPES} from '../public/js/aircraft-types.js';
import {ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {SHIPPING_VESSELS} from '../public/js/shipping-vessel-specs.js';

function validPlan(item,quantity,options){
 const plan=worldFactoryPlan(item,quantity,options);
 assert.ok(Number.isSafeInteger(plan.buildMs));assert.ok(plan.buildMs>=12&&plan.buildMs<=120000);
 assert.equal(plan.recipeVersion,2);assert.equal(plan.recipe.recipeVersion,2);assert.equal(plan.itemPlanId,plan.recipe.itemPlanId);assert.equal(plan.fingerprint,plan.recipe.fingerprint);
 assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.recipe.blueprint));
 assert.equal(plan.stages.length,4);assert.deepEqual(plan.stages.map(stage=>stage.id),['sourcing','assembly','quality','packing']);
 let elapsed=0;
 for(const stage of plan.stages){
  assert.equal(stage.startedOffsetMs,elapsed);assert.ok(Number.isSafeInteger(stage.durationMs)&&stage.durationMs>0);assert.ok(stage.name&&stage.description);
  assert.ok(stage.station.id&&stage.station.name);assert.ok(stage.operations.length>=2&&stage.operations.length<=4);
  let operationElapsed=0;
  for(const operation of stage.operations){
   assert.ok(operation.id&&operation.name&&operation.description);assert.ok(operation.weight>0);
   assert.equal(operation.stageOffsetMs,operationElapsed);assert.equal(operation.startedOffsetMs,stage.startedOffsetMs+operationElapsed);
   assert.ok(Number.isSafeInteger(operation.durationMs)&&operation.durationMs>0);operationElapsed+=operation.durationMs;
  }
  assert.equal(operationElapsed,stage.durationMs);
  for(const component of [...stage.inputs,...stage.outputs]){assert.equal(component.abstract,true);assert.equal(component.quantity,component.quantityPerUnit*quantity);}
  elapsed+=stage.durationMs;
 }
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
 assert.equal(validPlan({kind:'material'},1,{minimumBuildMs:0,maximumBuildMs:12}).buildMs,12);
 assert.equal(validPlan({kind:'material'},10000,{maximumBuildMs:999999}).buildMs<=120000,true);
});

test('request recipe overrides are ignored and invalid quantities/timing cannot produce malformed plans',()=>{
 const item={kind:'material'},base=worldFactoryPlan(item,10);
 assert.deepEqual(worldFactoryPlan({...item,recipe:{id:'aircraft'},recipeId:'aircraft',unitsPerContainer:100000,unitBuildMs:0,minimumBuildMs:0,stages:[{id:'done',durationMs:0}]},10),base);
 for(const quantity of [0,-1,1.2,NaN,Infinity,10001,'10'])assert.throws(()=>worldFactoryPlan(item,quantity),RangeError);
 for(const options of [{minimumBuildMs:-1},{minimumBuildMs:1.1},{maximumBuildMs:0},{maximumBuildMs:3},{maximumBuildMs:11},{maximumBuildMs:Infinity}])assert.throws(()=>worldFactoryPlan(item,1,options),RangeError);
 assert.equal(worldFactoryRecipe(null).id,'props');assert.equal(worldFactoryRecipe().id,'props');
});

test('same-profile items receive distinct immutable blueprints, verification criteria and versioned plan identities',()=>{
 const chair={sku:'native:blue-chair',name:'Blue Chair',buildAssetId:'blue-chair',assetType:'props',behavior:'seat',dimensions:[1,1.1,1],function_data:{behavior:'seat',seatOffset:[0,.5,0],prompt:'Sit in Blue Chair'}};
 const sofa={sku:'native:orange-sofa',name:'Orange Sofa',buildAssetId:'orange-sofa',assetType:'props',behavior:'seat',dimensions:[2.4,1.2,1],function_data:{behavior:'seat',seatOffset:[0,.7,0],prompt:'Sit on Orange Sofa'}};
 const first=validPlan(chair,3),second=validPlan(sofa,3);
 assert.equal(first.recipe.id,'furniture');assert.equal(second.recipe.id,'furniture');
 assert.notEqual(first.itemPlanId,second.itemPlanId);assert.notEqual(first.fingerprint,second.fingerprint);assert.notEqual(first.recipe.name,second.recipe.name);
 assert.equal(first.blueprint.buildAssetId,'blue-chair');assert.equal(second.blueprint.buildAssetId,'orange-sofa');
 assert.deepEqual(first.blueprint.function_data,chair.function_data);assert.deepEqual(second.blueprint.function_data,sofa.function_data);
 assert.notDeepEqual(first.recipe.qualityChecks,second.recipe.qualityChecks);
 assert.deepEqual(first.recipe.qualityChecks[2].expected.function_data,chair.function_data);
 assert.notEqual(first.stages[1].operations[1].description,second.stages[1].operations[1].description);
 assert.equal(first.recipe.processingDetails.consumesRawStock,false);assert.equal(first.recipe.processingDetails.componentMode,'abstract-game-bom');
 assert.equal(first.packaging.containers,1);assert.equal(first.packaging.quantity,3);
 assert.ok(first.billOfMaterials.every(component=>component.quantity===3&&component.abstract));
 assert.throws(()=>{first.blueprint.function_data.seatOffset[1]=99;},TypeError);
 assert.throws(()=>{first.stages[0].operations[0].durationMs=0;},TypeError);
 assert.equal(chair.function_data.seatOffset[1],.5,'freezing plans does not freeze or mutate the original catalog input');
 chair.function_data.seatOffset[1]=.6;
 assert.notEqual(worldFactoryPlan(chair,3).fingerprint,first.fingerprint,'changing trusted game function data creates a new plan revision');
});

test('authored-model identity is preserved while normalized refs and sorted metadata produce stable fingerprints',()=>{
 const item={sku:'repository:precise-model',name:'Precise Model',modelUrl:'/public/models/Precise%20Model.glb',format:'glb',assetType:'props',function_data:{prompt:'Use model',behavior:'interact',value:7},movementSettings:{speed:4,mode:'walk'}};
 const before=JSON.stringify(item),first=validPlan(item,10),equivalent=validPlan({...item,modelUrl:'public/models/Precise Model.glb',function_data:{value:7,behavior:'interact',prompt:'Use model'},movementSettings:{mode:'walk',speed:4}},10);
 assert.equal(first.blueprint.modelUrl,item.modelUrl);assert.equal(first.blueprint.modelRef,'public/models/Precise Model.glb');
 assert.equal(first.fingerprint,equivalent.fingerprint);assert.equal(first.itemPlanId,equivalent.itemPlanId);
 assert.equal(first.recipe.processingDetails.modelMode,'authored-model');assert.deepEqual(first.blueprint.movementSettings,item.movementSettings);
 assert.equal(JSON.stringify(item),before);
 const changed=worldFactoryPlan({...item,modelUrl:'/public/models/Other.glb'},10);
 assert.notEqual(first.fingerprint,changed.fingerprint);assert.notEqual(first.itemPlanId,changed.itemPlanId);
 const serialized=JSON.parse(JSON.stringify(first));assert.deepEqual(serialized.blueprint,first.blueprint);assert.deepEqual(serialized.stages,first.stages);
});

test('abstract stage inputs and outputs carry the exact item identity and quantity into packing',()=>{
 const item={sku:'material:distinct-wall',name:'Distinct Wall',kind:'material',materialId:'distinct-wall',shape:'block'},plan=validPlan(item,107);
 for(let index=1;index<plan.stages.length;index++)assert.equal(plan.stages[index].inputs[0].id,plan.stages[index-1].outputs[0].id);
 const packed=plan.stages.at(-1).outputs[0];assert.equal(packed.id,item.sku);assert.equal(packed.quantity,107);
 assert.equal(plan.packaging.containers,1);assert.equal(plan.stages[2].qualityChecks[0].expected.itemId,item.sku);
 const bulk=validPlan({sku:'native:delivery-vehicle',assetType:'vehicle'},17);
 assert.equal(bulk.packaging.unitsPerContainer,4);assert.equal(bulk.packaging.containers,5);
});
