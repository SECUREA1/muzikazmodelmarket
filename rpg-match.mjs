import {randomUUID} from 'node:crypto';
import {healthAfterHit} from './public/js/rpg-combat-rules.js';
export {PLAYER_HIT_CAPACITY} from './public/js/rpg-combat-rules.js';
export const SPAWN_PROTECTION_MS=3000;
export function newCombatStats(){return {shots:0,hits:0,misses:0,enemyHits:0,playerHits:0,enemyKills:0,playerKills:0,assists:0,deaths:0,hitsTaken:0,damageDealt:0,damageTaken:0,score:0,itemsCollected:[]};}
export function combatStats(player){return player.combat ||= newCombatStats();}
const TOURNAMENT_STATS=['shots','hits','misses','enemyHits','playerHits','enemyKills','playerKills','bossKills','assists','deaths','hitsTaken','damageDealt','damageTaken','score'];
export function recordTournamentScore(sim,playerId,delta,now){
 const player=sim.players[playerId];if(!player)return null;
 const tournament=sim.tournament ||= {id:randomUUID(),startedAt:now,participants:{}};tournament.participants ||= {};
 const row=tournament.participants[playerId] ||= {id:playerId,username:player.username,joinedAt:now,...Object.fromEntries(TOURNAMENT_STATS.map(key=>[key,0]))};
 row.username=player.username;
 row.earnedMzk ||= 0;row.rewardCount ||= 0;row.rewards ||= {mzk:0,supplies:{},catalog:{}};row.itemsCollected ||= [];
 for(const key of TOURNAMENT_STATS){const value=Number(delta?.[key]);if(Number.isFinite(value)&&value>0)row[key]=(Number(row[key])||0)+value;}
 player.tournamentScore=row.score;
 return row;
}
// Canonical wallet receipts are the source of tournament earnings. A room
// retry, reconnect, or lost database response cannot add a pickup twice.
export function recordTournamentRewards(sim,playerId,phase,receipts,now){
 const row=recordTournamentScore(sim,playerId,{},now);if(!row)return null;
 const ledger=sim.tournament.rewardPhases ||= {},key=phase.matchId+':'+phase.phaseId;
 const claims=(ledger[key] ||= {})[playerId] ||= {};
 const addReceipt=(target,receipt)=>{
  target.earnedMzk=(target.earnedMzk||0)+(Number(receipt.amountMzk)||0);target.rewardCount=(target.rewardCount||0)+1;
  const previous=target.rewards||{};const rewards=target.rewards={mzk:(Number(previous.mzk)||0)+(Number(receipt.amountMzk)||0),supplies:{...previous.supplies},catalog:{...previous.catalog}};
  if(receipt.resource&&Number.isFinite(receipt.amount))rewards.supplies[receipt.resource]=(rewards.supplies[receipt.resource]||0)+receipt.amount;
  if(receipt.catalogId)rewards.catalog[receipt.catalogId]=(rewards.catalog[receipt.catalogId]||0)+1;
 };
 for(const receipt of receipts){
  if(!receipt?.claimId||claims[receipt.claimId])continue;
  claims[receipt.claimId]=true;
  addReceipt(row,receipt);
  if(receipt.catalogId&&!row.itemsCollected.includes(receipt.catalogId))row.itemsCollected.push(receipt.catalogId);
  const player=sim.players[playerId];
  if(player?.matchId===phase.matchId)addReceipt(combatStats(player),receipt);
  for(const match of new Set([sim.match,...(sim.matchHistory||[])])){
   if(match?.id!==phase.matchId||!match.results)continue;
   const result=match.results.find(entry=>entry.id===playerId);if(result)addReceipt(result,receipt);
  }
 }
 const active=sim.tournament.coordinator?.scoreLedger?.phases;
 if(active)for(const old of Object.keys(ledger))if(!active[old])delete ledger[old];
 return row;
}
export function tournamentView(sim,now){
 if(!sim.tournament)return null;
 const results=Object.values(sim.tournament.participants||{}).map(row=>{
  const player=sim.players[row.id],connection=sim.tournament.connectedPlayers?.[row.id];return {...row,kills:(row.enemyKills||0)+(row.playerKills||0),accuracy:row.shots?Number((100*row.hits/row.shots).toFixed(1)):0,connected:connection?Boolean(!connection.replaced&&now-connection.lastSeen<15000):Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000)};
 }).sort((a,b)=>b.score-a.score||b.kills-a.kills||a.id.localeCompare(b.id));
 const tournament=sim.tournament;
 return {id:tournament.id,startedAt:tournament.startedAt,status:tournament.status||'active',currentLevel:tournament.currentLevel??sim.radTox?.level??1,phaseId:tournament.phaseId??sim.radTox?.phaseId,phaseKind:tournament.phaseKind??sim.radTox?.phaseKind,phaseState:tournament.phaseState??sim.radTox?.state,wave:tournament.wave??sim.radTox?.wave,environmentId:tournament.environmentId??sim.radTox?.environmentId,phaseStartedAt:tournament.phaseStartedAt??sim.radTox?.startedAt,phaseEndsAt:tournament.phaseEndsAt??sim.radTox?.endsAt,nextPhaseAt:tournament.nextPhaseAt??sim.radTox?.transition?.at??null,endedAt:tournament.endedAt??null,serverTime:now,results};
}
export function healPlayer(player,amount){player.health=Math.min(100,Math.max(0,player.health)+amount);player.lifeRevision=(player.lifeRevision||0)+1;return player.health;}
export function damagePlayer(player,now,attacker=null){
 if(player.health<=0 || now<(player.shieldUntil||0) || now<(player.spawnProtectedUntil||0))return false;
 const before=player.health;player.health=Number(healthAfterHit(before).toFixed(6));
 const damage=before-player.health,taken=combatStats(player);taken.hitsTaken++;taken.damageTaken+=damage;
 if(attacker){combatStats(attacker).damageDealt+=damage;player.lastDamager=attacker.actorId;}
 if(player.health===0){taken.deaths++;player.input={};if(attacker){const stats=combatStats(attacker);stats.playerKills++;stats.score+=25;attacker.score+=25;}}
 return true;
}
export function openMatch(sim,level,now){
 const match=sim.match={id:randomUUID(),level,startedAt:now,state:'active',participants:{},endedAt:null,outcome:null,results:null};
 for(const [id,player]of Object.entries(sim.players))if(!player.basketballAI&&!player.replacedByRoom&&now-player.lastSeen<15000)registerParticipant(sim,id,player,now,true);
 return match;
}
export function registerParticipant(sim,id,player,now,reset=false){
 player.actorId=id;
 if(!sim.match || sim.match.state!=='active')return;
 if(reset || player.matchId!==sim.match.id){player.combat=newCombatStats();player.score=0;player.matchId=sim.match.id;player.health=100;player.ammo=120;player.fuel=100;player.spray=24;player.contributors={};player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;player.lifeRevision=(player.lifeRevision||0)+1;}
 sim.match.participants[id] ||= {id,username:player.username,joinedAt:now};sim.match.participants[id].username=player.username;
 if(sim.radTox?.combatMode==='local')recordTournamentScore(sim,id,{},now);
}
export function matchRows(sim,now){
 return Object.values(sim.match?.participants||{}).map(participant=>{
  const player=sim.players[participant.id],saved=sim.match?.results?.find(row=>row.id===participant.id);
  if(!player||player.matchId!==sim.match.id){if(saved)return {...saved,connected:Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000)};}
  const stats={...newCombatStats(),earnedMzk:0,rewardCount:0,rewards:{mzk:0,supplies:{},catalog:{}},...(player?.combat||{})};
  return {...participant,...stats,score:player?.score||0,items:[...(stats.itemsCollected||[])],kills:stats.enemyKills+stats.playerKills,accuracy:stats.shots?Number((100*stats.hits/stats.shots).toFixed(1)):0,damageDealt:Number(stats.damageDealt.toFixed(2)),damageTaken:Number(stats.damageTaken.toFixed(2)),health:player?.health||0,connected:Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000)};
 }).sort((a,b)=>b.score-a.score||b.kills-a.kills||a.id.localeCompare(b.id));
}
export function finishMatch(sim,outcome,now){
 if(!sim.match || sim.match.state!=='active')return;
 sim.match.state='finished';sim.match.outcome=outcome;sim.match.endedAt=now;sim.match.results=matchRows(sim,now);
 if(sim.radTox){sim.radTox.state='finished';sim.radTox.nextWaveAt=null;}
 sim.matchHistory ||= [];sim.matchHistory.push(structuredClone(sim.match));sim.matchHistory=sim.matchHistory.slice(-5);
 for(const player of Object.values(sim.players))player.input={};
}
export function checkTeamDefeat(sim,now){
 if(sim.match?.state!=='active'||sim.radTox?.combatMode==='local')return;
 const online=Object.keys(sim.match.participants).map(id=>sim.players[id]).filter(player=>player&&!player.replacedByRoom&&now-player.lastSeen<15000);
 if(online.length && online.every(player=>player.health<=0))finishMatch(sim,'defeat',now);
}
export function matchView(sim,now){if(!sim.match)return null;return {...sim.match,results:sim.match.results||matchRows(sim,now)};}
