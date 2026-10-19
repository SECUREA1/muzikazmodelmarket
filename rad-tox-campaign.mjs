import {randomUUID} from 'node:crypto';
import {openMatch,finishMatch,healPlayer,matchRows} from './rpg-match.mjs';
import {captureRadToxScorePhase} from './rad-tox-local-score.mjs';
import {radToxWavePopulation,RAD_TOX_WAVE_MS,RAD_TOX_NORMAL_WAVES,RAD_TOX_BOSS_WAVE} from './public/js/rad-tox-wave-rules.js';
export {RAD_TOX_WAVE_MS,RAD_TOX_NORMAL_WAVES,RAD_TOX_BOSS_WAVE} from './public/js/rad-tox-wave-rules.js';
export const ROUND_COUNTDOWN_MS=10000;
export const RAD_TOX_FINAL_LEVEL=3;
export const RAD_TOX_AUTHORED_WORLDS=new Set(['muzikaz-main','muzikaz-upper','sheepbase']);
const onlinePlayers=(sim,now)=>Object.entries(sim.players).filter(([,player])=>!player.basketballAI&&!player.replacedByRoom&&now-player.lastSeen<15000);

export function supportsRadTox(environment) {
 return environment.playable!==false && !environment.builderScene && !environment.proceduralLand && Boolean(environment.modelUrl || environment.modelUrls?.length);
}
export function radToxWorldForLevel(level,fallback='muzikaz-main'){
 if(!RAD_TOX_AUTHORED_WORLDS.has(fallback))return fallback;
 return level>=3?'sheepbase':level===2?'muzikaz-upper':'muzikaz-main';
}
export function radToxWaveTargetCount(level,wave){return radToxWavePopulation(level,wave).budget.total;}
function removeServerEncounter(sim){
 for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[id];
 sim.projectiles={};
 if(sim.events?.some(event=>['enemy-attack','enemy-hit'].includes(event.action)))sim.events=sim.events.filter(event=>!['enemy-attack','enemy-hit'].includes(event.action));
}

// Only the tournament coordinator advances these clocks. Browsers own every
// enemy, projectile, attack, collectible and their personal defeat state.
export function spawnRadToxWave(sim,now,_center){
 captureRadToxScorePhase(sim,now);removeServerEncounter(sim);
 const campaign=sim.radTox,boss=campaign.wave===RAD_TOX_BOSS_WAVE,population=radToxWavePopulation(campaign.level,campaign.wave);
 Object.assign(campaign,{combatMode:'local',state:'active',nextWaveAt:null,transition:null,
  phaseId:randomUUID(),phaseKind:boss?'boss':'wave',normalWaveCount:RAD_TOX_NORMAL_WAVES,
  bossKind:boss?({1:'bee',2:'aape'})[campaign.level]||'beeduck':null,
  targetCount:population.budget.total,population,
  startedAt:now,endsAt:boss?null:now+RAD_TOX_WAVE_MS,
  participants:onlinePlayers(sim,now).map(([id])=>id),localProgress:{}});
 campaign.remaining=campaign.targetCount;captureRadToxScorePhase(sim,now);
}
export function seedRadToxLevel(sim,environment,now,level=1){
 if(!supportsRadTox(environment))return false;
 captureRadToxScorePhase(sim,now);
 const coordinated=Boolean(sim.radTox?.coordinated);
 const selectedLevel=Math.max(1,Math.trunc(Number(level)||1));
 sim.radTox={level:selectedLevel,wave:1,combatMode:'local',state:'active',environmentId:radToxWorldForLevel(selectedLevel,environment.id),...(coordinated?{coordinated:true}:{})};
 openMatch(sim,sim.radTox.level,now);spawnRadToxWave(sim,now,environment.spawn);return true;
}
export function startRadTox(sim,environment,now,center){
 if(!supportsRadTox(environment))return false;
 if(!sim.radTox)return seedRadToxLevel(sim,environment,now);
 if(sim.radTox.combatMode!=='local'){
  const campaign=sim.radTox;campaign.wave=campaign.wave===4?RAD_TOX_BOSS_WAVE:Math.max(1,Math.min(RAD_TOX_NORMAL_WAVES,campaign.wave||1));
  campaign.environmentId ||= environment.id;if(!sim.match)openMatch(sim,campaign.level||1,now);spawnRadToxWave(sim,now,center);
 }else if(!sim.match){openMatch(sim,sim.radTox.level||1,now);spawnRadToxWave(sim,now,center);}
 removeServerEncounter(sim);return true;
}
function levelTransition(sim,environment,now){
 const victory=sim.match.outcome==='victory',final=victory&&sim.radTox.level>=RAD_TOX_FINAL_LEVEL;
 if(final)return {kind:'tournament',at:now,nextLevel:null,environmentId:sim.radTox.environmentId||environment?.id};
 const nextLevel=sim.radTox.level+(victory?1:0);
 return {kind:victory?'level':'retry',at:now+ROUND_COUNTDOWN_MS,nextLevel,
  environmentId:victory?radToxWorldForLevel(nextLevel,sim.radTox.environmentId||environment?.id):environment?.id||sim.radTox.environmentId};
}
export function advanceRadTox(sim,now,environment,{coordinated=false}={}){
 if(!sim.radTox||sim.radTox.coordinated&&!coordinated)return;
 if(sim.radTox.combatMode!=='local'){if(!environment)return;startRadTox(sim,environment,now,environment.spawn);}
 removeServerEncounter(sim);
 // Catch up at the scheduled boundary, rather than restarting clocks after a
 // browser sleeps or the last connected player leaves. Four finite waves bound
 // this loop; the untimed authored boss remains playable on a late join.
 for(let transitions=0;transitions<16;transitions++){
  const campaign=sim.radTox,online=onlinePlayers(sim,now);
  if(sim.match?.state==='finished'){
   if(!['level','retry','tournament'].includes(campaign.transition?.kind))campaign.transition=levelTransition(sim,environment,sim.match.endedAt);
   if(campaign.transition.kind==='tournament'){
    campaign.state='finished';campaign.endedAt=sim.match.endedAt;
    if(sim.tournament){sim.tournament.status='finished';sim.tournament.endedAt=sim.match.endedAt;}
    return;
   }
   if(!environment||now<campaign.transition.at)return;
   nextRadToxLevel(sim,environment,campaign.transition.at,sim.match.id);continue;
  }
  if(campaign.phaseKind==='boss'){
   const participants=online.map(([id])=>id);
   if(!participants.length||!participants.every(id=>campaign.localProgress?.[id]?.phaseId===campaign.phaseId&&campaign.localProgress[id].bossDefeated))return;
   const finishedPhase=captureRadToxScorePhase(sim,now);if(finishedPhase)finishedPhase.closedAt ??= now;
   campaign.remaining=0;finishMatch(sim,'victory',now);campaign.transition=levelTransition(sim,environment,now);continue;
  }
  if(campaign.state==='active'){
   if(now<campaign.endsAt)return;
   const boundary=campaign.endsAt;captureRadToxScorePhase(sim,boundary);campaign.remaining=0;campaign.state='cleared';
   campaign.nextWaveAt=boundary+ROUND_COUNTDOWN_MS;
   campaign.transition={kind:'wave',at:campaign.nextWaveAt,results:matchRows(sim,now)};
  }
  if(campaign.state!=='cleared'||now<campaign.nextWaveAt)return;
  const boundary=campaign.nextWaveAt;campaign.wave++;
  for(const [,player]of online){player.ammo=120;player.fuel=100;healPlayer(player,15);}
  spawnRadToxWave(sim,boundary,online[0]?.[1].position||environment?.spawn);
 }
}
export function nextRadToxLevel(sim,environment,now,expectedMatchId){
 if(!supportsRadTox(environment)||!sim.match||sim.match.state!=='finished'||sim.match.id!==expectedMatchId)return false;
 const transition=sim.radTox.transition||levelTransition(sim,environment,sim.match.endedAt);
 if(transition.kind==='tournament'||now<transition.at)return false;
 const level=sim.match.outcome==='victory'?sim.radTox.level+1:sim.radTox.level;
 const destination=transition.environmentId||environment.id;
 seedRadToxLevel(sim,{...environment,id:destination},transition.at,level);
 sim.radTox.transferId=sim.radTox.phaseId;return true;
}
