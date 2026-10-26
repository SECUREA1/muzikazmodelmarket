import {residentClamp,residentHash,residentSkillGain} from './public/js/resident-personalities.js';

// Shared errands use the residents' verified public work positions. Movement is
// handled by the same collision-aware resident navigation as individual goals.
// Equipment, player quests and player rewards stay with their own schedulers.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z)&&Number.isFinite(point.y??0);
const sameFloor=(a,b)=>Math.abs((a.y||0)-(b.y||0))<1.2;
const present=actor=>actor?.resident&&actor.active!==false&&(actor.health===undefined||actor.health>0)&&finite(actor.position)&&finite(actor.resident.home);
const occupied=actor=>{
 const r=actor.resident;
 return r.casino||r.factory||r.fitness||r.activitySuspended||actor.aiTask?.status==='active'||r.machineWork?.status==='active'||r.objective?.status==='active'||r.goal?.kind==='objective'||r.conversationId;
};
const plans={
 play:{title:'Practice passing and welcome players',duties:[['Set up the passing drill','Check spacing and welcome the next player'],['Lead a controlled passing sequence','Receive passes and return them'],['Review timing with the team','Share one improvement for the next round']]},
 airport:{title:'Prepare a crew briefing together',duties:[['Read the terminal briefing checklist','Check equipment information'],['Rehearse departure and radio calls','Check the route and read back the plan'],['Give the crew handover','Confirm the briefing is complete']]},
 harbor:{title:'Prepare a dockside crew handover',duties:[['Read the public dock checklist','Check mooring and weather information'],['Prepare the departure briefing','Review the route and crew signals'],['Share the dockside handover','Read back the departure plan']]},
 construction:{title:'Prepare the next crew handover',duties:[['Read the public site plan','Check the materials checklist'],['Prepare the next crew handover','Review the plan and clearances'],['Present the handover checklist','Confirm the next crew instructions']]},
 music:{title:'Rehearse a duet together',duties:[['Set a steady pulse','Listen and count in the phrase'],['Play the lead phrase','Keep the rhythm and answer the phrase'],['Review the timing','Suggest a change for the next duet']]},
 park:{title:'Compare local nature observations',duties:[['Choose a nearby observation','Check the public path and surroundings'],['Record an interesting detail','Compare the observation with the guide'],['Share the discovery','Add a second detail to the field notes']]},
 basketball:{title:'Prepare a sideline passing drill',duties:[['Set up the sideline drill','Check spacing and turn-taking'],['Demonstrate controlled passing','Receive and return each pass'],['Review footwork','Share feedback on the passing drill']]},
 hockey:{title:'Rehearse off-ice team positioning',duties:[['Review the support positions','Check the public practice area'],['Demonstrate a passing lane','Rehearse the support movement'],['Review team spacing','Read back the next practice plan']]},
 skiing:{title:'Prepare a trail briefing together',duties:[['Read the trail information','Check equipment instructions'],['Rehearse the resort briefing','Review the trail and weather notes'],['Share the route plan','Confirm the preparation checklist']]},
 range:{title:'Rehearse the preparation briefing',duties:[['Read the public range instructions','Check the preparation checklist'],['Rehearse the safety briefing','Read back the lane procedures'],['Review the preparation notes','Confirm the next visitor instructions']]},
 arcade:{title:'Prepare a friendly arcade practice round',duties:[['Read the game and boarding instructions','Check waiting areas and turn-taking'],['Rehearse a coordination sequence','Keep count and support the attempt'],['Review the practice round','Share a useful game tip']]},
 community:{title:'Organise local supplies together',duties:[['Read the local activity checklist','Check the public activity information'],['Prepare a local activity handover','Review directions and supplies'],['Share the activity plan','Confirm the handover checklist']]}
};
function contextKind(actor,friend){
 if(actor.resident.ageGroup==='child'||friend.resident.ageGroup==='child')return 'play';
 const kind=actor.resident.context?.kind;
 if(plans[kind])return kind;
 const role=actor.resident.role||'';
 return /ground|flight/i.test(role)?'airport':/site|construction/i.test(role)?'construction':/dock|harbor/i.test(role)?'harbor':/music/i.test(role)?'music':'community';
}
function readyForTask(actor,now){
 const r=actor.resident;
 return present(actor)&&!occupied(actor)&&!r.sharedTask&&now>=(r.communityRetryAt||0)&&now>=(r.pauseUntil||0)&&(r.needs?.energy??85)>=30&&!(r.goal?.kind==='practice'&&r.practice?.phase!=='complete');
}
function setGoal(actor,task,now){
 const r=actor.resident;
 if(r.intelligenceVersion){
  if(r.goal?.familyTaskId!==task.id)r.goal={kind:'social',target:{...task.workPosition},reason:task.title,status:'planned',startedAt:now,familyTaskId:task.id};
 }else r.goal={...task.workPosition};
}
function recordHistory(info,task,partner,status,now){
 info.communityHistory||=[];
 info.communityHistory.push({id:task.id,title:task.title,kind:task.kind,partnerId:task.partnerId,partnerName:partner?.resident?.name||'Teammate',responsibility:task.assignments?.[1]||task.responsibility,status,at:now});
 info.communityHistory=info.communityHistory.slice(-6);
}
function release(actor,partner,status,now){
 const r=actor.resident,task=r.sharedTask;if(!task)return;
 recordHistory(r,task,partner,status,now);
 if(r.goal?.familyTaskId===task.id||!r.intelligenceVersion)r.goal=null;
 delete r.sharedTask;
 r.communityRetryAt=now+(status==='completed'?30000+residentHash(actor.id+task.id)%15000:10000);
 r.nextThinkAt=now+450;
}
function gainRelationship(info,partnerId,now){
 if(!Array.isArray(info.relationships))info.relationships=Object.entries(info.relationships||{}).map(([id,affinity])=>({id,affinity,lastAt:now}));
 let relation=info.relationships.find(item=>item.id===partnerId);
 if(!relation){relation={id:partnerId,affinity:0,lastAt:now};info.relationships.push(relation);}
 relation.affinity=residentClamp(relation.affinity+5);relation.lastAt=now;
 info.relationships=info.relationships.sort((a,b)=>b.lastAt-a.lastAt).slice(0,8);
}
function complete(sim,a,b,now){
 const task=a.resident.sharedTask;
 for(const [person,partner]of [[a,b],[b,a]]){
  const info=person.resident,own=info.sharedTask;
  info.completedCommunityTasks=(info.completedCommunityTasks||0)+1;
  gainRelationship(info,partner.id,now);
  info.needs.social=residentClamp(info.needs.social+8);
  if(info.needs.purpose!==undefined)info.needs.purpose=residentClamp(info.needs.purpose+20);
  if(info.skills){residentSkillGain(info.skills,'social',.45);const skill=info.context?.primarySkill;if(skill&&Object.hasOwn(info.skills,skill))residentSkillGain(info.skills,skill,.35);}
  info.memory||=[];info.memory.push({kind:'community-task',subjectId:partner.id,text:'Completed '+task.title.toLowerCase()+' with '+partner.resident.name+'. My part: '+own.assignments[1]+'.',at:now});info.memory=info.memory.slice(-8);
  info.speech='Thanks, '+partner.resident.name+'! '+(task.kind==='music'?'That duet is coming together.':task.kind==='park'?'I will remember what we noticed.':'Let’s share a break before the next task.');
  info.speechUntil=now+6000;info.speaking=true;info.phase='socialising';info.gesture='wave';info.pauseUntil=now+2000;
  release(person,partner,'completed',now);
 }
 const state=sim.communityLife;
 state.completed=(state.completed||0)+1;
 state.history.push({id:task.id,title:task.title,kind:task.kind,participants:[a.id,b.id],at:now});state.history=state.history.slice(-12);
 if(sim.residentLife){sim.residentLife.stats||={};sim.residentLife.events||=[];sim.residentLife.stats.communityTasks=(sim.residentLife.stats.communityTasks||0)+1;sim.residentLife.events.push({id:task.id,kind:'community-task',actorId:a.id,targetId:b.id,text:a.resident.name+' and '+b.resident.name+' completed '+task.title.toLowerCase()+'.',at:now});sim.residentLife.events=sim.residentLife.events.slice(-12);}
}
export function stepCommunityLife(sim,cast,now,dt){
 const state=sim.communityLife||=( {sequence:0,completed:0,history:[]} );state.history||=[];
 const elapsed=Math.max(0,Math.min(.25,Number(dt)||0));
 if(state.needsUpdatedAt!==now){for(const actor of cast){const r=actor.resident;if(!r||r.casino)continue;r.needs||={energy:85,social:75};if(!r.intelligenceVersion){r.needs.energy=residentClamp(r.needs.energy+elapsed*(r.phase==='relaxing'?.8:-.04));r.needs.social=residentClamp(r.needs.social+elapsed*(r.phase==='socialising'?.8:-.02));}}state.needsUpdatedAt=now;}
 for(const actor of cast){
  if(!readyForTask(actor,now))continue;
  const friend=cast.filter(other=>other!==actor&&readyForTask(other,now)&&sameFloor(other.position,actor.position)&&sameFloor(other.resident.home,actor.resident.home)&&distance(other.position,actor.position)<12&&distance(other.resident.home,actor.resident.home)<12&&distance(other.resident.home,actor.resident.home)>.8&&(!actor.resident.context?.worldId||!other.resident.context?.worldId||actor.resident.context.worldId===other.resident.context.worldId)).sort((a,b)=>{
   const affinity=other=>(actor.resident.relationships||[]).find?.(r=>r.id===other.id)?.affinity||0;
   return affinity(b)-affinity(a)||distance(a.position,actor.position)-distance(b.position,actor.position)||a.id.localeCompare(b.id);
  })[0];
  if(!friend)continue;
  const kind=contextKind(actor,friend),plan=plans[kind],task={id:'community-'+ ++state.sequence+':'+now,worldId:actor.resident.context?.worldId||null,leaderId:actor.id,title:plan.title,kind,elapsed:0,goal:16,state:'approaching',stageIndex:0,stage:'Prepare',progress:0,startedAt:now,deadline:now+120000};
  for(const [person,partner,slot]of [[actor,friend,0],[friend,actor,1]]){person.resident.sharedTask={...task,partnerId:partner.id,workPosition:{...person.resident.home},assignments:plan.duties.map(pair=>pair[slot]),responsibility:plan.duties[0][slot],partnerResponsibility:plan.duties[0][1-slot]};setGoal(person,person.resident.sharedTask,now);}
 }
 for(const actor of cast){
  const r=actor.resident,task=r?.sharedTask;if(!task)continue;
  const friend=cast.find(other=>other.id===task.partnerId),other=friend?.resident?.sharedTask;
  if(!present(actor)||!present(friend)||!other||other.id!==task.id||occupied(actor)||occupied(friend)||now>task.deadline||task.worldId&&(r.context?.worldId!==task.worldId||friend.resident.context?.worldId!==task.worldId)){
   if(other?.id===task.id)release(friend,actor,'interrupted',now);release(actor,friend,'interrupted',now);continue;
  }
  setGoal(actor,task,now);
  if(task.leaderId!==actor.id||task.updatedAt===now)continue;
  task.updatedAt=other.updatedAt=now;
  const ready=sameFloor(actor.position,friend.position)&&sameFloor(actor.position,task.workPosition)&&sameFloor(friend.position,other.workPosition)&&distance(actor.position,task.workPosition)<.55&&distance(friend.position,other.workPosition)<.55&&distance(actor.position,friend.position)<12;
  const paused=now<(r.pauseUntil||0)||now<(friend.resident.pauseUntil||0)||r.speaking&&r.speechUntil>now||friend.resident.speaking&&friend.resident.speechUntil>now;
  task.state=other.state=ready?(paused?'waiting':'working'):'approaching';
  if(ready&&!paused)task.elapsed=Math.min(task.goal,task.elapsed+elapsed);
  const stage=task.elapsed<4?0:task.elapsed<12?1:2;
  for(const [person,partner,own]of [[actor,friend,task],[friend,actor,other]]){
   own.elapsed=task.elapsed;own.progress=task.elapsed/task.goal;own.stageIndex=stage;own.stage=['Prepare','Work together','Review and hand over'][stage];own.responsibility=own.assignments[stage];own.partnerResponsibility=partner.resident.sharedTask.assignments[stage];
   if(ready&&!paused){person.resident.phase=task.kind==='play'?'playing':'working';person.resident.gesture=task.kind==='play'||task.kind==='music'?'play':stage===2?'explain':'work';}
   person.resident.task=own.responsibility+' with '+partner.resident.name+' · '+Math.floor(own.progress*100)+'%';
  }
  if(task.elapsed>=task.goal)complete(sim,actor,friend,now);
 }
}
