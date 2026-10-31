import {planResidentObjective,stepResidentObjective} from './server-resident-objectives.mjs';
import {residentActivityInvitation} from './server-resident-invitations.mjs';
import {localMapLocations} from './public/js/local-map-locations.js';
import {harborWaterAt} from './public/js/harbor-water.js';
import {firingRangeLocations,rangeWorldToLocal,rangeLocalToWorld} from './public/js/firing-range.js';
import {arcadeSettings} from './public/js/arcade-rules.js';
import {createEarthworks} from './public/js/construction-earthworks.js';
import {constructionMachineKind} from './public/js/construction-state.js';
import {residentPersonality,residentContext,RESIDENT_CONTEXTS,residentHash,residentClamp,residentGoalUtilities,residentSkillGain} from './public/js/resident-personalities.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),gap=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const sameFloor=(a,b)=>Math.abs((a.y||0)-(b.y||0))<1.2;
const text=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').slice(0,180);
const generic=npc=>npc?.resident&&!npc.resident.casino&&npc.active!==false&&(npc.health??100)>0;
const restrictionCache=new WeakMap();
function restrictions(environment){let result=restrictionCache.get(environment);if(result)return result;const layout=environment.builderScene?.layout||environment.layout||'',game=environment.game;result={basketball:game==='basketball'||environment.basketball===true||environment.basketballCourt===true||['basketball-arena','basketball-stadium'].includes(layout)||environment.id==='basketball-arena',hockey:game==='hockey'||layout==='hockey-arena',arcade:game==='arcade'||layout==='arcade-park'||environment.id==='neon-junction'?arcadeSettings(environment.builderScene?.gameplay?.arcade||environment.arcade):null,ranges:firingRangeLocations(environment),runways:environment.airport?.enabled?(environment.airport.runways||[environment.airport.runway].filter(Boolean)):[],construction:environment.construction||environment.builderScene?.layoutMeta?.construction};if(result.construction?.enabled!==false&&result.construction)result.earthworks=createEarthworks(result.construction).patches.map(({origin,columns,rows,cellSize})=>({origin,columns,rows,cellSize}));restrictionCache.set(environment,result);return result;}
function partLocal(point,part){const angle=(part.rotation||0)*Math.PI/180,dx=point.x-part.x,dz=point.z-part.z,scale=part.scale||1;return {x:(dx*Math.cos(angle)-dz*Math.sin(angle))/scale,z:(dx*Math.sin(angle)+dz*Math.cos(angle))/scale};}
function segmentDistance(point,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/Math.max(.0001,dx*dx+dz*dz)));return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);}
export function residentActivityRestricted(environment,point,sim={},now=Math.max(sim.time||0,sim.residentUpdatedAt||0,sim.residentLife?.updatedAt||0)){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return true;const areas=restrictions(environment);
 if(areas.basketball&&Math.abs(point.x)<8.7&&Math.abs(point.z)<15.7)return true;
 if(areas.hockey&&Math.abs(point.x)<31.6&&Math.abs(point.z)<14.2)return true;
 if(areas.arcade){const config=areas.arcade;
  for(const id of ['hockey','shooting','basketball','air-hockey','billiards'])if(config.enabled.includes(id)){const p=partLocal(point,config.parts[id]);if(Math.abs(p.x)<4.6&&Math.abs(p.z)<3.6)return true;}
  if(config.enabled.includes('train')){const p=partLocal(point,config.parts.train),radius=Math.hypot(p.x/config.trainRadiusX,p.z/config.trainRadiusZ);if(Math.abs(radius-1)*Math.min(config.trainRadiusX,config.trainRadiusZ)<1.6)return true;}
  if(config.enabled.includes('coaster')){const p=partLocal(point,config.parts.coaster),track=[[19,9],[20,2],[15,-10],[4,-14],[-9,-13],[-19,-4],[-17,9],[-5,13],[8,13]].map(([x,z])=>({x:x*config.coasterWidth/39,z:z*config.coasterDepth/27}));if(track.some((a,index)=>segmentDistance(p,a,track[(index+1)%track.length])<1.8))return true;}
 }
 for(const range of areas.ranges){const p=rangeWorldToLocal(range,{...point,y:point.y||0});if(Math.abs(p.x)<19.6&&p.z>-20&&p.z<15.3&&p.y>-2&&p.y<8)return true;}
 for(const runway of areas.runways)if(Math.abs(point.x-runway.x)<(runway.width||16)/2+3&&Math.abs(point.z-runway.z)<(runway.length||200)/2+5)return true;
 const construction=areas.construction,tower=construction?.tower,cut=construction?.excavation;
 if(tower&&Math.abs(point.x-tower.x)<tower.width/2+2&&Math.abs(point.z-tower.z)<tower.depth/2+2)return true;
 if(cut&&distance(point,cut)<(cut.radius||10)+2)return true;
 // Working earth patches remain off limits even before a bucket changes their
 // height. Use the same rounded cell footprint as the authoritative terrain.
 for(const patch of sim.construction?.earthworks?.patches||areas.earthworks||[])if(point.x>patch.origin.x-2&&point.x<patch.origin.x+patch.columns*patch.cellSize+2&&point.z>patch.origin.z-2&&point.z<patch.origin.z+patch.rows*patch.cellSize+2)return true;
 if(construction)for(const machine of Object.values(sim.actors||{})){const kind=constructionMachineKind(machine),state=machine.construction;if(!kind||machine.active===false||!machine.position||!state)continue;const active=state.working||state.workCycle||state.assist||Math.abs(machine.driving?.speed||0)>.15||state.crewOperator?.expiresAt>now;if(!active)continue;const radius=kind==='crane'?Math.max(6,(state.trolley||4)+10):kind==='excavator'?9:kind==='truck'?8:7;if(distance(point,machine.position)<radius)return true;}
 if(harborWaterAt(environment,point,.6))return true;
 // A resident never takes an ambient stroll through an occupied active gate.
 for(const player of Object.values(sim.players||{})){if(!player.position||player.health<=0||player.replacedByRoom||!Number.isFinite(player.lastSeen)||now-player.lastSeen>=15000)continue;const active=player.skiRace?.status==='racing'||player.vehicleMission?.status==='active';if(active&&distance(point,player.position)<(player.vehicleId?6:3))return true;}
 return false;
}
function lifeState(sim,environment,now){
 const id=environment?.id||sim.residentLife?.worldId||'shared-world',name=environment?.name||sim.residentLife?.worldName||id;
 let life=sim.residentLife;if(!life||life.worldId!==id){const archive=life?.archive||{};life=sim.residentLife={version:1,worldId:id,worldName:name,sequence:0,stats:{practices:0,work:0,conversations:0},events:[],conversations:[],archive:{...archive}};}
 life.archive||={};life.events||=[];life.conversations||=[];life.stats||={practices:0,work:0,conversations:0};life.sequence||=0;life.worldName=name;return life;
}
function remember(info,kind,subjectId,message,now){const item={kind,subjectId:subjectId||null,text:text(message),at:now};info.memory||=[];if(info.memory.some(old=>old.kind===item.kind&&old.subjectId===item.subjectId&&old.text===item.text&&now-old.at<60000))return;info.memory.push(item);info.memory=info.memory.slice(-8);}
function relate(info,id,amount,now){if(!id)return;info.relationships||=[];let relation=info.relationships.find(item=>item.id===id);if(!relation){relation={id,affinity:0,lastAt:now};info.relationships.push(relation);}relation.affinity=residentClamp(relation.affinity+amount,-100,100);relation.lastAt=now;info.relationships=info.relationships.sort((a,b)=>b.lastAt-a.lastAt).slice(0,8);}
function event(life,kind,actorId,targetId,message,now){life.events.push({id:'resident-life-'+ ++life.sequence,kind,actorId,targetId:targetId||null,text:text(message),at:now});life.events=life.events.slice(-12);}
function face(npc,target){npc.resident.lookAt={...target,y:Number.isFinite(target.y)?target.y:npc.position.y+1.5};if(!npc.resident.moving){const yaw=Math.atan2(npc.position.x-target.x,npc.position.z-target.z),angle=Math.atan2(Math.sin(yaw-(npc.rotation?.y||0)),Math.cos(yaw-(npc.rotation?.y||0)));if(Math.abs(angle)>1.05){npc.rotation||={x:0,y:0,z:0};npc.rotation.y=yaw;}}}
function say(npc,message,now,{gesture='talk',duration=3100,target}={}){const info=npc.resident;delete info.speechRecipients;info.speech=text(message);info.speechUntil=now+duration;info.speaking=true;info.gesture=gesture;if(target)face(npc,target);}
function locationFor(npc,environment){const places=localMapLocations(environment);return places[npc.resident.locationIndex]||places.find(place=>place.name===npc.resident.placeName)||{id:'resident-home-'+(npc.resident.locationIndex??0),name:npc.resident.placeName||environment.name||'Local activity'};}
const progressFields=['skills','needs','memory','relationships','practice','work','practicesCompleted','workCompleted','observedIds','lastNeedsAt','socialCooldownUntil','completedCommunityTasks','communityHistory','communityRetryAt','worldActionsCompleted','objectivesCompleted','objectiveHistory','objectiveSequence','nextObjectiveAt'];
export function archiveResidentIntelligence(sim,npc,environment,now,{despawn=true}={}){
 if(!npc?.resident||npc.resident.casino)return;const life=lifeState(sim,environment,now),info=npc.resident;if(!info.personalityId)return;
 const progress={};for(const key of progressFields)if(info[key]!==undefined)progress[key]=structuredClone(info[key]);life.archive[info.personalityId]={scope:info.personalityId,name:info.name,savedAt:now,progress};
 const entries=Object.entries(life.archive).sort((a,b)=>b[1].savedAt-a[1].savedAt);life.archive=Object.fromEntries(entries.slice(0,64));
 if(despawn&&life.objectivePlans)delete life.objectivePlans[npc.id];
 if(despawn)for(const conversation of life.conversations)if(conversation.status==='active'&&conversation.participants.includes(npc.id)){conversation.status='interrupted';conversation.completedAt=now;for(const id of conversation.participants){const other=sim.actors?.[id];if(other?.resident){delete other.resident.conversationId;other.resident.socialCooldownUntil=now+8000;}}}
}
export function ensureResidentIntelligence(sim,npc,environment,now){
 if(!npc?.resident||npc.resident.casino)return npc?.resident||null;const life=lifeState(sim,environment,now),info=npc.resident,place=locationFor(npc,environment);let profile=residentPersonality(environment,place,npc.id,info.name||npc.name?.split(' · ')[0]||'Resident');
 if(info.personalityId!==profile.id&&life.archive[profile.id]?.name)profile=residentPersonality(environment,place,npc.id,life.archive[profile.id].name);
 const changedContext=!!info.context&&info.context.kind!==profile.context.kind;
 if(info.personalityId!==profile.id||info.intelligenceVersion!==1||info.identityVersion!==1||changedContext||info.context?.placeName!==profile.context.placeName||info.context?.worldName!==profile.context.worldName){
  const changedScope=info.personalityId&&info.personalityId!==profile.id;
  if(changedScope){archiveResidentIntelligence(sim,npc,environment,now);for(const key of progressFields)delete info[key];}
  const saved=life.archive[profile.id];if(saved)for(const key of progressFields)if(info[key]===undefined&&saved.progress[key]!==undefined)info[key]=structuredClone(saved.progress[key]);
  if(changedScope||changedContext){delete info.objective;delete info.sharedTask;if(life.objectivePlans)delete life.objectivePlans[npc.id];}
  if(changedContext){archiveResidentIntelligence(sim,npc,environment,now);delete info.practice;delete info.work;}
  info.name=profile.name;info.identityVersion=1;info.identity={...profile.identity};info.form=profile.identity.form;info.ambition=profile.identity.ambition;info.quirk=profile.identity.quirk;info.socialStyle=profile.identity.socialStyle;info.personalityId=profile.id;info.personality=profile.temperament;info.backstory=profile.backstory;info.preferences={...profile.preferences};info.traits={...profile.traits};info.appearance={...profile.appearance};info.context={...profile.context};info.placeName=profile.context.placeName;info.role=profile.role;info.duty=profile.duty;info.uniform=profile.uniform;info.prop=profile.prop;info.color=profile.appearance.outfit;info.skin=profile.appearance.skin;info.workLabel=profile.work;info.practiceLabel=profile.practice;info.practiceSteps=[...profile.practiceSteps];info.tip=profile.tip;info.intelligenceVersion=1;info.goal=null;delete info.conversationId;
  npc.name=info.name+' · '+info.role;if(npc.definition){npc.definition.name=info.name;if(npc.definition.gameplay)npc.definition.gameplay.prompt='Talk / local activities · '+info.name;}
 }
 // Enrich old saves without replacing their chosen colors or learned identity.
 info.appearance={...profile.appearance,...info.appearance};
 info.skills||={...profile.skills};for(const [key,value]of Object.entries(profile.skills))info.skills[key]=residentClamp(info.skills[key]??value);for(const key of Object.keys(info.skills))info.skills[key]=residentClamp(info.skills[key]);const currentSkills=Object.keys(profile.skills),retainedSkills=new Set([...currentSkills,...Object.keys(info.skills).filter(key=>!currentSkills.includes(key)).sort((a,b)=>info.skills[b]-info.skills[a]||a.localeCompare(b)).slice(0,6-currentSkills.length)]);for(const key of Object.keys(info.skills))if(!retainedSkills.has(key))delete info.skills[key];
 const seed=residentHash(profile.id);info.needs||={energy:65+seed%20,social:30+seed%35,purpose:25+(seed>>>4)%35,curiosity:30+(seed>>>8)%35};for(const key of ['energy','social','purpose','curiosity'])info.needs[key]=residentClamp(info.needs[key]??60);
 info.memory=(info.memory||[]).slice(-8);info.relationships=(info.relationships||[]).slice(0,8);info.observedIds=(info.observedIds||[]).slice(-16);info.home||={...npc.position};info.practicesCompleted||=0;info.workCompleted||=0;info.lastNeedsAt??=now;info.nextSocialAt??=now+3500+seed%4500;info.nextAmbientAt??=now+12000+seed%8000;info.nextThinkAt??=now;info.ask='Ask about '+info.preferences.conversation+', my current plans, local activities, or a daily favor.';
 if(!info.memory.length)remember(info,'arrival',environment.id,'Started helping around '+info.context.placeName+'.',now);return info;
}
export function residentIntelligence(info){if(!info)return {};return {name:info.name,form:info.form,ambition:info.ambition,quirk:info.quirk,objective:info.objective||null,sharedTask:info.sharedTask||null,objectivesCompleted:info.objectivesCompleted||0,personality:info.personality||'Local resident',backstory:info.backstory||'',preferences:info.preferences||{},skills:{...info.skills},needs:{...info.needs},activity:info.task||info.role||'helping locally',goal:info.goal||null,mood:info.mood||'settled',lastMemory:info.memory?.at(-1)||null,memory:(info.memory||[]).slice(-8),relationships:(info.relationships||[]).slice(0,8),context:info.context||null,practice:info.practice||null};}
export function observeResidentInteraction(sim,npcId,observation,now){
 const npc=sim.actors?.[npcId];if(!generic(npc))return null;const info=npc.resident,life=lifeState(sim,{id:info.context?.worldId,name:info.context?.worldName},now),key=text(observation.requestId||[observation.kind,observation.actorId,observation.text].join(':'));info.observedIds||=[];if(info.observedIds.some(item=>item.id===key&&now-item.at<3600000))return residentIntelligence(info);info.observedIds.push({id:key,at:now});info.observedIds=info.observedIds.slice(-16);
 if(observation.kind==='player-conversation'){
  for(const conversation of life.conversations)if(conversation.status==='active'&&conversation.participants.includes(npc.id)){
   conversation.status='interrupted';conversation.completedAt=now;
   for(const id of conversation.participants){const other=sim.actors?.[id];if(other?.resident){delete other.resident.conversationId;other.resident.interaction=null;other.resident.socialCooldownUntil=now+12000;}}
  }
  releaseVisitor(npc,Object.values(sim.players||{}),now);info.pauseUntil=now+5000;info.moving=false;
 }
 remember(info,observation.kind||'conversation',observation.actorId,observation.text||'Shared a local conversation.',now);relate(info,observation.actorId,observation.kind==='task-complete'?4:1,now);if(info.needs)info.needs.social=residentClamp(info.needs.social+4);const skill=Object.hasOwn(info.skills||{},observation.skill)?observation.skill:'social';if(info.skills)residentSkillGain(info.skills,skill,observation.kind==='task-complete'?.8:.25);
 if(['task-complete','activity-complete','game-complete'].includes(observation.kind)){const player=sim.players?.[observation.actorId];say(npc,'Well done, '+(player?.username||'friend')+'. '+(info.tip||'Take a moment to think about what went well.'),now,{gesture:'cheer',duration:4400,target:player?.position});event(life,'shared-activity',npc.id,observation.actorId,(player?.username||'A visitor')+' shared a completed local activity with '+info.name+'.',now);}
 return residentIntelligence(info);
}
function safePoint(environment,npc,point,collision,sim,objects,{clearPeople=false}={}){
 if(residentActivityRestricted(environment,point,sim))return null;const floor=collision?.groundAt?collision.groundAt(environment,point,{actors:sim.actors,objects,maxRise:.4}):point;if(!floor||Math.abs((floor.y||0)-(point.y||0))>.4||residentActivityRestricted(environment,floor,sim))return null;
 if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,floor,.42,{actors:sim.actors,objects}))return null;
 if(clearPeople&&Object.values(sim.actors||{}).some(other=>other!==npc&&other.active!==false&&other.position&&sameFloor(other.position,floor)&&distance(other.position,floor)<(other.resident ? .9 : other.driving||other.flight||other.boating?4:0)))return null;
 return {x:floor.x??point.x,y:floor.y??point.y??0,z:floor.z??point.z};
}
function publicHome(environment,npc,collision,sim,objects){
 if(safePoint(environment,npc,npc.position,collision,sim,objects))return true;const areas=restrictions(environment),source=npc.position,candidates=[];
 if(areas.basketball){candidates.push({...source,x:(source.x<0?-1:1)*9.2},{...source,z:(source.z<0?-1:1)*16.2});}
 if(areas.hockey)candidates.push({...source,z:(source.z<0?-1:1)*15.2});
 for(const range of areas.ranges){const p=rangeWorldToLocal(range,source);candidates.push(rangeLocalToWorld(range,{...p,z:16.3}));}
 for(const runway of areas.runways)candidates.push({...source,x:runway.x+(source.x<runway.x?-1:1)*((runway.width||16)/2+5)});
 for(const radius of [3,6,10,16,24])for(let i=0;i<12;i++){const angle=i*Math.PI/6;candidates.push({x:source.x+Math.cos(angle)*radius,y:source.y,z:source.z+Math.sin(angle)*radius});}
 for(const candidate of candidates.sort((a,b)=>distance(a,source)-distance(b,source))){const point=safePoint(environment,npc,candidate,collision,sim,objects,{clearPeople:true});if(!point)continue;npc.position={...point};npc.resident.home={...point};npc.resident.goal=null;npc.resident.safetyRelocated=true;return true;}
 npc.resident.activitySuspended=true;npc.resident.goal=null;return false;
}
function clearSegment(environment,npc,from,to,collision,sim,objects,progress={},budget={remaining:Infinity}){
 const length=distance(from,to),count=Math.max(1,Math.ceil(length/.65));progress.index??=1;progress.previous??={...from};
 for(;progress.index<=count;progress.index++){
  if(budget.remaining<=0)return;budget.remaining--;
  const t=progress.index/count,point={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t},floor=safePoint(environment,npc,point,collision,sim,objects);
  if(!floor)return false;const next=collision?.resolve?collision.resolve(environment,progress.previous,floor,sim.actors,objects):floor;if(!next||distance(next,floor)>.15)return false;progress.previous=next;
 }return true;
}
function chooseTarget(sim,npc,environment,kind,now,collision,objects){
 const info=npc.resident,home=info.home,seed=residentHash(info.personalityId+':'+kind+':'+(info.goalSequence||0)),candidates=[];
 if(kind==='social'){const friend=Object.values(sim.actors).filter(other=>generic(other)&&other!==npc&&sameFloor(other.position,npc.position)&&distance(other.position,npc.position)<8&&gap(other.position,npc.position)<9).sort((a,b)=>distance(a.position,npc.position)-distance(b.position,npc.position))[0];if(friend){const dx=friend.position.x-npc.position.x,dz=friend.position.z-npc.position.z,span=Math.hypot(dx,dz);if(span>2.4){const step=Math.min(span-2.2,2);candidates.push({x:npc.position.x+dx/span*step,y:home.y,z:npc.position.z+dz/span*step});}else candidates.push({...npc.position});}}
 for(let i=0;i<10;i++){const angle=(seed%6283)/1000+i*Math.PI*.4,radius=kind==='rest'?.7+((seed+i)%3)*.4:kind==='practice'?1.2+((seed+i)%3)*.4:1.8+((seed+i)%3)*.6;candidates.push({x:home.x+Math.cos(angle)*radius,y:home.y,z:home.z+Math.sin(angle)*radius});}
 candidates.push({...home});for(const point of candidates){if(distance(home,point)>4.1)continue;const target=safePoint(environment,npc,point,collision,sim,objects,{clearPeople:true});if(target&&clearSegment(environment,npc,npc.position,target,collision,sim,objects))return target;}return null;
}
function chooseGoal(sim,npc,environment,now,collision,objects){const info=npc.resident;info.goalSequence=(info.goalSequence||0)+1;const ranked=residentGoalUtilities(info);let goal=ranked[0];if(goal.kind===info.lastGoalKind&&now-(info.lastGoalAt||0)<12000)goal=ranked[1]||goal;const target=chooseTarget(sim,npc,environment,goal.kind,now,collision,objects);if(!target){info.goal={kind:'rest',reason:'Waiting for a clear public floor nearby',status:'blocked',startedAt:now};info.nextThinkAt=now+3500;return;}
 info.goal={kind:goal.kind,reason:goal.kind==='work'?'Helping with useful work at '+info.placeName:goal.kind==='practice'?'Improving '+info.context.primarySkill+' with a small local exercise':goal.kind==='social'?'Finding company to talk about '+info.preferences.conversation:'Taking a quiet break before helping again',target,status:'planned',startedAt:now};info.lastGoalKind=goal.kind;info.lastGoalAt=now;info.nextThinkAt=now+20000;info.navigation={attempts:0,blockedAt:0};}
function move(sim,npc,environment,target,now,dt,collision,objects,cast,players){
 const info=npc.resident;if(distance(npc.position,target)<.2)return true;const span=distance(npc.position,target),amount=Math.min(span,Math.max(0,Math.min(.25,dt))*.87);if(!amount)return false;const point={x:npc.position.x+(target.x-npc.position.x)/span*amount,y:npc.position.y,z:npc.position.z+(target.z-npc.position.z)/span*amount};
 // A visitor can stop inside a resident's personal space during a chat. Let
 // the resident walk out of that existing overlap once the reply finishes.
 const blocksStep=(position,radius)=>{
  if(!position||!sameFloor(position,point)||distance(position,point)>=radius)return false;
  const outward=(point.x-npc.position.x)*(npc.position.x-position.x)+(point.z-npc.position.z)*(npc.position.z-position.z)>=0;
  return !outward||distance(position,point)<=distance(position,npc.position)+1e-6;
 };
 const peopleBlocked=players.some(player=>blocksStep(player.position,player.vehicleId?4:1.05))||cast.some(other=>other!==npc&&blocksStep(other.position,.85)),floor=peopleBlocked?null:safePoint(environment,npc,point,collision,sim,objects),resolved=floor&&(collision?.resolve?collision.resolve(environment,npc.position,floor,sim.actors,objects):floor);
 if(!resolved||distance(resolved,point)>.15||distance(resolved,npc.position)<amount*.1){info.navigation||={attempts:0,blockedAt:0};info.navigation.blockedAt||=now;if(now-info.navigation.blockedAt>1800){info.navigation.attempts++;const detour=['objective','visitor'].includes(info.goal.kind)||info.goal.familyTaskId?null:chooseTarget(sim,npc,environment,info.goal.kind,now+info.navigation.attempts*173,collision,objects);if(detour)info.goal.target=detour;info.navigation.blockedAt=now;if(info.navigation.attempts>=3){info.goal.status='blocked';info.nextThinkAt=now+1500;}}return false;}
 info.navigation||={attempts:0,blockedAt:0};info.navigation.blockedAt=0;npc.rotation||={x:0,y:0,z:0};npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position={x:resolved.x,y:floor.y,z:resolved.z};info.moving=true;info.phase='walking';info.gesture='walk';info.goal.status='travelling';info.task='walking to a clear spot near '+info.placeName;face(npc,{...target,y:npc.position.y+1.5});return distance(npc.position,target)<.2;
}
function beginPractice(info,now){const attempt=(info.practice?.attempt||0)+1;info.practice={id:'practice-'+residentHash(info.personalityId)+':'+attempt,kind:info.context.kind,skill:info.context.primarySkill,phase:'preparing',step:0,attempt,nextAt:now+2200,decision:info.practiceSteps[0],practiceOnly:true};}
function stepGoal(sim,npc,environment,now,dt,collision,objects,cast,players){
 const info=npc.resident,goal=info.goal;if(!goal||goal.status==='blocked')return;if(!move(sim,npc,environment,goal.target,now,dt,collision,objects,cast,players))return;goal.status='active';goal.arrivedAt??=now;info.moving=false;
 if(goal.familyTaskId&&info.sharedTask){info.phase='working';info.gesture=info.ageGroup==='child'?'play':'work';return;}
 if(goal.kind==='practice'){info.phase='practising';info.gesture=info.prop==='ball'?'play':info.prop==='music'?'play':'work';info.task='practising '+info.practiceLabel;if(!goal.practiceId){beginPractice(info,now);goal.practiceId=info.practice.id;}
  const practice=info.practice;if(practice.phase!=='complete'&&now>=practice.nextAt){practice.step++;practice.nextAt=now+2400;if(practice.step<3){practice.phase=practice.step===1?'trying':'reviewing';practice.decision=info.practiceSteps[practice.step];info.gesture=practice.step===2?'thought':info.prop==='ball'||info.prop==='music'?'play':'work';}
   else{practice.phase='complete';practice.completedAt=now;practice.quality=Math.round(residentClamp(info.skills[practice.skill]*.55+residentHash(practice.id+':quality')%46));practice.result=practice.quality>=65?'A controlled sequence; I kept the timing and checks clear.':'A useful attempt; I found one detail to improve next time.';residentSkillGain(info.skills,practice.skill,.7);residentSkillGain(info.skills,'observation',.18);info.practicesCompleted++;info.needs.curiosity=residentClamp(info.needs.curiosity+38);info.needs.energy=residentClamp(info.needs.energy-4);sim.residentLife.stats.practices++;remember(info,'practice',practice.skill,'Practised '+info.practiceLabel+'. '+practice.result,now);event(sim.residentLife,'practice',npc.id,null,info.name+' completed '+info.practiceLabel+'.',now);info.gesture=practice.quality>=65?'cheer':'thought';}
  }if(practice.phase==='complete'&&now-practice.completedAt>2300)info.goal=null;
 }else if(goal.kind==='work'){info.phase='working';info.gesture='work';info.task=info.workLabel;info.work||={cycle:0};if(!goal.workCycle){info.work.cycle++;info.work.phase='checking';info.work.progress=0;goal.workCycle=info.work.cycle;}info.work.progress=Math.min(1,(now-goal.arrivedAt)/6500);if(info.work.progress>=1){info.work.phase='complete';info.work.completedAt=now;info.work.result='Local supplies and public activity information checked.';residentSkillGain(info.skills,info.context.primarySkill,.25);residentSkillGain(info.skills,'hospitality',.35);info.workCompleted++;info.needs.purpose=residentClamp(info.needs.purpose+38);info.needs.energy=residentClamp(info.needs.energy-3);sim.residentLife.stats.work++;remember(info,'work',info.context.placeId,'Finished '+info.workLabel+'.',now);event(sim.residentLife,'work',npc.id,null,info.name+' finished '+info.workLabel+'.',now);info.goal=null;}}
 else if(goal.kind==='rest'){info.phase='relaxing';info.gesture='relax';info.task='taking a quiet break near '+info.placeName;info.needs.energy=residentClamp(info.needs.energy+Math.max(0,Math.min(.25,dt))*2.2);if(now-goal.arrivedAt>12000){remember(info,'rest',info.context.placeId,'Took a short break near '+info.placeName+'.',now);info.goal=null;}}
 else{info.phase='socialising';info.gesture='listen';info.task='looking for a friendly conversation about '+info.preferences.conversation;if(now-goal.arrivedAt>11000){info.needs.social=residentClamp(info.needs.social+3);info.goal=null;}}
 if(!info.goal)info.nextThinkAt=now+450;
}
const visitorBusy=(player,now)=>player.vehicleId||player.skiRace?.status==='racing'||player.vehicleMission?.status==='active'||player.npcConversation?.status==='active'&&now-(player.residentReplyAt||0)<12000;
function canWelcome(info,player,npc,now){
 return !visitorBusy(player,now)&&!info.sharedTask&&info.objective?.status!=='active'&&!info.conversationId&&!info.speaking&&now>=(player.residentGreetAt??-Infinity)+45000&&(!player.residentApproach||player.residentApproach.expiresAt<=now||player.residentApproach.residentId===npc.id);
}
function releaseVisitor(npc,players,now){
 const info=npc.resident,approach=info.visitorApproach;
 if(approach){const player=players.find(player=>player.actorId===approach.playerId);if(player?.residentApproach?.residentId===npc.id)delete player.residentApproach;}
 if(info.goal?.kind==='visitor')info.goal=null;delete info.visitorApproach;info.nextVisitorAt=now+8000;info.nextThinkAt=now+450;
}
function welcomeVisitor(sim,npc,player,environment,now,collision,objects){
 const info=npc.resident,known=info.relationships.some(relation=>relation.id===player.actorId);
 if(now>=(player.residentInviteCooldownUntil||0)&&player.residentVisit?.status!=='active'&&!(player.residentInvitation?.status==='offered'&&player.residentInvitation.expiresAt>now)){
  const budget={remaining:24};
  const invitation=residentActivityInvitation(environment,npc,player,now,{resolveDestination:place=>{
   if(!sameFloor(place,npc.position)||distance(place,npc.position)>24||budget.remaining<=0)return null;
   // Prefer the actual landmark, then a clear public approach beside it.
   for(const offset of [[0,0],[2.5,0],[-2.5,0],[0,2.5],[0,-2.5]]){
    if(budget.remaining<=0)return null;budget.remaining--;
    const point=safePoint(environment,npc,{x:place.x+offset[0],y:place.y||0,z:place.z+offset[1]},collision,sim,objects);
    if(point&&clearSegment(environment,npc,npc.position,point,collision,sim,objects,{},budget))return point;
   }return null;
  }});
  if(invitation)player.residentInvitation=invitation;
 }
 const invitation=player.residentInvitation?.residentId===npc.id&&player.residentInvitation.status==='offered'&&player.residentInvitation.expiresAt>now?player.residentInvitation:null;
 const greeting=(known?'Good to see you again, ':'Hello ')+player.username+'. '+(invitation?'Would you like to '+invitation.title.toLowerCase()+'? I can mark the public approach.':'I can help with '+info.context.label+' and local directions.');
 player.residentGreetAt=now;say(npc,greeting,now,{gesture:'greet',duration:5000,target:{...player.position,y:player.position.y+1.5}});
 info.speechRecipients=[player.actorId];info.interaction={kind:'visitor-greeting',playerId:player.actorId,phase:'speaking',at:now,id:npc.id+':welcome:'+player.actorId+':'+now};
 relate(info,player.actorId,1,now);remember(info,'greeting',player.actorId,(known?'Recognized ':'Met ')+player.username+' near '+info.placeName+'.',now);
 player.residentNearby={id:npc.id,name:info.name,placeName:info.placeName,ask:invitation?.description||info.ask,at:now,expiresAt:now+20000};
 info.pauseUntil=now+5000;releaseVisitor(npc,Object.values(sim.players),now);
}
function stepVisitorApproach(sim,npc,environment,now,dt,collision,objects,cast,players,budget){
 const info=npc.resident;let approach=info.visitorApproach;
 if(approach){
  const player=players.find(player=>player.actorId===approach.playerId);
  if(!player||!canWelcome(info,player,npc,now)||now>approach.expiresAt||!sameFloor(player.position,npc.position)||gap(player.position,npc.position)>12||info.goal?.status==='blocked'){releaseVisitor(npc,Object.values(sim.players),now);return false;}
  if(distance(player.position,approach.playerPosition)>1){releaseVisitor(npc,Object.values(sim.players),now);return false;}
  if(approach.planning){
   const clear=clearSegment(environment,npc,approach.origin,approach.target,collision,sim,objects,approach.route,budget);
   if(clear===undefined)return true;
   if(!clear){releaseVisitor(npc,Object.values(sim.players),now);return false;}
   approach.planning=false;info.goal={kind:'visitor',reason:'Welcoming '+player.username,target:{...approach.target},status:'planned',startedAt:now};info.navigation={attempts:0,blockedAt:0};
  }
  if(move(sim,npc,environment,approach.target,now,dt,collision,objects,cast,players))welcomeVisitor(sim,npc,player,environment,now,collision,objects);
  else info.task='walking over to welcome '+player.username;
  return true;
 }
 if(now<(info.nextVisitorAt||0)||info.sharedTask||info.objective?.status==='active'||info.speaking||info.needs.energy<30||info.practice&&['preparing','trying','reviewing'].includes(info.practice.phase))return false;
 info.nextVisitorAt=now+8000;
 const player=players.filter(player=>canWelcome(info,player,npc,now)&&sameFloor(player.position,npc.position)&&gap(player.position,npc.position)>3.2&&gap(player.position,npc.position)<10).sort((a,b)=>gap(a.position,npc.position)-gap(b.position,npc.position))[0];
 if(!player||budget.remaining<=0)return false;
 const span=distance(npc.position,player.position),target={x:player.position.x+(npc.position.x-player.position.x)/span*2.4,y:npc.position.y,z:player.position.z+(npc.position.z-player.position.z)/span*2.4};
 if(distance(target,info.home)>9)return false;
 budget.remaining--;const floor=safePoint(environment,npc,target,collision,sim,objects,{clearPeople:true});if(!floor)return false;
 approach=info.visitorApproach={playerId:player.actorId,origin:{...npc.position},playerPosition:{...player.position},target:floor,planning:true,route:{},startedAt:now,expiresAt:now+18000};
 player.residentApproach={residentId:npc.id,expiresAt:approach.expiresAt};
 if(sim.residentLife.objectivePlans)delete sim.residentLife.objectivePlans[npc.id];
 return true;
}
function trimConversations(life,now){const active=life.conversations.filter(c=>c.status==='active').slice(0,3),closed=life.conversations.filter(c=>c.status!=='active'&&now-(c.completedAt||0)<180000).slice(-(6-active.length));life.conversations=[...closed,...active];}
const experienceKinds=new Set(['practice','work','objective','community-task','world-action']);
function recentExperience(info){return [...(info.memory||[])].reverse().find(item=>experienceKinds.has(item.kind)&&item.text);}
function startConversation(sim,a,b,now){
 const life=sim.residentLife,experience=recentExperience(a.resident),topic=experience?'recent '+(experience.kind==='community-task'?'teamwork':experience.kind):a.resident.preferences.conversation,pair=[a.id,b.id].sort().join('|');
 if(life.conversations.filter(c=>c.status==='active').length>=3||life.conversations.some(c=>c.pair===pair&&c.topic===topic&&now-c.startedAt<60000))return false;
 const experiences=Object.fromEntries([a,b].map(npc=>[npc.id,recentExperience(npc.resident)]).filter(([,item])=>item).map(([id,item])=>[id,{kind:item.kind,text:text(item.text),at:item.at}]));
 const c={id:'resident-conversation-'+ ++life.sequence,participants:[a.id,b.id],pair,topic,experiences,turn:0,status:'active',startedAt:now,nextAt:now,lines:[]};
 life.conversations.push(c);trimConversations(life,now);a.resident.conversationId=b.resident.conversationId=c.id;a.resident.socialCooldownUntil=b.resident.socialCooldownUntil=now+25000;return true;
}
function conversationText(speaker,listener,conversation){
 const info=speaker.resident,other=listener.resident,experience=conversation.experiences?.[speaker.id];
 if(conversation.turn===0)return experience?experience.text+' What have you been working on, '+other.name.split(' ')[0]+'?':'I have been thinking about '+info.preferences.conversation+'. How is your day going, '+other.name.split(' ')[0]+'?';
 if(conversation.turn===1)return experience?'Thanks for sharing. '+experience.text:'I am '+info.workLabel+'. '+info.tip;
 return 'That is useful, '+other.name.split(' ')[0]+'. '+(other.tip||'Let us compare what we discover next time.');
}
const unavailable=npc=>npc.aiTask?.status==='active'||npc.resident.machineWork?.status==='active'||npc.resident.sharedTask||npc.resident.objective?.status==='active';
function stepConversations(sim,environment,now,{collision,objects}){const life=sim.residentLife;for(const c of life.conversations){if(c.status!=='active'||now<c.nextAt)continue;const [a,b]=c.participants.map(id=>sim.actors[id]);if(!generic(a)||!generic(b)||unavailable(a)||unavailable(b)||!sameFloor(a.position,b.position)||gap(a.position,b.position)>5||!clearSegment(environment,a,a.position,b.position,collision,sim,objects)){c.status='interrupted';c.completedAt=now;for(const npc of [a,b].filter(Boolean))if(npc.resident){delete npc.resident.conversationId;npc.resident.socialCooldownUntil=now+8000;}continue;}if(a.resident.speechUntil>now||b.resident.speechUntil>now){c.nextAt=Math.max(a.resident.speechUntil||0,b.resident.speechUntil||0)+250;continue;}const speaker=c.turn%2===0?a:b,listener=speaker===a?b:a,message=text(conversationText(speaker,listener,c));c.lines.push({speakerId:speaker.id,text:message,at:now});if(c.turn<2&&c.experiences?.[speaker.id]){remember(listener.resident,'shared-experience',speaker.id,speaker.resident.name+' shared: '+c.experiences[speaker.id].text,now);residentSkillGain(listener.resident.skills,'observation',.1);}c.lines=c.lines.slice(-3);say(speaker,message,now,{target:{...listener.position,y:listener.position.y+1.5}});listener.resident.gesture='listen';face(listener,{...speaker.position,y:speaker.position.y+1.5});speaker.resident.interaction={kind:'conversation',partnerId:listener.id,phase:'speaking'};listener.resident.interaction={kind:'conversation',partnerId:speaker.id,phase:'listening'};c.turn++;c.nextAt=now+3700;if(c.turn>=3){c.status='complete';c.completedAt=now;life.stats.conversations++;for(const [npc,other]of [[a,b],[b,a]]){delete npc.resident.conversationId;npc.resident.socialCooldownUntil=now+25000+Math.round(npc.resident.traits.patience*10000);npc.resident.nextSocialAt=npc.resident.socialCooldownUntil;npc.resident.needs.social=residentClamp(npc.resident.needs.social+28);relate(npc.resident,other.id,2,now);residentSkillGain(npc.resident.skills,'social',.4);remember(npc.resident,'conversation',other.id,'Talked with '+other.resident.name+' about '+c.topic+'.',now);}event(life,'conversation',a.id,b.id,a.resident.name+' and '+b.resident.name+' talked about '+c.topic+'.',now);}}
 trimConversations(life,now);
}
export function residentLifeView(sim){const life=sim.residentLife;if(!life)return null;return {version:1,worldId:life.worldId,worldName:life.worldName,stats:{...life.stats},objectives:(life.objectives||[]).slice(-12).map(q=>({...q})),conversations:life.conversations.slice(-6).map(c=>({id:c.id,participants:[...c.participants],topic:c.topic,turn:c.turn,status:c.status,startedAt:c.startedAt,nextAt:c.nextAt,lines:c.lines.slice(-3).map(line=>({...line}))})),events:life.events.slice(-12).map(item=>({...item}))};}
export function stepResidentLife(sim,environment,now,dt,{collision,objects={}}={}){
 if(environment?.game==='casino'||environment?.id==='muzikaz-casino'||environment?.builderScene?.layout==='casino')return;sim.actors||={};sim.players||={};const life=lifeState(sim,environment,now),cast=Object.values(sim.actors).filter(generic);for(const npc of cast)ensureResidentIntelligence(sim,npc,environment,now);if(life.updatedAt===now)return;life.updatedAt=now;
 const players=Object.values(sim.players).filter(player=>player.health>0&&!player.replacedByRoom&&player.position&&Number.isFinite(player.position.x)&&Number.isFinite(player.position.z)&&now-player.lastSeen<15000);stepConversations(sim,environment,now,{collision,objects});const socialBudget={remaining:32};
 // Share a fixed amount of route validation across the full resident cast.
 // Movement, greetings and live player input continue between planning slices.
 const planningStart=(life.planningCursor||0)%Math.max(1,cast.length),planningShare=Math.floor(64/Math.max(1,cast.length)),planningExtra=64%Math.max(1,cast.length);
 const planningAllowances=new Map(cast.map((npc,index)=>[npc.id,planningShare+((index-planningStart+cast.length)%cast.length<planningExtra?1:0)]));
 life.planningCursor=(planningStart+Math.max(1,planningExtra))%Math.max(1,cast.length);
 const planningRevision=JSON.stringify(Object.values(objects).map(object=>[object.id,object.revision,object.deleted,object.open,object.position,object.rotation,object.scale]));
 if(life.objectivePlans)for(const id of Object.keys(life.objectivePlans))if(!sim.actors[id]?.resident||sim.actors[id].active===false)delete life.objectivePlans[id];
 for(const npc of cast){const info=npc.resident;if(info.conversationId&&!life.conversations.some(c=>c.id===info.conversationId&&c.status==='active')){delete info.conversationId;info.interaction=null;}info.speaking=now<info.speechUntil;if(!info.speaking){info.speech='';if(info.interaction?.kind==='visitor-greeting'||info.interaction?.kind==='conversation'&&!info.conversationId)info.interaction=null;}const elapsed=Math.max(0,Math.min(2,(now-info.lastNeedsAt)/1000));info.lastNeedsAt=now;info.needs.energy=residentClamp(info.needs.energy-elapsed*(info.moving?.07:.035));info.needs.social=residentClamp(info.needs.social-elapsed*.085);info.needs.purpose=residentClamp(info.needs.purpose-elapsed*.07);info.needs.curiosity=residentClamp(info.needs.curiosity-elapsed*.065);info.mood=info.needs.energy<25?'ready for a rest':info.needs.social<30?'seeking company':info.needs.curiosity<30?'curious':'settled';info.moving=false;
  if(npc.aiTask?.status==='active'||info.machineWork?.status==='active'||info.bunkerResponse?.status==='active'){info.activitySuspended=false;continue;}
  if(!publicHome(environment,npc,collision,sim,objects))continue;info.activitySuspended=false;
  const nearby=players.filter(player=>sameFloor(player.position,npc.position)&&gap(player.position,npc.position)<3.2).sort((a,b)=>gap(a.position,npc.position)-gap(b.position,npc.position))[0];
  if(nearby&&canWelcome(info,nearby,npc,now)&&!info.visitorApproach&&socialBudget.remaining>0){const progress={};if(clearSegment(environment,npc,npc.position,nearby.position,collision,sim,objects,progress,socialBudget))welcomeVisitor(sim,npc,nearby,environment,now,collision,objects);}
  if(nearby&&nearby.health<35&&now>(info.reactionAt||0)+30000&&!info.speaking){say(npc,'You look ready for a break. Find a clear public spot and take care of yourself before the next activity.',now,{target:nearby.position});info.reactionAt=now;}
  if(info.conversationId||now<(info.pauseUntil||0))continue;
  if(stepVisitorApproach(sim,npc,environment,now,dt,collision,objects,cast,players,socialBudget))continue;
  const navigation={safePoint:point=>safePoint(environment,npc,point,collision,sim,objects),clearSegment:(from,to,progress,budget)=>clearSegment(environment,npc,from,to,collision,sim,objects,progress,budget),budget:{remaining:planningAllowances.get(npc.id)},revision:planningRevision};
  if(info.sharedTask){if(life.objectivePlans)delete life.objectivePlans[npc.id];}else planResidentObjective(sim,npc,environment,now,navigation);
  if(life.objectivePlans?.[npc.id]?.phase==='connect')continue;
  if(stepResidentObjective(sim,npc,environment,now,{...navigation,move:target=>move(sim,npc,environment,target,now,dt,collision,objects,cast,players)}))continue;
  if(!info.sharedTask&&((!info.goal&&now>=(info.nextThinkAt||0))||info.goal?.status==='blocked'&&now>=info.nextThinkAt))chooseGoal(sim,npc,environment,now,collision,objects);stepGoal(sim,npc,environment,now,dt,collision,objects,cast,players);
  if(!info.sharedTask&&now>=(info.nextSocialAt||0)&&now>=(info.socialCooldownUntil||0)&&!info.speaking&&!info.moving&&!(info.practice?.phase==='trying'||info.practice?.phase==='reviewing')&&!(info.goal?.kind==='practice'&&info.practice?.phase==='preparing')){const friend=cast.filter(other=>other!==npc&&!unavailable(other)&&!other.resident.conversationId&&!other.resident.moving&&sameFloor(other.position,npc.position)&&other.resident.speechUntil<=now&&now>=(other.resident.socialCooldownUntil||0)&&!other.resident.visitorApproach&&gap(other.position,npc.position)<4.5).sort((a,b)=>gap(a.position,npc.position)-gap(b.position,npc.position)||a.id.localeCompare(b.id))[0];if(friend&&socialBudget.remaining>0&&clearSegment(environment,npc,npc.position,friend.position,collision,sim,objects,{},socialBudget))startConversation(sim,npc,friend,now);info.nextSocialAt=now+9000;}
  if(!info.sharedTask&&now>=info.nextAmbientAt&&!info.speaking&&!info.conversationId&&!info.moving){say(npc,info.tip,now,{gesture:'explain'});info.nextAmbientAt=now+32000+residentHash(npc.id)%8000;}
 }
 if(now>=(life.nextArchiveAt||0)){for(const npc of cast)archiveResidentIntelligence(sim,npc,environment,now,{despawn:false});life.nextArchiveAt=now+60000;}
}
