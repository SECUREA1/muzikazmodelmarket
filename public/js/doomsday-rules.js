import {doomsdayForEnvironment} from './doomsday-config.js';

export const DOOMSDAY_TIMING=Object.freeze({initialMinMs:15000,initialMaxMs:90000,repeatMinMs:180000,repeatMaxMs:1200000,warningMs:18000,detonationMs:7000,falloutSettleMs:5000,clearingMs:8000});
export const DOOMSDAY_PHASES=Object.freeze({
 idle:{label:'Radio standby',message:'Cole is monitoring the emergency channel. Keep exploring; warnings arrive sporadically.'},
 warning:{label:'Nuclear warning',message:'This is Cole on the emergency radio. Incoming strikes. Get to the continuity shelter now.'},
 detonation:{label:'Distant detonations',message:'Cole to all units. Impacts confirmed on the horizon. Stay sheltered. Fallout is approaching.'},
 fallout:{label:'Fallout response',message:'Cole here. Fallout has begun. Follow the supply marker and recover the sealed relief crates.'},
 recovery:{label:'Recovery',message:'This is Cole. Fallout is dispersing. Reach the recovery relay and restore our emergency communications.'},
 clearing:{label:'Skies clearing',message:'Cole to all responders. The warning is ending. The clouds and emergency lights are clearing.'},
 'all-clear':{label:'All clear',message:'Cole to all survivors. Fallout has dispersed. Keep exploring; all routes remain open.'}
});
const copy=value=>JSON.parse(JSON.stringify(value));
const reject=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const areaKeys=['minX','maxX','minZ','maxZ'];
const finiteArea=area=>area&&areaKeys.every(key=>Number.isFinite(area[key]))&&area.minX<=area.maxX&&area.minZ<=area.maxZ;
const running=state=>state&&['warning','detonation','fallout','recovery','clearing'].includes(state.phase);
const present=(player,now)=>player&&!player.basketballAI&&!player.replacedByRoom&&(!Number.isFinite(player.lastSeen)||now-player.lastSeen<15000);
const live=(player,now)=>present(player,now)&&player.health>0;
// Authored shelter footprints cover the whole building and its entrance. The
// same check is used by the room and the viewer's personal arrival guidance.
export function isDoomsdayObjectiveNearby(position,objective){
 if(!finitePoint(position)||!finitePoint(objective?.position)||Math.abs(position.y-objective.position.y)>3)return false;
 const area=objective.id==='shelter'&&objective.arrivalArea;
 return finiteArea(area)?position.x>=area.minX&&position.x<=area.maxX&&position.z>=area.minZ&&position.z<=area.maxZ:Math.hypot(position.x-objective.position.x,position.z-objective.position.z)<=4.5;
}
const nearby=(player,objective)=>isDoomsdayObjectiveNearby(player.position,objective);
const eligible=(objective,state,now)=>objective.id==='shelter'?['warning','detonation','fallout','recovery'].includes(state.phase):objective.phase===state.phase&&(objective.id!=='supplies'||now>=state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs);
const randomDelay=(random,min,max)=>{const value=Number(random());return Math.round(min+Math.max(0,Math.min(1,Number.isFinite(value)?value:.5))*(max-min));};
function configuredObjectives(environment,resolvePoint){
 return doomsdayForEnvironment(environment).objectives.map(objective=>{
  const authored={...objective.position},resolved=resolvePoint?.(authored,objective)||authored;
  return {...objective,optional:objective.id==='shelter',position:finitePoint(resolved)?{x:resolved.x,y:resolved.y,z:resolved.z}:authored,completed:false,completedBy:null,completedAt:null};
 });
}
export function ensureDoomsday(sim,environment){
 const mapId=environment?.id||'local',saved=sim.doomsday;
 if(saved?.version===2&&saved.mapId===mapId&&Array.isArray(saved.objectives)&&['warning','detonation','fallout','recovery'].includes(saved.phase)){
  // Keep the original automatic experience active when upgrading e16f94ed
  // rooms. Its quest-led phases and impact deadlines already match this one.
  Object.assign(saved,{version:4,automatic:true,cycle:1,scheduledAt:null,nextEventAt:null,recoveryAt:saved.phase==='recovery'?saved.phaseStartedAt:null,clearingAt:null,clearAt:null,awaitingArrival:false,revision:(saved.revision||0)+1});
 }
 if(saved?.version===3&&saved.mapId===mapId&&Array.isArray(saved.objectives)){
  // Preserve an in-progress response when replacing the old short timer.
  // A timer-only recovery/clearing has not completed the missing quest.
  const supplies=saved.objectives.find(item=>item.id==='supplies'),relay=saved.objectives.find(item=>item.id==='recovery');
  if(['recovery','clearing'].includes(saved.phase)&&!supplies?.completed){saved.phase='fallout';saved.phaseStartedAt=saved.falloutAt;}
  else if(saved.phase==='clearing'&&!relay?.completed){saved.phase='recovery';saved.phaseStartedAt=supplies?.completedAt??saved.phaseStartedAt;}
  if(running(saved)){
   saved.nextEventAt=null;saved.recoveryAt=['recovery','clearing'].includes(saved.phase)?(supplies?.completedAt??saved.phaseStartedAt):null;
   if(saved.phase!=='clearing')saved.clearingAt=saved.clearAt=null;
  }else if(saved.phase==='all-clear'&&Number.isFinite(saved.nextEventAt)){
   const delay=Math.max(DOOMSDAY_TIMING.repeatMinMs,Math.min(DOOMSDAY_TIMING.repeatMaxMs,saved.nextEventAt-saved.startedAt));
   saved.scheduledAt=saved.clearAt??saved.phaseStartedAt;saved.nextEventAt=saved.scheduledAt+delay;
  }
  saved.version=4;saved.revision++;
 }
 if(sim.doomsday?.version!==4||sim.doomsday.mapId!==mapId)sim.doomsday={version:4,automatic:true,id:null,mapId,phase:'idle',revision:0,cycle:0,startedAt:null,phaseStartedAt:null,updatedAt:null,serverTime:null,scheduledAt:null,nextEventAt:null,detonationAt:null,falloutAt:null,recoveryAt:null,clearingAt:null,clearAt:null,awaitingArrival:true,objectives:configuredObjectives(environment)};
 // Existing live rooms adopt the new footprint without restarting their
 // warning, losing completed quests, or changing the next event's schedule.
 const shelter=sim.doomsday.objectives.find(objective=>objective.id==='shelter'),authored=environment?.doomsday?.objectives?.find(objective=>objective.id==='shelter')?.arrivalArea;
 const area=finiteArea(authored)?authored:undefined;
 if(shelter&&!areaKeys.every(key=>shelter.arrivalArea?.[key]===area?.[key])){if(area)shelter.arrivalArea=Object.fromEntries(areaKeys.map(key=>[key,area[key]]));else delete shelter.arrivalArea;sim.doomsday.revision++;}
 return sim.doomsday;
}
function changePhase(state,phase,at){if(state.phase===phase)return;state.phase=phase;state.phaseStartedAt=at;state.updatedAt=at;state.revision++;}
function complete(state,objective,player,now){objective.completed=true;objective.completedBy=player.actorId||player.id||'local';objective.completedAt=now;state.updatedAt=now;state.revision++;}
function armArrival(state,now,random){state.scheduledAt=now;state.nextEventAt=now+randomDelay(random,DOOMSDAY_TIMING.initialMinMs,DOOMSDAY_TIMING.initialMaxMs);state.awaitingArrival=false;state.updatedAt=now;state.revision++;}
function beginEvent(state,environment,now,resolvePoint){
 const cycle=state.cycle+1,revision=state.revision+1,detonationAt=now+DOOMSDAY_TIMING.warningMs,falloutAt=detonationAt+DOOMSDAY_TIMING.detonationMs;
 Object.assign(state,{id:state.mapId+':'+now+':'+cycle,cycle,phase:'warning',revision,startedAt:now,phaseStartedAt:now,updatedAt:now,detonationAt,falloutAt,recoveryAt:null,clearingAt:null,clearAt:null,scheduledAt:null,nextEventAt:null,objectives:configuredObjectives(environment,resolvePoint)});
}
function advanceTimeline(state,now,random){
 if(state.phase==='warning'&&now>=state.detonationAt)changePhase(state,'detonation',state.detonationAt);
 if(state.phase==='detonation'&&now>=state.falloutAt)changePhase(state,'fallout',state.falloutAt);
 if(state.phase==='clearing'&&now>=state.clearAt){
  changePhase(state,'all-clear',state.clearAt);
  state.scheduledAt=state.clearAt;state.nextEventAt=state.clearAt+randomDelay(random,DOOMSDAY_TIMING.repeatMinMs,DOOMSDAY_TIMING.repeatMaxMs);
 }
}
/** Warning and detonation follow the room clock; fallout and recovery retain
 * their original quest-led length. The next quiet interval begins at all-clear. */
export function stepDoomsday(sim,environment,now,{players=sim.players||[],resolvePoint,start=true,random=Math.random}={}){
 const state=ensureDoomsday(sim,environment),humans=Object.values(players).filter(player=>present(player,now)),active=humans.filter(player=>player.health>0);state.serverTime=now;
 if(start&&!humans.length&&!running(state)&&state.nextEventAt!==null){state.nextEventAt=state.scheduledAt=null;state.awaitingArrival=true;state.updatedAt=now;state.revision++;}
 if(start&&active.length&&!running(state)){
  if(state.nextEventAt===null)armArrival(state,now,random);
  // A long suspended client receives one fresh event, never a burst of old ones.
  if(now>=state.nextEventAt)beginEvent(state,environment,now,resolvePoint);
 }
 advanceTimeline(state,now,random);
 for(const objective of state.objectives){
  if(objective.completed||!eligible(objective,state,now))continue;
  const responder=active.find(player=>nearby(player,objective));if(responder)complete(state,objective,responder,now);
 }
 if(state.phase==='fallout'&&state.objectives.find(objective=>objective.id==='supplies')?.completed){state.recoveryAt=now;changePhase(state,'recovery',now);}
 if(state.phase==='recovery'&&state.objectives.find(objective=>objective.id==='recovery')?.completed){state.clearingAt=now;state.clearAt=now+DOOMSDAY_TIMING.clearingMs;changePhase(state,'clearing',now);}
 if(start&&!humans.length&&!running(state)&&state.nextEventAt!==null){state.nextEventAt=state.scheduledAt=null;state.awaitingArrival=true;state.updatedAt=now;state.revision++;}
 return doomsdayView(sim);
}
export function doomsdayView(sim,environment){
 const state=environment?ensureDoomsday(sim,environment):sim.doomsday;if(!state)return null;
 const current=state.objectives.find(objective=>!objective.completed&&objective.phase===state.phase);
 const phaseEndsAt={warning:state.detonationAt,detonation:state.falloutAt,clearing:state.clearAt}[state.phase]??null;
 return {...copy(state),active:!!running(state),phaseLabel:DOOMSDAY_PHASES[state.phase].label,message:DOOMSDAY_PHASES[state.phase].message,
  suppliesReadyAt:state.falloutAt===null?null:state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs,phaseEndsAt,
  phaseElapsedMs:Math.max(0,(state.serverTime??0)-(state.phaseStartedAt??state.serverTime??0)),currentObjectiveId:current?.id||null,
  canAdvance:false,completedCount:state.objectives.filter(objective=>objective.completed).length,totalObjectives:state.objectives.length};
}
export function doomsdayCommand(sim,player,environment,command,now,options={}){
 const state=ensureDoomsday(sim,environment),operation=command.operation||'status';
 if(operation==='status')return {message:DOOMSDAY_PHASES[state.phase].message,doomsday:doomsdayView(sim)};
 if(['start','stop','advance'].includes(operation))reject('The emergency unfolds automatically. Follow Cole’s radio and visit the quest markers.');
 if(operation!=='objective')reject('Unknown doomsday operation.',422);
 if(!running(state))reject('The emergency response is not active.');
 const objective=state.objectives.find(item=>item.id===command.objectiveId);if(!objective)reject('This response objective is unavailable.',404);
 if(!eligible(objective,state,now))reject('Follow the objective for the current response phase.');
 if(objective.completed)return {message:objective.name+' is already complete.',doomsday:doomsdayView(sim)};
 if(!live(player,now))reject('Respawn before checking in at a response objective.');
 if(!nearby(player,objective))reject(objective.id==='shelter'&&finiteArea(objective.arrivalArea)?'Enter the '+objective.name+' area to check in.':'Move within 4.5 metres of '+objective.name+' to check in.');
 complete(state,objective,player,now);
 stepDoomsday(sim,environment,now,{...options,players:[player],start:false});
 return {message:objective.name+' complete. Cole has your confirmation.',doomsday:doomsdayView(sim)};
}
