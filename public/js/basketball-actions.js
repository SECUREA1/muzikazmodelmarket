import {isBasketball,basketballCatchPosition,basketballShotSolution,basketballLaunchOptions} from './basketball.js';
import {BASKETBALL_COURT,basketballHoopForTeam} from './basketball-rules.js';

export const BASKETBALL_TRIGGER_MODES=Object.freeze(['auto','shoot','pass','toss','catch','steal']);
const values=items=>Array.isArray(items)?items:Object.values(items||{});
const identity=player=>player?.actorId||player?.id;
const none=label=>({action:null,fields:{},label});
const chest=position=>({...position,y:position.y+1});
const span=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Resolve intent from the current simulation. Execution still uses the sport's
// normal catch, steal and release handlers, including authoritative validation.
export function resolveBasketballAction({game,player,players={},balls=[],direction,options={},now=Date.now(),forced='auto',visible=()=>true}={}){
 if(!player?.position)return none('Waiting for player');
 if(player.basketballRole==='spectator')return none('Join a team to play');
 if(player.health<=0||game?.state==='finished')return none('Start a new game');
 const tuning=basketballLaunchOptions(options);
 const aim=direction||[-Math.sin(player.yaw||0),0,-Math.cos(player.yaw||0)];
 // Use the existing launch parser to reject malformed directions even while
 // empty-handed, before a later possession could turn the input into a shot.
 const heading=basketballShotSolution({...player.position,y:player.position.y+1.2},null,aim,{...tuning,mode:'manual'}).velocity;
 const headingLength=Math.hypot(heading.x,heading.z),dx=heading.x/headingLength,dz=heading.z/headingLength;
 const roster=values(players),allBalls=values(balls).filter(ball=>isBasketball(ball)&&ball.active!==false);
 const self=identity(player),held=allBalls.find(ball=>ball.id===player.heldId||self&&ball.holderId===self);
 const angleTo=target=>{const x=target.x-player.position.x,z=target.z-player.position.z,length=Math.hypot(x,z);return length>.001?(x*dx+z*dz)/length:-1;};
 const opponents=roster.filter(other=>other!==player&&identity(other)!==self&&other.basketballTeam&&other.basketballTeam!==player.basketballTeam&&other.basketballRole!=='spectator'&&other.health!==0&&other.position);
 function passTo(teammate){
  const distance=span(player.position,teammate.position),angle=20*Math.PI/180,height=-.32;
  const speed=Math.sqrt(9.8*distance*distance/(2*Math.cos(angle)**2*(distance*Math.tan(angle)-height)));
  if(speed>18)return null;
  return {direction:[(teammate.position.x-player.position.x)/distance,0,(teammate.position.z-player.position.z)/distance],power:Math.max(0,(speed-4)/14),angle:20,mode:'manual'};
 }
 const teammates=roster.filter(other=>other!==player&&identity(other)!==self&&player.basketballTeam&&other.basketballTeam===player.basketballTeam&&other.basketballRole!=='spectator'&&other.health!==0&&other.position)
  .filter(other=>{const distance=span(player.position,other.position);return distance>=2&&distance<=22&&passTo(other)&&visible(chest(player.position),chest(other.position),other);})
  .map(other=>{
   const distance=span(player.position,other.position),x=(other.position.x-player.position.x)/distance,z=(other.position.z-player.position.z)/distance;
   const blocked=opponents.some(opponent=>{const ox=opponent.position.x-player.position.x,oz=opponent.position.z-player.position.z,along=ox*x+oz*z;return along>.7&&along<distance+.4&&Math.abs(ox*z-oz*x)<.85&&Math.abs(opponent.position.y-player.position.y)<1.5;});
   const hoop=basketballHoopForTeam(player.basketballTeam),advance=span(player.position,hoop)-span(other.position,hoop);
   return {other,alignment:angleTo(other.position),blocked,score:angleTo(other.position)*4+advance*.1-distance*.015};
  }).filter(candidate=>!candidate.blocked).sort((a,b)=>b.score-a.score);
 const pass=teammates[0];
 if(forced!=='auto'){
  const action={shoot:'basketball-shoot',pass:'toss',toss:'toss',catch:'catch',steal:'basketball-steal'}[forced];
  if(action)return {action,fields:forced==='pass'&&held&&pass?passTo(pass.other):{},label:forced==='catch'?'Grab / catch':forced[0].toUpperCase()+forced.slice(1)};
 }
 if(held){
  let shot=false;
  if(game&&Math.abs(player.position.x)<=BASKETBALL_COURT.width/2&&Math.abs(player.position.z)<=BASKETBALL_COURT.length/2){
   const hoop=basketballHoopForTeam(player.basketballTeam),target={...hoop,y:hoop.y-BASKETBALL_COURT.ballRadius},origin={...player.position,y:player.position.y+1.8};
   const solution=basketballShotSolution(origin,target,aim,{...tuning,mode:'assisted'});
   shot=span(origin,target)<=29&&solution.reachable&&solution.aimAligned&&visible(origin,target,held);
  }
  if(shot)return {action:'basketball-shoot',fields:{},label:'Shoot'};
  if(pass&&(pass.alignment>.94||pass.score>0))return {action:'toss',fields:passTo(pass.other),label:'Pass'};
  return {action:'toss',fields:{mode:'manual'},label:'Toss'};
 }
 if(player.heldId)return none('Release your held item');
 const carrierBall=allBalls.find(ball=>ball.id===game?.ballId||ball.basketballMatchBall);
 const carrier=roster.find(other=>identity(other)===carrierBall?.holderId);
 if(game?.state==='live'&&carrier&&opponents.includes(carrier)&&span(player.position,carrier.position)<=1.7&&Math.abs(player.position.y-carrier.position.y)<=1.5&&now-(player.basketballStealAt??-Infinity)>=800&&visible(chest(player.position),chest(carrier.position),carrierBall)){
  return {action:'basketball-steal',fields:{},label:'Steal'};
 }
 const catchable=allBalls.map(ball=>({ball,reach:basketballCatchPosition(ball,player.position,{now})})).filter(({ball,reach})=>reach&&visible(chest(player.position),{...reach.position,y:reach.position.y+.12},ball)).sort((a,b)=>a.reach.distance-b.reach.distance)[0];
 if(catchable)return {action:'catch',fields:{entityId:catchable.ball.id},label:'Grab / catch'};
 return none(carrier?.basketballTeam===player.basketballTeam?'Get open for a pass':carrier?'Move closer to steal':'Move closer to the ball');
}
