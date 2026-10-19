import {randomUUID} from 'node:crypto';
import {openMatch,finishMatch,healPlayer,matchRows} from './rpg-match.mjs';
import {captureRadToxScorePhase} from './rad-tox-local-score.mjs';
import {radToxWavePopulation,RAD_TOX_WAVE_MS,RAD_TOX_NORMAL_WAVES,RAD_TOX_BOSS_WAVE} from './public/js/rad-tox-wave-rules.js';
export {RAD_TOX_WAVE_MS,RAD_TOX_NORMAL_WAVES,RAD_TOX_BOSS_WAVE} from './public/js/rad-tox-wave-rules.js';
export const ROUND_COUNTDOWN_MS=10000;
const onlinePlayers=(sim,now)=>Object.entries(sim.players).filter(([,player])=>!player.basketballAI&&!player.replacedByRoom&&now-player.lastSeen<15000);

export function supportsRadTox(environment) {
 return environment.playable!==false && !environment.builderScene && !environment.proceduralLand && Boolean(environment.modelUrl || environment.modelUrls?.length);
}
export function radToxWorldForLevel(level,fallback='muzikaz-main'){
 return level>=3?'sheepbase':level===2?'muzikaz-upper':fallback;
}
export function radToxWaveTargetCount(level,wave){
 return radToxWavePopulation(level,wave).budget.total;
}
function removeServerEncounter(sim){
 for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[id];
 sim.projectiles={};
 if(sim.events?.some(event=>['enemy-attack','enemy-hit'].includes(event.action)))sim.events=sim.events.filter(event=>!['enemy-attack','enemy-hit'].includes(event.action));
}

// The room owns stage clocks and score receipts. Each browser owns its enemy
// meshes, movement, attacks and damage; no enemy actors cross the room channel.
export function spawnRadToxWave(sim,now,_center){
 captureRadToxScorePhase(sim,now);
 removeServerEncounter(sim);
 const campaign=sim.radTox,boss=campaign.wave===RAD_TOX_BOSS_WAVE,population=radToxWavePopulation(campaign.level,campaign.wave);
 Object.assign(campaign,{combatMode:'local',state:'active',nextWaveAt:null,transition:null,
  phaseId:randomUUID(),phaseKind:boss?'boss':'wave',normalWaveCount:RAD_TOX_NORMAL_WAVES,
  bossKind:boss?({1:'bee',2:'aape'})[campaign.level]||'beeduck':null,
  targetCount:population.budget.total,population,
  startedAt:now,endsAt:boss?null:now+RAD_TOX_WAVE_MS,
  participants:onlinePlayers(sim,now).map(([id])=>id),localProgress:{}});
 campaign.remaining=campaign.targetCount;
 captureRadToxScorePhase(sim,now);
}

export function seedRadToxLevel(sim,environment,now,level=1){
 if(!supportsRadTox(environment))return false;
 captureRadToxScorePhase(sim,now);
 sim.radTox={level:Math.max(1,Math.trunc(Number(level)||1)),wave:1,combatMode:'local',state:'active',environmentId:environment.id};
 openMatch(sim,sim.radTox.level,now);spawnRadToxWave(sim,now,environment.spawn);return true;
}
export function startRadTox(sim,environment,now,center){
 if(!supportsRadTox(environment))return false;
 if(!sim.radTox)return seedRadToxLevel(sim,environment,now);
 // Saved rooms from the former authoritative-enemy mode migrate on entry.
 if(sim.radTox.combatMode!=='local'){
  const campaign=sim.radTox;campaign.wave=campaign.wave===4?RAD_TOX_BOSS_WAVE:Math.max(1,Math.min(RAD_TOX_NORMAL_WAVES,campaign.wave||1));
  campaign.environmentId ||= environment.id;
  if(!sim.match)openMatch(sim,campaign.level||1,now);
  spawnRadToxWave(sim,now,center);
 }else if(!sim.match){openMatch(sim,sim.radTox.level||1,now);spawnRadToxWave(sim,now,center);}
 removeServerEncounter(sim);return true;
}
function levelTransition(sim,environment,now){
 const victory=sim.match.outcome==='victory',nextLevel=sim.radTox.level+(victory?1:0);
 return {kind:victory?'level':'retry',at:now+ROUND_COUNTDOWN_MS,nextLevel,
  environmentId:victory?radToxWorldForLevel(nextLevel,environment?.id):environment?.id||sim.radTox.environmentId};
}
export function advanceRadTox(sim,now,environment){
 if(!sim.radTox)return;
 if(sim.radTox.combatMode!=='local'){
  if(!environment)return;
  startRadTox(sim,environment,now,environment.spawn);
 }
 const campaign=sim.radTox,online=onlinePlayers(sim,now);
 removeServerEncounter(sim);
 if(sim.match?.state==='finished'){
  if(!['level','retry'].includes(campaign.transition?.kind))campaign.transition=levelTransition(sim,environment,sim.match.endedAt);
  if(environment&&now>=campaign.transition.at&&online.length)nextRadToxLevel(sim,environment,now,sim.match.id);
  return;
 }
 if(environment&&campaign.environmentId!==environment.id)return;
 if(!online.length)return;
 if(campaign.phaseKind==='boss'){
  const required=(campaign.participants||[]).filter(id=>online.some(([onlineId])=>onlineId===id));
  // A late arrival can finish an abandoned boss stage, but cannot hold up the
  // players who were already fighting when that stage began.
  const participants=required.length?required:online.map(([id])=>id);
  if(!participants.every(id=>campaign.localProgress?.[id]?.phaseId===campaign.phaseId&&campaign.localProgress[id].bossDefeated))return;
  captureRadToxScorePhase(sim,now);campaign.remaining=0;finishMatch(sim,'victory',now);
  campaign.transition=levelTransition(sim,environment,now);return;
 }
 if(campaign.state==='active'){
  if(now<campaign.endsAt)return;
  captureRadToxScorePhase(sim,now);campaign.remaining=0;campaign.state='cleared';
  // Start the results clock when the timeout is processed. A sleeping room
  // never silently skips waves when somebody returns.
  campaign.nextWaveAt=now+ROUND_COUNTDOWN_MS;
  campaign.transition={kind:'wave',at:campaign.nextWaveAt,results:matchRows(sim,now)};return;
 }
 if(campaign.state!=='cleared'||now<campaign.nextWaveAt)return;
 campaign.wave++;
 for(const [,player]of online){player.ammo=120;player.fuel=100;healPlayer(player,15);}
 spawnRadToxWave(sim,now,online[0][1].position);
}

export function nextRadToxLevel(sim,environment,now,expectedMatchId){
 if(!supportsRadTox(environment)||!sim.match||sim.match.state!=='finished'||sim.match.id!==expectedMatchId)return false;
 const transition=sim.radTox.transition||levelTransition(sim,environment,sim.match.endedAt);
 if(now<transition.at)return false;
 const level=sim.match.outcome==='victory'?sim.radTox.level+1:sim.radTox.level;
 seedRadToxLevel(sim,environment,now,level);
 sim.radTox.environmentId=transition.environmentId||environment.id;
 if(sim.radTox.environmentId!==environment.id)sim.radTox.transferId=sim.radTox.phaseId;
 return true;
}
