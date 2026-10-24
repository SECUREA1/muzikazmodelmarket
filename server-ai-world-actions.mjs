import {residentActivityRestricted} from './server-resident-life.mjs';
import {questRadio} from './server-quest-radio.mjs';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';

const caches=new WeakMap();
const definitionCaches=new WeakMap(),definitions=new WeakMap();
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const planar=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=point=>point&&['x','z'].every(axis=>Number.isFinite(point[axis]));
const definitionFor=entity=>entity?.definition||definitions.get(entity)||{};
const configFor=entity=>definitionFor(entity).gameplay||entity?.functionalSettings||entity?.gameplay||{};
const allowed=new Set(['talk','switch','door','heal']);
const actorReady=npc=>npc&&npc.active!==false&&npc.health>0&&finite(npc.position)&&(npc.resident||npc.questContact);
const hash=value=>[...String(value)].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);
const safeText=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').slice(0,180);

function usable(entity){
 const config=configFor(entity);
 return entity?.active!==false&&finite(entity?.position)&&!entity.resident&&!entity.questContact&&!entity.holderId&&config.enabled!==false&&allowed.has(config.behavior)&&!config.device&&!config.factoryStation&&!config.fitnessStation&&!config.casinoStation&&!config.portal?.enabled&&(!config.action||config.action==='none');
}
/** The room keeps static definitions in its canonical manifest rather than
 * duplicating them into every snapshot actor. Retain that metadata out of band. */
export function registerAIWorldDefinitions(sim,manifest,revision=manifest){
 const previous=definitionCaches.get(sim);if(previous?.registered&&previous.revision===revision&&previous.boundActors===sim.actors)return;
 const index=new Map((manifest?.objects||manifest?.actors||[]).map(definition=>[definition.objectId||definition.id,definition]));
 definitionCaches.set(sim,{registered:true,index,revision,boundActors:sim.actors,nextBindAt:(sim.time||0)+1000});
 for(const [id,definition]of index){const entity=sim.actors?.[id];if(entity)definitions.set(entity,definition);}
 caches.delete(sim);
}
function ensureDefinitions(sim,environment,now=sim.time||0){
 const scene=environment?.builderScene||environment?.placementScene;
 let info=definitionCaches.get(sim);
 if(!info?.registered&&(!info||info.scene!==scene||info.updatedAt!==environment?.updatedAt)){
  const compiled=scene?compileBuilderScene(scene):{objects:[]};info={scene,updatedAt:environment?.updatedAt,index:new Map(compiled.objects.map(definition=>[definition.objectId,definition]))};definitionCaches.set(sim,info);
 }
 if(info&&(info.boundActors!==sim.actors||now>=(info.nextBindAt||0))){for(const [id,definition]of info.index){const entity=sim.actors?.[id];if(entity)definitions.set(entity,definition);}info.boundActors=sim.actors;info.nextBindAt=now+1000;}
}
function targets(sim,environment,now){
 ensureDefinitions(sim,environment,now);
 let cached=caches.get(sim);
 if(!cached||now>=cached.nextAt||cached.actors!==sim.actors){cached={actors:sim.actors,nextAt:now+1000,values:Object.values(sim.actors||{}).filter(usable).slice(0,512)};caches.set(sim,cached);}
 return cached.values;
}
const targetName=entity=>safeText(entity.name||definitionFor(entity).name||entity.id||'local item');
function protectedTarget(sim,target,now){
 if(target.aiUsePriority?.until>now||target.holderId)return true;
 return Object.values(sim.players||{}).some(player=>player.health>0&&!player.replacedByRoom&&now-(player.lastSeen??0)<15000&&finite(player.position)&&distance(player.position,target.position)<(player.vehicleMission?.status==='active'?3:1.35));
}
function actionRecord(entity,kind){
 const name=targetName(entity),verbs={switch:'Operate ',door:'Open or close ',talk:'Read or explain ',heal:'Use recovery point ',inspect:'Inspect '};
 return {id:'world:'+kind+':'+entity.id,label:verbs[kind]+name,kind,targetId:entity.id,targetName:name};
}

/** Only actual local, free interactions are offered. Native machine controls
 * are delegated by the construction/factory adapters, never impersonated. */
export function describeAIWorldActions(sim,environment,npc,{player,now=sim.time||0,maxDistance=20}={}){
 if(!actorReady(npc))return [];
 const limit=Math.max(1,Math.min(24,Number(maxDistance)||20));
 return targets(sim,environment,now).filter(entity=>entity!==npc&&usable(entity)&&(!entity.aiWorldOperator||entity.aiWorldOperator.npcId===npc.id||entity.aiWorldOperator.expiresAt<=now)&&distance(npc.position,entity.position)<=limit&&Math.abs((entity.position.y||0)-(npc.position.y||0))<1.2)
  .sort((a,b)=>Number(configFor(a).behavior==='talk')-Number(configFor(b).behavior==='talk')||distance(a.position,npc.position)-distance(b.position,npc.position)||a.id.localeCompare(b.id)).slice(0,8)
  .flatMap(entity=>[actionRecord(entity,configFor(entity).behavior),actionRecord(entity,'inspect')]);
}

export function notePlayerAIWorldInteraction(entity,player,now){
 if(entity)entity.aiUsePriority={actorId:player?.actorId||player?.id||null,until:now+3000};
}

/** The player and NPC paths use the same authoritative object fields. This
 * function grants no quest credit and never invokes a paid/financial device. */
export function applyWorldObjectAction(entity,kind,{actor,now=0,desiredState}={}){
 if(!usable(entity))throw Error('This item is not available for a local AI interaction.');
 const config=configFor(entity);if(kind!=='inspect'&&kind!==config.behavior)throw Error('This item does not support that action.');
 if(kind==='switch')entity.switched=typeof desiredState==='boolean'?desiredState:!entity.switched;
 if(kind==='door')entity.open=typeof desiredState==='boolean'?desiredState:!entity.open;
 if(kind==='heal'){
  if(!actor)throw Error('Choose a living actor for recovery.');
  actor.health=Math.min(actor.maxHealth||100,Math.max(0,actor.health||0)+Math.max(0,Math.min(100,Number(config.value)||25)));
 }
 const message=kind==='talk'?definitionFor(entity).dialogue?.text||config.prompt||'Local information checked.':kind==='switch'?'Control '+(entity.switched?'enabled.':'disabled.'):kind==='door'?'Door '+(entity.open?'opened.':'closed.'):kind==='heal'?'Recovery point used.':'The item and its public approach have been inspected.';
 entity.aiLastUsedAt=now;return safeText(message);
}

function announce(sim,npc,task,now,message){
 const name=npc.resident?.name||npc.name||'Local helper';
 questRadio(sim,now,name,safeText(message),{aiAction:true,speakerId:npc.id,taskId:task.id,...(task.ownerId?{recipients:[task.ownerId]}:{})});
}
function setPresentation(npc,task,message){
 if(!npc.resident)return;
 Object.assign(npc.resident,{task:safeText(message),moving:task.status==='active'&&task.stage==='walking',phase:task.stage==='walking'?'walking':task.status==='active'?'working':'relaxing',gesture:task.stage==='walking'?'walk':task.status==='active'?'work':'thought'});
}
function finish(sim,npc,task,now,status,message){
 if(task.status!=='active')return;
 task.status=status;task.finishedAt=now;task.message=safeText(message);task.stage=status;
 const target=sim.actors?.[task.targetId];if(target?.aiWorldOperator?.taskId===task.id)delete target.aiWorldOperator;
 setPresentation(npc,task,message);
 if(npc.resident){npc.resident.goal=null;npc.resident.nextThinkAt=now+2000;npc.resident.nextWorldActionAt=now+30000+hash(npc.id+task.id)%25000;}
 announce(sim,npc,task,now,message);
}
function safeFloor(sim,environment,npc,point,context){
 if(!finite(point)||residentActivityRestricted(environment,point,sim,context.now))return null;
 const args={actors:context.collisionActors||sim.actors,objects:context.objects||{},maxRise:.4,earthworks:sim.construction?.earthworks};
 const floor=context.collision?.groundAt?context.collision.groundAt(environment,point,args):point;
 if(!floor||Math.abs((floor.y||0)-(point.y||0))>.4||residentActivityRestricted(environment,floor,sim,context.now))return null;
 if(context.collision?.hasBodyClearance&&!context.collision.hasBodyClearance(environment,floor,.4,args))return null;
 return {x:floor.x??point.x,y:floor.y??point.y??0,z:floor.z??point.z};
}
function clearSegment(sim,environment,npc,from,to,context){
 const count=Math.max(1,Math.ceil(planar(from,to)/.65));let previous=from;
 for(let i=1;i<=count;i++){
  const t=i/count,point={x:from.x+(to.x-from.x)*t,y:from.y,z:from.z+(to.z-from.z)*t},floor=safeFloor(sim,environment,npc,point,context);
  if(!floor||peopleAt(sim,npc,floor,context.now))return false;
  const next=context.collision?.resolve?context.collision.resolve(environment,previous,floor,context.collisionActors||sim.actors,context.objects||{}):floor;
  if(!next||planar(next,floor)>.15)return false;previous=next;
 }
 return true;
}
function peopleAt(sim,npc,point,now){
 return Object.values(sim.players||{}).some(player=>player.health>0&&!player.replacedByRoom&&now-(player.lastSeen??0)<15000&&finite(player.position)&&distance(player.position,point)<(player.vehicleId?4:.95))||Object.values(sim.actors||{}).some(other=>other!==npc&&actorReady(other)&&distance(other.position,point)<.8);
}
function navigationContext(sim,context){
 // Residents use explicit capsule avoidance below. Their render meshes must
 // not also become solid obstacles around the very actor trying to move.
 return {...context,collisionActors:context.collisionActors||Object.fromEntries(Object.entries(sim.actors||{}).filter(([,actor])=>!actor.resident&&!actor.questContact))};
}
function navigationScope(context,run){return context.collision?.withActorCandidates?context.collision.withActorCandidates(context.collisionActors,run):run();}
function desiredState(input,kind){
 const text=String(input.text||'').toLowerCase();
 if(kind==='door'){if(/\bclose\b/.test(text))return false;if(/\bopen\b/.test(text))return true;}
 if(kind==='switch'){if(/\b(?:turn|switch|set)\b.*\boff\b|\bdisable\b/.test(text))return false;if(/\b(?:turn|switch|set)\b.*\bon\b|\benable\b/.test(text))return true;}
 return undefined;
}
function approach(sim,environment,npc,target,context){
 const reach=Math.max(.6,Math.min(5,Number(configFor(target).interactionDistance)||3)),goal=target.position;
 if(distance(npc.position,goal)<=reach-.1)return {point:{...npc.position},reach};
 const angle=Math.atan2(npc.position.z-goal.z,npc.position.x-goal.x);
 for(const radius of [Math.min(2,reach-.25),Math.min(1.2,reach-.2)])for(const offset of [0,.65,-.65,1.25,-1.25]){
  const raw={x:goal.x+Math.cos(angle+offset)*radius,y:npc.position.y,z:goal.z+Math.sin(angle+offset)*radius},point=safeFloor(sim,environment,npc,raw,context);
  if(!point||distance(point,goal)>reach-.05)continue;
  if(clearSegment(sim,environment,npc,npc.position,point,context))return {point,reach};
  const dx=point.x-npc.position.x,dz=point.z-npc.position.z,length=Math.hypot(dx,dz);
  for(const side of [-1,1]){const mid=safeFloor(sim,environment,npc,{x:(point.x+npc.position.x)/2-dz/length*1.6*side,y:npc.position.y,z:(point.z+npc.position.z)/2+dx/length*1.6*side},context);if(mid&&clearSegment(sim,environment,npc,npc.position,mid,context)&&clearSegment(sim,environment,npc,mid,point,context))return {point,via:mid,reach};}
 }
 return null;
}
function actionChoice(sim,environment,npc,input,now){
 const records=describeAIWorldActions(sim,environment,npc,{now}),raw=String(input.id||input.action||input.type||''),targetId=input.targetId||input.entityId;
 if(raw.startsWith('world:'))return records.find(record=>record.id===raw)||null;
 let kind=allowed.has(raw)||raw==='inspect'?raw:null;
 if(raw&&!kind&&!['demonstrate','ai-demonstrate','world-demonstrate','start'].includes(raw))return null;
 if(!kind&&input.text){const text=String(input.text).toLowerCase();kind=/\b(inspect|check|look)\b/.test(text)?'inspect':/\b(door|open|close)\b/.test(text)?'door':/\b(switch|beacon|toggle)\b/.test(text)?'switch':/\b(read|sign|explain)\b/.test(text)?'talk':/\b(heal|recover|restore)\b/.test(text)?'heal':null;}
 const candidates=records.filter(record=>(!targetId||record.targetId===targetId)&&(!kind||record.kind===kind));
 return candidates.find(record=>record.kind!==npc.aiLastActionKind)||candidates[0]||null;
}

export function requestAIWorldAction(sim,player,npc,input={},now,context={}){
 if(!actorReady(npc))throw Error('This local helper is unavailable.');
 if(!player||player.health<=0||player.replacedByRoom||now-(player.lastSeen??0)>15000||!finite(player.position))throw Error('Join the live map before asking a helper.');
 const operation=input.operation||(['ai-stop','stop'].includes(input.action||input.id)?'stop':['ai-status','status'].includes(input.action||input.id)?'status':'start');
 const requesterId=player.actorId||player.id,ownTask=operation==='stop'&&npc.aiTask?.status==='active'&&npc.aiTask.ownerId===requesterId;
 if(operation==='stop'&&npc.aiTask?.status==='active'&&npc.aiTask.worldId!==context.environment?.id)throw Error('This helper’s task belongs to another map.');
 const remoteOwnStop=ownTask&&typeof npc.aiTask.worldId==='string'&&npc.aiTask.worldId.length>0&&npc.aiTask.worldId===context.environment?.id&&sim.players?.[requesterId]===player;
 if(!remoteOwnStop&&distance(player.position,npc.position)>(context.maxRequestDistance||16))throw Error('Move closer to the local helper before asking.');
 if(operation==='status')return {message:npc.aiTask?.message||'I am ready to help with the local objects listed in my actions.',task:npc.aiTask||null};
 if(operation==='stop'){if(npc.aiTask?.status==='active'){if(npc.aiTask.ownerId&&npc.aiTask.ownerId!==(player.actorId||player.id))throw Error('This helper is working on another player’s request.');finish(sim,npc,npc.aiTask,now,'cancelled','Local action stopped. The item is free for players.');}return {message:'Local action stopped.',task:npc.aiTask||null};}
 if(operation!=='start')throw Error('Choose a local action, status or stop.');
 if(npc.resident?.machineWork?.status==='active')throw Error('This helper is operating equipment. Ask them to stop that work first.');
 if(npc.aiTask?.status==='active')throw Error('This helper is already working. Ask for status or stop first.');
 const environment=context.environment||{},choice=actionChoice(sim,environment,npc,input,now);if(!choice)throw Error('No matching free local object is available nearby.');
 const target=sim.actors[choice.targetId],routeContext=navigationContext(sim,{...context,now}),route=navigationScope(routeContext,()=>approach(sim,environment,npc,target,routeContext));if(!route)throw Error('The helper cannot reach that object on clear public ground.');
 sim.aiWorldSequence=(sim.aiWorldSequence||0)+1;
 const task=npc.aiTask={id:'ai-world-'+sim.aiWorldSequence,worldId:environment.id,status:'active',stage:planar(npc.position,route.point)<.25?'operating':'walking',kind:choice.kind,desiredState:desiredState(input,choice.kind),targetId:choice.targetId,targetName:choice.targetName,targetPosition:{...target.position},targetRevision:target.placementRevision||0,ownerId:player.actorId||player.id,startedAt:now,deadline:now+90000,approach:route.point,via:route.via||null,reach:route.reach,message:'Preparing to '+choice.label.toLowerCase()+'.'};
 target.aiWorldOperator={npcId:npc.id,taskId:task.id,expiresAt:now+1500};
 if(npc.resident){npc.resident.goal=null;npc.resident.pauseUntil=now+500;npc.resident.conversationId=null;}
 setPresentation(npc,task,task.message);announce(sim,npc,task,now,task.message);
 return {message:task.message,task};
}

function autonomous(sim,environment,npc,now,context){
 const info=npc.resident;if(!info||info.factory||info.fitness||info.casino||npc.questContact||info.machineWork?.status==='active'||info.conversationId||info.speaking||info.activitySuspended||info.goal?.kind==='practice')return;
 info.nextWorldActionAt??=now+10000+hash(npc.id)%15000;
 if(now<info.nextWorldActionAt)return;
 info.nextWorldActionAt=now+30000+hash(npc.id+now)%25000;
 const records=describeAIWorldActions(sim,environment,npc,{now,maxDistance:8}).filter(record=>record.kind!=='door'&&!protectedTarget(sim,sim.actors[record.targetId],now));
 const choices=records.filter(record=>record.kind!==npc.aiLastActionKind),choice=(choices.length?choices:records)[hash(npc.id+Math.floor(now/30000))%Math.max(1,(choices.length?choices:records).length)];
 if(!choice)return;
 const target=sim.actors[choice.targetId],route=approach(sim,environment,npc,target,{...context,now});if(!route)return;
 sim.aiWorldSequence=(sim.aiWorldSequence||0)+1;
 npc.aiTask={id:'ai-world-'+sim.aiWorldSequence,worldId:environment.id,status:'active',stage:planar(npc.position,route.point)<.25?'operating':'walking',kind:choice.kind,targetId:choice.targetId,targetName:choice.targetName,targetPosition:{...target.position},targetRevision:target.placementRevision||0,ownerId:null,autonomous:true,startedAt:now,deadline:now+45000,approach:route.point,via:route.via||null,reach:route.reach,message:'Checking '+choice.targetName+'.'};
 target.aiWorldOperator={npcId:npc.id,taskId:npc.aiTask.id,expiresAt:now+1500};
 info.goal=null;setPresentation(npc,npc.aiTask,npc.aiTask.message);
}

export function stepAIWorldActions(sim,environment,now,dt,context={}){
 const scoped=navigationContext(sim,context);return navigationScope(scoped,()=>stepWorldActions(sim,environment,now,dt,scoped));
}
function stepWorldActions(sim,environment,now,dt,context){
 sim.actors||={};ensureDefinitions(sim,environment,now);const cast=Object.values(sim.actors).filter(actorReady).slice(0,48),players=Object.values(sim.players||{}).filter(player=>player.health>0&&!player.replacedByRoom&&now-(player.lastSeen??0)<15000);
 let autonomousCount=cast.filter(npc=>npc.aiTask?.status==='active'&&npc.aiTask.autonomous).length;
 for(const npc of cast){
  if(npc.aiTask?.status!=='active'&&autonomousCount<3){autonomous(sim,environment,npc,now,context);if(npc.aiTask?.status==='active'&&npc.aiTask.autonomous)autonomousCount++;}
  const task=npc.aiTask;if(task?.status!=='active')continue;
  const target=sim.actors[task.targetId],owner=task.ownerId&&sim.players?.[task.ownerId];
  if(task.worldId!==environment.id||!usable(target)||target.placementRevision!==undefined&&target.placementRevision!==task.targetRevision||distance(target.position,task.targetPosition)>.25){finish(sim,npc,task,now,'cancelled','The local item changed or became unavailable. Choose a new action.');continue;}
  if(task.ownerId&&(!owner||owner.health<=0||owner.replacedByRoom||now-(owner.lastSeen??0)>15000)){finish(sim,npc,task,now,'cancelled','The request ended after the player left the live activity.');continue;}
  if(now>task.deadline){finish(sim,npc,task,now,'failed','The public approach stayed blocked. Ask again from a clear place.');continue;}
  if(target.aiWorldOperator&&target.aiWorldOperator.npcId!==npc.id&&target.aiWorldOperator.expiresAt>now){task.stage='waiting';task.message='Waiting for the other local helper to finish.';delete task.readyAt;setPresentation(npc,task,task.message);continue;}
  target.aiWorldOperator={npcId:npc.id,taskId:task.id,expiresAt:now+1500};
  if(protectedTarget(sim,target,now)){
   task.stage='waiting';task.message='Waiting for the player to finish using '+task.targetName+'.';delete task.readyAt;setPresentation(npc,task,task.message);continue;
  }
  const waypoint=task.via||task.approach,span=planar(npc.position,waypoint);
  if(span>.22){
   const step=Math.min(span,Math.max(0,Math.min(.25,dt))*1.05),candidate={x:npc.position.x+(waypoint.x-npc.position.x)/span*step,y:npc.position.y,z:npc.position.z+(waypoint.z-npc.position.z)/span*step};
   const human=players.some(player=>distance(player.position,candidate)<(player.vehicleId?4:.95)),neighbor=cast.some(other=>other!==npc&&distance(other.position,candidate)<.8),floor=!human&&!neighbor&&safeFloor(sim,environment,npc,candidate,{...context,now}),resolved=floor&&(context.collision?.resolve?context.collision.resolve(environment,npc.position,floor,context.collisionActors,context.objects||{}):floor);
   if(!resolved||planar(resolved,candidate)>.15){task.stage='waiting';task.message='Waiting for a clear public path to '+task.targetName+'.';delete task.readyAt;setPresentation(npc,task,task.message);continue;}
   npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position={x:resolved.x,y:floor.y,z:resolved.z};task.stage='walking';task.message='Walking to '+task.targetName+'.';delete task.readyAt;setPresentation(npc,task,task.message);continue;
  }
  if(task.via){task.via=null;continue;}
  if(distance(npc.position,target.position)>task.reach){finish(sim,npc,task,now,'failed','The object is outside safe interaction reach.');continue;}
  task.stage='operating';task.readyAt??=now+1200;task.message=(task.kind==='inspect'?'Inspecting ':task.kind==='talk'?'Reading ':task.kind==='heal'?'Using recovery point ':'Operating ')+task.targetName+'.';setPresentation(npc,task,task.message);
  if(now<task.readyAt)continue;
  const cooldown=Math.max(0,Math.min(30,Number(configFor(target).cooldown)||0))*1000;
  if(now<(target.aiLastUsedAt||0)+cooldown){task.stage='waiting';task.message='Waiting for the item control to reset.';continue;}
  const reply=applyWorldObjectAction(target,task.kind,{actor:npc,now,desiredState:task.desiredState});npc.aiLastActionKind=task.kind;
  if(npc.resident){npc.resident.speech=reply;npc.resident.speechUntil=now+4500;npc.resident.speaking=true;npc.resident.worldActionsCompleted=(npc.resident.worldActionsCompleted||0)+1;}
  sim.events||=[];sim.events.push({id:task.id+':complete',action:'ai-world-action',actorId:npc.id,entityId:target.id,kind:task.kind,message:reply,at:now});sim.events=sim.events.slice(-100);
  finish(sim,npc,task,now,'completed',task.targetName+': '+reply);
 }
}
