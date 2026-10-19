import {advanceRadTox,supportsRadTox,radToxWorldForLevel,RAD_TOX_AUTHORED_WORLDS} from './rad-tox-campaign.mjs';
import {RAD_TOX_SCORE_FIELDS} from './public/js/rad-tox-score-reporter.js';
import {matchRows,registerParticipant} from './rpg-match.mjs';

// Persist the clock, phase and score receipts once for the whole authored
// tournament. Rooms are projections; their player movement stays room-local.
const REGISTRY='__radToxTournaments';
function registry(rooms){const data=rooms[REGISTRY] ||= {tournaments:{},aliases:{}};data.groups ||= {};return data;}
function resolveId(data,id){const seen=new Set();while(data.aliases[id]&&!seen.has(id)){seen.add(id);id=data.aliases[id];}return id;}
const groupFor=id=>RAD_TOX_AUTHORED_WORLDS.has(id)?'authored':'world:'+id;
const simulations=(sim,rooms)=>[...new Set([sim,...Object.values(rooms).map(room=>room?.simulation).filter(Boolean)])];
function mergeTournaments(source,target,rooms,world,now){
 const data=registry(rooms);if(source.id===target.id)return;
 target.participants ||= {};
 for(const [id,incoming]of Object.entries(source.participants||{})){
  const current=target.participants[id];if(!current){target.participants[id]=structuredClone(incoming);continue;}
  for(const key of [...RAD_TOX_SCORE_FIELDS,'earnedMzk','rewardCount'])current[key]=(current[key]||0)+(incoming[key]||0);
  current.joinedAt=Math.min(current.joinedAt||Infinity,incoming.joinedAt||Infinity);
  current.itemsCollected=[...new Set([...(current.itemsCollected||[]),...(incoming.itemsCollected||[])])];
  for(const [kind,count]of Object.entries(incoming.rewards||{})){
   current.rewards ||= {};
   if(count&&typeof count==='object'){const totals=current.rewards[kind] ||= {};for(const [name,value]of Object.entries(count))totals[name]=(Number(totals[name])||0)+(Number(value)||0);}
   else current.rewards[kind]=(Number(current.rewards[kind])||0)+(Number(count)||0);
  }
 }
 for(const [key,value]of Object.entries(source.rewardPhases||{})){target.rewardPhases ||= {};target.rewardPhases[key] ||= value;}
 const incoming=source.coordinator?.scoreLedger||world?.radToxScoreLedger,destination=target.coordinator?.scoreLedger;
 if(incoming&&destination){
  for(const [key,phase]of Object.entries(incoming.phases||{}))if(!destination.phases[key]){phase.closedAt ??= now;destination.phases[key]=phase;}
  destination.order=Object.keys(destination.phases).sort((a,b)=>destination.phases[a].startedAt-destination.phases[b].startedAt);
  while(destination.order.length>24)delete destination.phases[destination.order.shift()];
 }
 if(target.coordinator){
  const previous=[...(target.coordinator.matchHistory||[]),...(source.coordinator?.matchHistory||world?.matchHistory||[])];
  const match=source.coordinator?.match||world?.match;if(match&&match.id!==target.coordinator.match.id)previous.push(match);
  target.coordinator.matchHistory=[...new Map(previous.map(match=>[match.id,match])).values()].sort((a,b)=>a.startedAt-b.startedAt).slice(-5);
 }
 target.startedAt=Math.min(target.startedAt,source.startedAt);data.aliases[source.id]=target.id;delete data.tournaments[source.id];
}
function aggregatePlayers(worlds){
 const players={};
 for(const world of worlds)for(const [id,player]of Object.entries(world.players||{})){
  const previous=players[id];
  if(!previous||Boolean(previous.replacedByRoom)&&!player.replacedByRoom||Boolean(previous.replacedByRoom)===Boolean(player.replacedByRoom)&&(player.lastSeen||0)>=(previous.lastSeen||0))players[id]=player;
 }
 return players;
}
function coordinatorEnvironment(environment,coordinator){
 return {...environment,id:coordinator.campaign.environmentId||environment.id};
}
export function syncRadToxTournament(sim,rooms,{environment,now=Date.now()}={}){
 if(environment&&!supportsRadTox(environment))return null;
 const data=registry(rooms),group=sim.tournament?.coordinator?.group||(environment&&supportsRadTox(environment)?groupFor(environment.id):null);
 let id=sim.tournament&&resolveId(data,sim.tournament.id),activeId=group&&data.groups[group]&&resolveId(data,data.groups[group]);
 // Normal joins and reconnects attach to the same running or finished game.
 // They never create a fresh clock or implicitly restart a completed event.
 if(activeId&&data.tournaments[activeId]){
  const canonical=data.tournaments[activeId];
  if(sim.tournament&&id!==activeId)mergeTournaments(sim.tournament,canonical,rooms,sim,now);
  sim.tournament=canonical;id=activeId;
 }
 if(!sim.tournament)return null;
 const tournament=data.tournaments[id] ||= sim.tournament;sim.tournament=tournament;
 if(group)data.groups[group]=id;
 let coordinator=tournament.coordinator;
 if(!coordinator&&sim.radTox?.phaseId&&sim.match){
  if(group==='authored')sim.radTox.environmentId=radToxWorldForLevel(sim.radTox.level,environment.id);
  coordinator=tournament.coordinator={version:1,group:group||groupFor(sim.radTox.environmentId),campaign:sim.radTox,match:sim.match,
   scoreLedger:sim.radToxScoreLedger||{phases:{},order:[]},matchHistory:sim.matchHistory||[]};
 }
 const worlds=simulations(sim,rooms).filter(world=>world===sim||world.tournament&&resolveId(data,world.tournament.id)===id);
 for(const world of worlds)world.tournament=tournament;
 if(coordinator){
  const bind=world=>{world.radTox=coordinator.campaign;world.radTox.coordinated=true;world.match=coordinator.match;world.radToxScoreLedger=coordinator.scoreLedger;world.matchHistory=coordinator.matchHistory;};
  for(const world of worlds)bind(world);
  if(environment){
   const aggregate={...sim,players:aggregatePlayers(worlds),tournament};
   bind(aggregate);
   advanceRadTox(aggregate,now,coordinatorEnvironment(environment,coordinator),{coordinated:true});
   Object.assign(coordinator,{campaign:aggregate.radTox,match:aggregate.match,scoreLedger:aggregate.radToxScoreLedger,matchHistory:aggregate.matchHistory||[]});
   coordinator.campaign.coordinated=true;coordinator.campaign.transferId=coordinator.campaign.phaseId;
   // A phase clock can have advanced while a player was disconnected. Reset
   // match-local vitals only when their level changed, preserving earnings.
   for(const [playerId,player]of Object.entries(aggregate.players)){
    if(!player.replacedByRoom&&now-player.lastSeen<15000)registerParticipant(aggregate,playerId,player,now);
   }
   if(coordinator.match.state==='active')coordinator.match.results=matchRows(aggregate,now);
   tournament.connectedPlayers=Object.fromEntries(Object.entries(aggregate.players).map(([playerId,player])=>[playerId,{lastSeen:player.lastSeen,replaced:Boolean(player.replacedByRoom)}]));
   for(const world of worlds)bind(world);
  }
  const campaign=coordinator.campaign;
  Object.assign(tournament,{status:campaign.transition?.kind==='tournament'?'finished':'active',currentLevel:campaign.level,
   phaseId:campaign.phaseId,phaseKind:campaign.phaseKind,phaseState:campaign.state,wave:campaign.wave,
   environmentId:campaign.environmentId,phaseStartedAt:campaign.startedAt,phaseEndsAt:campaign.endsAt,
   nextPhaseAt:campaign.transition?.at??null,endedAt:campaign.transition?.kind==='tournament'?coordinator.match.endedAt:null});
 }
 for(const world of worlds)for(const [playerId,player]of Object.entries(world.players||{}))player.tournamentScore=tournament.participants[playerId]?.score||0;
 return tournament;
}
export function transferRadToxPlayer(sim,rooms,environment,playerId,command,now){
 if(!command.radToxFrom&&!command.radToxTransfer)return false;
 const source=rooms[command.radToxFrom]?.simulation;
 const fail=()=>{throw Object.assign(new Error('This RAD-TOX map transfer is no longer available. Rejoin the game from its current map.'),{statusCode:409});};
 if(!supportsRadTox(environment)||!source?.players?.[playerId])fail();
 const sourceTournament=syncRadToxTournament(source,rooms,{environment:{...environment,id:command.radToxFrom},now});
 const campaign=source.radTox;
 const knownTransfer=(campaign?.transferId||campaign?.phaseId)===command.radToxTransfer||Object.values(source.radToxScoreLedger?.phases||{}).some(phase=>phase.phaseId===command.radToxTransfer&&phase.participants.includes(playerId));
 if(!sourceTournament||campaign?.combatMode!=='local'||!knownTransfer||groupFor(command.radToxFrom)!==groupFor(environment.id))fail();
 // The destination reuses this exact phase ID, deadline and receipt ledger.
 sim.tournament=sourceTournament;syncRadToxTournament(sim,rooms,{environment,now});return true;
}
