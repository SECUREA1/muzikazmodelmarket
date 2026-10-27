import test from 'node:test';
import assert from 'node:assert/strict';
import {worldFactoryPlan} from '../public/js/world-factory-recipes.js';
import {createFactoryProduction,advanceFactoryProduction,pauseFactoryProduction,resumeFactoryProduction} from '../world-factory-runtime.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const item={id:'runtime-console',sku:'native:runtime-console',supplyId:'native:runtime-console',name:'Harbor logistics console',kind:'asset',assetType:'electronics',buildAssetId:'factory-control-console',behavior:'device',function_data:{device:'factory-control-console',behavior:'device'}};
function fixture({quantity=12,now=1000000,id='production-runtime-a'}={}){
 const plan={...clone(worldFactoryPlan(item,quantity)),itemId:item.supplyId,quantity,priceMzk:1200};
 const job=createFactoryProduction(plan,{id,ownerId:'account:manufacturer',now});
 return {plan,job,now};
}
const operations=job=>job.stages.flatMap(stage=>stage.operations||[]);
const eventIds=job=>(job.events||[]).map(event=>event.id);

test('a saved item blueprint expands into contiguous absolute operations with immutable production identity',()=>{
 const {plan,job,now}=fixture();
 assert.equal(job.schemaVersion,3);assert.equal(job.phase,'building');assert.equal(job.startedAt,now);
 assert.equal(job.readyAt-now,plan.buildMs);assert.equal(job.quantity,12);
 assert.equal(job.itemId,item.supplyId);assert.equal(job.ownerId,'account:manufacturer');
 assert.equal(job.recipe.itemPlanId,plan.recipe.itemPlanId);assert.equal(job.recipe.fingerprint,plan.recipe.fingerprint);
 assert.deepEqual(job.stages.map(stage=>stage.id),['sourcing','assembly','quality','packing']);
 assert.equal(job.blueprint.buildAssetId,item.buildAssetId);assert.equal(job.blueprint.modelUrl||'',item.modelUrl||'');
 let cursor=now;
 for(const stage of job.stages){
  assert.equal(stage.startedAt,cursor);assert.ok(stage.readyAt>stage.startedAt);
  assert.ok(stage.operations.length>=2,'each manufacturing station has observable work operations');
  let operationCursor=stage.startedAt;
  for(const operation of stage.operations){
   assert.equal(operation.startedAt,operationCursor);assert.ok(operation.readyAt>operation.startedAt);
   assert.equal(operation.readyAt-operation.startedAt,operation.durationMs);operationCursor=operation.readyAt;
  }
  assert.equal(operationCursor,stage.readyAt);cursor=stage.readyAt;
 }
 assert.equal(cursor,job.readyAt);
 const saved=clone(job.blueprint);plan.recipe.blueprint.name='Changed source catalog name';
 assert.deepEqual(job.blueprint,saved,'later catalog mutations cannot change the saved production blueprint');
});

test('operations and all four stations complete from server time before a quality receipt and sealed output are issued',()=>{
 const {job,now}=fixture();
 assert.equal(advanceFactoryProduction(job,now),false);
 const scheduled=job.stages.map(stage=>({id:stage.id,readyAt:stage.readyAt,operations:stage.operations.map(operation=>({id:operation.id,readyAt:operation.readyAt}))}));
 let emittedReady=0;
 for(const [stageIndex,stage] of scheduled.entries()){
  for(const [operationIndex,operation] of stage.operations.entries()){
   assert.equal(advanceFactoryProduction(job,operation.readyAt-1),false);
   assert.equal(job.phase,'building');assert.equal(job.stageIndex,stageIndex);
   assert.equal(job.operationIndex,operationIndex);assert.equal(job.operationId,operation.id);
   assert.equal(job.stages[stageIndex].operations[operationIndex].phase,'processing');
   assert.equal(job.packingReceipt,undefined,'packed output cannot be claimed during unfinished work');
   if(advanceFactoryProduction(job,operation.readyAt))emittedReady++;
   assert.equal(job.stages[stageIndex].operations[operationIndex].phase,'complete');
  }
  assert.equal(job.stages[stageIndex].phase,'complete');
  if(stage.id==='quality'){
   assert.equal(job.qualityReceipt.scope,'factory-line');assert.equal(job.qualityReceipt.productionId,job.id);
   assert.equal(job.qualityReceipt.quantity,job.quantity);assert.equal(job.qualityReceipt.checkedAt,stage.readyAt);
   assert.equal(job.qualityReceipt.itemPlanId,job.recipe.itemPlanId);
   assert.equal(job.qualityReceipt.fingerprint,job.recipe.fingerprint);
   assert.ok(job.qualityReceipt.checks.length>0);assert.ok(job.qualityReceipt.checks.every(check=>check.status==='passed'));
  }
 }
 assert.equal(emittedReady,1);assert.equal(job.phase,'ready');assert.equal(job.progress,100);assert.equal(job.remainingMs,0);
 assert.equal(job.packingReceipt.productionId,job.id);assert.equal(job.packingReceipt.quantity,job.quantity);
 assert.match(job.packingReceipt.sealHash,/^[a-f0-9]{64}$/);
 assert.equal(new Set(eventIds(job)).size,eventIds(job).length,'persisted events have unique deterministic identities');
 for(const stage of scheduled){
  assert.ok(job.events.some(event=>event.stageId===stage.id&&event.at===stage.readyAt),'station completion is traceable');
  for(const operation of stage.operations)assert.ok(job.events.some(event=>event.operationId===operation.id&&event.at===operation.readyAt),'each completed operation is traceable');
 }
 const completed=clone(job);assert.equal(advanceFactoryProduction(job,job.readyAt+3600000),false);
 assert.deepEqual(job,completed,'ready polling cannot create another output or alter its confirmations');
});

test('pausing survives a serialized restart and resumes unfinished work without gaining elapsed wall-clock time',()=>{
 const {job,now}=fixture();
 const firstOperation=job.stages[0].operations[0],pausedAt=firstOperation.startedAt+Math.floor(firstOperation.durationMs/2);
 advanceFactoryProduction(job,pausedAt);pauseFactoryProduction(job,pausedAt);
 assert.equal(job.phase,'paused');assert.equal(job.pausedAt,pausedAt);
 const frozenProgress=job.progress,frozenRemaining=job.remainingMs,frozenOperationProgress=job.operationProgress;
 assert.ok(frozenRemaining>0);assert.equal(job.stages[0].operations[0].phase,'paused');
 const saved=clone(job),reopened=clone(job),resumeAt=pausedAt+3600000;
 assert.equal(advanceFactoryProduction(reopened,resumeAt),false);
 assert.equal(reopened.phase,'paused');assert.equal(reopened.progress,frozenProgress);assert.equal(reopened.remainingMs,frozenRemaining);
 assert.equal(reopened.operationProgress,frozenOperationProgress);
 assert.equal(reopened.packingReceipt,undefined);
 const delay=resumeAt-pausedAt;
 resumeFactoryProduction(reopened,resumeAt);
 assert.equal(reopened.phase,'building');assert.equal(reopened.startedAt,saved.startedAt+delay);assert.equal(reopened.readyAt,saved.readyAt+delay);
 assert.equal(reopened.progress,frozenProgress);assert.equal(reopened.remainingMs,frozenRemaining);
 for(const [index,stage] of reopened.stages.entries()){
  assert.equal(stage.startedAt,saved.stages[index].startedAt+delay);assert.equal(stage.readyAt,saved.stages[index].readyAt+delay);
  for(const [operationIndex,operation] of stage.operations.entries()){
   assert.equal(operation.startedAt,saved.stages[index].operations[operationIndex].startedAt+delay);
   assert.equal(operation.readyAt,saved.stages[index].operations[operationIndex].readyAt+delay);
  }
 }
 assert.equal(advanceFactoryProduction(reopened,reopened.readyAt-1),false);assert.equal(reopened.packingReceipt,undefined);
 assert.equal(advanceFactoryProduction(reopened,reopened.readyAt),true);assert.equal(reopened.phase,'ready');
 assert.equal(new Set(eventIds(reopened)).size,eventIds(reopened).length);
 assert.equal(now,1000000);
});

test('quality verification stays immutable when packing pauses and resumes',()=>{
 const {job}=fixture({id:'packing-pause'}),quality=job.stages.find(stage=>stage.id==='quality'),packing=job.stages.find(stage=>stage.id==='packing');
 const pauseAt=packing.startedAt+Math.floor(packing.operations[0].durationMs/2);
 advanceFactoryProduction(job,pauseAt);assert.equal(job.qualityReceipt.checkedAt,quality.readyAt);
 const qualityReceipt=clone(job.qualityReceipt),priorEventIds=new Set(eventIds(job));
 pauseFactoryProduction(job,pauseAt);resumeFactoryProduction(job,pauseAt+30000);
 assert.deepEqual(job.qualityReceipt,qualityReceipt);
 advanceFactoryProduction(job,job.readyAt);
 assert.deepEqual(job.qualityReceipt,qualityReceipt,'resuming the remaining packing work cannot issue a second quality certificate');
 for(const id of priorEventIds)assert.ok(eventIds(job).includes(id),'earlier operation audit identities survive resume');
 assert.equal(new Set(eventIds(job)).size,eventIds(job).length);assert.match(job.packingReceipt.sealHash,/^[a-f0-9]{64}$/);
});

test('invalid control transitions cannot resume completed work or pause a finished batch',()=>{
 const {job}=fixture();
 assert.throws(()=>resumeFactoryProduction(job,job.startedAt),{statusCode:409});
 pauseFactoryProduction(job,job.startedAt+1);
 assert.throws(()=>pauseFactoryProduction(job,job.startedAt+2),{statusCode:409});
 resumeFactoryProduction(job,job.pausedAt+10000);
 advanceFactoryProduction(job,job.readyAt);
 assert.throws(()=>pauseFactoryProduction(job,job.readyAt+1),{statusCode:409});
 assert.throws(()=>resumeFactoryProduction(job,job.readyAt+1),{statusCode:409});
 const cancelled={...clone(job),phase:'cancelled'};
 assert.equal(advanceFactoryProduction(cancelled,cancelled.readyAt+999999),false);
 assert.throws(()=>pauseFactoryProduction(cancelled,cancelled.readyAt+1),{statusCode:409});
 assert.throws(()=>resumeFactoryProduction(cancelled,cancelled.readyAt+1),{statusCode:409});
});

test('legacy timed and four-stage batches remain finish-once compatible without synthetic new operations',()=>{
 const simple={id:'legacy-timer',schemaVersion:1,ownerId:'account:legacy',itemId:'tool:scanner',quantity:3,phase:'building',startedAt:1000,readyAt:5000};
 assert.equal(advanceFactoryProduction(simple,4999),false);assert.equal(simple.phase,'building');
 assert.equal(advanceFactoryProduction(simple,5000),true);assert.equal(simple.phase,'ready');
 assert.equal(advanceFactoryProduction(simple,6000),false);
 const staged={id:'legacy-four-stage',schemaVersion:2,ownerId:'account:legacy',itemId:'tool:scanner',quantity:4,phase:'building',startedAt:1000,readyAt:5000,
  stages:['sourcing','assembly','quality','packing'].map((id,index)=>({id,name:id,startedAt:1000+index*1000,readyAt:2000+index*1000,durationMs:1000,phase:'waiting'}))};
 assert.equal(advanceFactoryProduction(staged,3999),false);assert.equal(staged.stages[2].phase,'processing');
 assert.equal(advanceFactoryProduction(staged,5000),true);assert.equal(staged.phase,'ready');
 assert.ok(staged.stages.every(stage=>stage.phase==='complete'));
 assert.equal(advanceFactoryProduction(staged,5001),false);
 assert.ok(staged.stages.every(stage=>!stage.operations),'legacy orders retain their saved process contract');
});
