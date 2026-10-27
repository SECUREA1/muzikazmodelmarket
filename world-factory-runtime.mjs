import {createHash} from 'node:crypto';
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409});};
const own=(value,key)=>Object.hasOwn(value,key);
function event(job,type,at,message,fields={}){
 job.eventSequence=(job.eventSequence||0)+1;job.events ||= [];
 job.events.push({id:job.id+':'+job.eventSequence,type,at,message,...fields});job.events=job.events.slice(-100);
}
function project(job,unit,now,fields){
 if(now>=unit.startedAt&&!own(unit,'observedStartedAt')){unit.observedStartedAt=unit.startedAt;event(job,'work-started',unit.startedAt,unit.name||unit.id,fields);}
 if(now>=unit.readyAt&&!own(unit,'completedAt')){unit.completedAt=unit.readyAt;event(job,'work-completed',unit.readyAt,unit.name||unit.id,fields);}
 unit.phase=own(unit,'completedAt')?'complete':now>=unit.startedAt?'processing':'waiting';
 unit.progress=unit.phase==='complete'?100:Math.max(0,Math.min(100,Math.floor((now-unit.startedAt)/Math.max(1,unit.durationMs||unit.readyAt-unit.startedAt)*100)));
}
export function createFactoryProduction(plan,{id,ownerId,now}){
 const saved=clone(plan),job={...saved,id,ownerId,schemaVersion:3,createdAt:now,startedAt:now,readyAt:now+plan.buildMs,phase:'building',shippingRequired:true,pausedDurationMs:0,events:[]};
 job.stages=saved.stages.map(stage=>({...stage,startedAt:now+stage.startedOffsetMs,readyAt:now+stage.startedOffsetMs+stage.durationMs,phase:'waiting',operations:(stage.operations||[]).map(operation=>({...operation,startedAt:now+operation.startedOffsetMs,readyAt:now+operation.startedOffsetMs+operation.durationMs,phase:'waiting'}))}));
 event(job,'production-funded',now,'Production funded; saved item blueprint locked.');advanceFactoryProduction(job,now);return job;
}
export function advanceFactoryProduction(job,now){
 if(!job||!['building','paused'].includes(job.phase))return false;
 if(job.phase==='paused')return false;
 job.buildMs ||= Math.max(1,job.readyAt-job.startedAt);job.effectiveAt=now;
 if(job.schemaVersion>=2&&job.stages?.length){
  for(const stage of job.stages){
   for(const operation of stage.operations||[])project(job,operation,now,{stageId:stage.id,operationId:operation.id});
   project(job,stage,now,{stageId:stage.id});
   if(stage.id==='quality'&&stage.phase==='complete'&&!job.qualityReceipt)job.qualityReceipt={id:'quality:'+job.id,scope:'factory-line',productionId:job.id,itemPlanId:job.itemPlanId||job.recipe?.itemPlanId,fingerprint:job.fingerprint||job.recipe?.fingerprint,quantity:job.quantity,checkedAt:stage.completedAt,checks:(job.recipe?.qualityChecks||[]).map(check=>({...clone(check),status:'passed',verifiedAt:stage.completedAt}))};
  }
  const pending=job.stages.findIndex(stage=>stage.phase!=='complete');job.stageIndex=pending<0?job.stages.length-1:pending;
  const stage=job.stages[job.stageIndex],ops=stage.operations||[],operationIndex=ops.findIndex(operation=>operation.phase!=='complete');job.operationIndex=operationIndex<0?Math.max(0,ops.length-1):operationIndex;
  Object.assign(job,{stageId:stage.id,stageName:stage.name,stageReadyAt:stage.readyAt,operationId:ops[job.operationIndex]?.id||null,operationName:ops[job.operationIndex]?.name||null,operationProgress:ops[job.operationIndex]?.progress||0});
  job.progress=Math.max(0,Math.min(100,Math.floor((now-job.startedAt)/job.buildMs*100)));job.remainingMs=Math.max(0,job.readyAt-now);
  if(pending>=0)return false;
 }
 if(now<job.readyAt){job.remainingMs=job.readyAt-now;job.progress=Math.max(0,Math.floor((now-job.startedAt)/job.buildMs*100));return false;}
 const sealHash=createHash('sha256').update(JSON.stringify([job.id,job.itemId,job.itemPlanId||job.recipe?.itemPlanId,job.fingerprint||job.recipe?.fingerprint,job.quantity,job.stages?.map(stage=>[stage.id,stage.completedAt])])).digest('hex');
 job.packingReceipt ||= {id:'packing:'+job.id,productionId:job.id,itemId:job.itemId,itemPlanId:job.itemPlanId||job.recipe?.itemPlanId,quantity:job.quantity,packedAt:job.readyAt,sealHash,unitsPerContainer:job.recipe?.unitsPerContainer||1000};
 Object.assign(job,{phase:'ready',progress:100,remainingMs:0,completedAt:job.readyAt,shippingRequired:true});event(job,'production-packed',job.readyAt,'Packed output is ready for shipping; world stock has not been credited.');return true;
}
export function pauseFactoryProduction(job,now){
 if(job?.phase!=='building')fail('Only a running production batch can be paused.');advanceFactoryProduction(job,now);
 if(job.phase!=='building')fail('The batch is already packed and ready.');
 job.phase='paused';job.pausedAt=now;job.effectiveAt=now;
 for(const stage of job.stages||[]){if(stage.phase==='processing')stage.phase='paused';for(const operation of stage.operations||[])if(operation.phase==='processing')operation.phase='paused';}
 event(job,'production-paused',now,'Production paused; remaining work and payment are preserved.');return job;
}
export function resumeFactoryProduction(job,now){
 if(job?.phase!=='paused')fail('Only a paused production batch can be resumed.');
 const delay=Math.max(0,now-job.pausedAt);job.startedAt+=delay;job.readyAt+=delay;job.pausedDurationMs=(job.pausedDurationMs||0)+delay;
 for(const stage of job.stages||[]){stage.startedAt+=delay;stage.readyAt+=delay;for(const operation of stage.operations||[]){operation.startedAt+=delay;operation.readyAt+=delay;}}
 job.phase='building';delete job.pausedAt;event(job,'production-resumed',now,'Production resumed without an additional charge.');advanceFactoryProduction(job,now);return job;
}
