import {randomUUID} from 'node:crypto';
import {healthAfterHit} from './public/js/rpg-combat-rules.js';
export {PLAYER_HIT_CAPACITY} from './public/js/rpg-combat-rules.js';
export const SPAWN_PROTECTION_MS=3000;
export function newCombatStats(){return {shots:0,hits:0,misses:0,enemyHits:0,playerHits:0,enemyKills:0,playerKills:0,assists:0,deaths:0,hitsTaken:0,damageDealt:0,damageTaken:0,score:0,itemsCollected:[]};}
export function combatStats(player){return player.combat ||= newCombatStats();}
export function healPlayer(player,amount){player.health=Math.min(100,Math.max(0,player.health)+amount);return player.health;}
export function damagePlayer(player,now,attacker=null){
 if(player.radToxReady===false || player.health<=0 || now<(player.shieldUntil||0) || now<(player.spawnProtectedUntil||0))return false;
 const before=player.health;player.health=Number(healthAfterHit(before).toFixed(6));
 const damage=before-player.health,taken=combatStats(player);taken.hitsTaken++;taken.damageTaken+=damage;
 if(attacker){combatStats(attacker).damageDealt+=damage;player.lastDamager=attacker.actorId;}
 if(player.health===0){taken.deaths++;player.input={};if(attacker){const stats=combatStats(attacker);stats.playerKills++;stats.score+=25;attacker.score+=25;}}
 return true;
}
export function openMatch(sim,level,now){
 const match=sim.match={id:randomUUID(),level,startedAt:now,state:'active',participants:{},endedAt:null,outcome:null,results:null};
 for(const [id,player]of Object.entries(sim.players))if(player.radToxReady!==false&&now-player.lastSeen<15000)registerParticipant(sim,id,player,now,true);
 return match;
}
export function registerParticipant(sim,id,player,now,reset=false){
 player.actorId=id;
 if(!sim.match || sim.match.state!=='active')return;
 if(reset || player.matchId!==sim.match.id){player.combat=newCombatStats();player.score=0;player.matchId=sim.match.id;player.health=100;player.ammo=120;player.fuel=100;player.contributors={};player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;}
 sim.match.participants[id] ||= {id,username:player.username,joinedAt:now};sim.match.participants[id].username=player.username;
}
export function matchRows(sim,now){
 return Object.values(sim.match?.participants||{}).map(participant=>{
  const player=sim.players[participant.id],stats={...newCombatStats(),...(player?.combat||{})};
  return {...participant,...stats,score:player?.score||0,items:[...(stats.itemsCollected||[])],kills:stats.enemyKills+stats.playerKills,accuracy:stats.shots?Number((100*stats.hits/stats.shots).toFixed(1)):0,damageDealt:Number(stats.damageDealt.toFixed(2)),damageTaken:Number(stats.damageTaken.toFixed(2)),health:player?.health||0,connected:Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000)};
 }).sort((a,b)=>b.score-a.score||b.kills-a.kills||a.id.localeCompare(b.id));
}
export function finishMatch(sim,outcome,now){
 if(!sim.match || sim.match.state!=='active')return;
 sim.match.state='finished';sim.match.outcome=outcome;sim.match.endedAt=now;sim.match.results=matchRows(sim,now);
 if(sim.radTox){sim.radTox.state='finished';sim.radTox.nextWaveAt=null;}
 sim.matchHistory ||= [];sim.matchHistory.push(structuredClone(sim.match));sim.matchHistory=sim.matchHistory.slice(-5);
 for(const player of Object.values(sim.players))if(player.health<=0)player.input={};
}
export function checkTeamDefeat(sim,now){
 if(sim.match?.state!=='active')return;
 const online=Object.keys(sim.match.participants).map(id=>sim.players[id]).filter(player=>player&&player.radToxReady!==false&&!player.replacedByRoom&&now-player.lastSeen<15000);
 if(online.length && online.every(player=>player.health<=0))finishMatch(sim,'defeat',now);
}
export function matchView(sim,now){if(!sim.match)return null;return {...sim.match,results:sim.match.results||matchRows(sim,now)};}
