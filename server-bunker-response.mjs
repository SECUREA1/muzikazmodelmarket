import {applyWorldObjectAction} from './server-ai-world-actions.mjs';
import {questRadio} from './server-quest-radio.mjs';

const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.z);
const gap=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const planar=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clean=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').slice(0,220);
const configFor=environment=>{const config=environment.bunkerDefense||environment.bunker?.defense||environment.builderScene?.layoutMeta?.bunkerDefense||environment.builderScene?.layoutMeta?.bunker?.defense||{},stations=config.stations||{};return {...config,powerId:config.powerId||stations.power,filtrationId:config.filtrationId||stations.filtration,relayId:config.relayId||stations.relay,alarmConsoleId:config.alarmConsoleId||stations.alert,medicalId:config.medicalId||stations.medical,archiveId:config.archiveId||stations.archive,lockerId:config.lockerId||stations.locker,waterId:config.waterId||stations.water};};
const definitionFor=(entity,environment)=>entity?.definition||environment.builderScene?.objects?.find(object=>object.id===entity?.id)||{};
const gameplayFor=(entity,environment)=>{const definition=definitionFor(entity,environment);return definition.gameplay||definition.functionalSettings||entity?.gameplay||{};};
const present=(player,now)=>player?.health>0&&!player.replacedByRoom&&point(player.position)&&now-(player.lastSeen??now)<15000;
const taskText=(label,stage)=>stage==='walking'?'Moving to '+label+'.':stage==='operating'?'Checking '+label+'.':stage==='waiting'?'Waiting for clear access to '+label+'.':label;

function report(sim,npc,text,now,{phase=false}={}){
 const info=npc.resident,message=clean(text);
 info.speech=message;info.speechUntil=now+5000;info.speaking=true;info.gesture='explain';delete info.speechRecipients;
 questRadio(sim,now,info.name||npc.name,message,{bunkerResponse:true,speakerId:npc.id,role:info.role,alertId:sim.bunkerDefense?.alarm?.id,phase});
}
function remember(npc,text,now,id){
 const info=npc.resident;info.memory||=[];
 if(info.memory.some(item=>item.kind==='bunker-response'&&item.subjectId===id))return;
 info.memory=[...info.memory,{kind:'bunker-response',subjectId:id,text:clean(text),at:now}].slice(-8);
}
function roleSteps(npc,environment){
 const config=configFor(environment),inspect=(targetId,label)=>({targetId,kind:'inspect',label}),read=(targetId,label)=>({targetId,kind:'talk',label}),enable=(targetId,label)=>({targetId,kind:'switch',desiredState:true,label});
 if(npc.id==='bunker-nyx')return [read(config.alarmConsoleId||'bunker-alert-console','emergency command console'),...(config.sealDoorIds||['bunker-ingress-shutter']).map(targetId=>({targetId,kind:'door',desiredState:false,label:'shelter ingress blast shutter'}))];
 if(npc.id==='bunker-rook')return [enable(config.powerId||'bunker-power-core','backup power core'),enable(config.filtrationId||'bunker-filtration-unit','filtered-air system')];
 if(npc.id==='bunker-patch')return [inspect(config.medicalId||'bunker-med-station','medical recovery supplies'),inspect(config.lockerId||'bunker-emergency-locker','emergency supply locker'),inspect(config.waterId||'bunker-water-reserve','sealed water reserve')];
 return [read(config.archiveId||'bunker-archive-terminal','archive integrity console'),enable(config.relayId||'bunker-power-relay','emergency communications relay')];
}
function phaseLine(npc,alarm){
 const title=alarm.kind==='airstrike'?'Airstrike':'Nuclear';
 if(alarm.phase==='clearing')return 'The emergency channel reports clearing. My checks are recorded; I am holding below ground until the actual all-clear.';
 if(npc.id==='bunker-nyx')return title+' alert. Move below ground and keep the marked route clear. I am checking command and sealing the shelter ingress.';
 if(npc.id==='bunker-rook')return title+' alert received. I am checking backup power and filtered air; use the real system indicators to confirm readiness.';
 if(npc.id==='bunker-patch')return title+' alert received. I am checking medical supplies and sealed reserves. Stay in the underground shelter through the alarm.';
 return title+' alert received. I am checking the archive and emergency relay. Your active quest markers remain yours to complete.';
}
function releaseAutonomousTask(sim,npc,now){
 const task=npc.aiTask;if(task?.status!=='active'||!task.autonomous)return;
 task.status='cancelled';task.stage='cancelled';task.finishedAt=now;task.message='Emergency bunker response takes priority over the ambient inspection.';
 const target=sim.actors[task.targetId];if(target?.aiWorldOperator?.npcId===npc.id)delete target.aiWorldOperator;
}
function cancelRoutine(sim,npc,now){
 const info=npc.resident;info.goal=null;info.visitorApproach=null;info.interaction=null;
 if(info.objective?.status==='active'){info.objective.status='cancelled';info.objective.finishedAt=now;info.objective.message='The bunker alarm interrupted this personal round.';}
 if(info.sharedTask){const id=info.sharedTask.id;for(const actor of Object.values(sim.actors))if(actor.resident?.sharedTask?.id===id)delete actor.resident.sharedTask;}
 if(info.conversationId){for(const conversation of sim.residentLife?.conversations||[])if(conversation.id===info.conversationId&&conversation.status==='active'){conversation.status='interrupted';conversation.completedAt=now;}delete info.conversationId;}
 releaseAutonomousTask(sim,npc,now);
}
function safeFloor(sim,environment,npc,candidate,context){
 if(!point(candidate))return null;
 const args={actors:context.collisionActors,objects:context.objects,maxRise:.4};
 const floor=context.collision?.groundAt?context.collision.groundAt(environment,candidate,args):candidate;
 if(!floor||Math.abs((floor.y||0)-(npc.position.y||0))>.6)return null;
 if(context.collision?.hasBodyClearance&&!context.collision.hasBodyClearance(environment,floor,.35,args))return null;
 return {x:floor.x??candidate.x,y:floor.y??candidate.y??0,z:floor.z??candidate.z};
}
function approach(sim,environment,npc,target,context){
 const reach=Math.max(1,Math.min(5,Number(gameplayFor(target,environment).interactionDistance)||3));
 if(gap(npc.position,target.position)<reach-.2)return {point:{...npc.position},reach};
 const yaw=Math.atan2(npc.position.z-target.position.z,npc.position.x-target.position.x),candidates=[];
 for(const radius of [Math.max(1,reach-.6),1.6,1])for(const offset of [0,.8,-.8,1.6,-1.6,Math.PI]){
  const candidate=safeFloor(sim,environment,npc,{x:target.position.x+Math.cos(yaw+offset)*radius,y:npc.position.y,z:target.position.z+Math.sin(yaw+offset)*radius},context);
  if(candidate&&gap(candidate,target.position)<reach-.1)candidates.push(candidate);
 }
 // Prefer a nearby access point, then let the room route connect it.
 const candidate=candidates.sort((a,b)=>planar(a,npc.position)-planar(b,npc.position))[0];
 return candidate?{point:candidate,reach}:null;
}
const row=z=>z< -12?-22:z>12?22:0;
function roomDoor(sim,location){
 if(Math.abs(location.x)<4.1)return null;
 const side=location.x<0?'west':'east',id='bunker-door-'+side+'-'+row(location.z),door=sim.actors[id];
 return door?.active!==false&&point(door?.position)?door:null;
}
function sameRoom(a,b){return Math.sign(a.x)===Math.sign(b.x)&&Math.abs(a.x)>4.1&&Math.abs(b.x)>4.1&&row(a.z)===row(b.z);}
function route(sim,npc,target,goal){
 const from=npc.position,to=goal.point,result=[],sourceDoor=roomDoor(sim,from),targetDoor=roomDoor(sim,to),waypoint=(x,z)=>({x,y:from.y,z});
 if(sameRoom(from,to)||!sourceDoor&&!targetDoor)return [to];
 const exitSign=sourceDoor?Math.sign(sourceDoor.position.x):Math.sign(from.x)||1;
 if(sourceDoor){result.push(waypoint(sourceDoor.position.x+exitSign*2.2,sourceDoor.position.z),{doorId:sourceDoor.id},waypoint(sourceDoor.position.x-exitSign*2.2,sourceDoor.position.z));}
 // The authored access spine stays clear along x = 0. Side consoles and the
 // radiation monitor occupy the edge lanes, so responders use its centre.
 const lane=0;
 const destinationZ=targetDoor?targetDoor.position.z:to.z;
 result.push(waypoint(lane,sourceDoor?.position.z??from.z),waypoint(lane,destinationZ));
 if(targetDoor){const sign=Math.sign(targetDoor.position.x);result.push(waypoint(targetDoor.position.x-sign*2.2,targetDoor.position.z),{doorId:targetDoor.id},waypoint(targetDoor.position.x+sign*2.2,targetDoor.position.z));}
 result.push(to);return result;
}
function reserved(sim,target,now){
 if(target.aiUsePriority?.until>now)return true;
 return Object.values(sim.players||{}).some(player=>present(player,now)&&(gap(player.position,target.position)<1.1||player.vehicleMission?.status==='active'&&player.vehicleMission.checkpoints?.[player.vehicleMission.index]?.entityId===target.id&&gap(player.position,target.position)<6));
}
function move(sim,environment,npc,goal,now,dt,context){
 const span=planar(npc.position,goal);if(span<.24)return true;
 const step=Math.min(span,Math.max(0,Math.min(.25,dt))*3);if(!step)return false;
 const dx=(goal.x-npc.position.x)/span,dz=(goal.z-npc.position.z)/span,proposals=[{x:dx,z:dz},{x:dx,z:0},{x:0,z:dz},{x:-dz,z:dx},{x:dz,z:-dx}];
 const before=planar(npc.position,goal);
 for(const proposal of proposals){
  const candidate={x:npc.position.x+proposal.x*step,y:npc.position.y,z:npc.position.z+proposal.z*step};
  if(planar(candidate,goal)>before+.01)continue;
  const people=Object.values(sim.players||{}).some(player=>present(player,now)&&gap(player.position,candidate)<.8)||Object.values(sim.actors).some(other=>other!==npc&&other.resident&&other.active!==false&&gap(other.position,candidate)<.65);
  const floor=!people&&safeFloor(sim,environment,npc,candidate,context);if(!floor)continue;
  const resolved=context.collision?.resolve?context.collision.resolve(environment,npc.position,floor,context.collisionActors,context.objects):floor;
  if(!resolved||planar(resolved,candidate)>.12||planar(resolved,npc.position)<.005)continue;
  npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position={x:resolved.x,y:floor.y,z:resolved.z};npc.resident.moving=true;return planar(npc.position,goal)<.24;
 }
 npc.resident.moving=false;return false;
}
function setTask(npc,response,text,stage){
 response.message=clean(text);response.stage=stage;
 Object.assign(npc.resident,{task:response.message,phase:stage==='walking'?'walking':'working',moving:stage==='walking',gesture:stage==='walking'?'walk':'work'});
}
function completeStep(sim,npc,response,step,now){
 step.status='completed';step.completedAt=now;response.index++;
 remember(npc,'Emergency check confirmed: '+step.label+'.',now,response.id+':'+step.targetId);
 npc.resident.worldActionsCompleted=(npc.resident.worldActionsCompleted||0)+1;
 sim.events||=[];sim.events.push({id:response.id+':'+step.targetId,action:'bunker-crew-action',actorId:npc.id,entityId:step.targetId,kind:step.kind,at:now});sim.events=sim.events.slice(-100);
 delete response.path;delete response.pathIndex;delete response.readyAt;delete response.targetRevision;
}
function operate(sim,environment,npc,response,step,now,dt,context){
 const target=sim.actors[step.targetId];
 if(!target||target.active===false||!point(target.position)){
  step.status='unavailable';setTask(npc,response,'Required '+step.label+' is missing. Restore it in Builder; I cannot confirm this check.','blocked');return;
 }
 if(npc.aiTask?.status==='active'&&!npc.aiTask.autonomous){setTask(npc,response,'Finishing the requested helper action before my emergency station check.','waiting');return;}
 if(reserved(sim,target,now)){delete response.readyAt;setTask(npc,response,'A player is using '+step.label+'. I will wait for the control to be free.','waiting');return;}
 const revision=JSON.stringify([target.position,target.placementRevision||0]);
 if(response.targetRevision!==revision){
  const goal=approach(sim,environment,npc,target,context);
  if(!goal){setTask(npc,response,'No clear approach to '+step.label+'. Please clear its access lane.','blocked');return;}
  response.path=route(sim,npc,target,goal);response.pathIndex=0;response.reach=goal.reach;response.targetRevision=revision;
 }
 const next=response.path?.[response.pathIndex||0];
 if(next?.doorId){
  const door=sim.actors[next.doorId];
  if(!door||door.active===false){delete response.targetRevision;setTask(npc,response,'The room access door changed. I am checking a new approach.','blocked');return;}
  const reach=Number(gameplayFor(door,environment).interactionDistance)||4;
  if(gap(npc.position,door.position)>reach){delete response.targetRevision;setTask(npc,response,'The room door is outside my safe operating reach.','blocked');return;}
  if(!door.open){if(reserved(sim,door,now)){setTask(npc,response,'Waiting while a player uses the room door.','waiting');return;}try{applyWorldObjectAction(door,'door',{actor:npc,now,desiredState:true});}catch{setTask(npc,response,'This room door cannot be operated. Please restore its door behavior.','blocked');return;}}
  response.pathIndex++;return;
 }
 if(next){
  setTask(npc,response,taskText(step.label,'walking'),'walking');
  if(move(sim,environment,npc,next,now,dt,context)){response.pathIndex++;delete response.blockedAt;}
  else if(!npc.resident.moving){response.blockedAt??=now;if(now-response.blockedAt>4000){delete response.targetRevision;delete response.blockedAt;setTask(npc,response,'Access to '+step.label+' is blocked. I will recheck the walking route.','blocked');}}
  return;
 }
 if(gap(npc.position,target.position)>response.reach){delete response.targetRevision;return;}
 response.readyAt??=now+900;setTask(npc,response,taskText(step.label,'operating'),'operating');if(now<response.readyAt)return;
 try{applyWorldObjectAction(target,step.kind,{actor:npc,now,desiredState:step.desiredState});}
 catch{setTask(npc,response,'The '+step.label+' control is unavailable. A player must restore it before I can confirm.','blocked');return;}
 completeStep(sim,npc,response,step,now);
}

/** Called once per bounded resident update. Actions use real room objects;
 * no authenticated player, inventory operation, or quest credit is synthesized. */
export function stepBunkerResponse(sim,environment,cast,now,dt,{collision,objects={}}={}){
 const defense=sim.bunkerDefense;if(!defense)return;
 const alarm=defense.alarm||{},active=alarm.active===true,responseTasks=Object.fromEntries((Array.isArray(defense.responseTasks)?defense.responseTasks:Object.values(defense.responseTasks||{})).filter(task=>task?.actorId).map(task=>[task.actorId,task]));
 const expected=new Set(cast.map(npc=>npc.id));for(const id of Object.keys(responseTasks))if(!expected.has(id))delete responseTasks[id];
 const collisionActors=Object.fromEntries(Object.entries(sim.actors||{}).filter(([,actor])=>!actor.resident&&!actor.questContact)),context={collision,objects,collisionActors};
 const run=()=>{
  for(const npc of cast){
   const info=npc.resident,current=info.bunkerResponse;
   if(!active){
    if(current?.status==='active'){
     current.status='completed';current.finishedAt=now;current.stage='all-clear';current.message='The alarm is clear. Response checks are recorded; ordinary duties can resume.';
     info.goal=null;info.nextThinkAt=now+500;info.nextWorldActionAt=now+30000;info.nextAmbientAt=now+12000;info.task=current.message;info.moving=false;remember(npc,current.message,now,current.id+':clear');report(sim,npc,current.message,now,{phase:true});
    }
    if(current)responseTasks[npc.id]={actorId:npc.id,name:info.name,...current};
    continue;
   }
   const alertId=String(alarm.id||defense.airstrike?.id||defense.nuclear?.id||'bunker-alarm');
   if(current?.alertId!==alertId||current?.status!=='active'){
    cancelRoutine(sim,npc,now);
    info.bunkerResponse={id:alertId+':'+npc.id,alertId,worldId:environment.id,status:'active',stage:'preparing',index:0,startedAt:now,steps:roleSteps(npc,environment).map(step=>({...step,status:'pending'})),message:'Preparing my assigned bunker response checks.'};
   }
   const response=info.bunkerResponse,phase=alertId+':'+(alarm.phase||alarm.level||'warning');
   if(response.lastAnnouncedPhase!==phase){response.lastAnnouncedPhase=phase;report(sim,npc,phaseLine(npc,alarm),now,{phase:true});remember(npc,phaseLine(npc,alarm),now,phase);}
   info.activeBunkerOperations=Object.values(sim.players||{}).filter(player=>present(player,now)&&player.vehicleMission?.status==='active'&&player.vehicleMission.campaign).length;
   const step=response.steps[response.index];
   if(step)operate(sim,environment,npc,response,step,now,dt,context);
   else{response.stage='ready';response.message='My emergency checks are complete. Holding inside the shelter until all clear.';info.task=response.message;info.phase='working';info.moving=false;info.gesture='explain';}
   response.moving=info.moving===true;
   responseTasks[npc.id]={actorId:npc.id,name:info.name,role:info.role,...response};
  }
 };
 if(collision?.withActorCandidates)collision.withActorCandidates(collisionActors,run);else run();
 defense.responseTasks=Object.values(responseTasks);
}

/** Private conversation guidance follows the requesting player's current step,
 * even while this crew member is carrying out a separate emergency task. */
export function bunkerResidentGuidance(sim,player,npc){
 if(!npc?.resident?.bunker)return '';
 const alarm=sim.bunkerDefense?.alarm,mission=player?.vehicleMission;
 const safety=alarm?.active?(alarm.kind==='airstrike'?'Airstrike':'Nuclear')+' alert: stay below ground and follow the shelter status panel. '+(npc.resident.bunkerResponse?.message||'The crew is checking the protective systems.')+' ':'';
 if(mission?.status==='active'&&(mission.campaign||String(mission.questId||'').includes('underground-bunker'))){
  const current=mission.checkpoints?.[mission.index],count=mission.checkpoints?.length||0;
  if(current)return clean(safety)+" Your active operation is "+clean(mission.title)+'. Step '+((mission.index||0)+1)+' of '+count+': '+clean(current.name)+'. '+(current.action==='interact'?'Use the actual marked item; my equipment check cannot complete your objective.':'Reach the marked checkpoint and confirm there.');
 }
 return safety?clean(safety):'';
}
