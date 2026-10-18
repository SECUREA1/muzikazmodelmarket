import {BASKETBALL_SPECTATOR_SEATS} from './basketball-stadium.js';
import {isBasketball,stepBasketball,basketballShotSolution} from './basketball.js';

// Metres, regulation NBA court and hoop dimensions. Ball positions refer to
// the bottom of the model; scoring tests use its physical centre.
export const BASKETBALL_COURT=Object.freeze({width:15.24,length:28.65,rimZ:12.75,rimHeight:3.05,rimRadius:.2286,ballRadius:.12,threePointRadius:7.239,cornerThreeX:6.706,quarterMs:720000,overtimeMs:300000,shotClockMs:24000});
export const BASKETBALL_BALL_ID='basketball-game-ball';
const teams=['home','away'],other=team=>team==='home'?'away':'home';
const error=message=>{throw Object.assign(new Error(message),{statusCode:409});};
export const BASKETBALL_DEFAULT_SETTINGS=Object.freeze({quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,allowLateJoin:false});
export const isBasketballPlayer=player=>player?.basketballRole!=='spectator';
const online=(sim,now)=>Object.values(sim.players||{}).filter(player=>isBasketballPlayer(player)&&!player.replacedByRoom&&now-player.lastSeen<15000&&player.health>0);
const shotClockMs=match=>(match.settings?.shotClockSeconds||24)*1000;
const quarterMs=match=>(match.settings?.quarterMinutes||12)*60000;
const regulationQuarters=match=>match.settings?.quarters||4;
export function requireBasketballPlayer(sim,player){if(sim.basketball&&!isBasketballPlayer(player))error('Spectators can watch this game. Choose a team before the next tip-off.');}
const event=(sim,action,now,fields={})=>{sim.events ||= [];sim.events.push({id:`${action}-${now}-${sim.basketball?.playSequence||0}`,action,at:now,...fields});sim.events=sim.events.slice(-100);};
export const isBasketballEnvironment=environment=>environment?.id==='basketball-arena'||environment?.basketballCourt===true||environment?.basketball===true||['basketball-arena','basketball-stadium'].includes(environment?.builderScene?.layout);
export const basketballGameBall=sim=>sim.actors?.[sim.basketball?.ballId||BASKETBALL_BALL_ID];
export const basketballHoopForTeam=team=>({x:0,y:BASKETBALL_COURT.rimHeight,z:team==='away'?BASKETBALL_COURT.rimZ:-BASKETBALL_COURT.rimZ});

export const BASKETBALL_SPECTATOR_BUFFER=.5;
export function basketballSpectatorRestricted(position,sim){
 return Boolean(sim?.basketball?.state==='live'&&position&&Math.abs(position.x)<BASKETBALL_COURT.width/2+BASKETBALL_SPECTATOR_BUFFER-1e-7&&Math.abs(position.z)<BASKETBALL_COURT.length/2+BASKETBALL_SPECTATOR_BUFFER-1e-7);
}
/** Block the entire walking/teleport segment, then slide around the court. */
export function constrainBasketballSpectator(previous,next,sim,player){
 if(sim?.basketball?.state!=='live'||player?.basketballRole!=='spectator')return {...next};
 const edgeX=BASKETBALL_COURT.width/2+BASKETBALL_SPECTATOR_BUFFER+.001,edgeZ=BASKETBALL_COURT.length/2+BASKETBALL_SPECTATOR_BUFFER+.001;
 const project=point=>{
  if(!basketballSpectatorRestricted(point,sim))return {...point};
  if(edgeX-Math.abs(point.x)<=edgeZ-Math.abs(point.z))return {...point,x:(point.x<0?-1:1)*edgeX};
  return {...point,z:(point.z<0?-1:1)*edgeZ};
 };
 if(basketballSpectatorRestricted(previous,sim))return project(next);
 let enter=0,leave=1,axis=null,side=1;
 for(const [name,edge]of [['x',edgeX],['z',edgeZ]]){
  const delta=next[name]-previous[name];
  if(Math.abs(delta)<1e-9){if(Math.abs(previous[name])>=edge)return {...next};continue;}
  let near=(-edge-previous[name])/delta,far=(edge-previous[name])/delta;
  if(near>far)[near,far]=[far,near];
  if(near>=enter){enter=near;axis=name;side=delta>0?-1:1;}
  leave=Math.min(leave,far);if(enter>leave)return {...next};
 }
 if(leave<0||enter>1||!axis)return project(next);
 return {...next,[axis]:side*(axis==='x'?edgeX:edgeZ)};
}
function evacuateBasketballSpectators(sim){
 if(sim.basketball?.state!=='live')return;
 for(const player of Object.values(sim.players)){
  if(player.basketballRole!=='spectator')continue;
  let corrected=false;
  const seat=sim.actors[player.seatedId],vehicle=sim.actors[player.vehicleId];
  if(vehicle){if(vehicle.holderId===player.actorId)vehicle.holderId=null;player.vehicleId=null;corrected=true;}
  if(seat&&basketballSpectatorRestricted(seat.position,sim)){if(seat.holderId===player.actorId)seat.holderId=null;player.seatedId=null;corrected=true;}
  if(basketballSpectatorRestricted(player.position,sim)){player.position=constrainBasketballSpectator(player.position,player.position,sim,player);corrected=true;}
  if(corrected){player.input={};player.velocityY=0;player.movementRevision=(player.movementRevision||0)+1;}
 }
}

export function ensureBasketballGame(sim,environment,now) {
 if(!isBasketballEnvironment(environment))return null;
 sim.actors ||= {};sim.players ||= {};sim.events ||= [];
 sim.basketball ||= {state:'ready',matchId:null,homeScore:0,awayScore:0,quarter:1,clockMs:BASKETBALL_COURT.quarterMs,shotClockMs:BASKETBALL_COURT.shotClockMs,possession:'home',lastPlay:'Pick a team and start the game.',lastScore:null,startedAt:null,updatedAt:now,playSequence:0};
 sim.basketball.settings={...BASKETBALL_DEFAULT_SETTINGS,...sim.basketball.settings,allowLateJoin:false};
 for(const seat of BASKETBALL_SPECTATOR_SEATS)if(!sim.actors[seat.id]){const position={x:seat.x,y:seat.y,z:seat.z},rotation={x:0,y:seat.rotationY,z:0};sim.actors[seat.id]={id:seat.id,modelId:'basketball-spectator-seat',basketballManaged:true,basketballSpectatorSeat:true,active:true,health:100,position,rotation,scale:{x:1,y:1,z:1},definition:{objectId:seat.id,modelId:'basketball-spectator-seat',position:{...position},gameplay:{behavior:'seat',health:100,damage:0,interactionDistance:2.5,cooldown:0,action:'none',prompt:'Sit on spectator bench',seatOffset:[0,0,0]},movement:{speed:0}}};}
 const current=basketballGameBall(sim),authored=Object.values(sim.actors).find(ball=>isBasketball(ball)&&!ball.basketballManaged&&!ball.spawned&&ball.active!==false);
 if(authored&&(!current||current.basketballManaged&&sim.basketball.state!=='live')){
  if(current?.basketballManaged){releaseBall(sim,current);delete sim.actors[current.id];}
  sim.basketball.ballId=authored.id;authored.basketballMatchBall=true;authored.ballFloor=0;
 }
 if(!basketballGameBall(sim))sim.actors[BASKETBALL_BALL_ID]={id:BASKETBALL_BALL_ID,modelId:'basketball',basketballManaged:true,basketballMatchBall:true,spawned:true,ownerId:null,asset:{id:'basketball',buildAssetId:'basketball',name:'Basketball',basic:true,behavior:'pickup'},active:true,health:100,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},ballFloor:0,definition:{objectId:BASKETBALL_BALL_ID,modelId:'basketball',position:{x:0,y:0,z:0},gameplay:{behavior:'pickup',health:100,damage:0,interactionDistance:3,cooldown:0,action:'none',prompt:'Basketball · E catch · T pass · R shoot'},movement:{speed:0}}};
 if(!basketballGameBall(sim))sim.basketball.ballId=BASKETBALL_BALL_ID;
 sim.basketball.ballId=basketballGameBall(sim).id;
 return sim.basketball;
}

export function assignBasketballTeam(sim,player,now,requestedTeam) {
 if(requestedTeam!==undefined&&!teams.includes(requestedTeam))error('Choose the Home or Away team.');
 if(sim.basketball?.state==='live'&&(!isBasketballPlayer(player)||!player.basketballTeam))error('Spectators can choose a team before the next tip-off. Late arrivals watch the current game.');
 if(requestedTeam&&sim.basketball?.state==='live'&&player.basketballTeam&&requestedTeam!==player.basketballTeam)error('Change teams before starting a game or after the final buzzer.');
 const counts=online(sim,now).filter(candidate=>candidate!==player).reduce((result,candidate)=>{if(teams.includes(candidate.basketballTeam))result[candidate.basketballTeam]++;return result;},{home:0,away:0});
 player.basketballRole='player';
 player.basketballTeam=requestedTeam||(teams.includes(player.basketballTeam)?player.basketballTeam:counts.home<=counts.away?'home':'away');
 player.basketballJersey=player.basketballTeam;
 return player.basketballTeam;
}

function releaseBall(sim,ball) {
 for(const player of Object.values(sim.players))if(player.heldId===ball.id)player.heldId=null;
 ball.holderId=null;delete ball.ballVelocity;delete ball.basketballShot;
}
function resetPossession(sim,team,now,message) {
 const match=sim.basketball,ball=basketballGameBall(sim);
 match.possession=team;match.shotClockMs=shotClockMs(match);match.lastPlay=message;match.playSequence++;
 if(!ball)return;
 releaseBall(sim,ball);ball.position={x:0,y:0,z:0};ball.ballFloor=0;
 const receiver=online(sim,now).find(player=>player.basketballTeam===team&&!player.heldId);
 if(receiver){receiver.position={x:0,y:0,z:team==='home'?10.4:-10.4};receiver.floor=0;receiver.velocityY=0;receiver.grounded=true;receiver.input={};ball.holderId=receiver.actorId||receiver.id;receiver.heldId=ball.id;ball.position={...receiver.position,y:1};}
}


export function configureBasketballGame(sim,settings,now){
 const match=sim.basketball;if(!match)error('Enter Basketball Arena to configure a basketball game.');
 if(match.state==='live')error('Change basketball settings before tip-off or after the final buzzer.');
 const invalid=()=>{throw Object.assign(new Error('Invalid basketball settings: use 1–12 minute quarters, 1–4 quarters, a 5–60 second shot clock, a 0–200 point limit and win by 1–10. Late arrivals must watch.'),{statusCode:422});};
 if(!settings||typeof settings!=='object'||Array.isArray(settings))invalid();
 const limits={quarterMinutes:[1,12],quarters:[1,4],shotClockSeconds:[5,60],scoreLimit:[0,200],winBy:[1,10]};
 for(const [key,value]of Object.entries(settings)){if(key==='allowLateJoin'){if(value!==false)invalid();continue;}if(!limits[key]||!Number.isInteger(value)||value<limits[key][0]||value>limits[key][1])invalid();}
 match.settings={...BASKETBALL_DEFAULT_SETTINGS,...match.settings,...settings,allowLateJoin:false};
 if(match.state==='ready'){match.clockMs=quarterMs(match);match.shotClockMs=shotClockMs(match);}
 match.updatedAt=now;match.lastPlay='Game settings saved · choose a side or watch, then start.';return match;
}
export const setBasketballSettings=configureBasketballGame;

function releaseBasketballSeatAndVehicle(sim,player){
 for(const key of ['seatedId','vehicleId']){const actor=sim.actors[player[key]];if(actor?.holderId===(player.actorId||player.id))actor.holderId=null;player[key]=null;}
}

export function watchBasketballGame(sim,player,now){
 if(!sim.basketball)error('Enter Basketball Arena to watch a basketball game.');
 const held=sim.actors[player.heldId],team=player.basketballTeam;releaseBasketballSeatAndVehicle(sim,player);
 player.basketballRole='spectator';player.basketballTeam=null;player.input={};
 if(isBasketball(held)){releaseBall(sim,held);held.position={x:0,y:0,z:0};held.ballFloor=0;if(held.basketballMatchBall&&sim.basketball.state==='live')resetPossession(sim,other(team||sim.basketball.possession),now,'Player moved to the sideline · play continues.');}
 player.position={x:8.8,y:0,z:0};player.yaw=Math.PI/2;player.floor=0;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;
 return player;
}
function finishBasketballGame(sim,now,winner,message){
 const match=sim.basketball;match.state='finished';match.winner=winner;match.endedAt=now;match.shotClockMs=0;match.lastPlay=message;
 releaseBall(sim,basketballGameBall(sim));event(sim,'basketball-finish',now,{winner});
}

export function startBasketballGame(sim,now) {
 const match=sim.basketball;if(!match)error('Enter Basketball Arena to start a basketball game.');
 if(match.state==='live')error('This shared basketball game is already running.');
 const participants=online(sim,now);if(!participants.length)error('Choose a team before starting. At least one player must be on the court.');
 for(const player of participants)assignBasketballTeam(sim,player,now);
 Object.assign(match,{state:'live',matchId:`basketball-${now}-${(match.gameSequence||0)+1}`,gameSequence:(match.gameSequence||0)+1,homeScore:0,awayScore:0,quarter:1,clockMs:quarterMs(match),shotClockMs:shotClockMs(match),possession:'home',lastScore:null,lastPlay:'Tip-off! Home attacks the orange end; Away attacks the blue end.',startedAt:now,updatedAt:now,playSequence:0,winner:null,endedAt:null});
 const counts={home:0,away:0};
 for(const player of participants){releaseBasketballSeatAndVehicle(sim,player);const index=counts[player.basketballTeam]++;player.position={x:(player.basketballTeam==='home'?-1:1)*(1.1+index%4*1.4),y:0,z:Math.floor(index/4)===0?0:(Math.floor(index/4)%2?1:-1)*Math.ceil(Math.floor(index/4)/2)*1.25};player.floor=0;player.velocityY=0;player.grounded=true;player.input={};player.basketballPoints=0;}
 const ball=basketballGameBall(sim);releaseBall(sim,ball);ball.position={x:0,y:0,z:0};ball.ballFloor=0;
 evacuateBasketballSpectators(sim);
 event(sim,'basketball-start',now,{matchId:match.matchId});return match;
}

export function touchBasketball(sim,ball,player,now) {
 if(!isBasketball(ball)||!sim.basketball)return;
 requireBasketballPlayer(sim,player);
 const team=player.basketballTeam||assignBasketballTeam(sim,player,now);
 ball.lastBasketballTouch={playerId:player.actorId||player.id,team,at:now};
 delete ball.basketballShot;
 if(ball.basketballMatchBall&&sim.basketball.state==='live'&&sim.basketball.possession!==team){sim.basketball.possession=team;sim.basketball.shotClockMs=shotClockMs(sim.basketball);sim.basketball.lastPlay=`${team==='home'?'Home':'Away'} takes possession.`;}
}

export function registerBasketballRelease(sim,ball,player,now) {
 if(!isBasketball(ball)||!sim.basketball)return;
 requireBasketballPlayer(sim,player);
 const team=player.basketballTeam||assignBasketballTeam(sim,player,now);
 ball.lastBasketballTouch={playerId:player.actorId||player.id,team,at:now};
 ball.basketballShot={id:`${player.actorId||player.id}-${now}-${++sim.basketball.playSequence}`,playerId:player.actorId||player.id,team,origin:{...player.position},releasedAt:now,scored:false};
}

export function shootBasketball(sim,player,now,options={}) {
 requireBasketballPlayer(sim,player);
 const ball=sim.actors[player.heldId];if(!isBasketball(ball))error('Catch a basketball before shooting.');
 if(!sim.basketball)error('Enter Basketball Arena to shoot at a regulation hoop.');
 if(sim.basketball.state==='finished')error('Start a new game before shooting again.');
 const team=player.basketballTeam||assignBasketballTeam(sim,player,now),target=basketballHoopForTeam(team);
 const origin={x:player.position.x,y:player.position.y+1.8,z:player.position.z};
 const span=Math.hypot(target.x-origin.x,target.z-origin.z);if(span>29||Math.abs(player.position.x)>BASKETBALL_COURT.width/2||Math.abs(player.position.z)>BASKETBALL_COURT.length/2)error('Step onto the court before shooting.');
 const direction=options.direction||{x:-Math.sin(player.yaw||0),y:0,z:-Math.cos(player.yaw||0)};
 const solution=basketballShotSolution(origin,{...target,y:target.y-BASKETBALL_COURT.ballRadius},direction,options);
 ball.position=solution.position;ball.ballFloor=0;ball.ballVelocity=solution.velocity;ball.ballLaunch={power:solution.power,angle:solution.angle,mode:solution.mode,reachable:solution.reachable};ball.holderId=null;delete ball.ballCatchSegment;player.heldId=null;
 registerBasketballRelease(sim,ball,player,now);return ball;
}

export function basketballShotPoints(origin,hoop) {
 const distance=Math.hypot(origin.x-hoop.x,origin.z-hoop.z);
 return Math.abs(origin.x)>=BASKETBALL_COURT.cornerThreeX||distance>=BASKETBALL_COURT.threePointRadius?3:2;
}

function scoreCrossing(sim,ball,previous,next,now) {
 const match=sim.basketball,shot=ball.basketballShot;
 if(!ball.basketballMatchBall||!shot||shot.scored||match.state!=='live')return false;
 const from=previous.y+BASKETBALL_COURT.ballRadius,to=next.y+BASKETBALL_COURT.ballRadius;
 if(from<=BASKETBALL_COURT.rimHeight||to>BASKETBALL_COURT.rimHeight||to>=from)return false;
 const t=(from-BASKETBALL_COURT.rimHeight)/(from-to),x=previous.x+(next.x-previous.x)*t,z=previous.z+(next.z-previous.z)*t;
 for(const team of teams){const hoop=basketballHoopForTeam(team);
  if(Math.hypot(x-hoop.x,z-hoop.z)>BASKETBALL_COURT.rimRadius-BASKETBALL_COURT.ballRadius+.015)continue;
  // A basket at the opponent's end credits that end's attacking team, including
  // an own goal. Only the shooter's own basket can count as a three-pointer.
  const points=shot.team===team?basketballShotPoints(shot.origin,hoop):2;
  shot.scored=true;match[team+'Score']+=points;const scorer=sim.players[shot.playerId];if(scorer&&shot.team===team)scorer.basketballPoints=(scorer.basketballPoints||0)+points;
  match.lastScore={team,points,playerId:shot.playerId,at:now};
  const message=`${team==='home'?'Home':'Away'} +${points} · ${scorer?.username||'Basketball'} scores!`;
  event(sim,'basketball-score',now,{team,points,playerId:shot.playerId,homeScore:match.homeScore,awayScore:match.awayScore});
  const lead=match[team+'Score']-match[other(team)+'Score'];
  if(match.settings?.scoreLimit>0&&match[team+'Score']>=match.settings.scoreLimit&&lead>=(match.settings.winBy||1))finishBasketballGame(sim,now,team,`${message} · ${team==='home'?'Home':'Away'} wins by the point limit!`);
  else resetPossession(sim,other(team),now,message);return true;
 }
 return false;
}

function advanceClock(sim,now) {
 const match=sim.basketball,elapsed=Math.max(0,now-match.updatedAt);match.updatedAt=now;
 if(match.state!=='live'||!online(sim,now).length)return;
 let remaining=elapsed;
 while(remaining>0&&match.state==='live'){
  const span=Math.min(remaining,match.clockMs,match.shotClockMs);match.clockMs-=span;match.shotClockMs-=span;remaining-=span;
  if(match.clockMs<=0){
   if(match.quarter>=regulationQuarters(match)&&Math.abs(match.homeScore-match.awayScore)>=(match.settings?.winBy||1)){match.clockMs=0;const winner=match.homeScore>match.awayScore?'home':'away';finishBasketballGame(sim,now,winner,`Final buzzer · ${winner==='home'?'Home':'Away'} wins ${match.homeScore}–${match.awayScore}.`);break;}
   match.quarter++;match.clockMs=match.quarter>regulationQuarters(match)?BASKETBALL_COURT.overtimeMs:quarterMs(match);
   resetPossession(sim,match.quarter%2?'home':'away',now,match.quarter>regulationQuarters(match)?`Overtime ${match.quarter-regulationQuarters(match)} · next basket matters.`:`Quarter ${match.quarter} begins.`);
  }else if(match.shotClockMs<=0){const team=other(match.possession);resetPossession(sim,team,now,`Shot clock violation · ${team==='home'?'Home':'Away'} ball.`);event(sim,'basketball-turnover',now,{team,reason:'shot-clock'});}
 }
}

export function stepBasketballGame(sim,now,dt) {
 if(!sim.basketball)return;
 evacuateBasketballSpectators(sim);
 advanceClock(sim,now);
 for(const ball of Object.values(sim.actors)){
  if(!isBasketball(ball)||ball.holderId||!ball.ballVelocity)continue;
  const catchFrom={...ball.position};
  stepBasketball(ball,dt,0,(previous,next)=>{
   if(scoreCrossing(sim,ball,previous,next,now))return false;
   // Regulation transparent backboards: a bank shot reflects at the board.
   if(ball.ballVelocity)for(const sign of [-1,1]){const plane=sign*13.131;if((previous.z-plane)*(next.z-plane)<=0&&Math.abs(next.x)<.9145&&next.y+BASKETBALL_COURT.ballRadius>2.9&&next.y+BASKETBALL_COURT.ballRadius<3.969){ball.ballVelocity.z*=-.7;next.z=plane-sign*.025;}}
  });
  if(dt>0&&!ball.holderId)ball.ballCatchSegment={from:catchFrom,to:{...ball.position},at:now};
  if(!ball.basketballMatchBall||sim.basketball.state!=='live'||ball.holderId)continue;
  if(Math.abs(ball.position.x)>BASKETBALL_COURT.width/2||Math.abs(ball.position.z)>BASKETBALL_COURT.length/2||ball.position.y<-.5){const team=other(ball.lastBasketballTouch?.team||sim.basketball.possession);resetPossession(sim,team,now,`Out of bounds · ${team==='home'?'Home':'Away'} ball.`);event(sim,'basketball-turnover',now,{team,reason:'out-of-bounds'});}
 }
 // Carrying the ball across a sideline is also a turnover.
 const ball=basketballGameBall(sim),holder=sim.players[ball?.holderId];
 if(holder&&sim.basketball.state==='live'&&(Math.abs(holder.position.x)>BASKETBALL_COURT.width/2||Math.abs(holder.position.z)>BASKETBALL_COURT.length/2)){const team=other(holder.basketballTeam||sim.basketball.possession);resetPossession(sim,team,now,`Out of bounds · ${team==='home'?'Home':'Away'} ball.`);}
}

/** Preview arena board collisions with the identical flight and bounce rules. */
export function predictBasketballShotPath(solution,{duration=3,step=1/30,floor=0}={}){
 if(!solution?.position||!solution?.velocity)return [];
 const ball={id:'basketball-preview',modelId:'basketball',position:{...solution.position},ballVelocity:{...solution.velocity},ballFloor:floor};
 const sim={basketball:{state:'ready',updatedAt:0,settings:{...BASKETBALL_DEFAULT_SETTINGS}},actors:{[ball.id]:ball},players:{},events:[]};
 const seconds=Math.max(0,Math.min(6,Number(duration)||0)),dt=Math.max(1/120,Math.min(.1,Number(step)||1/30)),points=[{...ball.position,t:0}];
 for(let elapsed=0;elapsed<seconds-1e-8;){const span=Math.min(dt,seconds-elapsed);elapsed+=span;stepBasketballGame(sim,elapsed*1000,span);points.push({...ball.position,t:elapsed});if(!ball.ballVelocity)break;}
 return points;
}
