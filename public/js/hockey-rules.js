/** Deterministic hockey simulation shared by solo play and the authoritative server. */
import {HOCKEY_TIERS,initializeOfficials,recordHockeyEvent,assessPenalty,enforceDelayedPenalties,stepPenaltyClocks,updateHockeyLineup,releasePowerPlayPenalty,pendingOffside,startHockeyShootout,shootoutDecision,sanitizeHockeyInput} from './hockey-officials.js';
import {sportsEnvironmentKind} from './sports-worlds.js';
export {HOCKEY_TIERS,PENALTY_RULES,assessPenalty,changeHockeyLine,toggleHockeyGoalie,switchHockeyPlayer,requestHockeyTimeout} from './hockey-officials.js';
export const RINK=Object.freeze({length:60.96,width:25.908,corner:8.534,goalX:27.1272,goalWidth:1.8288,goalHeight:1.2192,blue:7.62});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0)),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function hockeySettings(raw={}){
 const c=raw&&typeof raw==='object'?raw:{};
 return {aiFill:c.aiFill!==false,difficulty:HOCKEY_TIERS[c.difficulty]?c.difficulty:'easy',periodSeconds:clamp(c.periodSeconds||180,30,1200),icing:c.icing!==false,offside:c.offside!==false,penalties:c.penalties!==false,
  icingMode:c.icingMode==='automatic'?'automatic':'hybrid',offsideMode:c.offsideMode==='immediate'?'immediate':'delayed',overtime:c.mode==='tournament'||c.overtime==='playoff'?'playoff':'regular',
  mode:c.mode==='tournament'?'tournament':'exhibition',homeColor:/^#[\da-f]{6}$/i.test(c.homeColor)?c.homeColor:'#237ad4',awayColor:/^#[\da-f]{6}$/i.test(c.awayColor)?c.awayColor:'#dc3c56'};
}
export const isHockeyMap=environment=>sportsEnvironmentKind(environment)==='hockey';
export const attackDirection=(s,t)=>(t===0?1:-1)*(s.period%2===0?-1:1);
export function createHockey(raw={}){
 const config=hockeySettings(raw),players=[];
 for(let team=0;team<2;team++)for(let slot=0;slot<6;slot++)players.push({id:`${team}-${slot}`,team,slot,goalie:slot===5,human:null,name:slot===5?'AI goalie':'AI skater',x:0,z:0,vx:0,vz:0,yaw:0,penalty:0,cooldown:0,input:{},animation:'idle'});
 const s={version:2,config,players,score:[0,0],period:1,remaining:config.periodSeconds,elapsed:0,host:null,referees:[{x:0,z:10,role:'referee'},{x:0,z:-10,role:'referee'},{x:RINK.blue,z:11,role:'linesman'},{x:-RINK.blue,z:-11,role:'linesman'}],tournament:config.mode==='tournament'?{round:0,tier:config.difficulty,teams:['Home','Visitors','Ice Wolves','Northern Lights'],results:[],champion:null}:null};
 s.rosters=[0,1].map(team=>Array.from({length:20},(_,i)=>({id:`${team}-roster-${i}`,number:i+1,name:i===19?'Goaltender':`Skater ${i+1}`,position:i===19?'G':i%5<3?'F':'D'})));initializeOfficials(s);faceoff(s,0,0,'Opening faceoff');return s;
}
export function faceoff(s,x=0,z=0,reason='Faceoff'){
 enforceDelayedPenalties(s);s.delayedOffside=[false,false];s.phase='faceoff';s.delay=2;s.whistle=reason;s.puck={x,z,y:.03,vx:0,vz:0,vy:0,owner:null,lastTeam:null,lastPlayer:null,icing:null};s.faceoffSpot={x,z};s.faceoffPending=true;s.icingTeam=reason.startsWith('Icing')?(x*attackDirection(s,0)<0?0:1):null;updateHockeyLineup(s);
 for(const p of s.players){const d=attackDirection(s,p.team);p.x=p.goalie?-d*(RINK.goalX-.7):clamp(x-d*(p.slot<3?2.4:9),-24,24);p.z=p.goalie?0:clamp(z+[-1.2,-6,6,-7,7][p.slot],-11,11);p.vx=p.vz=0;p.animation='idle';if(p.penalty>0&&!p.queuedReplacement){p.x=p.team===0?-5:5;p.z=14.8;}else if(!p.onIce){p.x=(p.team===0?-10:10)+(p.slot-2)*.8;p.z=-14.8;}}
 s.referees.forEach(r=>r.signal=reason.startsWith('Goal')?'goal':'whistle');recordHockeyEvent(s,'stoppage',reason,{x,z});
}
export function joinHockey(s,id,name='Player',slotId=null){
 let p=s.players.find(p=>p.human===id);if(p&&(!slotId||p.id===slotId))return p;const previous=p;const counts=[0,1].map(t=>s.players.filter(p=>p.team===t&&p.human).length),team=counts[0]<=counts[1]?0:1;
 p=slotId?s.players.find(p=>p.id===slotId&&!p.human&&!p.goalie&&!p.ejected):s.players.find(p=>p.team===team&&!p.human&&!p.goalie&&!p.ejected)||(slotId?null:s.players.find(p=>!p.human&&!p.goalie&&!p.ejected));
 if(!p)throw Object.assign(Error('All ten skater positions are occupied. Choose spectator mode.'),{statusCode:409});if(previous){previous.human=null;previous.name='AI skater';previous.input={};}p.human=id;p.name=String(name).slice(0,32);p.input={};s.host ||= id;updateHockeyLineup(s);return p;
}
export function leaveHockey(s,id){const p=s.players.find(p=>p.human===id);if(p){p.human=null;p.name='AI skater';p.input={};}s.spectators=s.spectators.filter(p=>p.id!==id);if(s.host===id)s.host=s.players.find(p=>p.human)?.human||null;}
export function hockeyInput(s,id,i={}){const p=s.players.find(p=>p.human===id);if(!p)throw Object.assign(Error('Join this hockey room first.'),{statusCode:409});p.input=sanitizeHockeyInput(i);}
function release(s,p,pass){
 const d=attackDirection(s,p.team),mates=s.players.filter(q=>q.team===p.team&&q!==p&&!q.goalie&&q.onIce&&q.penalty<=0),tier=HOCKEY_TIERS[s.config.difficulty];
 let target=pass?mates.sort((a,b)=>(dist(p,a)-d*a.x*.3)-(dist(p,b)-d*b.x*.3))[0]:{x:d*RINK.goalX,z:Math.sin(s.elapsed*3)*(.8-tier.accuracy*.25)};
 if(!pass&&p.human&&Math.hypot(p.input.aimX-p.x,p.input.aimZ-p.z)>1)target={x:p.input.aimX,z:p.input.aimZ};target ||= {x:d*24,z:0};const dx=target.x-p.x,dz=target.z-p.z,l=Math.hypot(dx,dz)||1;
 Object.assign(s.puck,{owner:null,vx:dx/l*(pass?14:25),vz:dz/l*(pass?14:25),vy:p.input.lift&&!pass?7.8:0,y:.03,lastTeam:p.team,lastPlayer:p.id,
  icing:!pass&&p.x*d<0&&!s.players.some(q=>q.team===p.team&&q.penalty>0)?{team:p.team,direction:d,judged:false}:null});
 if(s.shootout?.active)s.shootout.shotTaken=true;if(!pass)s.stats.shots[p.team]++;p.cooldown=pass?.5:tier.reaction;p.animation=pass?'pass':'shoot';
}
function awardGoal(s,team){
 if(s.shootout?.active){completeShootoutAttempt(s,team===s.shootout.turn);return;}
 // A team cannot score while offside or while illegally occupying the crease.
 if(s.delayedOffside[team]){faceoff(s,attackDirection(s,team)*(RINK.blue-1.524),6.7056,'Offside • goal disallowed');return;}
 const goalie=s.players.find(p=>p.team!==team&&p.goalie),interferer=s.players.find(p=>p.team===team&&!p.goalie&&p.onIce&&dist(p,goalie)<.6&&Math.abs(p.x)>RINK.goalX-1.8);
 if(interferer&&!s.goaliesPulled[1-team]){assessPenalty(s,interferer,'goalie-interference');faceoff(s,0,0,'Goal disallowed • goaltender interference');return;}
 s.score[team]++;releasePowerPlayPenalty(s,team);
 // An impending minor is cancelled when the non-offending side scores.
 const pending=s.delayedPenalties.findIndex(p=>s.players.find(q=>q.id===p.playerId)?.team!==team&&p.type!=='major'&&p.type!=='match-penalty');if(pending>=0){if(s.delayedPenalties[pending].type==='double-minor')s.delayedPenalties[pending].type='high-sticking';else s.delayedPenalties.splice(pending,1);}
 recordHockeyEvent(s,'goal',`Goal • ${team===0?'Home':'Visitors'}`,{team});
 if(s.period>3)finish(s);else faceoff(s,0,0,`Goal • ${team===0?'Home':'Visitors'}`);
}
function finish(s,winner=s.score[0]>s.score[1]?0:1){
 s.phase='finished';s.winner=winner;s.whistle=`${winner===0?'Home':'Visitors'} win ${s.score.join(' – ')}`;recordHockeyEvent(s,'final',s.whistle,{winner});
 const t=s.tournament;if(!t)return;const teams=t.round===0?t.teams.slice(0,2):t.finalists,winningTeam=teams[winner];t.results.push({teams,score:[...s.score],winner:winningTeam});
 if(t.round===0){const ai=createHockey({...s.config,mode:'exhibition',overtime:'regular',periodSeconds:30});for(let n=0;n<60000&&ai.phase!=='finished';n++)stepHockey(ai,.05);
  const aiWinner=t.teams[(ai.winner??(ai.score[0]>=ai.score[1]?0:1))+2];t.results.push({teams:t.teams.slice(2),score:[...ai.score],winner:aiWinner,simulated:true});t.finalists=[winningTeam,aiWinner];
 }else{t.champion=winningTeam;t.completedTier=s.config.difficulty;}
}
export function nextHockeyGame(s,id){const t=s.tournament;if(s.phase!=='finished'||s.host!==id||!t||t.champion)return false;const winner=s.winner??(s.score[0]>s.score[1]?0:1),old=s.players.filter(p=>p.human),advancing=old.filter(p=>p.team===winner),next=createHockey(s.config);next.tournament={...t,round:t.round+1};next.host=advancing[0]?.human||null;next.spectators=[...s.spectators,...old.filter(p=>p.team!==winner).map(p=>({id:p.human,name:p.name,eliminated:true}))];for(const p of advancing)Object.assign(next.players.find(q=>q.team===0&&q.slot===p.slot),{human:p.human,name:p.name});Object.assign(s,next);faceoff(s,0,0,'Championship faceoff');return true;}
export function restartHockey(s,id){if(s.phase!=='finished'||s.host!==id)return false;const old=s.players.filter(p=>p.human).map(p=>({id:p.id,human:p.human,name:p.name})),fresh=createHockey(s.config);fresh.host=id;fresh.spectators=s.spectators;for(const p of old)Object.assign(fresh.players.find(q=>q.id===p.id),p);Object.assign(s,fresh);return true;}
export function startHockeyPenaltyShot(s,shooter){s.phase='shootout';s.shootout={kind:'penalty-shot',forcedShooterId:shooter.id,turn:shooter.team,round:1,attempts:[[],[]],timer:0,active:false,shooterId:null};recordHockeyEvent(s,'penalty-shot','Penalty shot awarded',{team:shooter.team,playerId:shooter.id});}
function setupShootoutAttempt(s){
 const so=s.shootout,team=so.turn,d=attackDirection(s,team),shooters=s.players.filter(p=>p.team===team&&!p.goalie&&!p.ejected),shooter=shooters.find(p=>p.id===so.forcedShooterId)||shooters[(so.attempts[team].length)%shooters.length];
 if(!shooter.human&&!so.forcedShooterId){const controller=shooters.find(p=>p.human);if(controller){shooter.human=controller.human;shooter.name=controller.name;shooter.input={};controller.human=null;controller.name='AI skater';controller.input={};}}
 for(const p of s.players){p.onIce=p.id===shooter.id||(p.goalie&&p.team!==team);p.vx=p.vz=0;if(!p.onIce){p.x=-12+p.slot*3;p.z=p.team===0?-14.5:14.5;}}
 shooter.x=0;shooter.z=0;shooter.cooldown=.3;shooter.yaw=d*Math.PI/2;const goalie=s.players.find(p=>p.goalie&&p.team!==team);goalie.x=d*(RINK.goalX-.7);goalie.z=0;goalie.cooldown=0;
 s.puck={x:shooter.x+d*.65,z:0,y:.03,vx:0,vz:0,vy:0,owner:shooter.id,lastTeam:team,lastPlayer:shooter.id,icing:null};so.timer=12;so.active=true;so.shotTaken=false;so.shooterId=shooter.id;s.whistle=`Shootout ${so.round} • ${team===0?'Home':'Visitors'}`;
}
function completeShootoutAttempt(s,goal){const so=s.shootout;if(!so?.active)return;if(so.kind==='penalty-shot'){const team=so.turn;s.shootout=null;s.phase='playing';if(goal)awardGoal(s,team);else faceoff(s,attackDirection(s,team)*21.0312,6.7056,'Penalty shot saved / missed');return;}so.attempts[so.turn].push(!!goal);recordHockeyEvent(s,'shootout-attempt',goal?'Shootout goal':'Shootout save / miss',{team:so.turn});so.active=false;so.timer=-1.5;const winner=shootoutDecision(so);if(winner!==null){s.score[winner]++;finish(s,winner);return;}so.turn=1-so.turn;so.round=Math.min(so.attempts[0].length,so.attempts[1].length)+1;}
export function stepHockey(s,delta){
 const dt=clamp(delta,0,.05);if(!dt||s.phase==='finished')return;s.elapsed+=dt;
 for(const p of s.players)p.cooldown=Math.max(0,p.cooldown-dt);stepPenaltyClocks(s,dt);
 if(s.phase==='timeout'){s.timeoutRemaining-=dt;if(s.timeoutRemaining<=0){s.phase='faceoff';s.delay=2;s.whistle='Timeout complete • faceoff';}return;}
 if(s.phase==='faceoff'){s.delay-=dt;if(s.delay<=0){s.phase='playing';s.referees.forEach(r=>r.signal='play');}return;}
 const shootout=s.phase==='shootout';
 if(shootout){const so=s.shootout;if(!so.active){so.timer+=dt;if(so.timer>=0)setupShootoutAttempt(s);return;}so.timer-=dt;if(so.timer<=0){completeShootoutAttempt(s,false);return;}}
 else{s.remaining-=dt;if(s.remaining<=0){
   if(s.period>=3&&s.score[0]!==s.score[1]){finish(s);return;}
   if(s.period===4&&s.config.overtime==='regular'){startHockeyShootout(s);return;}
   s.period++;s.remaining=s.period>3?(s.config.overtime==='regular'?300:1200):s.config.periodSeconds;s.goaliesPulled=[false,false];faceoff(s,0,0,s.period>3?'Sudden-death overtime':`Period ${s.period}`);return;
  }updateHockeyLineup(s);}
 const puck=s.puck,previousX=puck.x,owner=s.players.find(p=>p.id===puck.owner),tier=HOCKEY_TIERS[s.config.difficulty];
 const chasers=[0,1].map(t=>s.players.filter(p=>p.team===t&&(!p.goalie||s.goaliesPulled[t])&&p.onIce&&(p.penalty<=0||p.queuedReplacement)).sort((a,b)=>dist(a,puck)-dist(b,puck))[0]);
 for(const p of s.players){
  if((!shootout&&p.penalty>0&&!p.queuedReplacement)||!p.onIce){p.x=p.penalty>0?(p.team===0?-5:5)+s.players.filter(q=>q.team===p.team&&q.penalty>0&&q.slot<p.slot).length*.8:(p.team===0?-10:10)+(p.slot-2)*.8;p.z=p.penalty>0?14.8:-14.8;p.vx=p.vz=0;p.animation='idle';continue;}
  const goalie=p.goalie&&!s.goaliesPulled[p.team],d=attackDirection(s,p.team),controlled=p.human&&!p.ejected&&p.misconduct<=0&&!p.queuedReplacement;let i=controlled?p.input:{},tx=p.x,tz=p.z,shoot=i.shoot,pass=i.pass;
  p.shiftTime+=dt;p.stamina=clamp(p.stamina-(Math.hypot(p.vx,p.vz)>2?.0018:.0005)*dt,.5,1);
  if(!controlled){
   if(!goalie&&!s.config.aiFill){p.vx=p.vz=0;p.animation='idle';continue;}
   if(goalie){tx=-d*(RINK.goalX-.7);tz=clamp(puck.z*.4,-.85,.85);}
   else if(owner===p){tx=d*24;tz=Math.sin(s.elapsed+p.slot)*2;shoot=p.x*d>16;pass=!shoot&&Math.sin(s.elapsed*1.7+p.slot)>.995;}
   else if(chasers[p.team]===p){tx=puck.x;tz=puck.z;}
   else{tx=clamp(puck.x-d*(p.slot<3?3:9),-23,23);tz=clamp((p.slot%2?1:-1)*(p.slot<3?6:8)+puck.z*.15,-10,10);if(s.config.offside&&s.delayedOffside[p.team])tx=d*(RINK.blue-1);}
   const dx=tx-p.x,dz=tz-p.z,l=Math.hypot(dx,dz)||1;i={x:l>.3?dx/l:0,z:l>.3?dz/l:0};
   if(!goalie&&p.shiftTime>45&&Math.abs(p.z)>9){p.line=(p.line+1)%3;p.stamina=1;p.shiftTime=0;}
  }
  const l=Math.max(1,Math.hypot(i.x||0,i.z||0)),speed=(goalie?3.2:controlled?7.8:tier.speed)*(.8+p.stamina*.2);
  p.vx+=((i.x||0)/l*speed-p.vx)*Math.min(1,6*dt);p.vz+=((i.z||0)/l*speed-p.vz)*Math.min(1,6*dt);p.x+=p.vx*dt;p.z+=p.vz*dt;constrain(p,.4);blockNets(p);
  if(Math.hypot(p.vx,p.vz)>.2)p.yaw=Math.atan2(p.vx,p.vz);if(p.cooldown===0)p.animation=Math.hypot(p.vx,p.vz)>.5?'skate':'idle';
  if(owner===p&&p.cooldown===0&&(shoot||pass))release(s,p,pass);
  if(!shootout&&controlled&&p.cooldown===0&&(i.check||i.poke||i.hook||i.slash||i.hold)){
   p.cooldown=1;p.animation=i.check?'check':'pass';const victim=s.players.filter(q=>q.team!==p.team&&q.onIce&&dist(q,p)<1.8).sort((a,b)=>dist(a,p)-dist(b,p))[0];
   if(victim){let foul=null;
    if(victim.goalie&&!s.goaliesPulled[victim.team])foul='goalie-interference';else if(i.hook)foul='hooking';else if(i.hold)foul='holding';else if(i.slash)foul='slashing';else if(i.poke&&puck.y>1.45)foul='high-sticking';else if(i.poke&&owner!==victim&&dist(p,puck)>1.1)foul='tripping';else if(i.check&&owner!==victim)foul='interference';
    else if(i.check&&Math.abs(victim.z)>RINK.width/2-1.2&&Math.hypot(p.vx,p.vz)>5)foul='boarding';
    else if(i.check&&Math.hypot(p.vx-victim.vx,p.vz-victim.vz)>12)foul='major';
    if(foul){const victimDirection=attackDirection(s,victim.team),breakaway=owner===victim&&['hooking','tripping','slashing'].includes(foul)&&victim.x*victimDirection>RINK.blue&&p.x*victimDirection<victim.x*victimDirection&&!s.players.some(q=>q.team===p.team&&q!==p&&!q.goalie&&q.onIce&&q.x*victimDirection>victim.x*victimDirection);if(breakaway){startHockeyPenaltyShot(s,victim);return;}const delayed=owner&&owner.team!==p.team;assessPenalty(s,p,foul,{delayed});if(!delayed){faceoff(s,-d*21.0312,6.7056,`${foul==='interference'?'Interference':foul.replaceAll('-',' ')} • penalty`);return;}}
    else if(owner===victim){s.stats.hits[p.team]++;puck.owner=null;puck.vx=d*4;puck.vz=3;victim.cooldown=.8;}
   }
  }
 }
 for(let a=0;a<s.players.length;a++)for(let b=a+1;b<s.players.length;b++){const p=s.players[a],q=s.players[b];if(!p.onIce||!q.onIce||p.penalty>0||q.penalty>0)continue;const dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz);if(l<.65){const nx=l>1e-6?dx/l:1,nz=l>1e-6?dz/l:0,push=(.65-l)/2;p.x-=nx*push;p.z-=nz*push;q.x+=nx*push;q.z+=nz*push;constrain(p,.4);constrain(q,.4);}}
 if(puck.owner){const p=s.players.find(p=>p.id===puck.owner);puck.x=p.x+attackDirection(s,p.team)*.65;puck.z=p.z;puck.y=.03;
  if(s.delayedPenalties.some(call=>s.players.find(q=>q.id===call.playerId)?.team===p.team)){faceoff(s,-attackDirection(s,p.team)*21.0312,6.7056,'Delayed penalty • offending team touched puck');return;}
  const defender=chasers[1-p.team];if(!shootout&&defender&&dist(defender,p)<.8&&defender.cooldown===0&&Math.sin(s.elapsed*4)>.8){puck.owner=defender.id;puck.lastTeam=defender.team;defender.cooldown=tier.reaction;puck.icing=null;}
 }else{
  puck.y=Math.max(.03,Number(puck.y)||.03);puck.vy=Number(puck.vy)||0;const oldY=puck.y;puck.x+=puck.vx*dt;puck.z+=puck.vz*dt;puck.y+=puck.vy*dt;puck.vy-=9.81*dt;if(puck.y<.03){puck.y=.03;puck.vy=Math.abs(puck.vy)>.7?-puck.vy*.25:0;}
  const outside=Math.abs(puck.x)>RINK.length/2||Math.abs(puck.z)>RINK.width/2;
  if(outside&&puck.y>2.25){if(shootout){completeShootoutAttempt(s,false);return;}const last=s.players.find(p=>p.id===puck.lastPlayer),defensive=last&&last.x*attackDirection(s,last.team)<-RINK.blue;if(defensive&&oldY>.1&&s.config.penalties)assessPenalty(s,last,'delay-of-game');faceoff(s,last?-attackDirection(s,last.team)*21.0312:0,puck.z>0?6.7056:-6.7056,'Puck out of play'+(defensive?' • delay of game':''));return;}
 }
 const offside=!shootout?pendingOffside(s,previousX,attackDirection,RINK.blue):null;if(offside){faceoff(s,offside.x,offside.z,offside.reason);return;}
 if(!shootout&&s.config.icing&&s.config.icingMode==='hybrid'&&puck.icing&&!puck.icing.judged){const call=puck.icing,d=call.direction;if(puck.x*d>21.0312&&puck.vx*d>0){call.judged=true;const crossingZ=puck.z+puck.vz*(RINK.goalX-puck.x*d)/Math.abs(puck.vx),target={x:d*RINK.goalX,z:crossingZ},defender=chasers[1-call.team],attacker=chasers[call.team],shortHanded=s.players.some(p=>p.team===call.team&&p.penalty>0);if(shortHanded||attacker&&defender&&dist(attacker,target)+.3<dist(defender,target))puck.icing=null;else if(Math.abs(crossingZ)>RINK.goalWidth/2&&defender){faceoff(s,-d*21.0312,crossingZ>0?6.7056:-6.7056,'Icing • hybrid race awarded to defender');return;}}}
 for(const sign of [-1,1])if(previousX*sign<RINK.goalX+.0381&&puck.x*sign>=RINK.goalX+.0381){
  const t=(sign*(RINK.goalX+.0381)-previousX)/(puck.x-previousX),crossZ=puck.z-puck.vz*dt*(1-t),height=puck.y||.03;
  if(Math.abs(crossZ)+.0381<RINK.goalWidth/2&&height+.0127<RINK.goalHeight){
   const scoring=attackDirection(s,0)===sign?0:1,goalie=s.players.find(p=>p.team!==scoring&&p.goalie),saved=!s.goaliesPulled[goalie.team]&&Math.abs(goalie.z-crossZ)<tier.saveReach&&goalie.cooldown===0;
   if(saved){s.stats.saves[goalie.team]++;goalie.cooldown=tier.reaction;goalie.animation='save';if(shootout){completeShootoutAttempt(s,false);return;}puck.owner=null;puck.x=sign*(RINK.goalX-1);puck.y=.03;puck.vy=0;puck.vx=-sign*8;puck.vz=crossZ>=0?4:-4;puck.icing=null;}
   else{awardGoal(s,scoring);return;}
  }else if(shootout){completeShootoutAttempt(s,false);return;}
  else if(s.config.icing&&puck.icing?.direction===sign){
   const team=puck.icing.team,defender=chasers[1-team],attacker=chasers[team],shortHanded=s.players.some(p=>p.team===team&&p.penalty>0),attackerWins=s.config.icingMode==='hybrid'&&attacker&&defender&&dist(attacker,puck)+.3<dist(defender,puck);
   if(!shortHanded&&!attackerWins){faceoff(s,-sign*21.0312,puck.z>0?6.7056:-6.7056,'Icing • defensive-zone faceoff');return;}puck.icing=null;
  }
 }
 if(!puck.owner){
  const before={x:puck.x,z:puck.z};constrain(puck,.04);if(before.x!==puck.x)puck.vx*=-.75;if(before.z!==puck.z)puck.vz*=-.75;
  const covering=s.players.find(p=>p.goalie&&p.onIce&&!s.goaliesPulled[p.team]&&dist(p,puck)<.55&&puck.y<.6&&Math.hypot(puck.vx,puck.vz)<9);
  if(covering){s.stats.saves[covering.team]++;covering.animation='save';if(shootout)completeShootoutAttempt(s,false);else faceoff(s,-attackDirection(s,covering.team)*21.0312,puck.z>0?6.7056:-6.7056,'Goaltender freezes puck');return;}
  if(puck.y<.55){const receiver=s.players.filter(p=>(!p.goalie||s.goaliesPulled[p.team])&&p.onIce&&(p.penalty<=0||p.queuedReplacement)&&p.cooldown===0&&dist(p,puck)<.95).sort((a,b)=>dist(a,puck)-dist(b,puck))[0];if(receiver){
    if(shootout&&s.shootout.shotTaken){completeShootoutAttempt(s,false);return;}
    if(s.delayedPenalties.some(call=>s.players.find(p=>p.id===call.playerId)?.team===receiver.team)){faceoff(s,-attackDirection(s,receiver.team)*21.0312,6.7056,'Delayed penalty • offending team touched puck');return;}
    if(s.faceoffPending){s.stats.faceoffs[receiver.team]++;s.faceoffPending=false;}puck.owner=receiver.id;puck.lastTeam=receiver.team;puck.lastPlayer=receiver.id;puck.icing=null;receiver.cooldown=.15;
    if(!shootout&&s.delayedOffside[receiver.team]){faceoff(s,attackDirection(s,receiver.team)*(RINK.blue-1.524),6.7056,'Offside • attacking touch');return;}
   }}
 }
 s.referees.forEach((r,i)=>{r.x+=((i<2?clamp(puck.x+(i?6:-6),-23,23):i===2?RINK.blue:-RINK.blue)-r.x)*dt*1.5;r.z=i%2?10.5:-10.5;if(s.delayedPenalties.length)r.signal='delayed-penalty';});
}
function constrain(p,margin){const hx=RINK.length/2-margin,hz=RINK.width/2-margin,r=RINK.corner,cx=hx-r,cz=hz-r;p.x=clamp(p.x,-hx,hx);p.z=clamp(p.z,-hz,hz);const dx=Math.max(0,Math.abs(p.x)-cx),dz=Math.max(0,Math.abs(p.z)-cz),l=Math.hypot(dx,dz);if(l>r){p.x=Math.sign(p.x)*(cx+dx/l*r);p.z=Math.sign(p.z)*(cz+dz/l*r);}}
function blockNets(p){for(const sign of [-1,1]){const x=p.x*sign,front=RINK.goalX-.35,back=RINK.goalX+1.35,side=RINK.goalWidth/2+.35;if(x>front&&x<back&&Math.abs(p.z)<side){const choices=[x-front,back-x,side-Math.abs(p.z)],nearest=Math.min(...choices);if(nearest===choices[0]){p.x=sign*front;p.vx=0;}else if(nearest===choices[1]){p.x=sign*back;p.vx=0;}else{p.z=(p.z<0?-1:1)*side;p.vz=0;}}}}
