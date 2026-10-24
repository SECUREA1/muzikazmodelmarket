import {FACTORY_RECIPES,factoryStations,factoryCrew,factoryRecipeSteps} from './public/js/missile-factory-config.js';
import {residentSkillGain} from './public/js/resident-personalities.js';

const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const active=job=>job&&['moving','waiting','processing'].includes(job.status);
const copy=point=>({x:point.x,y:Number(point.y)||0,z:point.z});
const fresh=(player,now)=>player.health>0&&!player.replacedByRoom&&now-player.lastSeen<15000;
const modelFor=recipe=>recipe.id==='cargo-rocket'?'factory-cargo-rocket':'factory-training-missile';

function stateFor(sim,environment){
 if(sim.factoryCrewWork?.worldId!==environment.id)sim.factoryCrewWork={worldId:environment.id,sequence:0,job:null,locks:{},outputs:[],materials:{components:0,assemblies:0,models:0},completed:0,nextAutoAt:null};
 return sim.factoryCrewWork;
}
function releaseWorker(sim,job){
 const npc=sim.actors?.[job.workerId];
 if(npc?.resident?.machineWork?.jobId===job.id){delete npc.resident.machineWork;npc.resident.moving=false;npc.resident.goal=null;npc.resident.nextThinkAt=0;}
}
function release(state,job){for(const [id,lock]of Object.entries(state.locks))if(lock.jobId===job.id)delete state.locks[id];}
function end(sim,state,job,status,message,now){release(state,job);releaseWorker(sim,job);job.status=status;job.message=message;job.finishedAt=now;job.readyAt=null;state.nextAutoAt=now+45000;}
function fundedBusy(sim,stationId,now){return Object.values(sim.players||{}).some(player=>{const job=player.factory?.job;return job?.status==='processing'&&job.environmentId===sim.factoryCrewWork?.worldId&&job.readyAt>now&&job.steps?.[job.stepIndex]?.stationId===stationId;});}
function nearHuman(sim,station,now){return Object.values(sim.players||{}).some(player=>fresh(player,now)&&gap(player.position,station.position)<1.1);}
function say(npc,message,now){if(!npc?.resident)return;npc.resident.speech=message;npc.resident.speechUntil=now+4500;npc.resident.speaking=true;npc.resident.gesture='explain';}

function chooseWorker(sim,crew,kind){
 const preferred=kind==='fabrication'?'machinist':kind==='calibration'?'tech':'foreman';
 return crew.map(person=>sim.actors?.[person.id]).filter(npc=>npc?.active!==false&&npc?.resident?.factory&&npc.health>0&&!npc.resident.conversationId).sort((a,b)=>Number(String(b.resident.factoryCrewId||b.id).includes(preferred))-Number(String(a.resident.factoryCrewId||a.id).includes(preferred))||a.id.localeCompare(b.id))[0];
}

function clearPoint(sim,environment,point,{collision,objects}){
 const floor=collision?.groundAt?collision.groundAt(environment,point,{actors:sim.actors,objects,maxRise:.4}):point;
 if(!floor||Math.abs((floor.y||0)-(point.y||0))>.5)return null;
 if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,floor,.38,{actors:sim.actors,objects}))return null;
 return copy(floor);
}
function clearSegment(sim,environment,from,to,context){
 const span=gap(from,to);if(span>180)return false;
 let previous=copy(from);const count=Math.max(1,Math.ceil(span/.65));
 for(let index=1;index<=count;index++){
  const fraction=index/count,point={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,z:from.z+(to.z-from.z)*fraction},floor=clearPoint(sim,environment,point,context);if(!floor)return false;
  const resolved=context.collision?.resolve?context.collision.resolve(environment,previous,floor,sim.actors,context.objects):floor;
  if(gap(resolved,floor)>.15)return false;previous=resolved;
 }
 return true;
}
function planPath(sim,environment,npc,target,context){
 const start=copy(npc.position),finish=clearPoint(sim,environment,target,context);if(!finish)return null;
 const candidates=[[finish],[{x:start.x,y:start.y,z:finish.z},finish],[{x:finish.x,y:start.y,z:start.z},finish]];
 for(const offset of [-3,3,-6,6])candidates.push([{x:start.x+offset,y:start.y,z:start.z},{x:start.x+offset,y:finish.y,z:finish.z},finish],[{x:start.x,y:start.y,z:start.z+offset},{x:finish.x,y:finish.y,z:start.z+offset},finish]);
 for(const path of candidates){let previous=start,valid=true;for(const point of path){if(!clearSegment(sim,environment,previous,point,context)){valid=false;break;}previous=point;}if(valid)return path.map(copy);}
 return null;
}
function walk(sim,environment,npc,job,station,now,dt,context){
 if(now<(npc.resident.pauseUntil||0)){npc.resident.moving=false;return false;}
 if(!job.path){if(now<(job.nextPathAt||0))return false;job.path=planPath(sim,environment,npc,station.position,context);job.nextPathAt=now+3000;}
 if(!job.path){job.message='Waiting for a clear walking route to '+station.name+'.';npc.resident.moving=false;return false;}
 while(job.path.length&&gap(npc.position,job.path[0])<.3)job.path.shift();
 const target=job.path[0];if(!target)return gap(npc.position,station.position)<=.8;
 const distance=gap(npc.position,target),amount=Math.min(distance,Math.max(0,Math.min(.25,dt))*1.3);
 const next={x:npc.position.x+(target.x-npc.position.x)*amount/distance,y:npc.position.y,z:npc.position.z+(target.z-npc.position.z)*amount/distance};
 const floor=clearPoint(sim,environment,next,context),resolved=floor&&(context.collision?.resolve?context.collision.resolve(environment,npc.position,floor,sim.actors,context.objects):floor);
 if(!resolved||gap(resolved,next)>.15){job.path=null;job.nextPathAt=now+1500;npc.resident.moving=false;return false;}
 if(Object.values(sim.players||{}).some(player=>fresh(player,now)&&gap(player.position,resolved)<.9&&gap(player.position,resolved)<=gap(player.position,npc.position)+.02)){npc.resident.moving=false;job.message='Giving the player room beside '+station.name+'.';return false;}
 npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position=copy(resolved);npc.resident.moving=true;return gap(npc.position,station.position)<=.8;
}

function createJob(sim,environment,state,now,{requestedBy=null,requestedRevision=0,crewId=null}={}){
 const stations=factoryStations(environment,{actors:sim.actors}),crew=factoryCrew(environment,{actors:sim.actors}),recipe=FACTORY_RECIPES[state.sequence%FACTORY_RECIPES.length],steps=factoryRecipeSteps(recipe,stations);
 if(!crew.length||steps.some(step=>!step.stationId))return null;
 const job={id:'factory-crew-'+ ++state.sequence,ai:true,demonstration:true,owner:'factory-crew',worldId:environment.id,environmentId:environment.id,requestedBy,requestedRevision,requestedCrewId:crewId,recipeId:recipe.id,name:recipe.name+' · crew demonstration',buildAssetId:modelFor(recipe),status:'waiting',stepIndex:0,steps,startedAt:now,deadline:now+600000,readyAt:null,completedSteps:[],workerId:null,message:'The crew is preparing a shared demonstration order.'};
 state.job=job;return job;
}

/** Player orders always take precedence over a public crew demonstration. */
export function preemptFactoryCrewStation(sim,stationId,now,playerId){
 const state=sim.factoryCrewWork,job=state?.job;if(!active(job)||job.steps[job.stepIndex]?.stationId!==stationId)return false;
 release(state,job);job.readyAt=null;job.status='waiting';job.path=null;job.message='Yielding this machine to a player order.';job.yieldedAt=now;job.yieldedTo=playerId||null;
 const npc=sim.actors?.[job.workerId];if(npc?.resident){npc.resident.moving=false;npc.resident.gesture='wait';say(npc,'Your order has priority. I will resume our demonstration when this machine is free.',now);}
 return true;
}

/** Public crew work changes room materials and products, never an account,
 * Backpack or wallet. Its machine cycles use the canonical recipe durations. */
export function stepFactoryCrewWork(sim,environment,now,dt,{collision,objects={}}={}){
 const state=stateFor(sim,environment);if(state.lastAt===now)return;state.lastAt=now;
 const stations=factoryStations(environment,{actors:sim.actors}),crew=factoryCrew(environment,{actors:sim.actors});
 if(!Object.values(sim.players||{}).some(player=>fresh(player,now))){if(active(state.job))end(sim,state,state.job,'cancelled','The crew paused work while the factory is empty.',now);return;}
 if(state.nextAutoAt===null)state.nextAutoAt=now+12000;
 if(!active(state.job)&&now>=state.nextAutoAt)createJob(sim,environment,state,now);
 const job=state.job;if(!active(job))return;
 if(job.requestedBy){const owner=sim.players?.[job.requestedBy];if(!owner||!fresh(owner,now)||(owner.movementRevision||0)!==job.requestedRevision){end(sim,state,job,'cancelled','The requesting player left, relocated or disconnected. The crew released this demonstration.',now);return;}}
 if(now>job.deadline){end(sim,state,job,'cancelled','The demonstration paused because the work route stayed unavailable.',now);return;}
 const step=job.steps[job.stepIndex],station=stations.find(value=>value.id===step?.stationId);
 if(!station||station.stationRevision!==step.stationRevision){end(sim,state,job,'cancelled','The equipment changed. The crew will plan a new route using the active stations.',now);return;}
 if(fundedBusy(sim,station.id,now)){preemptFactoryCrewStation(sim,station.id,now);return;}
 let npc=sim.actors?.[job.workerId];
 if(!npc||npc.active===false||!npc.resident?.factory||npc.health<=0){releaseWorker(sim,job);npc=chooseWorker(sim,crew,step.kind);job.workerId=npc?.id||null;job.path=null;if(!npc){job.status='waiting';job.message='Waiting for an available factory specialist.';return;}}
 npc.resident.machineWork={kind:'factory',status:'active',jobId:job.id,stationId:station.id,phase:job.status};npc.resident.phase=job.status==='processing'?'working':'walking';npc.resident.task=(job.status==='processing'?'Operating ':'Walking to ')+station.name;npc.resident.gesture=job.status==='processing'?'work':'walk';
 if(job.status!=='processing'){
  job.status='moving';if(!walk(sim,environment,npc,job,station,now,dt,{collision,objects}))return;
  npc.resident.moving=false;
  if(nearHuman(sim,station,now)){job.message='Waiting for the player to finish at '+station.name+'.';return;}
  job.status='processing';job.cycleStartedAt=now;job.readyAt=now+step.durationMs;job.message=npc.resident.name+' is running '+step.name.toLowerCase()+'.';state.locks[station.id]={jobId:job.id,workerId:npc.id,startedAt:now,expiresAt:job.readyAt};say(npc,'Starting '+station.name+'. This is our shared demonstration; your own orders stay separate.',now);
  return;
 }
 npc.resident.moving=false;job.remainingMs=Math.max(0,job.readyAt-now);if(now<job.readyAt)return;
 release(state,job);
 const components=job.recipeId==='cargo-rocket'?3:2;
 if(step.kind==='fabrication')state.materials.components+=components;
 else if(step.kind==='assembly'){
  if(state.materials.components<components){end(sim,state,job,'cancelled','The assembly stock is unavailable. A fresh order is required.',now);return;}
  state.materials.components-=components;state.materials.assemblies++;
 }else if(step.kind==='calibration'){
  if(state.materials.assemblies<1){end(sim,state,job,'cancelled','The completed assembly is unavailable for inspection.',now);return;}
  state.materials.assemblies--;state.materials.models++;
 }
 job.completedSteps.push({stationId:station.id,kind:step.kind,workerId:npc.id,at:now});npc.resident.workCompleted=(npc.resident.workCompleted||0)+1;
 if(npc.resident.skills){residentSkillGain(npc.resident.skills,'manufacturing',.6);residentSkillGain(npc.resident.skills,'observation',.2);}
 releaseWorker(sim,job);job.stepIndex++;job.workerId=null;job.path=null;job.readyAt=null;
 if(job.stepIndex>=job.steps.length){
  const output={id:job.id+'-output',jobId:job.id,recipeId:job.recipeId,name:job.name,buildAssetId:job.buildAssetId,at:now,demonstration:true,roomOnly:true};state.outputs.push(output);state.outputs=state.outputs.slice(-8);state.completed++;end(sim,state,job,'completed','Crew demonstration complete. The inspected model is recorded on the shared factory board.',now);
 }else{job.status='waiting';job.message='Components confirmed. Handing over to the next factory specialist.';}
}

export function factoryCrewCommand(sim,player,environment,{operation='status',entityId}={},now){
 if(!Number.isFinite(now)||!fresh(player,now))throw Error('Join the live factory before asking the crew.');
 const crew=factoryCrew(environment,{actors:sim.actors}),npc=sim.actors?.[entityId];
 if(!crew.some(person=>person.id===entityId)||!npc?.resident?.factory||npc.active===false)throw Error('Choose an available factory crew member.');
 const current=sim.factoryCrewWork?.worldId===environment.id&&sim.factoryCrewWork.job,remoteOwnerStop=operation==='stop'&&active(current)&&current.requestedBy===player.actorId&&current.worldId===environment.id;
 if(!remoteOwnerStop&&gap(player.position,npc.position)>10)throw Error('Move closer to the factory worker before asking.');
 if(!['demonstrate','status','stop'].includes(operation))throw Error('Choose demonstrate, status or stop.');
 const state=stateFor(sim,environment);
 if(operation==='status')return state.job?.message||'The crew can demonstrate fabrication, assembly and quality inspection using the active machines.';
 if(now<(player.factoryCrewRequestAt||0)+1000)throw Error('Let the crew finish the current reply.');player.factoryCrewRequestAt=now;
 if(operation==='stop'){
  if(active(state.job)&&state.job.requestedBy&&state.job.requestedBy!==player.actorId)throw Error('This demonstration belongs to another player. Let them stop it or ask the crew for its status.');
  if(active(state.job))end(sim,state,state.job,'cancelled','The crew stopped this demonstration at the player’s request.',now);
  state.nextAutoAt=now+60000;say(npc,'Understood. The demonstration is stopped and the machines are clear for players.',now);return 'Factory demonstration stopped; player orders are unchanged.';
 }
 if(active(state.job))return state.job.message;
 const job=createJob(sim,environment,state,now,{requestedBy:player.actorId,requestedRevision:player.movementRevision||0,crewId:npc.id});if(!job)throw Error('Place active fabrication, assembly and calibration equipment and factory crew before requesting a demonstration.');
 say(npc,'We will run a real demonstration order through the machines. You can watch each specialist or ask us to stop.',now);return 'Crew demonstration requested. Watch the live factory board and the workers at each station.';
}

export function factoryCrewWorkView(sim,now){
 const state=sim.factoryCrewWork;if(!state)return null;
 const job=state.job?structuredClone(state.job):null;if(job){delete job.path;delete job.nextPathAt;delete job.requestedBy;delete job.requestedRevision;job.remainingMs=job.status==='processing'?Math.max(0,job.readyAt-now):0;}
 return {worldId:state.worldId,job,completed:state.completed,materials:{...state.materials},outputs:state.outputs.map(output=>({...output})),reservations:Object.entries(state.locks).filter(([,lock])=>lock.expiresAt>now).map(([stationId,lock])=>({stationId,workerId:lock.workerId,jobId:lock.jobId,expiresAt:lock.expiresAt}))};
}

/** Read-only status for quest radio; it never starts work or needs proximity. */
export function factoryCrewStatus(sim,{entityId}={}){
 const state=sim.factoryCrewWork,job=state?.job,worker=sim.actors?.[job?.workerId||entityId],step=job?.steps?.[job.stepIndex];
 const now=Math.max(sim.time||0,state?.lastAt||0),duration=(job?.readyAt||0)-(job?.cycleStartedAt||0);
 return {kind:'factory',workerId:worker?.id||entityId||null,workerName:worker?.resident?.name||worker?.name||'Factory crew',status:job?.status||'idle',phase:job?.status||'idle',message:job?.message||'The factory crew is available for a shared machine demonstration.',machineName:sim.factoryStations?.find(station=>station.id===step?.stationId)?.name||step?.name||null,progress:job?.status==='processing'&&duration>0?Math.max(0,Math.min(1,(now-job.cycleStartedAt)/duration)):job?.status==='completed'?1:0,completed:state?.completed||0,outputs:state?.outputs?.length||0};
}
