import {localMapLocations} from './public/js/local-map-locations.js';
import {residentHash,residentClamp,residentSkillGain} from './public/js/resident-personalities.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.y??0);
const descriptions={
 airport:['Terminal readiness round','Check public briefing information','Review the equipment handover'],
 harbor:['Dockside departure round','Check public mooring information','Review the dockside handover'],
 construction:['Site planning round','Review the public materials board','Check the public crew briefing'],
 factory:['Production planning round','Review public station information','Check the crew handover'],
 park:['Nature observation walk','Record a local observation','Compare the public walking routes'],
 music:['Rehearsal preparation round','Read the local activity board','Check the public rehearsal information'],
 arcade:['Arcade host round','Read the public game instructions','Check the waiting area information'],
 basketball:['Court host round','Review public activity information','Check the sideline welcome point'],
 hockey:['Rink host round','Review public activity information','Check the public rink approach'],
 skiing:['Resort information round','Read the public trail information','Check the guest welcome point'],
 range:['Training preparation round','Read the public preparation information','Check the public briefing point'],
};

// Resident quests use public landmarks, verified walking routes and their own
// journal. Live player quests, vehicle ownership and rewards remain authoritative.
const planningPoint=point=>({x:point.x,y:point.y||0,z:point.z});
const takePlanningWork=budget=>{if(budget.remaining<=0)return false;budget.remaining--;return true;};
const routeOffsets=[2.5,-2.5,5,-5,8,-8];
function routeSearch(from,to){return {from:planningPoint(from),to:planningPoint(to),phase:'direct',offset:0,segment:{}};}
// Undefined means that the current work allowance was used. Progress contains
// only plain data so room snapshots, saving and process restarts retain it.
function advanceRoute(search,{safePoint,clearSegment,budget}){
 while(budget.remaining>0){
  if(search.phase==='direct'){
   const clear=clearSegment(search.from,search.to,search.segment,budget);if(clear===undefined)return;
   if(clear)return [{...search.to}];search.phase='via';search.segment={};
  }
  if(search.phase==='via'){
   if(search.offset>=routeOffsets.length)return null;
   if(!takePlanningWork(budget))return;
   const dx=search.to.x-search.from.x,dz=search.to.z-search.from.z,length=Math.hypot(dx,dz);
   if(!length)return [{...search.to}];
   const offset=routeOffsets[search.offset];search.via=safePoint({x:(search.from.x+search.to.x)/2-dz/length*offset,y:search.from.y,z:(search.from.z+search.to.z)/2+dx/length*offset});
   if(!search.via){search.offset++;continue;}search.phase='out';search.segment={};
  }
  if(search.phase==='out'){
   const clear=clearSegment(search.from,search.via,search.segment,budget);if(clear===undefined)return;
   if(!clear){search.offset++;search.phase='via';continue;}search.phase='in';search.segment={};
  }
  if(search.phase==='in'){
   const clear=clearSegment(search.via,search.to,search.segment,budget);if(clear===undefined)return;
   if(clear)return [{...search.via},{...search.to}];search.offset++;search.phase='via';search.segment={};
  }
 }
}

export function planResidentObjective(sim,npc,environment,now,{safePoint,clearSegment,budget={remaining:64},revision=''}){
 const info=npc.resident;sim.residentLife||={};const plans=sim.residentLife.objectivePlans||={};
 info.nextObjectiveAt??=now+8000+residentHash(npc.id)%10000;
 if(info.objective?.status==='active'||info.sharedTask||info.needs.energy<30||info.factory||info.fitness){delete plans[npc.id];return false;}
 if(info.conversationId||info.speaking||now<(info.pauseUntil||0))return false;
 if(!plans[npc.id]&&(now<info.nextObjectiveAt||budget.remaining<=0))return false;
 const places=localMapLocations(environment).filter(place=>finite(place)&&Math.abs((place.y||0)-npc.position.y)<1.2&&distance(place,info.home)>6&&distance(place,info.home)<32);
 const signature=JSON.stringify([environment.id,info.personalityId,info.context.kind,environment.contentUpdatedAt||environment.updatedAt||'',revision,info.home,places]);
 let plan=plans[npc.id];
 if(plan&&(plan.signature!==signature||distance(plan.origin,npc.position)>8||Math.abs(plan.origin.y-npc.position.y)>.4)){delete plans[npc.id];plan=null;}
 if(!plan){
  if(now<info.nextObjectiveAt||budget.remaining<=0)return false;
  info.nextObjectiveAt=now+30000+residentHash(npc.id+now)%15000;
  if(!places.length)return false;
  const seed=residentHash(info.personalityId+':objective:'+ (info.objectiveSequence||0)),ordered=places.map(place=>({place,rank:residentHash(seed+':'+(place.id||place.name))})).sort((a,b)=>a.rank-b.rank).slice(0,6).map(({place})=>({id:place.id,name:place.name,...planningPoint(place)}));
  plan=plans[npc.id]={signature,seed,places:ordered,origin:planningPoint(npc.position),home:planningPoint(info.home),candidate:0,phase:'search'};
 }
 const navigation={safePoint,clearSegment,budget};
 while(budget.remaining>0){
  if(plan.phase==='search'){
   if(plan.candidate>=plan.places.length*24)break;
   if(!plan.search){
    if(!takePlanningWork(budget))return false;
    const source=plan.places[Math.floor(plan.candidate/24)],radius=[2.5,4,6][Math.floor(plan.candidate%24/8)],angle=(plan.seed%6283)/1000+plan.candidate%8*Math.PI/4;
    const point=safePoint({x:source.x+Math.cos(angle)*radius,y:plan.origin.y,z:source.z+Math.sin(angle)*radius});
    if(!point||distance(point,plan.home)<5||distance(point,plan.home)>36){plan.candidate++;continue;}
    plan.destination=point;plan.source=source;plan.search=routeSearch(plan.origin,point);
   }
   const route=advanceRoute(plan.search,navigation);if(route===undefined)return false;
   if(!route){delete plan.search;plan.candidate++;continue;}plan.route=route;plan.phase='home';delete plan.search;
  }
  if(plan.phase==='home'){
   if(!takePlanningWork(budget))return false;
   const home=safePoint({...plan.home});if(!home)break;plan.home=home;plan.search=routeSearch(plan.destination,home);plan.phase='return';
  }
  if(plan.phase==='return'){
   const route=advanceRoute(plan.search,navigation);if(route===undefined)return false;if(!route)break;plan.returnRoute=route;plan.search=routeSearch(npc.position,plan.origin);plan.phase='connect';
  }
  if(plan.phase==='connect'){
   // Ordinary life can continue during the full landmark search. Validate the
   // short connection from the resident's current position before committing.
   const route=advanceRoute(plan.search,navigation);if(route===undefined)return false;if(!route)break;
   if(distance(plan.search.from,plan.origin)>.2)plan.route=[...route,...plan.route];plan.phase='complete';
  }
  if(plan.phase==='complete'){
   const [title,first,last]=descriptions[info.context.kind]||['Local discovery round','Check local activity information','Share the route notes at home'];
   info.objectiveSequence=(info.objectiveSequence||0)+1;
   const objective=info.objective={id:info.personalityId+':round:'+info.objectiveSequence,worldId:environment.id,title,kind:'landmark-round',status:'active',index:0,startedAt:now,deadline:now+180000,skill:info.context.primarySkill,checkpoints:[{name:first+' · '+plan.source.name,position:plan.destination,placeId:plan.source.id||plan.source.name,sourcePosition:planningPoint(plan.source),route:plan.route,dwell:3000},{name:last+' · '+info.placeName,position:plan.home,route:plan.returnRoute,dwell:2500}]};
   info.goal={kind:'objective',reason:title,target:{...plan.route[0]},status:'planned',startedAt:now,objectiveId:objective.id};
   info.navigation={attempts:0,blockedAt:0};info.task='heading out for '+title.toLowerCase();delete plans[npc.id];return true;
  }
 }
 if(budget.remaining<=0)return false;
 delete plans[npc.id];info.nextObjectiveAt=now+30000+residentHash(npc.id+now)%15000;return false;
}

function finish(sim,npc,now,status,message){
 const info=npc.resident,q=info.objective;q.status=status;q.finishedAt=now;q.message=message;info.goal=null;info.nextThinkAt=now+500;info.nextObjectiveAt=now+40000+residentHash(q.id)%25000;
 info.objectiveHistory=[...(info.objectiveHistory||[]),{id:q.id,title:q.title,status,at:now}].slice(-6);
 if(status==='completed'){
  info.objectivesCompleted=(info.objectivesCompleted||0)+1;residentSkillGain(info.skills,q.skill,.9);residentSkillGain(info.skills,'observation',.25);info.needs.purpose=residentClamp(info.needs.purpose+32);info.needs.curiosity=residentClamp(info.needs.curiosity+20);info.needs.energy=residentClamp(info.needs.energy-4);info.gesture='cheer';
  info.memory=[...(info.memory||[]),{kind:'objective',subjectId:q.id,text:message,at:now}].slice(-8);
  if(sim.residentLife){sim.residentLife.stats.objectives=(sim.residentLife.stats.objectives||0)+1;sim.residentLife.objectives=[...(sim.residentLife.objectives||[]),{id:q.id,actorId:npc.id,title:q.title,at:now}].slice(-12);}
 }
 info.task=message;
}

/** Returns true while this quest owns the ambient movement slot. */
export function stepResidentObjective(sim,npc,environment,now,{move,safePoint}){
 const info=npc.resident,q=info.objective;if(q?.status!=='active')return false;
 if(q.worldId!==environment.id||now>q.deadline){finish(sim,npc,now,'failed','The local round ended before all checkpoints were reached.');return true;}
 const checkpoint=q.checkpoints[q.index];
 if(!checkpoint||!finite(checkpoint.position)||!safePoint(checkpoint.position)){finish(sim,npc,now,'cancelled','The public route changed; I will choose another activity.');return true;}
 if(checkpoint.placeId){const source=localMapLocations(environment).find(place=>(place.id||place.name)===checkpoint.placeId);if(!source||distance(source,checkpoint.sourcePosition)>.25||Math.abs((source.y||0)-checkpoint.sourcePosition.y)>.25){finish(sim,npc,now,'cancelled','The landmark changed; I will check the new map before going out.');return true;}}
 if(info.goal?.kind!=='objective'||info.goal.objectiveId!==q.id){info.goal={kind:'objective',reason:q.title,target:{...checkpoint.route[checkpoint.waypoint||0]},status:'planned',startedAt:now,objectiveId:q.id};info.navigation={attempts:0,blockedAt:0};}
 if(info.goal.status==='blocked'){finish(sim,npc,now,'failed','The public path stayed blocked; I will try another route later.');return true;}
 if(!move(info.goal.target)){delete checkpoint.arrivedAt;info.task='walking to '+checkpoint.name.toLowerCase();return true;}
 const waypoint=checkpoint.waypoint||0;
 if(waypoint<checkpoint.route.length-1){checkpoint.waypoint=waypoint+1;info.goal.target={...checkpoint.route[checkpoint.waypoint]};return true;}
 if(distance(npc.position,checkpoint.position)>.3||Math.abs(npc.position.y-checkpoint.position.y)>.4)return true;
 checkpoint.arrivedAt??=now;info.moving=false;info.phase='working';info.gesture='work';info.task=checkpoint.name+' · step '+(q.index+1)+' of '+q.checkpoints.length;
 if(now-checkpoint.arrivedAt<checkpoint.dwell)return true;
 checkpoint.completedAt=now;q.index++;
 if(q.index===q.checkpoints.length){finish(sim,npc,now,'completed','Finished '+q.title.toLowerCase()+' and brought the route notes back to '+info.placeName+'.');return true;}
 const next=q.checkpoints[q.index];info.goal.target={...next.route[0]};info.goal.status='planned';info.navigation={attempts:0,blockedAt:0};return true;
}
