import {isHockeyMap,createHockey} from './public/js/hockey-rules.js';
import {isArcadeMap,arcadeSettings,ARCADE_ATTRACTIONS} from './public/js/arcade-rules.js';
import {isBasketballEnvironment,BASKETBALL_DEFAULT_SETTINGS} from './public/js/basketball-rules.js';
import {isRangeMap} from './public/js/range-rules.js';

const MEMBER_TTL=15000;
const BASE_URL='https://match-directory.invalid/';
const clean=(value,fallback='',limit=100)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,limit)||fallback:fallback;
const count=(value,fallback,min=0,max=10)=>Number.isInteger(value)?Math.max(min,Math.min(max,value)):fallback;
const fresh=(at,now)=>typeof at==='number'&&Number.isFinite(at)&&now-at<MEMBER_TTL;
const roomAt=(store,id,fallback)=>{const rooms=store?.rooms||store;return rooms instanceof Map?rooms.get(id)||rooms.get(fallback):rooms?.[id]||rooms?.[fallback];};

// Keep runtime-specific launch parameters, while refusing external or incorrect
// runtimes. A directory link must always enter the selected public destination.
function launchUrl(map,game,mode,attractionId){
 const runtime=game==='hockey'?'hockey.html':game==='arcade'?'arcade.html':'model-explorer.html';
 let target=new URL(runtime,BASE_URL);
 try{
  const candidate=new URL(map.playUrl||runtime,BASE_URL);
  if(candidate.origin===new URL(BASE_URL).origin&&candidate.pathname==='/'+runtime)target=candidate;
 }catch{}
 target.searchParams.set('environment',map.id);
 target.searchParams.set('house',map.roomId||map.id);
 target.searchParams.set('autoplay','1');
 target.searchParams.set('mode',mode);
 target.searchParams.set('matchmaking','1');
 if(attractionId)target.searchParams.set('attraction',attractionId);
 target.hash='';
 return target.pathname.slice(1)+target.search;
}

function entry(map,game,status,slots,{hostName='',gameIndex,gameName,attractionId,canJoin=true,canSpectate=true}={}){
 const players=slots.filter(slot=>slot.occupied).length,capacity=slots.length,openSlots=capacity-players;
 return {
  id:`${map.id}:${game}${attractionId?':'+attractionId:''}`,
  mapId:map.id,mapName:clean(map.name,map.id),game,
  ...(gameIndex===undefined?{}:{gameIndex}),
  gameName:gameName|| (game==='hockey'?'Ice hockey':'Basketball'),
  ...(attractionId?{attractionId}:{}),
  status,players,capacity,openSlots,hostName:clean(hostName,'',32),
  joinUrl:launchUrl(map,game,'multiplayer',attractionId),
  spectateUrl:launchUrl(map,game,'spectator',attractionId),
  slots,canJoin:canJoin&&openSlots>0,canSpectate,
 };
}

function hockeyMatch(map,rooms,now){
 const stored=roomAt(rooms,map.roomId||map.id,map.id);
 const active=stored&&stored.seen instanceof Map&&[...stored.seen.values()].some(at=>fresh(at,now));
 const room=active?stored:null,state=room?.state||createHockey(map.builderScene?.gameplay?.hockey||map.hockey);
 const slots=state.players.filter(player=>!player.goalie&&!player.ejected).map(player=>({
  id:player.id,label:`${player.team===0?'Home':'Away'} · skater ${player.slot+1}`,
  occupied:Boolean(player.human&&fresh(room?.seen?.get(player.human),now)),
  name:player.human&&fresh(room?.seen?.get(player.human),now)?clean(player.name,'Player',32):'Open',
 }));
 const host=state.players.find(player=>player.human===state.host&&fresh(room?.seen?.get(player.human),now))||state.players.find(player=>player.human&&fresh(room?.seen?.get(player.human),now));
 const spectators=state.spectators.filter(player=>fresh(room?.seen?.get(player.id),now));
 return entry(map,'hockey',!room?'available':state.phase==='finished'?'finished':room.started?'playing':'waiting',slots,{hostName:host?.name,canSpectate:spectators.length<64});
}

function arcadeMatches(map,rooms,now){
 const stored=roomAt(rooms,map.roomId||map.id,map.id);
 const active=stored&&stored.members instanceof Map&&[...stored.members.values()].some(member=>fresh(member.at,now));
 const room=active?stored:null,config=room?.config||arcadeSettings(map.builderScene?.gameplay?.arcade||map.arcade);
 const games=room?ARCADE_ATTRACTIONS.slice(0,5).filter((_,index)=>index===room.game):ARCADE_ATTRACTIONS.slice(0,5).filter(attraction=>config.enabled.includes(attraction.id));
 return games.map(attraction=>{
  const gameIndex=ARCADE_ATTRACTIONS.indexOf(attraction),teamSize=gameIndex===2&&config.basketballMode==='full'?config.teamSize:1;
  const slots=(room?.slots||Array.from({length:teamSize*2},()=>({}))).map((slot,index)=>({
   id:String(index),label:teamSize>1?`${index<teamSize?'Home':'Away'} · player ${index%teamSize+1}`:`Player ${index+1}`,
   occupied:Boolean(slot.actor&&room?.members.get(slot.actor)?.role==='player'&&fresh(room.members.get(slot.actor).at,now)),
   name:slot.actor&&room?.members.get(slot.actor)?.role==='player'&&fresh(room.members.get(slot.actor).at,now)?clean(slot.name,'Player',32):'Open',
  }));
  const host=room?.slots.find(slot=>slot.actor===room.host&&room.members.get(slot.actor)?.role==='player'&&fresh(room.members.get(slot.actor).at,now))||room?.slots.find(slot=>slot.actor&&room.members.get(slot.actor)?.role==='player'&&fresh(room.members.get(slot.actor).at,now));
  const state=room?.match.snapshot();
  const members=room?[...room.members.values()].filter(member=>fresh(member.at,now)).length:0;
  return entry(map,'arcade',!room?'available':state.ended?'finished':room.started?'playing':'waiting',slots,{gameIndex,gameName:attraction.name,attractionId:attraction.id,hostName:host?.name,canSpectate:members<66});
 });
}

function basketballMatch(map,rooms,now){
 const sim=roomAt(rooms,map.roomId||map.id,map.id)?.simulation,match=sim?.basketball;
 const settings={...BASKETBALL_DEFAULT_SETTINGS,...match?.settings};
 const teamSize=count(settings.teamSize,5,1,5);
 const people=Object.entries(sim?.players||{}).filter(([,player])=>!player.basketballAI&&!player.replacedByRoom&&fresh(player.lastSeen,now));
 const roster=people.filter(([,player])=>player.basketballRole!=='spectator'&&player.health>0);
 const slots=['home','away'].flatMap(team=>{
  const humans=roster.filter(([,player])=>player.basketballTeam===team);
  return Array.from({length:Math.min(teamSize,count(settings[team+'Humans'],5,0,5))},(_,index)=>({
   id:`${team}-${index}`,label:`${team==='home'?'Home':'Away'} · player ${index+1}`,
   occupied:Boolean(humans[index]),name:humans[index]?clean(humans[index][1].username,'Player',32):'Open',
  }));
 });
 const host=roster.find(([id])=>id===(match?.host||match?.hostId))||roster[0];
 const status=match?.state==='live'?'playing':match?.state==='finished'?'finished':roster.length?'waiting':'available';
 return entry(map,'basketball',status,slots,{hostName:host?.[1].username,canJoin:status!=='playing'});
}

function rangeMatch(map,rooms,now){
 const stored=roomAt(rooms,map.roomId||map.id,map.id);
 const people=stored?.members instanceof Map?[...stored.members.entries()].filter(([,member])=>fresh(member.at,now)):[];
 const room=people.length?stored:null,players=people.filter(([,member])=>member.role==='player');
 const capacity=count(room?.capacity,5,1,16);
 const slots=Array.from({length:capacity},(_,index)=>{
  const person=players[index];
  return {id:String(index),label:`Lane ${index+1}`,occupied:Boolean(person),name:person?clean(person[1].name,'Player',32):'Open'};
 });
 const host=players.find(([actor])=>actor===room?.host)||players[0];
 const status=!room?'available':room.finished?'finished':room.started?'playing':'waiting';
 return entry(map,'firing-range',status,slots,{gameName:'Firing range',hostName:host?.[1].name,canJoin:status==='waiting'||status==='available',canSpectate:false});
}

/** A read-only snapshot: never advances games, changes rosters or claims slots. */
export function listGameMatches({environments=[],hockeyRooms,arcadeRooms,rangeRooms,sharedRooms={},now=Date.now()}={}){
 const matches=[],seen=new Set();
 for(const map of Array.isArray(environments)?environments:[]){
  if(!map||typeof map.id!=='string'||!map.id||map.id.length>200||/[\u0000-\u001f\u007f]/.test(map.id)||seen.has(map.id)||map.playable===false||map.multiplayer===false||map.visibility&&map.visibility!=='public')continue;
  seen.add(map.id);
  if(isHockeyMap(map))matches.push(hockeyMatch(map,hockeyRooms,now));
  else if(isArcadeMap(map))matches.push(...arcadeMatches(map,arcadeRooms,now));
  else if(isBasketballEnvironment(map))matches.push(basketballMatch(map,sharedRooms,now));
  else if(isRangeMap(map))matches.push(rangeMatch(map,rangeRooms,now));
 }
 const rank=match=>match.status==='waiting'&&match.canJoin?0:match.status==='available'&&match.canJoin?1:match.status==='waiting'?2:match.status==='playing'?3:4;
 return matches.sort((a,b)=>rank(a)-rank(b)||b.players-a.players||a.mapName.localeCompare(b.mapName)||a.id.localeCompare(b.id));
}
