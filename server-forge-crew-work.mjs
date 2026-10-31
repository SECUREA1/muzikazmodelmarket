import {forgeStations} from './public/js/forge-config.js';

const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const copy=point=>({x:point.x,y:Number(point.y)||0,z:point.z});
const active=object=>object&&object.active!==false&&!object.disabled&&!object.deleted&&object.visible!==false;
const fresh=(player,now)=>player.health>0&&!player.replacedByRoom&&player.position&&now-(player.lastSeen||0)<15000;
const duties={
 'Master smith':['hammer','heat','finish'],
 Metallurgist:['quench','temper','heat'],
 Quartermaster:['sourcing','dispatch','finish']
};
const names={sourcing:'counting demonstration billets',heat:'checking the hearth and bellows',hammer:'demonstrating controlled hammer strokes',quench:'inspecting quench technique',temper:'reviewing the heat-treatment cycle',finish:'inspecting the maker’s finish',dispatch:'checking sealed freight and route paperwork'};
const props={sourcing:'billet',heat:'tongs',hammer:'hammer',quench:'tongs',temper:'ledger',finish:'billet',dispatch:'ledger'};
const cycleMs={sourcing:9500,heat:11000,hammer:12000,quench:9000,temper:11000,finish:10000,dispatch:12000};

function workers(sim){return Object.values(sim.actors||{}).filter(npc=>npc.resident?.forge&&active(npc)&&npc.health>0);}
function talking(sim,npc,now){
 if(npc.resident.conversationId||npc.resident.speechUntil>now||npc.resident.pauseUntil>now)return true;
 return Object.values(sim.players||{}).some(player=>{
  const conversation=player.npcConversation,line=conversation?.conversation?.at(-1);
  return fresh(player,now)&&conversation?.entityId===npc.id&&conversation.status==='active'&&gap(player.position,npc.position)<6&&now-(line?.at||0)<9000;
 });
}
function actorView(sim,npc){return {...sim.actors,[npc.id]:{...npc,active:false}};}
function clearPoint(environment,point,{collision,objects,actors}){
 const floor=collision?.groundAt?collision.groundAt(environment,point,{actors,objects,maxRise:.4}):point;
 if(!floor||Math.abs((floor.y||0)-(point.y||0))>.5)return null;
 if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,floor,.38,{actors,objects}))return null;
 return copy(floor);
}
function workspace(environment,station){
 const saved=environment.builderScene?.layoutMeta?.forgeCrewWorkspaces?.find(point=>point.stationId===station.id&&point.kind===station.kind);
 if(saved?.position&&gap(saved.position,station.approach)<8)return copy(saved.position);
 const dx=station.approach.x-station.position.x,dz=station.approach.z-station.position.z,span=Math.hypot(dx,dz)||1;
 return {x:station.approach.x+dz/span*3.4+dx/span*2.8,y:station.approach.y,z:station.approach.z-dx/span*3.4+dz/span*2.8};
}
function places(environment){
 const stations=forgeStations(environment).map(station=>({...station,target:workspace(environment,station)}));
 const yard=environment.builderScene?.layoutMeta?.forgeYard;
 const dispatch=yard?.dispatchObjectId&&(environment.builderScene?.objects||[]).find(object=>object.id===yard.dispatchObjectId);
 if(yard?.dispatchApproach&&active(dispatch)&&dispatch.functionalSettings?.active!==false){
  const offset={x:(dispatch.position?.x||0)-(yard.dispatchPosition?.x??dispatch.position?.x??0),z:(dispatch.position?.z||0)-(yard.dispatchPosition?.z??dispatch.position?.z??0)};
  stations.push({id:yard.dispatchObjectId,kind:'dispatch',name:'Forge shipping dispatch',position:copy(dispatch.position),approach:{...yard.dispatchApproach,x:yard.dispatchApproach.x+offset.x,z:yard.dispatchApproach.z+offset.z},target:{x:yard.dispatchApproach.x+offset.x+2.8,y:yard.dispatchApproach.y||0,z:yard.dispatchApproach.z+offset.z+2.5}});
 }
 return stations;
}
function occupied(sim,station,now){
 return Object.values(sim.players||{}).some(player=>{
  const job=player.forge?.job;
  if(job?.environmentId===sim.forgeCrewActivity?.worldId&&job.stage===station.kind&&job.status==='processing'&&job.readyAt>now)return true;
  return fresh(player,now)&&gap(player.position,station.approach)<2.3;
 });
}
function candidates(environment,npc,target,kind){
 const start=copy(npc.position),finish=copy(target),aisle=Number(environment.builderScene?.layoutMeta?.forgeYard?.workshopAisleZ)||0;
 const routes=[[finish],[{x:start.x,y:start.y,z:aisle},{x:finish.x,y:finish.y,z:aisle},finish],
  [{x:finish.x,y:start.y,z:start.z},finish],[{x:start.x,y:finish.y,z:finish.z},finish],
  [{x:start.x+4,y:start.y,z:start.z},{x:start.x+4,y:finish.y,z:finish.z},finish]];
 const yard=environment.builderScene?.layoutMeta?.forgeYard,waypoints=yard?.courierWaypoints;
 if(kind==='dispatch'&&Array.isArray(waypoints)&&waypoints.length){
  const last=waypoints.reduce((best,point,index)=>gap(point,yard.dispatchApproach)<gap(waypoints[best],yard.dispatchApproach)?index:best,0),route=waypoints.slice(0,last+1).map(copy);
  routes.unshift([{x:start.x,y:start.y,z:aisle},{x:route[0].x,y:start.y,z:aisle},...route,{x:route.at(-1).x,y:finish.y,z:finish.z},finish]);
 }
 return routes;
}
/** Persist an incomplete validation slice so a busy world never spends an
 * unbounded number of collision queries preparing the three crew routes. */
function planRoute(environment,npc,work,context,budget){
 const plan=work.plan ||= {paths:candidates(environment,npc,work.target,work.kind),candidate:0,segment:0,index:1,previous:copy(npc.position)};
 while(plan.candidate<plan.paths.length&&budget.remaining>0){
  const path=plan.paths[plan.candidate],from=plan.segment?path[plan.segment-1]:work.origin,to=path[plan.segment],steps=Math.max(1,Math.ceil(gap(from,to)/.8));
  const fraction=plan.index/steps,point={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,z:from.z+(to.z-from.z)*fraction};
  budget.remaining--;budget.used++;
  const floor=clearPoint(environment,point,context),resolved=floor&&(context.collision?.resolve?context.collision.resolve(environment,plan.previous,floor,context.actors,context.objects):floor);
  if(!resolved||gap(resolved,point)>.18){plan.candidate++;plan.segment=0;plan.index=1;plan.previous=copy(work.origin);continue;}
  plan.previous=copy(resolved);plan.index++;
  if(plan.index>steps){plan.segment++;plan.index=1;if(plan.segment===path.length){work.path=path.map(copy);delete work.plan;return true;}}
 }
 if(plan.candidate>=plan.paths.length){delete work.plan;work.path=null;return false;}
 return undefined;
}
function walk(sim,environment,npc,target,now,dt,context,{yielding=false}={}){
 const distance=gap(npc.position,target);if(distance<.22)return true;
 const amount=Math.min(distance,Math.max(0,Math.min(.25,Number(dt)||0))*1.18);if(!amount)return false;
 const next={x:npc.position.x+(target.x-npc.position.x)*amount/distance,y:npc.position.y,z:npc.position.z+(target.z-npc.position.z)*amount/distance};
 const blocked=Object.values(sim.players||{}).filter(player=>fresh(player,now)).some(player=>gap(player.position,next)<(player.vehicleId?3:1.2)&&gap(player.position,next)<=gap(player.position,npc.position)+.005)
  ||workers(sim).some(other=>other!==npc&&gap(other.position,next)<.85&&gap(other.position,next)<=gap(other.position,npc.position)+.005);
 if(blocked)return false;
 const floor=clearPoint(environment,next,context),resolved=floor&&(context.collision?.resolve?context.collision.resolve(environment,npc.position,floor,context.actors,context.objects):floor);
 if(!resolved||gap(resolved,next)>.18)return false;
 npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position=copy(resolved);
 npc.resident.moving=true;npc.resident.gesture='walk';npc.resident.phase=yielding?'yielding':'walking';return gap(npc.position,target)<.22;
}
function publish(npc,work,phase,now){
 const info=npc.resident,previous=info.forgeActivity;
 info.forgeActivity={phase,kind:work?.kind||null,stationId:work?.stationId||null,startedAt:previous?.phase===phase&&previous.stationId===work?.stationId?previous.startedAt:now,cycleMs:cycleMs[work?.kind]||0,prop:phase==='working'||phase==='walking'?props[work?.kind]||'ledger':null,target:work?.target?copy(work.target):copy(info.home),demonstration:true};
 info.machineWork={kind:'forge',status:'active',stationId:work?.stationId||null,demonstration:true,message:phase==='working'?names[work.kind]:phase==='walking'?'walking to the '+(work?.kind||'work')+' side bench':phase==='talking'?'talking with a visitor':phase==='yielding'?'giving the player a clear working area':'waiting for an open demonstration space'};
 info.task=info.machineWork.message;info.moving=false;
 if(phase==='working'){info.phase='working';info.gesture='work';}
 else if(phase==='yielding'||phase==='waiting'){info.phase=phase;info.gesture='wait';}
}

/** Claim only the ambient movement slot before ordinary resident needs/memory
 * updates. Player conversation, favor and real AI-action schedulers keep priority. */
export function prepareForgeCrewWork(sim,now=0){
 for(const npc of workers(sim)){
  const info=npc.resident;
  if((info.needs?.energy??100)<25&&!info.forgeBreak){info.forgeBreak={startedAt:now};info.goal=null;info.nextThinkAt=now;}
  if(info.forgeBreak){
   if((info.needs?.energy??100)<55){if(info.machineWork?.kind==='forge')delete info.machineWork;continue;}
   delete info.forgeBreak;if(npc.forgeWork){npc.forgeWork.origin=copy(npc.position);npc.forgeWork.path=null;delete npc.forgeWork.plan;npc.forgeWork.nextPlanAt=now;delete npc.forgeWork.workingAt;}
  }
  if(npc.aiTask?.status==='active'||info.sharedTask||info.objective?.status==='active')continue;
  info.machineWork={kind:'forge',status:'active',demonstration:true,message:info.task||'preparing a workshop demonstration'};
 }
}

/** These are visible demonstrations only. This scheduler never reads or writes
 * a wallet, Backpack, material ledger, paid work order or quest completion. */
export function stepForgeCrewWork(sim,environment,now,dt,{collision,objects={},planningBudget=24}={}){
 sim.forgeCrewActivity ||= {worldId:environment.id,lastAt:null,planningChecks:0,workers:0};
 const state=sim.forgeCrewActivity;if(state.lastAt===now)return;
 state.worldId=environment.id;state.lastAt=now;
 const cast=workers(sim),stations=places(environment),players=Object.values(sim.players||{}).filter(player=>fresh(player,now)),budget={remaining:Math.max(0,Math.min(48,Math.floor(planningBudget))),used:0};
 state.workers=cast.length;
 for(const npc of cast){
  const info=npc.resident;
  if(info.forgeBreak){info.forgeActivity={phase:'waiting',kind:null,stationId:null,startedAt:info.forgeBreak.startedAt,cycleMs:0,prop:null,target:copy(info.home),demonstration:true};continue;}
  if(npc.aiTask?.status==='active'||info.sharedTask||info.objective?.status==='active'){delete info.forgeActivity;if(info.machineWork?.kind==='forge')delete info.machineWork;continue;}
  let work=npc.forgeWork;
  if(talking(sim,npc,now)){publish(npc,work,'talking',now);continue;}
  if(!players.length){publish(npc,work,'waiting',now);continue;}
  const choices=duties[info.role]||['finish','sourcing'],station=work&&stations.find(value=>value.id===work.stationId&&value.kind===work.kind);
  if(work&&(!station||gap(station.target,work.target)>.08)){delete npc.forgeWork;work=null;}
  if(!work){
   const sequence=Number.isSafeInteger(npc.forgeDutySequence)?npc.forgeDutySequence:0;
   let choice=null;
   for(let offset=0;offset<choices.length;offset++){const kind=choices[(sequence+offset)%choices.length],candidate=stations.find(value=>value.kind===kind);if(candidate&&!occupied(sim,candidate,now)){choice=candidate;break;}}
   if(!choice){publish(npc,null,'waiting',now);continue;}
   work=npc.forgeWork={kind:choice.kind,stationId:choice.id,target:copy(choice.target),origin:copy(npc.position),createdAt:now,nextPlanAt:now,path:null};
  }
  const chosen=stations.find(value=>value.id===work.stationId),context={collision,objects,actors:actorView(sim,npc)};
  if(occupied(sim,chosen,now)){
   publish(npc,work,'yielding',now);
   const nearest=players.filter(player=>gap(player.position,npc.position)<1.7).sort((a,b)=>gap(a.position,npc.position)-gap(b.position,npc.position))[0];
   if(nearest){const dx=npc.position.x-nearest.position.x,dz=npc.position.z-nearest.position.z,length=Math.hypot(dx,dz)||1;walk(sim,environment,npc,{x:npc.position.x+dx/length*2.1,y:npc.position.y,z:npc.position.z+dz/length*2.1},now,dt,context,{yielding:true});}
   if(work.workingAt)work.workingAt=now;
   work.path=null;delete work.plan;work.origin=copy(npc.position);work.nextPlanAt=now;
   continue;
  }
  if(gap(npc.position,work.target)<.3){
   work.workingAt??=now;publish(npc,work,'working',now);info.forgeActivity.startedAt=work.workingAt;
   npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-chosen.position.x,npc.position.z-chosen.position.z);
   if(now-work.workingAt>=cycleMs[work.kind]){npc.forgeDutySequence=(npc.forgeDutySequence||0)+1;delete npc.forgeWork;}
   continue;
  }
  publish(npc,work,'walking',now);
  if(!work.path&&now>=work.nextPlanAt){const planned=planRoute(environment,npc,work,context,budget);if(planned===false)work.nextPlanAt=now+4000;}
  if(!work.path){info.forgeActivity.phase='waiting';continue;}
  while(work.path.length&&gap(npc.position,work.path[0])<.3)work.path.shift();
  if(work.path.length){const prior=copy(npc.position);walk(sim,environment,npc,work.path[0],now,dt,context);if(gap(prior,npc.position)<.001){work.blockedAt??=now;if(now-work.blockedAt>2800){work.path=null;work.nextPlanAt=now+1500;work.origin=copy(npc.position);delete work.plan;}}else delete work.blockedAt;}
 }
 state.planningChecks=budget.used;
}
