import {isForestHarvestEnvironment} from './public/js/forest-harvest-config.js';
import {FOREST_SNAKE_ID,FOREST_SNAKE_MODEL_ID,FOREST_SNAKE_NAME,FOREST_SNAKE_ROUTE,FOREST_SNAKE_REMARKS,FOREST_SNAKE_SPEECH_MS,FOREST_SNAKE_REMARK_INTERVAL_MS,FOREST_SNAKE_HEARING_DISTANCE,FOREST_SNAKE_TALK_DISTANCE,forestSnakePose} from './public/js/forest-snake-config.js';

const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
const live=(player,now)=>player&&!player.basketballAI&&!player.isAI&&!player.ai&&!player.replacedByRoom&&!(player.health<=0)&&Number.isFinite(player.lastSeen)&&now-player.lastSeen>=0&&now-player.lastSeen<15_000;
function say(state,sim,environment,now){
 const number=state.utteranceSequence||0,text=FOREST_SNAKE_REMARKS[number%FOREST_SNAKE_REMARKS.length];
 state.utteranceSequence=number+1;state.lastSpokenAt=now;state.nextSpeechAt=now+FOREST_SNAKE_REMARK_INTERVAL_MS;
 state.speech={id:'forest-snake:'+String(sim.forestHarvest.instanceId||environment.roomId||environment.id)+':'+state.utteranceSequence,text,startedAt:now,endsAt:now+FOREST_SNAKE_SPEECH_MS};
 return state.speech;
}
/** Only the authored forest actor can patrol. Never spawns an animal into an
 * unrelated room, and never changes player, vehicle or harvesting state. */
export function stepForestSnake(sim,environment,now=Date.now()){
 if(!isForestHarvestEnvironment(environment)||!sim.forestHarvest||!Number.isFinite(now))return null;
 const actor=sim.actors?.[FOREST_SNAKE_ID];
 if(!actor||actor.active===false||!['modelId','buildAssetId'].some(key=>actor[key]===FOREST_SNAKE_MODEL_ID)&&actor.asset?.buildAssetId!==FOREST_SNAKE_MODEL_ID)return null;
 const start=FOREST_SNAKE_ROUTE[0];
 const state=sim.forestHarvest.snake ||= {id:FOREST_SNAKE_ID,name:FOREST_SNAKE_NAME,epoch:now,origin:{x:(actor.position?.x??start.x)-start.x,y:actor.position?.y||0,z:(actor.position?.z??start.z)-start.z},utteranceSequence:0,nextSpeechAt:now+3000,nearSince:null,speech:null};
 const pose=forestSnakePose(now,state.epoch,state.origin);state.position=pose.position;state.rotation=pose.rotation;state.phase=pose.phase;
 state.headPosition={x:pose.position.x-Math.sin(pose.rotation.y)*5.5,y:pose.position.y+.85,z:pose.position.z-Math.cos(pose.rotation.y)*5.5};
 actor.position={...pose.position};actor.rotation={...pose.rotation};actor.destructible=false;actor.forestSnakeManaged=true;
 if(state.speech&&now>=state.speech.endsAt)state.speech=null;
 const nearby=Object.values(sim.players||{}).some(player=>live(player,now)&&Math.min(distance(player.position,state.position),distance(player.position,state.headPosition))<=FOREST_SNAKE_HEARING_DISTANCE);
 if(nearby){
  state.nearSince??=now;
  if(!state.speech&&now>=state.nextSpeechAt&&now-state.nearSince>=3000)say(state,sim,environment,now);
 }else state.nearSince=null;
 actor.forestSnake={id:state.id,name:state.name,phase:state.phase,talking:!!state.speech,speechId:state.speech?.id||null};
 return state;
}
/** A client may ask to hear Mossback, but cannot supply its words or clock. */
export function forestSnakeTalk(sim,player,environment,now=Date.now()){
 const state=stepForestSnake(sim,environment,now);
 if(!state)fail('Mossback is not in this forest.');
 if(!player||player.health<=0||player.replacedByRoom||player.grounded===false)fail('Stand nearby to speak with Mossback.');
 if(Math.min(distance(player.position,state.position),distance(player.position,state.headPosition))>FOREST_SNAKE_TALK_DISTANCE)fail('Walk closer to Mossback to hear what is on its mind.');
 const speech=state.speech&&now<state.speech.endsAt?state.speech:say(state,sim,environment,now);
 const actor=sim.actors[FOREST_SNAKE_ID];actor.forestSnake={id:state.id,name:state.name,phase:state.phase,talking:true,speechId:speech.id};
 return {message:FOREST_SNAKE_NAME+': '+speech.text,snakeSpeech:{...speech}};
}

/** A small motion component keeps patrol updates out of the large tree snapshot. */
export function forestSnakeView(sim){
 const state=sim.forestHarvest?.snake;if(!state)return null;
 return {id:state.id,name:state.name,position:{...state.position},headPosition:{...state.headPosition},rotation:{...state.rotation},phase:state.phase,speech:state.speech?{...state.speech}:null};
}
