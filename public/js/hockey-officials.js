/** Shared officiating. These functions are called by the simulation, never by raw network commands. */
export const HOCKEY_TIERS = Object.freeze({
 easy: {name:'Rookie',speed:5.4,reaction:.75,saveReach:.42,accuracy:.55},
 normal: {name:'Club',speed:6.5,reaction:.55,saveReach:.48,accuracy:.35},
 pro: {name:'Pro',speed:7.3,reaction:.35,saveReach:.58,accuracy:.22},
 elite: {name:'Elite',speed:7.8,reaction:.2,saveReach:.68,accuracy:.12}
});
export const PENALTY_RULES = Object.freeze({
 interference:{label:'Interference',seconds:120},tripping:{label:'Tripping',seconds:120},hooking:{label:'Hooking',seconds:120},holding:{label:'Holding',seconds:120},slashing:{label:'Slashing',seconds:120},
 'high-sticking':{label:'High-sticking',seconds:120},'double-minor':{label:'High-sticking · double minor',seconds:240,segments:2},
 boarding:{label:'Boarding',seconds:120},charging:{label:'Charging',seconds:120},elbowing:{label:'Elbowing',seconds:120},roughing:{label:'Roughing',seconds:120},
 'goalie-interference':{label:'Goaltender interference',seconds:120},'delay-of-game':{label:'Delay of game',seconds:120},'too-many-men':{label:'Too many players',seconds:120},
 major:{label:'Dangerous contact · major',seconds:300,major:true},fighting:{label:'Fighting · major',seconds:300,major:true},
 misconduct:{label:'Misconduct',seconds:600,substitute:true},'game-misconduct':{label:'Game misconduct',seconds:0,substitute:true,eject:true},'match-penalty':{label:'Match penalty',seconds:300,major:true,eject:true}
});
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
export function recordHockeyEvent(s,type,message,fields={}){
 s.eventSequence=(s.eventSequence||0)+1;s.events ||= [];s.events.push({id:s.eventSequence,type,message,period:s.period,time:s.remaining,...fields});if(s.events.length>100)s.events.shift();
}
export function initializeOfficials(s){
 s.events=[];s.eventSequence=0;s.delayedPenalties=[];s.delayedOffside=[false,false];s.goaliesPulled=[false,false];s.stats={shots:[0,0],saves:[0,0],hits:[0,0],penaltyMinutes:[0,0],faceoffs:[0,0]};s.shootout=null;s.spectators=[];s.timeouts=[false,false];s.icingTeam=null;
 for(const p of s.players)Object.assign(p,{penaltySegments:[],misconduct:0,ejected:false,stamina:1,line:0,shiftTime:0,onIce:true});
}
export function assessPenalty(s,player,type='interference',{delayed=false,coincidental=false}={}){
 const rule=PENALTY_RULES[type];if(!rule||!player||s.config.penalties===false)return false;
 if(delayed&&s.puck.owner&&s.players.find(p=>p.id===s.puck.owner)?.team!==player.team){
  if(!s.delayedPenalties.some(p=>p.playerId===player.id))s.delayedPenalties.push({playerId:player.id,type,coincidental});s.referees.forEach(r=>r.signal='delayed-penalty');return 'delayed';
 }
 if(rule.eject)player.ejected=true;
 if(rule.substitute||coincidental){player.misconduct=Math.max(player.misconduct||0,rule.seconds);}
 else{const count=rule.segments||1;for(let i=0;i<count;i++)player.penaltySegments.push({type,remaining:rule.seconds/count,major:!!rule.major,at:s.eventSequence||0});player.penalty=player.penaltySegments.reduce((n,p)=>n+p.remaining,0);}
 s.stats.penaltyMinutes[player.team]+=rule.seconds/60;
 recordHockeyEvent(s,'penalty',`${rule.label} · ${rule.seconds/60} min`,{playerId:player.id,team:player.team,penalty:type});return true;
}
export function enforceDelayedPenalties(s){
 const pending=s.delayedPenalties.splice(0);for(const penalty of pending)assessPenalty(s,s.players.find(p=>p.id===penalty.playerId),penalty.type,penalty);
 return pending.length>0;
}
export function stepPenaltyClocks(s,dt){
 if(s.phase!=='playing')return;
 for(const team of [0,1]){
  const serving=s.players.filter(p=>p.team===team&&p.penaltySegments?.length).sort((a,b)=>a.penaltySegments[0].at-b.penaltySegments[0].at).slice(0,2);
  for(const p of serving){const segment=p.penaltySegments[0];segment.remaining=Math.max(0,segment.remaining-dt);if(segment.remaining===0){p.penaltySegments.shift();recordHockeyEvent(s,'penalty-expired','Penalty served',{playerId:p.id});}p.penalty=p.penaltySegments.reduce((n,part)=>n+part.remaining,0);}
 }
 for(const p of s.players){p.misconduct=Math.max(0,(p.misconduct||0)-dt);if(!p.penaltySegments?.length)p.penalty=Math.max(0,p.penalty-dt);}
}
export function manpower(s,team){
 const penalties=Math.min(2,s.players.filter(p=>p.team===team&&p.penalty>0).length),other=Math.min(2,s.players.filter(p=>p.team!==team&&p.penalty>0).length);
 const overtime=s.period>3&&s.config.overtime==='regular';return overtime?Math.min(5,3+Math.max(0,other-penalties)):Math.max(3,5-penalties);
}
export function updateHockeyLineup(s){
 for(const team of [0,1]){
  const serving=new Set(s.players.filter(p=>p.team===team&&p.penalty>0).sort((a,b)=>(a.penaltySegments?.[0]?.at||0)-(b.penaltySegments?.[0]?.at||0)).slice(0,2).map(p=>p.id));
  for(const p of s.players.filter(p=>p.team===team))p.queuedReplacement=p.penalty>0&&!serving.has(p.id);
  const available=s.players.filter(p=>p.team===team&&!p.goalie&&!serving.has(p.id)),count=manpower(s,team);
  const selected=new Set(available.sort((a,b)=>Number(!!b.human)-Number(!!a.human)||a.slot-b.slot).slice(0,count).map(p=>p.id));
  for(const p of s.players.filter(p=>p.team===team))p.onIce=p.goalie?!s.goaliesPulled[team]:selected.has(p.id);
  if(s.goaliesPulled[team])s.players.find(p=>p.team===team&&p.goalie).onIce=true;
 }
}
export function releasePowerPlayPenalty(s,scoring){
 if(manpower(s,scoring)<=manpower(s,1-scoring))return;
 const player=s.players.filter(p=>p.team!==scoring&&p.penaltySegments?.[0]&&!p.penaltySegments[0].major).sort((a,b)=>a.penaltySegments[0].at-b.penaltySegments[0].at)[0];
 if(player){player.penaltySegments.shift();player.penalty=player.penaltySegments.reduce((n,p)=>n+p.remaining,0);recordHockeyEvent(s,'penalty-released','Minor penalty released by power-play goal',{playerId:player.id});}
}
export function changeHockeyLine(s,id){
 const p=s.players.find(p=>p.human===id);if(!p||p.penalty>0||p.misconduct>0||p.ejected)return false;
 if(s.phase==='faceoff'&&s.icingTeam===p.team)return false;if(s.phase==='playing'&&Math.abs(p.z)<10)return false;p.line=(p.line+1)%3;p.stamina=1;p.shiftTime=0;recordHockeyEvent(s,'line-change','Fresh line joins the ice',{team:p.team,line:p.line+1});return true;
}
export function toggleHockeyGoalie(s,id){const p=s.players.find(p=>p.human===id);if(!p||s.phase==='finished'||s.phase==='shootout')return false;s.goaliesPulled[p.team]=!s.goaliesPulled[p.team];recordHockeyEvent(s,'goalie-change',s.goaliesPulled[p.team]?'Goalie pulled for extra attacker':'Goalie returned',{team:p.team});return true;}
export function switchHockeyPlayer(s,id){
 const p=s.players.find(p=>p.human===id);if(!p)return false;const puck=s.puck,other=s.players.filter(q=>q.team===p.team&&!q.goalie&&!q.human&&q.penalty<=0&&q.onIce&&!q.ejected).sort((a,b)=>Math.hypot(a.x-puck.x,a.z-puck.z)-Math.hypot(b.x-puck.x,b.z-puck.z))[0];
 if(!other)return false;other.human=id;other.name=p.name;p.human=null;p.name='AI skater';p.input={};other.input={};return true;
}
export function pendingOffside(s,previousX,direction,blue){
 if(!s.config.offside)return null;
 for(const team of [0,1]){
  const d=direction(s,team),ahead=s.players.filter(p=>p.team===team&&!p.goalie&&p.onIce&&p.penalty<=0&&p.x*d>blue+.35);
  if(!ahead.length||s.puck.x*d<blue)s.delayedOffside[team]=false;
  if(s.puck.lastTeam===team&&previousX*d<blue&&s.puck.x*d>=blue&&ahead.length)s.delayedOffside[team]=true;
  if(s.delayedOffside[team]){
   const owner=s.players.find(p=>p.id===s.puck.owner);
   if(s.config.offsideMode==='immediate'||owner?.team===team)return {x:d*(blue-1.524),z:s.puck.z>0?6.7056:-6.7056,reason:'Offside'};
  }
 }
 return null;
}
export function startHockeyShootout(s){s.phase='shootout';s.goaliesPulled=[false,false];s.shootout={round:1,turn:0,attempts:[[],[]],timer:0,active:false,shooterId:null};recordHockeyEvent(s,'shootout','Three-round shootout');}
export function shootoutDecision(shootout){
 const [home,away]=shootout.attempts,goals=list=>list.filter(Boolean).length,h=goals(home),a=goals(away),remainingHome=Math.max(0,3-home.length),remainingAway=Math.max(0,3-away.length);
 if(h>a+remainingAway)return 0;if(a>h+remainingHome)return 1;if(home.length>=3&&home.length===away.length&&h!==a)return h>a?0:1;return null;
}
export function sanitizeHockeyInput(i={}){i=i&&typeof i==='object'?i:{};const limit=(v,a,b)=>Math.max(a,Math.min(b,finite(v)));return {x:limit(i.x,-1,1),z:limit(i.z,-1,1),aimX:limit(i.aimX,-31,31),aimZ:limit(i.aimZ,-13,13),shoot:i.shoot===true,pass:i.pass===true,check:i.check===true,poke:i.poke===true,hook:i.hook===true,slash:i.slash===true,hold:i.hold===true,lift:i.lift===true};}

export function requestHockeyTimeout(s,id){const p=s.players.find(p=>p.human===id);if(!p||s.phase!=='faceoff'||s.timeouts[p.team])return false;s.timeouts[p.team]=true;s.phase='timeout';s.timeoutRemaining=30;s.whistle=`${p.team===0?'Home':'Visitors'} timeout`;recordHockeyEvent(s,'timeout',s.whistle,{team:p.team});return true;}
