import {doomsdayForEnvironment} from './doomsday-config.js';

export const DOOMSDAY_TIMING=Object.freeze({initialMinMs:15000,initialMaxMs:90000,repeatMinMs:180000,repeatMaxMs:1200000,warningMs:18000,detonationMs:7000,falloutSettleMs:5000,falloutMaxMs:40000,recoveryMaxMs:20000,clearingMs:8000});
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
const running=state=>state&&['warning','detonation','fallout','recovery','clearing'].includes(state.phase);
const present=(player,now)=>player&&!player.basketballAI&&!player.replacedByRoom&&(!Number.isFinite(player.lastSeen)||now-player.lastSeen<15000);
const live=(player,now)=>present(player,now)&&player.health>0;
const nearby=(player,objective)=>finitePoint(player.position)&&Math.hypot(player.position.x-objective.position.x,player.position.z-objective.position.z)<=4.5&&Math.abs(player.position.y-objective.position.y)<=3;
const eligible=(objective,state,now)=>objective.id==='shelter'?['warning','fallout','recovery'].includes(state.phase):objective.phase===state.phase&&(objective.id!=='supplies'||now>=state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs);
const randomDelay=(random,min,max)=>{const value=Number(random());return Math.round(min+Math.max(0,Math.min(1,Number.isFinite(value)?value:.5))*(max-min));};
function configuredObjectives(environment,resolvePoint){
 return doomsdayForEnvironment(environment).objectives.map(objective=>{
  const authored={...objective.position},resolved=resolvePoint?.(authored,objective)||authored;
  return {...objective,optional:objective.id==='shelter',position:finitePoint(resolved)?{x:resolved.x,y:resolved.y,z:resolved.z}:authored,completed:false,completedBy:null,completedAt:null};
 });
}
export function ensureDoomsday(sim,environment){
 const mapId=environment?.id||'local';
 if(sim.doomsday?.version!==3||sim.doomsday.mapId!==mapId)sim.doomsday={version:3,automatic:true,id:null,mapId,phase:'idle',revision:0,cycle:0,startedAt:null,phaseStartedAt:null,updatedAt:null,serverTime:null,scheduledAt:null,nextEventAt:null,detonationAt:null,falloutAt:null,recoveryAt:null,clearingAt:null,clearAt:null,awaitingArrival:true,objectives:configuredObjectives(environment)};
 return sim.doomsday;
}
function changePhase(state,phase,at){if(state.phase===phase)return;state.phase=phase;state.phaseStartedAt=at;state.updatedAt=at;state.revision++;}
function complete(state,objective,player,now){objective.completed=true;objective.completedBy=player.actorId||player.id||'local';objective.completedAt=now;state.updatedAt=now;state.revision++;}
function armArrival(state,now,random){state.scheduledAt=now;state.nextEventAt=now+randomDelay(random,DOOMSDAY_TIMING.initialMinMs,DOOMSDAY_TIMING.initialMaxMs);state.awaitingArrival=false;state.updatedAt=now;state.revision++;}
function beginEvent(state,environment,now,resolvePoint,random){
 const cycle=state.cycle+1,revision=state.revision+1,detonationAt=now+DOOMSDAY_TIMING.warningMs,falloutAt=detonationAt+DOOMSDAY_TIMING.detonationMs,recoveryAt=falloutAt+DOOMSDAY_TIMING.falloutMaxMs,clearingAt=recoveryAt+DOOMSDAY_TIMING.recoveryMaxMs;
 Object.assign(state,{id:state.mapId+':'+now+':'+cycle,cycle,phase:'warning',revision,startedAt:now,phaseStartedAt:now,updatedAt:now,detonationAt,falloutAt,recoveryAt,clearingAt,clearAt:clearingAt+DOOMSDAY_TIMING.clearingMs,scheduledAt:now,nextEventAt:now+randomDelay(random,DOOMSDAY_TIMING.repeatMinMs,DOOMSDAY_TIMING.repeatMaxMs),objectives:configuredObjectives(environment,resolvePoint)});
}
function advanceTimeline(state,now){
 if(state.phase==='warning'&&now>=state.detonationAt)changePhase(state,'detonation',state.detonationAt);
 if(state.phase==='detonation'&&now>=state.falloutAt)changePhase(state,'fallout',state.falloutAt);
 if(state.phase==='fallout'&&now>=state.recoveryAt)changePhase(state,'recovery',state.recoveryAt);
 if(state.phase==='recovery'&&now>=state.clearingAt)changePhase(state,'clearing',state.clearingAt);
 if(state.phase==='clearing'&&now>=state.clearAt)changePhase(state,'all-clear',state.clearAt);
}
/** Schedule once per arrival/run, not per frame. Recurrences are measured from
 * warning start to warning start. Every event ends even when quests are ignored. */
export function stepDoomsday(sim,environment,now,{players=sim.players||[],resolvePoint,start=true,random=Math.random}={}){
 const state=ensureDoomsday(sim,environment),humans=Object.values(players).filter(player=>present(player,now)),active=humans.filter(player=>player.health>0);state.serverTime=now;
 if(start&&!humans.length&&!running(state)&&state.nextEventAt!==null){state.nextEventAt=state.scheduledAt=null;state.awaitingArrival=true;state.updatedAt=now;state.revision++;}
 if(start&&active.length&&!running(state)){
  if(state.nextEventAt===null)armArrival(state,now,random);
  // A long suspended client receives one fresh event, never a burst of old ones.
  if(now>=state.nextEventAt)beginEvent(state,environment,now,resolvePoint,random);
 }
 advanceTimeline(state,now);
 for(const objective of state.objectives){
  if(objective.completed||!eligible(objective,state,now))continue;
  const responder=active.find(player=>nearby(player,objective));if(responder)complete(state,objective,responder,now);
 }
 if(state.phase==='fallout'&&state.objectives.find(objective=>objective.id==='supplies')?.completed){state.clearingAt=Math.min(state.clearingAt,now+DOOMSDAY_TIMING.recoveryMaxMs);state.clearAt=state.clearingAt+DOOMSDAY_TIMING.clearingMs;changePhase(state,'recovery',now);}
 if(state.phase==='recovery'&&state.objectives.find(objective=>objective.id==='recovery')?.completed){state.clearingAt=now;state.clearAt=now+DOOMSDAY_TIMING.clearingMs;changePhase(state,'clearing',now);}
 if(start&&!humans.length&&!running(state)&&state.nextEventAt!==null){state.nextEventAt=state.scheduledAt=null;state.awaitingArrival=true;state.updatedAt=now;state.revision++;}
 return doomsdayView(sim);
}
export function doomsdayView(sim,environment){
 const state=environment?ensureDoomsday(sim,environment):sim.doomsday;if(!state)return null;
 const current=state.objectives.find(objective=>!objective.completed&&objective.phase===state.phase);
 const phaseEndsAt={warning:state.detonationAt,detonation:state.falloutAt,fallout:state.recoveryAt,recovery:state.clearingAt,clearing:state.clearAt}[state.phase]??null;
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
 if(!nearby(player,objective))reject('Move within 4.5 metres of '+objective.name+' to check in.');
 complete(state,objective,player,now);
 stepDoomsday(sim,environment,now,{...options,players:[player],start:false});
 return {message:objective.name+' complete. Cole has your confirmation.',doomsday:doomsdayView(sim)};
}
