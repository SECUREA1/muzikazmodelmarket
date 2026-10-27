import {randomInt,randomUUID} from 'node:crypto';
import {FUNHOUSE_STATIONS,funhouseStations} from './public/js/clown-funhouse-config.js';

export const FUNHOUSE_ROUND_MS=30000;
export const FUNHOUSE_SHOT_MS=300;
export const FUNHOUSE_STAMP_KINDS=Object.freeze(['water','car','spinner','dressup','maze-finish','jackbox']);
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const stationFor=(sim,environment,id)=>funhouseStations(environment,{actors:sim.actors}).find(station=>station.id===id);
const nearestStation=(sim,environment,player,kind)=>funhouseStations(environment,{actors:sim.actors}).filter(station=>station.kind===kind).sort((a,b)=>distance(player.position,a.position)-distance(player.position,b.position))[0];
export const ensureFunhouseProgress=player=>player.funhouse ||= {stamps:[],costume:{hat:false,shoes:false},bestScore:0,rounds:0,effects:{},round:null,message:'Collect six funhouse stamps. Every attraction is free.'};
const progress=ensureFunhouseProgress;
function stamp(state,station){const id=station.canonicalStationId||station.id;if(FUNHOUSE_STAMP_KINDS.includes(station.kind)&&!state.stamps.includes(id))state.stamps.push(id);}
const effectFor=(station,kind,now,extra={})=>({stationId:station.id,canonicalStationId:station.canonicalStationId||station.id,objectId:station.objectId||null,kind,at:now,...extra});
function requireNear(player,station){
 if(!station)fail('Choose a funhouse attraction.',422);
 if(player.health<=0||player.vehicleId||player.seatedId||player.grounded===false)fail('Stand on the funhouse floor before using an attraction.');
 if(distance(player.position,station.position)>(station.interactionDistance||6.5))fail('Walk closer to '+station.name+' before playing.');
 return station;
}
function finish(player,now,{cancel=false}={}){
 const state=progress(player),round=state.round;if(round?.status!=='active')return;
 round.status=cancel?'cancelled':'complete';round.finishedAt=cancel?now:round.endsAt;
 if(!cancel){state.rounds++;state.bestScore=Math.max(state.bestScore,round.score);player.score=(player.score||0)+round.score;if(round.hits>=3)stamp(state,{kind:'water',id:round.canonicalStationId||FUNHOUSE_STATIONS.find(station=>station.kind==='water').id});}
 round.message=cancel?'Water round ended. Return to the gallery to try again.':'Splash round complete · '+round.score+' points!'+(round.hits>=3?' Gallery stamp collected.':' Land three splashes next round to collect the gallery stamp.');
 state.message=round.message;
}
/** Timers, relocation and score settlement use the room clock. A disconnected
 * or relocated visitor cannot leave a scoring round behind in the gallery. */
export function stepFunhouse(sim,environment,now){
 for(const player of Object.values(sim.players||{})){
  const round=player.funhouse?.round;if(round?.status!=='active')continue;
  const station=stationFor(sim,environment,round.stationId);
  if(!station||round.stationRevision&&round.stationRevision!==station.stationRevision||player.health<=0||player.replacedByRoom||now-player.lastSeen>15000||distance(player.position,station.position)>(station.interactionDistance||6.5)+1||player.vehicleId||player.seatedId){finish(player,now,{cancel:true});continue;}
  if(now>=round.endsAt)finish(player,now);
 }
}
export function funhouseCommand(sim,player,environment,command,now,{integer=randomInt}={}){
 if(!funhouseStations(environment,{actors:sim.actors}).length)fail('Visit Midnight Laughs Funhouse or place a carnival attraction before playing.');
 if(!Number.isFinite(now))fail('The attraction clock is unavailable.');
 const supported=['funhouse-start','funhouse-squirt','funhouse-use','funhouse-dress','funhouse-stop'];
 if(!supported.includes(command.action))fail('Choose a supported funhouse activity.',422);
 stepFunhouse(sim,environment,now);
 const state=progress(player);
 if(command.action==='funhouse-start'){
  const station=requireNear(player,stationFor(sim,environment,command.stationId));if(station.kind!=='water')fail('Start a water round at the water-gun gallery.',422);
  if(state.round?.status==='active')fail('Finish your current water round first.');
  state.round={id:randomUUID(),stationId:station.id,canonicalStationId:station.canonicalStationId||station.id,stationRevision:station.stationRevision||null,objectId:station.objectId||null,status:'active',startedAt:now,endsAt:now+FUNHOUSE_ROUND_MS,targetId:integer(6),hits:0,shots:0,score:0,message:'Splash the glowing clown target. Thirty seconds on the clock!'};
  state.message=state.round.message;return {message:state.message,funhouse:state};
 }
 if(command.action==='funhouse-stop'){
  if(!state.round||command.roundId!==state.round.id)fail('That water round is no longer available.');
  finish(player,now,{cancel:true});return {message:state.message,funhouse:state};
 }
 if(command.action==='funhouse-squirt'){
  const round=state.round;
  const station=requireNear(player,round?stationFor(sim,environment,round.stationId):null);
  if(!round||command.roundId!==round.id)fail('Start a fresh water-gun round first.');
  if(round.status!=='active'||now>=round.endsAt)fail('That water round has ended. Start another round.');
  if(!Number.isInteger(command.targetId)||command.targetId<0||command.targetId>5)fail('Aim at one of the six clown targets.',422);
  if(round.lastShotAt!==undefined&&now-round.lastShotAt<FUNHOUSE_SHOT_MS)fail('Give the water gun a moment to refill.',429);
  const hit=command.targetId===round.targetId;round.lastShotAt=now;round.shots++;round.hits+=hit?1:0;round.score+=hit?10:0;
  const previous=round.targetId;round.targetId=(previous+1+integer(5))%6;
  round.message=hit?'Splash! +10 points. Find the next glowing clown.':'Miss! Aim for the glowing clown.';state.message=round.message;
  return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'squirt',now,{targetId:command.targetId,hit})};
 }
 if(command.action==='funhouse-dress'){
  const station=requireNear(player,command.stationId?stationFor(sim,environment,command.stationId):nearestStation(sim,environment,player,'dressup'));
  if(station.kind!=='dressup')fail('Choose a clown dressing room.',422);
  if(typeof command.hat!=='boolean'||typeof command.shoes!=='boolean')fail('Choose whether to wear the spinner hat and clown shoes.',422);
  state.costume={hat:command.hat,shoes:command.shoes};if(command.hat&&command.shoes)stamp(state,station);
  state.message=command.hat&&command.shoes?'Spinner hat and giant clown shoes equipped. Costume stamp collected!':'Clown costume updated.';
  return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'dressup',now)};
 }
 const station=requireNear(player,stationFor(sim,environment,command.stationId));
 if(['water','dressup'].includes(station.kind))fail('Choose the water game or costume controls for this attraction.',422);
 if((state.effects[station.id]?.until||0)>now)fail('The attraction is still playing. Enjoy the show!');
 if(station.kind==='maze-finish'&&(!state.mazeStartedAt||state.mazeGroup&&state.mazeGroup!==station.mazeGroup))fail('Begin at the Crooked Mirror Maze entrance before ringing its exit bell.');
 if(station.kind==='maze-finish'&&now-state.mazeStartedAt<4000)fail('Follow the mirror passages before ringing the exit bell.');
 if(station.kind==='mirrors'){state.mazeStartedAt=now;state.mazeGroup=station.mazeGroup;state.mazeStartStationId=station.id;}
 stamp(state,station);state.effects[station.id]=effectFor(station,station.kind,now,{until:now+4000});
 while(Object.keys(state.effects).length>128)delete state.effects[Object.keys(state.effects)[0]];
 const messages={welcome:'Welcome to Midnight Laughs! Explore the haunted clown house, splash targets, try clown gear and collect six stamps.',car:'HONK HONK! The tiny clown car is bursting with surprises. Car stamp collected!',spinner:'Round and round under the giant propeller hat! Spinner stamp collected.',mirrors:'Mirror maze started. Follow the crooked passages to the exit bell at the far back left.', 'maze-finish':'DING! You found the mirror maze exit. Maze stamp collected!',ballpit:'The monster ball pit bubbles and bounces. Something silly is hiding underneath!',jackbox:'Wind, wind... BOO! The jack-in-the-box clown springs out. Surprise stamp collected!'};
 state.message=messages[station.kind]||station.name+' is ready.';
 return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,station.kind,now)};
}
/** Keep projection explicit so private room fields cannot leak into snapshots. */
export function playerFunhouseView(player){
 const state=player?.funhouse;if(!state)return null;
 return {stamps:[...state.stamps],costume:{...state.costume},tool:state.tool||null,equipment:{...state.equipment},bestScore:state.bestScore,rounds:state.rounds,round:state.round?{...state.round}:null,effects:structuredClone(state.effects),message:state.message};
}
