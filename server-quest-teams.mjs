import {recordMapQuestCompletion} from './server-site-quests.mjs';
import {isRoadVehicle} from './public/js/road-vehicles.js';
import {questRadio} from './server-quest-radio.mjs';
import {isWatercraft} from './public/js/harbor-water.js';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isCombatBoat} from './public/js/patrol-combat.js';
import {armedAircraft} from './public/js/aircraft-types.js';
export function canonicalQuest(sim,player){const q=player?.vehicleMission;if(!q?.teamLeader)return q;const leader=sim.players[q.teamLeader];return leader?.vehicleMission?.instanceId===q.instanceId?leader.vehicleMission:null;}
export function questHelpers(sim,q){return Object.entries(q?.team||{}).filter(([id,m])=>m.role!=='observer'&&sim.players[id]?.vehicleMission?.instanceId===q.instanceId).map(([id,m])=>({player:sim.players[id],member:m,craft:sim.actors[m.vehicleId]}));}
export function canEngageQuest(sim,actorId,target){if(target.questRole!=='hostile')return false;const q=canonicalQuest(sim,sim.players[actorId]);return q?.status==='active'&&q.instanceId===target.questInstance&&questHelpers(sim,q).some(m=>m.player.actorId===actorId);}
function availableLeader(player,now){const q=player?.vehicleMission;return !!(q?.shared&&!q.teamLeader&&q.status==='active'&&q.questId&&!q.siteWork&&player.health>0&&!player.replacedByRoom&&(!Number.isFinite(now)||now<q.deadline&&now-player.lastSeen<15000));}
function helpPoint(player){const point=player.position;return point&&Number.isFinite(point.x)&&Number.isFinite(point.z)?{x:point.x,y:Number.isFinite(point.y)?point.y:0,z:point.z}:null;}
export function questTeamOffers(sim,now=sim.time){return Object.values(sim.players).filter(p=>availableLeader(p,now)&&(!Number.isFinite(now)||!p.vehicleMission.helpExpires||now<p.vehicleMission.helpExpires)&&Object.keys(p.vehicleMission.team||{}).length<4).map(p=>{const q=p.vehicleMission,point=helpPoint(p);return {id:q.instanceId,leader:p.username,speakerId:p.actorId,questId:q.questId,title:q.title,mode:q.requiredMode||q.mode,members:Object.keys(q.team||{}).length,at:q.helpRequestedAt||q.startedAt,expires:Math.min(q.deadline,q.helpExpires||q.deadline),...(point?{point}:{})};});}
export function teamCommand(sim,player,operation,now,{teamId,role,environment}={}){
 let q=canonicalQuest(sim,player);
 if(operation==='join'){
  if(player.vehicleMission?.status==='active')throw Error('Finish or leave your current assignment first.');
  const leader=Object.values(sim.players).find(p=>p.vehicleMission?.instanceId===teamId&&!p.vehicleMission.teamLeader);q=leader?.vehicleMission;
  if(!q?.shared||q.status!=='active'||now>=q.deadline||now-leader.lastSeen>=15000||leader.health<=0||leader.replacedByRoom)throw Error('This shared assignment is no longer available.');
  if(q.siteWork)throw Error('This work challenge tracks your own activity. Accept your own challenge to participate.');
  if(Object.keys(q.team).length>=4)throw Error('This team is full.');if(!['helper','observer'].includes(role))throw Error('Choose helper or observer.');
  const craft=sim.actors[player.vehicleId],mode=q.requiredMode||q.mode;
  if(role==='helper'&&(player.health<=0||(mode==='foot'?!!player.vehicleId:!craft||craft.active===false||craft.health<=0||craft.trafficAI||craft.holderId!==player.actorId||(mode==='road'?!isRoadVehicle(craft):mode==='gunboat'?!isCombatBoat(craft):mode==='boat'?!isWatercraft(craft):mode==='armed'?!armedAircraft(craft):!isAircraft(craft)))))throw Error('Board an appropriate craft to help this team. Observers can watch on foot.');
  q.team[player.actorId]={role,vehicleId:player.vehicleId||null,revision:player.movementRevision||0,placementRevision:craft?.placementRevision||0,contribution:0};player.vehicleMission={...structuredClone(q),teamLeader:leader.actorId,teamRole:role,vehicleId:player.vehicleId||null};questRadio(sim,now,'Dispatch',player.username+' joined '+leader.username+' as '+role+'.');return 'Joined shared assignment as '+role+'.';
 }
 if(!q||q.status!=='active'||player.vehicleMission?.status!=='active'||!q.team?.[player.actorId])throw Error('Accept an assignment first.');
 if(operation==='share'||operation==='help'){
  if(q.siteWork)throw Error('This work challenge tracks your own activity and cannot be shared.');
  if(!q.questId)throw Error('Choose a full quest to open a shared team.');
  if(player.vehicleMission.teamLeader)throw Error('Only the leader can call for helpers.');
  if(player.health<=0||player.replacedByRoom||now-player.lastSeen>=15000||now>=q.deadline)throw Error('This assignment is no longer available.');
  if(Object.keys(q.team).length>=4)throw Error('This team is full.');
  if(player.questHelpAt!=null&&now<player.questHelpAt+30000)throw Error('Wait thirty seconds before calling for help again.');
  q.shared=true;player.questHelpAt=now;q.helpRequestedAt=now;q.helpExpires=Math.min(q.deadline,now+90000);
  const point=helpPoint(player);
  questRadio(sim,now,player.username,'Requesting help with '+q.title+'. Join my team through Crew Dispatch.',{helpRequest:true,teamId:q.instanceId,questId:q.questId,expires:q.helpExpires,speakerId:player.actorId,type:'player',worldId:environment?.id,worldName:environment?.name||environment?.id,...(point?{point}:{})});
  return operation==='help'?'Help call broadcast · team open to helpers and observers.':'Team open · up to four players.';
 }
 if(operation==='radio') {if(now<(player.questRadioAt||0)+4000)throw Error('Let the current radio call finish.');player.questRadioAt=now;questRadio(sim,now,player.username,'Dispatch, requesting current mission status.');const point=q.checkpoints[q.index];questRadio(sim,now,q.supportId?'Support crew':'Dispatch',(q.supportId?'Support on station. ':'')+(point?.name||q.title)+'. '+(q.kills||0)+' opponents secured; '+Object.keys(q.team||{}).length+' team members.');return 'Crew response received.';}
 return null;
}
export function syncQuestTeams(sim,now){for(const p of Object.values(sim.players)){const q=p.vehicleMission;if(q?.teamLeader&&q.status==='active'){const parent=sim.players[q.teamLeader]?.vehicleMission;if(parent?.instanceId!==q.instanceId||!parent.team?.[p.actorId]){q.status='cancelled';q.message='Shared assignment is no longer available.';}}}for(const leader of Object.values(sim.players)){const q=leader.vehicleMission;if(!q?.questId||q.teamLeader)continue;for(const [id,m]of Object.entries(q.team||{})){if(id===leader.actorId)continue;const p=sim.players[id];if(!p||p.vehicleMission?.instanceId!==q.instanceId){delete q.team[id];continue;}const craft=sim.actors[m.vehicleId];if(q.status==='active'&&(now-p.lastSeen>15000||p.health<=0||(p.movementRevision||0)!==m.revision||m.role==='helper'&&(q.mode==='foot'?!!p.vehicleId:p.vehicleId!==m.vehicleId||craft?.holderId!==id||craft?.active===false||craft?.health<=0||(craft?.placementRevision||0)!==m.placementRevision))){p.vehicleMission={...p.vehicleMission,status:'cancelled',message:'Left team after exit, relocation or disconnection.'};delete q.team[id];continue;}const prior=p.vehicleMission.status;p.vehicleMission={...structuredClone(q),teamLeader:leader.actorId,teamRole:m.role,vehicleId:m.vehicleId,ready:m.ready||false};if(q.status==='completed'&&prior==='active'&&m.role==='helper'&&m.contribution>0){p.score=(p.score||0)+q.reward;p.transportRewardAt=now;recordMapQuestCompletion(p,q,now);sim.questResults||=[];sim.questResults.push({questId:q.questId,title:q.title,actorId:id,username:p.username,at:now,elapsed:q.elapsed,score:q.reward,kind:q.kind,teamId:q.instanceId,role:'helper',opponentTime:q.opponentTime||null,won:!q.opponentFinishedAt||now<q.opponentFinishedAt});sim.questResults=sim.questResults.slice(-40);p.vehicleMission.message='Team assignment complete · +'+q.reward+' score';}else if(q.status==='completed'&&m.role==='observer')p.vehicleMission.message='Observed team completion · no score awarded.';}}}
