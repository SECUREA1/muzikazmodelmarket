import {ISLAND_EXPERIENCES,ISLAND_BALLS,isTropicalIslandEnvironment,isIslandLand} from './public/js/tropical-island-config.js';
import {ISLAND_BUZZ_SECONDS,createIslandSession,startIslandSession,stepIslandSession,consumeIslandDrink,visitIslandExperience,islandEffects} from './public/js/tropical-island-rules.js';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const copy=value=>structuredClone(value);
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);

export function ensureTropicalIsland(sim,environment,now){
 if(!isTropicalIslandEnvironment(environment))return null;
 sim.island ||= {version:1,updatedAt:now,balls:ISLAND_BALLS.map(ball=>({id:ball.id,radius:ball.radius,restY:.36+ball.radius,position:{x:ball.x,y:.36+ball.radius,z:ball.z},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}}))};
 sim.radTox=null;sim.match=null;sim.projectiles={};
 for(const player of Object.values(sim.players||{})){player.radToxEnabled=false;player.radToxReady=true;}
 return sim.island;
}

function playerState(player,now){
 if(!player.island||player.island.status!=='running'){
  player.island=startIslandSession(createIslandSession(now),now);
  player.islandLastAt=now;
 }
 const last=Number.isFinite(player.islandLastAt)?player.islandLastAt:now;
 if(now>last){stepIslandSession(player.island,(now-last)/1000);player.islandLastAt=now;}
 if(player.island.activity?.until<=now)player.island.activity=null;
 return player.island;
}

export function stepTropicalIsland(sim,environment,now){
 const state=ensureTropicalIsland(sim,environment,now);if(!state)return null;
 for(const player of Object.values(sim.players||{}))playerState(player,now);
 const dt=Math.max(0,Math.min(.25,(now-(state.updatedAt??now))/1000));state.updatedAt=Math.max(now,state.updatedAt||now);
 for(const ball of state.balls){
  const v=ball.velocity;if(!v||Math.hypot(v.x,v.y,v.z)<.001)continue;
  for(let remaining=dt;remaining>1e-8;remaining-=.025){
   const step=Math.min(.025,remaining),next={x:ball.position.x+v.x*step,z:ball.position.z+v.z*step};
   if(isIslandLand(next.x,next.z)){ball.position.x=next.x;ball.position.z=next.z;}else{v.x*=-.45;v.z*=-.45;}
   v.y-=9*step;ball.position.y+=v.y*step;
   if(ball.position.y<=ball.restY){ball.position.y=ball.restY;v.y=Math.abs(v.y)>.45?Math.abs(v.y)*.42:0;}
   v.x*=Math.exp(-1.2*step);v.z*=Math.exp(-1.2*step);
   ball.rotation.x+=v.z*step;ball.rotation.z-=v.x*step;
   if(Math.hypot(v.x,v.z)<.04&&v.y===0){v.x=v.z=0;}
  }
 }
 return state;
}

export function tropicalIslandView(sim){
 const state=sim?.island;
 return state?{enabled:true,unlimitedExploration:true,buzzSeconds:ISLAND_BUZZ_SECONDS,updatedAt:state.updatedAt,balls:state.balls.map(({velocity,restY,...ball})=>copy(ball))}:null;
}

export function playerTropicalIslandView(player){
 const state=player?.island;
 return state?{...copy(state),authoritative:true,serverTime:player.islandLastAt,effects:islandEffects(state)}:null;
}

function stationFor(sim,environment,stationId){
 const id=typeof stationId==='string'?stationId.replace(/^island-(?:station-)?/,''):'';
 const station=ISLAND_EXPERIENCES.find(point=>point.id===id);
 if(!station)fail('Choose an island resort station.',422);
 const authored=environment.builderScene?.objects?.find(object=>object.id==='island-'+id||object.functionalSettings?.islandStation===id);
 const actor=sim.actors?.[authored?.id||'island-'+id];
 if(!authored||authored.functionalSettings?.enabled===false||authored.gameplay?.enabled===false||!actor||actor.active===false)fail('That resort station is unavailable.');
 return station;
}

function requireNear(player,station,now){
 if(!player?.actorId||player.health<=0||player.replacedByRoom||!Number.isFinite(player.lastSeen)||now-player.lastSeen>15000)fail('Join the live island before using a resort station.');
 if(!player.position||distance(player.position,station.position||station)>(station.radius||4)+.35)fail('Move closer to '+station.label+'.');
}

export function recordTropicalIslandVisit(sim,player,environment,stationId,now){
 if(!isTropicalIslandEnvironment(environment))return null;
 const station=stationFor(sim,environment,stationId);requireNear(player,station,now);
 const state=playerState(player,now),result=visitIslandExperience(state,station.id);
 if(!result.ok)fail(result.reason);
 if(!result.alreadyVisited)player.score=(player.score||0)+100;
 return {stationId:station.id,alreadyVisited:result.alreadyVisited,score:state.score};
}

/** Only canonical station IDs and drink choices cross the trust boundary.
 * Position, dose strength, timers, passport score and ball motion are server-owned.
 */
export function tropicalIslandCommand(sim,player,environment,command,now){
 if(!isTropicalIslandEnvironment(environment))fail('Visit Palm Coast Resort to use an island activity.');
 if(!Number.isFinite(now))fail('The resort clock is unavailable.');
 if(command.action!=='island-action'||!['drink','visit','kick','snorkel','relax'].includes(command.operation))fail('Choose a listed island activity.',422);
 const station=stationFor(sim,environment,command.stationId);requireNear(player,station,now);
 if(command.operation!=='visit'&&(player.vehicleId||player.skiLift||player.grounded===false))fail('Step onto the island before using this activity.');
 stepTropicalIsland(sim,environment,now);
 const state=playerState(player,now);let message;
 if(command.operation==='drink'){
  if(station.type!=='bar')fail('Order refreshments at a beach bar.');
  const result=consumeIslandDrink(state,command.kind);if(!result.ok)fail(result.reason);
  message=result.dose>0?'Your drink is served. Its own two-minute buzz starts now; new drinks stack.':'Refreshment served. Enjoy the island at your own pace.';
 }else if(command.operation==='visit'){
  const result=recordTropicalIslandVisit(sim,player,environment,station.id,now);
  message=result.alreadyVisited?station.label+' is already stamped in your passport.':'Passport stamped: '+station.label+' · +100 island score.';
 }else if(command.operation==='kick'){
  if(station.type!=='ball')fail('Find the Beach Ball Rally to kick a ball.');
  if(now<(player.islandKickAt||0)+600)fail('Let the ball travel before kicking again.');
  const ball=[...sim.island.balls].sort((a,b)=>distance(a.position,player.position)-distance(b.position,player.position))[0];
  if(!ball||distance(ball.position,player.position)>7)fail('Move closer to a beach ball.');
  const dx=ball.position.x-player.position.x,dz=ball.position.z-player.position.z,length=Math.hypot(dx,dz);
  ball.velocity={x:(length>.1?dx/length:-Math.sin(player.yaw||0))*7,y:3.2,z:(length>.1?dz/length:-Math.cos(player.yaw||0))*7};
  ball.kickedBy=player.actorId;ball.kickedAt=now;player.islandKickAt=now;message='Beach ball kicked across the sand.';
 }else{
  if(command.operation==='snorkel'&&station.type!=='snorkel'||command.operation==='relax'&&!['relax','lookout'].includes(station.type))fail('Choose the matching resort activity.');
  state.activity={kind:command.operation,stationId:station.id,startedAt:now,until:now+(command.operation==='snorkel'?8000:5000)};
  message=command.operation==='snorkel'?'Enjoy a reef-viewing break. The island stays open as long as you like.':'Take in the ocean breeze. Your island visit has no time limit.';
 }
 return {message,island:playerTropicalIslandView(player),islandStation:station.id,islandStationId:station.id};
}
