import {randomInt,randomUUID} from 'node:crypto';
import {FUNHOUSE_STATIONS,funhouseStations} from './public/js/clown-funhouse-config.js';
import {FUNHOUSE_EXPERIENCE_RULES as RULES,funhouseRideCue,funhouseRidePose,funhouseMazeCheckpoints,funhouseAimedTarget} from './public/js/funhouse-experience-rules.js';
import {FUNHOUSE_ADVENTURE_RULES,FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES,funhouseAdventureAvailable,funhouseAdventureNextClue,funhouseAdventureNear} from './public/js/funhouse-adventure-rules.js';
import {FUNHOUSE_HAUNT_RULES,FUNHOUSE_HAUNT_START,FUNHOUSE_HAUNT_WARDS,funhouseHauntAvailable,funhouseHauntNextWard,funhouseHauntNear} from './public/js/funhouse-haunt-rules.js';

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
const liveActivity=(sim,environment,activity)=>activity&&stationFor(sim,environment,activity.stationId);
const unavailable=(player,activity,station,now)=>!station||activity.stationRevision&&activity.stationRevision!==station.stationRevision||player.health<=0||player.replacedByRoom||now-player.lastSeen>15000||player.vehicleId||player.seatedId;
function finishChallenge(player,now,{cancel=false,message}={}){
 const state=progress(player),challenge=state.challenge;if(challenge?.status!=='active')return;
 challenge.status=cancel?'cancelled':'complete';challenge.phase='finished';challenge.finishedAt=now;
 if(!cancel){player.score=(player.score||0)+challenge.score;state.bestScores||={};state.bestScores[challenge.kind]=Math.max(state.bestScores[challenge.kind]||0,challenge.score);if(challenge.kind==='jackbox'&&challenge.hits)stamp(state,{kind:'jackbox',id:challenge.canonicalStationId});}
 challenge.message=message||(cancel?'Challenge ended without awarding points.':challenge.kind==='ballpit'?'Ball-pit round complete · '+challenge.score+' points!':challenge.kind==='jackbox'?(challenge.hits?'Caught the creepy clown · 50 points!':'The clown escaped. Wind the box and try again.'):'Mirror maze complete · '+challenge.score+' points!');
 state.message=challenge.message;
}
function finishRide(player,now,{cancel=false,message}={}){
 const state=progress(player),ride=state.ride;if(ride?.status!=='active')return;
 ride.status=cancel?'cancelled':'complete';ride.finishedAt=now;ride.progress=Math.min(1,Math.max(0,(now-ride.startedAt)/ride.durationMs));
 if(ride.pose?.exitPosition){player.position={...ride.pose.exitPosition};player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;}
 if(!cancel){player.score=(player.score||0)+ride.score;state.bestScores||={};state.bestScores[ride.kind]=Math.max(state.bestScores[ride.kind]||0,ride.score);stamp(state,{kind:ride.kind,id:ride.canonicalStationId});}
 ride.message=message||(cancel?'You stepped safely back onto the midway.':(ride.kind==='car'?'Clown-car horn ride':'Dizzy spinner ride')+' complete · '+ride.score+' points!');state.message=ride.message;
}
function finishAdventure(player,now,{cancel=false,message}={}){
 const state=player?.funhouse,adventure=state?.adventure;if(adventure?.status!=='active')return;
 adventure.status=cancel?'cancelled':'complete';adventure.finishedAt=now;
 if(cancel){adventure.score=0;adventure.bonus=0;adventure.settled=false;}
 else{
  adventure.bonus=Math.min(FUNHOUSE_ADVENTURE_RULES.maximumBonus,Math.max(0,Math.floor((adventure.endsAt-now)/1000)));
  adventure.score=FUNHOUSE_ADVENTURE_CLUES.length*FUNHOUSE_ADVENTURE_RULES.cluePoints+adventure.bonus;
  adventure.settled=true;player.score=(player.score||0)+adventure.score;
  state.bestScores||={};state.bestScores.adventure=Math.max(state.bestScores.adventure||0,adventure.score);
 }
 adventure.hint=cancel?'Return to the welcome board to start a new trail.':'All six lost laughs found. Return to the welcome board to replay.';
 adventure.message=message||(cancel?'The Lost Laugh Trail ended without awarding points.':'The Lost Laugh Trail complete · '+adventure.score+' points! All six secrets discovered.');
 state.message=adventure.message;
}
function requireAdventureFloor(player){
 if(player.health<=0||player.vehicleId||player.seatedId||player.grounded===false||player.funhouse?.ride?.status==='active')fail('Step off the ride and stand on the funhouse floor before searching.');
}
function finishHaunt(player,now,{cancel=false,message}={}){
 const state=player?.funhouse,haunt=state?.haunt;if(haunt?.status!=='active')return;
 haunt.status=cancel?'cancelled':'complete';haunt.finishedAt=now;
 if(cancel){haunt.score=0;haunt.bonus=0;haunt.settled=false;}
 else{
  haunt.bonus=Math.min(FUNHOUSE_HAUNT_RULES.maximumBonus,Math.max(0,Math.floor((haunt.endsAt-now)/1000)));
  haunt.score=FUNHOUSE_HAUNT_WARDS.length*FUNHOUSE_HAUNT_RULES.wardPoints+haunt.bonus;
  haunt.settled=true;player.score=(player.score||0)+haunt.score;
  state.bestScores||={};state.bestScores.haunt=Math.max(state.bestScores.haunt||0,haunt.score);
 }
 haunt.hint=cancel?'Return to the haunted house lobby to start another Night Watch.':'All four lanterns sealed. Return to the house lobby to replay.';
 haunt.message=message||(cancel?'Night Watch ended without awarding points.':'Night Watch complete · '+haunt.score+' points! The midnight shadows retreat.');
 state.message=haunt.message;
}
function hauntCommand(player,environment,command,now){
 const state=progress(player),haunt=state.haunt,operation=command.operation;
 if(!['start','seal','stop'].includes(operation))fail('Choose whether to start, seal or stop Night Watch.',422);
 if(command.hauntId&&command.hauntId!==haunt?.id)fail('That Night Watch is no longer available.');
 if(operation==='stop'){
  finishHaunt(player,now,{cancel:true});return {message:haunt?.message||'No Night Watch is active.',funhouse:state};
 }
 if(!funhouseHauntAvailable(environment))fail('Visit the complete Midnight Laughs map to play Night Watch.');
 requireAdventureFloor(player);
 if(operation==='start'){
  if(haunt?.status==='active')fail('Finish or stop the current Night Watch before starting again.');
  if(!funhouseHauntNear(player.position,FUNHOUSE_HAUNT_START))fail('Walk to the haunted house lobby to start Night Watch.');
  cancelFunhouseActivities(player,now,'Starting Night Watch ended the previous carnival game.',{preserveAdventure:true});
  state.haunt={id:randomUUID(),name:FUNHOUSE_HAUNT_START.name,status:'active',startedAt:now,endsAt:now+FUNHOUSE_HAUNT_RULES.durationMs,durationMs:FUNHOUSE_HAUNT_RULES.durationMs,wardIndex:0,sealed:[],score:0,bonus:0,settled:false,hint:FUNHOUSE_HAUNT_WARDS[0].hint,message:'Four lanterns are keeping the shadows awake. Seal them in order before the midnight bell!'};
  state.message=state.haunt.message;
  const effect={stationId:FUNHOUSE_HAUNT_START.id,canonicalStationId:FUNHOUSE_HAUNT_START.id,objectId:null,kind:'haunt',phase:'start',position:{...FUNHOUSE_HAUNT_START.position},at:now,until:now+4500};
  state.effects['haunt:start']=effect;return {message:state.message,funhouse:state,funhouseEffect:effect};
 }
 if(haunt?.status!=='active')fail('Start Night Watch in the haunted house lobby before sealing a lantern.');
 const ward=funhouseHauntNextWard(haunt);
 if(!ward||command.wardId!==ward.id)fail('Follow the next Night Watch lantern in order.');
 if(!funhouseHauntNear(player.position,ward))fail('Walk closer to the '+ward.name+' before sealing it.');
 haunt.sealed.push(ward.id);haunt.wardIndex++;haunt.score=haunt.sealed.length*FUNHOUSE_HAUNT_RULES.wardPoints;
 haunt.lastWardId=ward.id;haunt.lastSealedAt=now;haunt.message=ward.discovery;
 const next=funhouseHauntNextWard(haunt);haunt.hint=next?.hint||'All four lanterns sealed!';
 if(haunt.wardIndex===FUNHOUSE_HAUNT_WARDS.length)finishHaunt(player,now);
 state.message=haunt.message;
 const effect={stationId:FUNHOUSE_HAUNT_START.id,canonicalStationId:FUNHOUSE_HAUNT_START.id,objectId:null,kind:'haunt',phase:haunt.status==='complete'?'complete':'seal',wardId:ward.id,position:{...ward.position},at:now,until:now+4500};
 state.effects['haunt:'+ward.id]=effect;
 return {message:haunt.message,funhouse:state,funhouseEffect:effect};
}
function adventureCommand(player,environment,command,now){
 const state=progress(player),adventure=state.adventure,operation=command.operation;
 if(!['start','inspect','stop'].includes(operation))fail('Choose whether to start, inspect or stop the adventure.',422);
 if(command.adventureId&&command.adventureId!==adventure?.id)fail('That adventure trail is no longer available.');
 if(operation==='stop'){
  finishAdventure(player,now,{cancel:true});
  return {message:adventure?.message||'No adventure trail is active.',funhouse:state};
 }
 if(!funhouseAdventureAvailable(environment))fail('Visit the complete Midnight Laughs map to follow the Lost Laugh Trail.');
 requireAdventureFloor(player);
 if(operation==='start'){
  if(adventure?.status==='active')fail('Finish or stop the current adventure trail before starting again.');
  if(!funhouseAdventureNear(player.position,FUNHOUSE_ADVENTURE_START))fail('Walk to the Midnight Laughs welcome board to start the adventure.');
  state.adventure={id:randomUUID(),name:FUNHOUSE_ADVENTURE_START.name,status:'active',startedAt:now,endsAt:now+FUNHOUSE_ADVENTURE_RULES.durationMs,durationMs:FUNHOUSE_ADVENTURE_RULES.durationMs,clueIndex:0,found:[],score:0,bonus:0,settled:false,hint:FUNHOUSE_ADVENTURE_CLUES[0].hint,message:'The ringmaster lost six laughs. Follow the clues, inspect each secret and light the final lantern!'};
  state.message=state.adventure.message;return {message:state.message,funhouse:state};
 }
 if(adventure?.status!=='active')fail('Start the Lost Laugh Trail at the welcome board before searching.');
 const clue=funhouseAdventureNextClue(adventure);
 if(!clue||command.clueId!==clue.id)fail('Follow the next adventure clue in order.');
 if(!funhouseAdventureNear(player.position,clue))fail('Walk closer to '+clue.name+' before inspecting it.');
 adventure.found.push(clue.id);adventure.clueIndex++;adventure.score=adventure.found.length*FUNHOUSE_ADVENTURE_RULES.cluePoints;
 adventure.lastClueId=clue.id;adventure.lastFoundAt=now;adventure.discoveredAt=now;adventure.message=clue.discovery;
 const next=funhouseAdventureNextClue(adventure);adventure.hint=next?.hint||'All six secrets found!';
 if(adventure.clueIndex===FUNHOUSE_ADVENTURE_CLUES.length)finishAdventure(player,now);
 state.message=adventure.message;
 const effect={stationId:FUNHOUSE_ADVENTURE_START.id,canonicalStationId:FUNHOUSE_ADVENTURE_START.id,objectId:null,kind:'adventure',clueId:clue.id,scare:clue.scare,position:{...clue.position},at:now,until:now+3500};
 state.effects['adventure:'+clue.id]=effect;
 return {message:adventure.message,funhouse:state,funhouseEffect:effect};
}
/** Travel and explicit exit always release the virtual ride seat. */
export function cancelFunhouseActivities(player,now,reason='Changing activity ended this carnival game.',{preserveAdventure=false}={}){
 if(!player?.funhouse)return;
 finish(player,now,{cancel:true});finishChallenge(player,now,{cancel:true,message:reason});finishRide(player,now,{cancel:true,message:reason});
 finishHaunt(player,now,{cancel:true,message:reason});
 if(!preserveAdventure)finishAdventure(player,now,{cancel:true,message:reason});
}
function updateRideCue(ride,now){Object.assign(ride,funhouseRideCue(ride,now));}
function aimedTarget(player,station,command,kind){
 if(command.origin===undefined&&command.direction===undefined)return command.targetId;
 const origin=command.origin,direction=command.direction;
 if(!origin||!['x','y','z'].every(key=>Number.isFinite(origin[key]))||!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<.1)fail('Aim with a valid controller or first-person ray.',422);
 if(Math.hypot(origin.x-player.position.x,origin.z-player.position.z)>2.2||origin.y<player.position.y-.4||origin.y>player.position.y+3.2)fail('Your water blaster or throwing hand must stay near your player.',422);
 // A scenery-blocked controller ray stays a miss even if its infinite line
 // intersects a target behind that scenery. Claimed hits still require aim.
 if(command.targetId===-1)return -1;
 return funhouseAimedTarget(station,origin,direction,{kind});
}
function activeChallenge(sim,player,environment,command,now){
 const challenge=player.funhouse?.challenge;if(challenge?.status!=='active'||command.stationId!==challenge.stationId||command.challengeId&&command.challengeId!==challenge.id)fail('Start this attraction challenge before acting.');
 const station=liveActivity(sim,environment,challenge);if(!station)fail('That attraction is no longer available.');
 if(challenge.kind!=='mirrors')requireNear(player,station);
 if(now>=challenge.endsAt)fail('That attraction challenge has ended.');
 return {challenge,station};
}
/** Timers, relocation and score settlement use the room clock. A disconnected
 * or relocated visitor cannot leave a scoring round behind in the gallery. */
export function stepFunhouse(sim,environment,now){
 for(const player of Object.values(sim.players||{})){
  const haunt=player.funhouse?.haunt;
  if(haunt?.status==='active'){
   if(!funhouseHauntAvailable(environment)||player.health<=0||player.replacedByRoom||now-player.lastSeen>15000||player.vehicleId||player.seatedId)finishHaunt(player,now,{cancel:true,message:'Night Watch stopped. Return to the haunted house lobby when you are ready.'});
   else if(now>=haunt.endsAt)finishHaunt(player,now,{cancel:true,message:'The midnight bell rang before all four lanterns were sealed. Return to the house lobby to try again.'});
  }
  const adventure=player.funhouse?.adventure;
  if(adventure?.status==='active'){
   if(!funhouseAdventureAvailable(environment)||player.health<=0||player.replacedByRoom||now-player.lastSeen>15000)finishAdventure(player,now,{cancel:true,message:'The adventure stopped. Return to the welcome board when you are ready.'});
   else if(now>=adventure.endsAt)finishAdventure(player,now,{cancel:true,message:'The trail lantern went dark. Return to the welcome board to try again.'});
  }
  const round=player.funhouse?.round;
  if(round?.status==='active'){
   const station=stationFor(sim,environment,round.stationId);
   if(unavailable(player,round,station,now)||distance(player.position,station.position)>(station.interactionDistance||6.5)+1)finish(player,now,{cancel:true});
   else if(now>=round.endsAt)finish(player,now);
  }
  const ride=player.funhouse?.ride;
  if(ride?.status==='active'){
   const station=liveActivity(sim,environment,ride);
   if(unavailable(player,ride,station,now))finishRide(player,now,{cancel:true,message:'The ride stopped safely. Return to the attraction to board again.'});
   else{ride.pose=funhouseRidePose(ride,station,now);ride.progress=ride.pose.progress;updateRideCue(ride,now);if(now>=ride.endsAt)finishRide(player,now);}
  }
  const challenge=player.funhouse?.challenge;
  if(challenge?.status==='active'){
   const station=liveActivity(sim,environment,challenge);
   if(unavailable(player,challenge,station,now)||challenge.kind!=='mirrors'&&distance(player.position,station.position)>(station.interactionDistance||6.5)+1){finishChallenge(player,now,{cancel:true,message:'The challenge ended. Return to the attraction to try again.'});continue;}
   if(challenge.kind==='mirrors'){
    const checkpoint=challenge.checkpoints[challenge.checkpointIndex];
    if(checkpoint&&distance(player.position,checkpoint)<=checkpoint.radius){challenge.lastCheckpointIndex=challenge.checkpointIndex;challenge.lastCheckpointAt=now;challenge.checkpointIndex++;challenge.message=challenge.checkpointIndex===challenge.checkpoints.length?'All passages found. Ring the exit bell!':'Checkpoint found. Continue to '+challenge.checkpoints[challenge.checkpointIndex].name+'.';progress(player).message=challenge.message;if(challenge.checkpointIndex===challenge.checkpoints.length)challenge.phase='bell';}
   }
   if(challenge.kind==='jackbox'&&challenge.phase==='ready'&&now>challenge.catchUntil)finishChallenge(player,now);
   else if(now>=challenge.endsAt)finishChallenge(player,now,{message:challenge.kind==='mirrors'?'Maze time expired. Start at the entrance to try again.':undefined});
  }
 }
}
export function funhouseCommand(sim,player,environment,command,now,{integer=randomInt}={}){
 if(!Number.isFinite(now))fail('The attraction clock is unavailable.');
 const supported=['funhouse-start','funhouse-squirt','funhouse-use','funhouse-dress','funhouse-stop','funhouse-ride','funhouse-ride-exit','funhouse-challenge','funhouse-action','funhouse-adventure','funhouse-haunt'];
 if(!supported.includes(command.action))fail('Choose a supported funhouse activity.',422);
 stepFunhouse(sim,environment,now);
 const state=progress(player);
 const exitCommand=['funhouse-ride-exit','funhouse-stop'].includes(command.action)||['funhouse-action','funhouse-adventure','funhouse-haunt'].includes(command.action)&&command.operation==='stop';
 if(!exitCommand&&!funhouseStations(environment,{actors:sim.actors}).length)fail('Visit Midnight Laughs Funhouse or place a carnival attraction before playing.');
 if(command.action==='funhouse-adventure')return adventureCommand(player,environment,command,now);
 if(command.action==='funhouse-haunt')return hauntCommand(player,environment,command,now);
 if(state.ride?.status==='active'&&!['funhouse-action','funhouse-ride-exit','funhouse-ride'].includes(command.action))fail('Use the ride controls or step off before choosing another attraction.');
 if(command.action==='funhouse-ride-exit'){
  if(!state.ride||command.rideId&&command.rideId!==state.ride.id)fail('That ride seat is no longer available.');
  finishRide(player,now,{cancel:true});return {message:state.message,funhouse:state};
 }
 if(command.action==='funhouse-ride'){
  const station=requireNear(player,stationFor(sim,environment,command.stationId));if(!['car','spinner'].includes(station.kind))fail('Choose the clown car or dizzy spinner to board.',422);
  if(state.ride?.status==='active')fail('Leave your current ride before boarding another.');
  if(Object.values(sim.players||{}).some(other=>other!==player&&other.funhouse?.ride?.status==='active'&&other.funhouse.ride.stationId===station.id))fail('Another guest is riding. Wait for this ride to finish.');
  cancelFunhouseActivities(player,now,'Boarding ended the previous carnival challenge.',{preserveAdventure:true});
  const durationMs=station.kind==='car'?RULES.carMs:RULES.spinnerMs;
  state.ride={id:randomUUID(),kind:station.kind,stationId:station.id,canonicalStationId:station.canonicalStationId||station.id,objectId:station.objectId||null,stationRevision:station.stationRevision||null,status:'active',startedAt:now,endsAt:now+durationMs,durationMs,progress:0,score:0,hits:0,gentle:true,lastCueHit:-1,message:station.kind==='car'?'Seated in the clown car. Honk when the horn cue lights up!':'Seated in the spinner. Balance toward the lit side!'};
  state.ride.pose=funhouseRidePose(state.ride,station,now);updateRideCue(state.ride,now);player.position={...state.ride.pose.position};player.floor=player.position.y;player.input={};player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;
  state.message=state.ride.message;return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'ride-start',now,{rideKind:station.kind,endsAt:state.ride.endsAt})};
 }
 if(command.action==='funhouse-challenge'){
  const station=requireNear(player,stationFor(sim,environment,command.stationId));if(!['jackbox','ballpit','mirrors'].includes(station.kind))fail('Choose the fright box, ball pit or mirror maze for this challenge.',422);
  if(state.challenge?.status==='active')fail('Finish or stop your current attraction challenge first.');
  cancelFunhouseActivities(player,now,'Starting a challenge ended the previous carnival game.',{preserveAdventure:true});
  const durationMs=station.kind==='jackbox'?RULES.jackBoxMs:station.kind==='ballpit'?RULES.ballPitMs:RULES.mazeMs;
  state.challenge={id:randomUUID(),kind:station.kind,stationId:station.id,canonicalStationId:station.canonicalStationId||station.id,objectId:station.objectId||null,stationRevision:station.stationRevision||null,mazeGroup:station.mazeGroup||null,status:'active',phase:station.kind==='jackbox'?'winding':station.kind==='mirrors'?'walking':'playing',startedAt:now,endsAt:now+durationMs,durationMs,hits:0,shots:0,score:0,windCount:0,targetId:station.kind==='ballpit'?integer(4):null,checkpointIndex:0,message:station.kind==='jackbox'?'Wind three times, then catch the clown when it pops!':station.kind==='ballpit'?'Toss at the glowing color target!':'Follow the marked mirror passages, then ring the exit bell.'};
  if(station.kind==='mirrors'){state.challenge.checkpoints=funhouseMazeCheckpoints(station);state.mazeStartedAt=now;state.mazeGroup=station.mazeGroup;state.mazeStartStationId=station.id;}
  state.message=state.challenge.message;return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'challenge-start',now,{challengeKind:station.kind})};
 }
 if(command.action==='funhouse-action'){
  if(state.ride?.status==='active'&&command.stationId===state.ride.stationId){
   const ride=state.ride,station=liveActivity(sim,environment,ride);if(!station)fail('This ride is no longer available.');updateRideCue(ride,now);
   if(command.operation==='gentle'){if(typeof command.enabled!=='boolean')fail('Choose whether to use the gentle ride view.',422);ride.gentle=command.enabled;ride.message=command.enabled?'Gentle ride view enabled.':'Turning ride view enabled.';}
   else if(command.operation==='honk'&&ride.kind==='car'){
    if(now-(ride.lastActionAt||0)<400)fail('Let the horn refill.',429);ride.lastActionAt=now;
    const hit=now>=ride.nextCueAt&&now<=ride.cueUntil&&ride.lastCueHit!==ride.cueIndex;if(hit){ride.hits++;ride.score+=10;ride.lastCueHit=ride.cueIndex;}ride.message=hit?'HONK! Perfect horn cue · +10 points.':'HONK! Watch for the next lit horn cue.';
   }else if(command.operation==='balance'&&ride.kind==='spinner'){
    if(!Number.isInteger(command.targetId)||![0,1].includes(command.targetId))fail('Choose left or right to balance.',422);
    if(now-(ride.lastActionAt||0)<300)fail('Hold your balance for a moment.',429);ride.lastActionAt=now;
    const hit=command.targetId===ride.targetId&&ride.lastCueHit!==ride.cueIndex;if(hit){ride.hits++;ride.score+=10;ride.lastCueHit=ride.cueIndex;}ride.message=hit?'Balanced! +10 points.':'Follow the lit balance side for the next cue.';
   }else fail('Choose a control available on this ride.',422);
   state.message=ride.message;return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,command.operation,now,{targetId:command.targetId,score:ride.score})};
  }
  if(command.operation==='stop'&&state.challenge&&command.stationId===state.challenge.stationId){if(command.challengeId&&command.challengeId!==state.challenge.id)fail('That attraction challenge is no longer available.');finishChallenge(player,now,{cancel:true});return {message:state.message,funhouse:state};}
  const {challenge,station}=activeChallenge(sim,player,environment,command,now);
  if(command.operation==='wind'&&challenge.kind==='jackbox'){
   if(challenge.phase!=='winding')fail('The box is wound. Wait for the clown, then catch it.');
   if(now-(challenge.lastActionAt||0)<RULES.windIntervalMs)fail('Turn the handle steadily.',429);challenge.lastActionAt=now;challenge.windCount++;
   if(challenge.windCount>=RULES.windCount){challenge.phase='ready';challenge.readyAt=now+RULES.jackDelayMs;challenge.catchUntil=challenge.readyAt+RULES.jackCatchMs;challenge.message='Watch the box. Catch the clown as soon as it pops!';}else challenge.message='Wind '+challenge.windCount+' / '+RULES.windCount+'. Keep turning!';
  }else if(command.operation==='catch'&&challenge.kind==='jackbox'){
   if(challenge.phase!=='ready'||now<challenge.readyAt)fail('Wait until the clown pops out.');
   challenge.hits=now<=challenge.catchUntil?1:0;challenge.score=challenge.hits?50:0;finishChallenge(player,now);
  }else if(command.operation==='toss'&&challenge.kind==='ballpit'){
   const targetId=aimedTarget(player,station,command,'ballpit');if(!Number.isInteger(targetId)||targetId< -1||targetId>3)fail('Aim at one of the four ball-pit targets.',422);
   if(now-(challenge.lastActionAt||0)<RULES.tossIntervalMs)fail('Pick up the next carnival ball.',429);challenge.lastActionAt=now;challenge.shots++;
   const hit=targetId===challenge.targetId;if(hit){challenge.hits++;challenge.score+=10;}challenge.targetId=(challenge.targetId+1+integer(3))%4;challenge.message=hit?'Bullseye! +10 points. Find the next glowing color.':'Miss! Toss at the glowing color.';state.message=challenge.message;
   return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'toss',now,{targetId,hit,origin:command.origin,direction:command.direction})};
  }else if(command.operation==='check-in'&&challenge.kind==='mirrors'){
   const checkpoint=challenge.checkpoints[challenge.checkpointIndex],previous=challenge.checkpoints[challenge.lastCheckpointIndex];
   if(previous&&distance(player.position,previous)<=previous.radius&&now-challenge.lastCheckpointAt<=1000){challenge.message=challenge.phase==='bell'?'All passages found. Ring the exit bell!':'Mirror checkpoint confirmed.';}
   else{if(!checkpoint)fail('All passages found. Ring the exit bell.');if(distance(player.position,checkpoint)>checkpoint.radius)fail('Walk to the next marked mirror passage.');challenge.lastCheckpointIndex=challenge.checkpointIndex;challenge.lastCheckpointAt=now;challenge.checkpointIndex++;if(challenge.checkpointIndex===challenge.checkpoints.length)challenge.phase='bell';challenge.message=challenge.phase==='bell'?'All passages found. Ring the exit bell!':'Mirror checkpoint confirmed.';}
  }else fail('Choose an action available in this attraction challenge.',422);
  state.message=challenge.message;return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,command.operation,now,{readyAt:challenge.readyAt,catchUntil:challenge.catchUntil,windCount:challenge.windCount,hit:challenge.hits>0})};
 }
 if(command.action==='funhouse-start'){
  const station=requireNear(player,stationFor(sim,environment,command.stationId));if(station.kind!=='water')fail('Start a water round at the water-gun gallery.',422);
  if(state.round?.status==='active')fail('Finish your current water round first.');
  cancelFunhouseActivities(player,now,'Starting the water gallery ended the previous attraction challenge.',{preserveAdventure:true});
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
  const targetId=aimedTarget(player,station,command,'water');
  if(!Number.isInteger(targetId)||targetId< -1||targetId>5)fail('Aim at one of the six clown targets.',422);
  if(round.lastShotAt!==undefined&&now-round.lastShotAt<FUNHOUSE_SHOT_MS)fail('Give the water gun a moment to refill.',429);
  const hit=targetId===round.targetId;round.lastShotAt=now;round.shots++;round.hits+=hit?1:0;round.score+=hit?10:0;
  const previous=round.targetId;round.targetId=(previous+1+integer(5))%6;
  round.message=hit?'Splash! +10 points. Find the next glowing clown.':'Miss! Aim for the glowing clown.';state.message=round.message;
  return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,'squirt',now,{targetId,hit,origin:command.origin,direction:command.direction})};
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
 let mazeOutcome='';
 if(station.kind==='maze-finish'&&state.challenge?.status==='active'&&state.challenge.kind==='mirrors'){
  const challenge=state.challenge;
  if(challenge.mazeGroup!==station.mazeGroup)fail('Return to the exit bell for this mirror maze.');
  if(challenge.checkpointIndex<challenge.checkpoints.length)fail('Follow every marked mirror passage before ringing the bell.');
  challenge.score=100+Math.min(100,Math.max(0,Math.floor((challenge.endsAt-now)/1000)));challenge.hits=challenge.checkpoints.length;finishChallenge(player,now);mazeOutcome=state.message;
 }
 if(station.kind==='mirrors'){state.mazeStartedAt=now;state.mazeGroup=station.mazeGroup;state.mazeStartStationId=station.id;}
 stamp(state,station);state.effects[station.id]=effectFor(station,station.kind,now,{until:now+4000});
 while(Object.keys(state.effects).length>128)delete state.effects[Object.keys(state.effects)[0]];
 const messages={welcome:'Welcome to Midnight Laughs! Explore the haunted clown house, splash targets, try clown gear and collect six stamps.',car:'HONK HONK! The tiny clown car is bursting with surprises. Car stamp collected!',spinner:'Round and round under the giant propeller hat! Spinner stamp collected.',mirrors:'Mirror maze started. Follow the crooked passages to the exit bell at the far back left.', 'maze-finish':'DING! You found the mirror maze exit. Maze stamp collected!',ballpit:'The monster ball pit bubbles and bounces. Something silly is hiding underneath!',jackbox:'Wind, wind... BOO! The jack-in-the-box clown springs out. Surprise stamp collected!'};
 state.message=mazeOutcome||messages[station.kind]||station.name+' is ready.';
 return {message:state.message,funhouse:state,funhouseEffect:effectFor(station,station.kind,now)};
}
/** Keep projection explicit so private room fields cannot leak into snapshots. */
export function playerFunhouseView(player){
 const state=player?.funhouse;if(!state)return null;
 return {stamps:[...state.stamps],costume:{...state.costume},tool:state.tool||null,equipment:{...state.equipment},bestScore:state.bestScore,bestScores:{...state.bestScores},rounds:state.rounds,round:state.round?{...state.round}:null,ride:state.ride?structuredClone(state.ride):null,challenge:state.challenge?structuredClone(state.challenge):null,adventure:state.adventure?structuredClone(state.adventure):null,haunt:state.haunt?structuredClone(state.haunt):null,effects:structuredClone(state.effects),message:state.message};
}
