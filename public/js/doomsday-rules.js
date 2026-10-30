import {doomsdayForEnvironment} from './doomsday-config.js';

export const DOOMSDAY_PHASES = Object.freeze({
 idle:{label:'Standby',message:'Choose Start scenario to activate this map’s emergency response.'},
 warning:{label:'Nuclear warning',message:'Warning sirens are active. Check in at the continuity shelter.'},
 fallout:{label:'Fallout response',message:'The skyline is glowing. Collect the sealed emergency supplies.'},
 recovery:{label:'Recovery',message:'Deliver the response report at the recovery beacon.'},
 'all-clear':{label:'All clear',message:'Response complete. The skies are clearing and all routes remain open.'}
});
const phaseOrder=['warning','fallout','recovery','all-clear'];
const copy=value=>JSON.parse(JSON.stringify(value));
const reject=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const running=state=>Boolean(state&&phaseOrder.slice(0,3).includes(state.phase));

function configuredObjectives(environment,resolvePoint){
 return doomsdayForEnvironment(environment).objectives.map(objective=>{
  const authored={...objective.position},resolved=resolvePoint?.(authored,objective)||authored;
  return {...objective,position:finitePoint(resolved)?{x:resolved.x,y:resolved.y,z:resolved.z}:authored,completed:false,completedBy:null,completedAt:null};
 });
}
export function ensureDoomsday(sim,environment){
 if(!sim.doomsday||sim.doomsday.mapId!==(environment?.id||'local'))sim.doomsday={id:null,mapId:environment?.id||'local',phase:'idle',revision:0,startedAt:null,phaseStartedAt:null,updatedAt:null,objectives:configuredObjectives(environment)};
 return sim.doomsday;
}
/** Public and solo use the same state machine. Each room keeps its own scenario;
 * none of its phases changes access, health, held inputs, or vehicle occupancy. */
export function doomsdayView(sim,environment){
 const state=environment?ensureDoomsday(sim,environment):sim.doomsday;
 if(!state)return null;
 const current=state.objectives.filter(objective=>objective.phase===state.phase);
 return {...copy(state),active:running(state),phaseLabel:DOOMSDAY_PHASES[state.phase].label,message:DOOMSDAY_PHASES[state.phase].message,
  canAdvance:running(state)&&current.length>0&&current.every(objective=>objective.completed),
  completedCount:state.objectives.filter(objective=>objective.completed).length,totalObjectives:state.objectives.length};
}
export function doomsdayCommand(sim,player,environment,command,now,{resolvePoint}={}){
 const state=ensureDoomsday(sim,environment),operation=command.operation||'status';
 let message;
 if(operation==='status')return {message:DOOMSDAY_PHASES[state.phase].message,doomsday:doomsdayView(sim)};
 if(operation==='start'){
  if(running(state))reject('A response is already active. Complete its current objective or end the scenario.');
  const revision=state.revision+1;
  Object.assign(state,{id:(environment?.id||'local')+':'+now+':'+revision,phase:'warning',revision,startedAt:now,phaseStartedAt:now,updatedAt:now,objectives:configuredObjectives(environment,resolvePoint)});
  message=DOOMSDAY_PHASES.warning.message;
 }else if(operation==='stop'){
  if(state.phase==='idle')return {message:'The scenario is already on standby.',doomsday:doomsdayView(sim)};
  state.phase='idle';message='Emergency scenario ended. Normal skies restored; movement and vehicles remain available.';
 }else if(operation==='objective'){
  if(!running(state))reject('Start a scenario before completing response objectives.');
  const objective=state.objectives.find(item=>item.id===command.objectiveId);
  if(!objective)reject('This response objective is unavailable.',404);
  if(objective.phase!==state.phase)reject('Complete the objective for the current response phase.');
  if(objective.completed)return {message:objective.name+' is already complete.',doomsday:doomsdayView(sim)};
  if(player.health<=0)reject('Respawn before checking in at a response objective.');
  const position=player.position,target=objective.position;
  if(!finitePoint(position)||Math.hypot(position.x-target.x,position.z-target.z)>4.5||Math.abs(position.y-target.y)>3)reject('Move within 4.5 metres of '+objective.name+' to check in.');
  objective.completed=true;objective.completedBy=player.actorId||player.id||'local';objective.completedAt=now;
  message=objective.name+' complete. Continue to the next response phase.';
 }else if(operation==='advance'){
  if(!doomsdayView(sim).canAdvance)reject('Complete this phase’s response objective before continuing.');
  state.phase=phaseOrder[phaseOrder.indexOf(state.phase)+1];state.phaseStartedAt=now;
  message=DOOMSDAY_PHASES[state.phase].message;
 }else reject('Unknown doomsday operation.',422);
 if(operation!=='start'){state.revision++;state.updatedAt=now;}
 return {message,doomsday:doomsdayView(sim)};
}
