import {seedRadToxLevel,supportsRadTox} from './rad-tox-campaign.mjs';
import {RAD_TOX_SCORE_FIELDS} from './public/js/rad-tox-score-reporter.js';

// Rooms share one tournament ledger across the authored map sequence. Rebind
// after loading JSON, which does not preserve shared object references.
const REGISTRY='__radToxTournaments';
function registry(rooms){return rooms[REGISTRY] ||= {tournaments:{},aliases:{}};}
function resolveId(data,id){const seen=new Set();while(data.aliases[id]&&!seen.has(id)){seen.add(id);id=data.aliases[id];}return id;}
export function syncRadToxTournament(sim,rooms){
 if(!sim.tournament)return null;
 const data=registry(rooms),id=resolveId(data,sim.tournament.id);
 const tournament=data.tournaments[id] ||= sim.tournament;
 sim.tournament=tournament;
 for(const other of Object.values(rooms)){
  const world=other.simulation;
  if(world?.tournament&&resolveId(data,world.tournament.id)===id)world.tournament=tournament;
 }
 for(const world of new Set([sim,...Object.values(rooms).map(room=>room.simulation)])){
  if(world?.tournament!==tournament)continue;
  for(const [playerId,player]of Object.entries(world.players))player.tournamentScore=tournament.participants[playerId]?.score||0;
 }
 return tournament;
}
function mergeTournaments(source,target,rooms){
 const data=registry(rooms);
 if(source.id===target.id)return;
 for(const [id,incoming]of Object.entries(source.participants||{})){
  const current=target.participants[id];
  if(!current){target.participants[id]=structuredClone(incoming);continue;}
  for(const key of RAD_TOX_SCORE_FIELDS)current[key]=(current[key]||0)+(incoming[key]||0);
  current.joinedAt=Math.min(current.joinedAt||Infinity,incoming.joinedAt||Infinity);
 }
 target.startedAt=Math.min(target.startedAt,source.startedAt);
 data.aliases[source.id]=target.id;delete data.tournaments[source.id];
}

export function transferRadToxPlayer(sim,rooms,environment,playerId,command,now){
 if(!command.radToxFrom&&!command.radToxTransfer)return false;
 const source=rooms[command.radToxFrom]?.simulation,campaign=source?.radTox;
 const fail=()=>{throw Object.assign(new Error('This RAD-TOX map transfer is no longer available. Rejoin the game from its current map.'),{statusCode:409});};
 if(!supportsRadTox(environment)||!source?.players?.[playerId]||campaign?.combatMode!=='local'||campaign.environmentId!==environment.id||
    (campaign.transferId||campaign.phaseId)!==command.radToxTransfer)fail();
 const sourceTournament=syncRadToxTournament(source,rooms);
 if(!sourceTournament)fail();
 let targetTournament=syncRadToxTournament(sim,rooms);
 const occupied=Object.entries(sim.players).some(([id,player])=>id!==playerId&&!player.basketballAI&&!player.replacedByRoom&&now-player.lastSeen<15000);
 const sameCampaign=targetTournament?.id===sourceTournament.id&&sim.radTox?.level===campaign.level;
 // First arrival opens the next authored level. Later arrivals join that exact
 // running phase; an occupied public map keeps its current game and clocks.
 if(!sameCampaign&&(!occupied||!sim.radTox)){
  if(targetTournament&&targetTournament.id!==sourceTournament.id)mergeTournaments(targetTournament,sourceTournament,rooms);
  sim.tournament=sourceTournament;seedRadToxLevel(sim,environment,now,campaign.level);
 }else if(targetTournament&&targetTournament.id!==sourceTournament.id){
  mergeTournaments(sourceTournament,targetTournament,rooms);
 }
 syncRadToxTournament(sim,rooms);return true;
}
