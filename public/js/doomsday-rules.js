import {doomsdayForEnvironment} from './doomsday-config.js';

export const DOOMSDAY_TIMING=Object.freeze({warningMs:18000,detonationMs:7000,falloutSettleMs:5000});
export const DOOMSDAY_PHASES=Object.freeze({
 idle:{label:'Incoming radio',message:'Emergency dispatch is connecting. Keep moving; the response begins automatically.'},
 warning:{label:'Nuclear warning',message:'This is Cole on the emergency radio. Incoming strikes. Get to the continuity shelter now.'},
 detonation:{label:'Distant detonations',message:'Cole to all units. Impacts confirmed on the horizon. Stay sheltered. Fallout is approaching.'},
 fallout:{label:'Fallout response',message:'Cole here. Fallout has begun. Follow the supply marker and recover the sealed relief crates.'},
 recovery:{label:'Recovery',message:'Supplies secured. This is Cole. Reach the recovery relay and restore our emergency communications.'},
 'all-clear':{label:'All clear',message:'Cole to all survivors. Recovery relay restored. Response complete. All routes remain open.'}
});
const copy=value=>JSON.parse(JSON.stringify(value));
const reject=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const running=state=>state&&['warning','detonation','fallout','recovery'].includes(state.phase);
const present=(player,now)=>player&&!player.basketballAI&&!player.replacedByRoom&&(!Number.isFinite(player.lastSeen)||now-player.lastSeen<15000);
const live=(player,now)=>present(player,now)&&player.health>0;
const nearby=(player,objective)=>finitePoint(player.position)&&Math.hypot(player.position.x-objective.position.x,player.position.z-objective.position.z)<=4.5&&Math.abs(player.position.y-objective.position.y)<=3;
const eligible=(objective,state,now)=>objective.id==='shelter'?['warning','fallout','recovery'].includes(state.phase):objective.phase===state.phase&&(objective.id!=='supplies'||now>=state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs);
function configuredObjectives(environment,resolvePoint){
 return doomsdayForEnvironment(environment).objectives.map(objective=>{
  const authored={...objective.position},resolved=resolvePoint?.(authored,objective)||authored;
  return {...objective,optional:objective.id==='shelter',position:finitePoint(resolved)?{x:resolved.x,y:resolved.y,z:resolved.z}:authored,completed:false,completedBy:null,completedAt:null};
 });
}
export function ensureDoomsday(sim,environment){
 const mapId=environment?.id||'local';
 if(sim.doomsday?.version!==2||sim.doomsday.mapId!==mapId)sim.doomsday={version:2,automatic:true,id:null,mapId,phase:'idle',revision:0,startedAt:null,phaseStartedAt:null,updatedAt:null,serverTime:null,detonationAt:null,falloutAt:null,objectives:configuredObjectives(environment)};
 return sim.doomsday;
}
function changePhase(state,phase,at){if(state.phase===phase)return;state.phase=phase;state.phaseStartedAt=at;state.updatedAt=at;state.revision++;}
function complete(state,objective,player,now){objective.completed=true;objective.completedBy=player.actorId||player.id||'local';objective.completedAt=now;state.updatedAt=now;state.revision++;}
/** The room clock drives the warning, blasts and fallout. Neither guide
 * visibility nor a menu command can pause the timeline or take over controls. */
export function stepDoomsday(sim,environment,now,{players=sim.players||[],resolvePoint,start=true}={}){
 const state=ensureDoomsday(sim,environment),humans=Object.values(players).filter(player=>present(player,now)),active=humans.filter(player=>player.health>0);state.serverTime=now;
 if(state.phase==='all-clear'&&!humans.length)state.awaitingArrival=true;
 if(start&&state.awaitingArrival&&active.length){state.phase='idle';state.awaitingArrival=false;}
 if(state.phase==='idle'&&start&&active.length){
  const revision=state.revision+1;
  Object.assign(state,{awaitingArrival:false,id:state.mapId+':'+now+':'+revision,phase:'warning',revision,startedAt:now,phaseStartedAt:now,updatedAt:now,detonationAt:now+DOOMSDAY_TIMING.warningMs,falloutAt:now+DOOMSDAY_TIMING.warningMs+DOOMSDAY_TIMING.detonationMs,objectives:configuredObjectives(environment,resolvePoint)});
 }
 if(state.phase==='warning'&&now>=state.detonationAt)changePhase(state,'detonation',state.detonationAt);
 if(state.phase==='detonation'&&now>=state.falloutAt)changePhase(state,'fallout',state.falloutAt);
 for(const objective of state.objectives){
  if(objective.completed||!eligible(objective,state,now))continue;
  const responder=active.find(player=>nearby(player,objective));if(responder)complete(state,objective,responder,now);
 }
 if(state.phase==='fallout'&&state.objectives.find(objective=>objective.id==='supplies')?.completed)changePhase(state,'recovery',now);
 if(state.phase==='recovery'&&state.objectives.find(objective=>objective.id==='recovery')?.completed)changePhase(state,'all-clear',now);
 return doomsdayView(sim);
}
export function doomsdayView(sim,environment){
 const state=environment?ensureDoomsday(sim,environment):sim.doomsday;if(!state)return null;
 const current=state.objectives.find(objective=>!objective.completed&&objective.phase===state.phase);
 return {...copy(state),active:!!running(state),phaseLabel:DOOMSDAY_PHASES[state.phase].label,message:DOOMSDAY_PHASES[state.phase].message,
  suppliesReadyAt:state.falloutAt===null?null:state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs,
  phaseEndsAt:state.phase==='warning'?state.detonationAt:state.phase==='detonation'?state.falloutAt:null,
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
