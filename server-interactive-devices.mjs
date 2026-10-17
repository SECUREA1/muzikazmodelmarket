import {ARCADE_LIBRARY} from './public/js/arcade-library.js';
import {pokerPayout} from './public/js/poker-rules.js';
export {pokerPayout} from './public/js/poker-rules.js';
import {newArcadeGame,arcadeMove} from './server-arcade-games.mjs';
import {randomInt} from 'node:crypto';
import {deviceDefinition,deviceTime,sharedMediaUrl} from './public/js/interactive-devices.js';
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
export function nearbyDevice(sim,manifest,player,id,reach=5){
 const actor=sim.actors[id],definition=manifest.actors.find(item=>item.objectId===id)||actor?.definition,profile=deviceDefinition(definition?.modelId||actor?.asset?.buildAssetId,definition?.gameplay);
 if(!actor||actor.active===false||actor.holderId||!profile||Math.hypot(actor.position.x-player.position.x,actor.position.y-player.position.y,actor.position.z-player.position.z)>reach)fail('Move within reach of an interactive device.');return {actor,profile};
}
function drawCards(count,exclude=[]){const deck=Array.from({length:52},(_,index)=>index).filter(card=>!exclude.includes(card)),cards=[];while(cards.length<count)cards.push(deck.splice(randomInt(deck.length),1)[0]);return cards;}
const questions=[['Which tool moves a placed item?',['Mute','Placement controls','Reload'],1],['How do you keep a build available to other players?',['Close the tab','Erase the floor','Publish the map'],2],['What is used by arcade machines?',['Practice credits','Crypto transfers','Land deeds'],0],['What lets nearby players hear voice?',['Bigger bricks','Photo frame','Room microphone'],2]];
export function deviceCommand(sim,manifest,player,actorId,command,now){
 const {actor,profile:baseProfile}=nearbyDevice(sim,manifest,player,command.entityId,command.operation==='duration'?60:5);let profile=baseProfile;sim.devices ||= {};let state=sim.devices[actor.id];
 if(state&&!baseProfile.multiGame&&(state.kind!==profile.kind||state.game!==profile.game))state=null;
 state ||= sim.devices[actor.id]={id:actor.id,name:profile.name,kind:profile.kind,game:profile.game,revision:0,queue:[],current:null,playing:false,offset:0,startedAt:now,volume:.7,gamers:{}};
 if(baseProfile.multiGame){state.multiGame=true;state.selectedGame ||= 'tictactoe';const selected=ARCADE_LIBRARY.find(item=>item.id===state.selectedGame)||ARCADE_LIBRARY.find(item=>item.id==='tictactoe');profile={...baseProfile,...selected,game:selected.kind==='arcade'?selected.game:undefined};state.kind=profile.kind;state.game=profile.game;}
 state.id=actor.id;
 if(!state.gamers[actorId]&&['slots','poker','trivia','arcade'].includes(profile.kind)&&Object.keys(state.gamers).length>=256)fail('This arcade player list is full.');
 if(command.operation==='open'&&profile.kind==='trivia'){const gamer=state.gamers[actorId] ||= {name:player.username,credits:100,round:0};gamer.question=questions[gamer.round%questions.length].slice(0,2);}
 if(command.operation==='open'&&profile.kind==='arcade'){state.gamers[actorId] ||= {name:player.username,credits:100,round:0};}
 if(command.operation==='open')return {deviceId:actor.id,deviceKind:profile.kind,message:profile.name};
 const motionInput=profile.kind==='arcade'&&['snake','pong','breakout'].includes(profile.game)&&['up','down','left','right','pause','resume'].includes(command.operation);
 if(command.revision!==state.revision&&!(motionInput&&Number.isInteger(command.revision)&&command.revision>=Math.max(0,state.revision-16)&&command.revision<=state.revision))fail('Device changed. Refresh its controls and try again.');
 const op=command.operation;
 const gameDevice=['arcade','slots','poker','trivia'].includes(profile.kind);
 if(gameDevice&&state.activePlayerId&&state.activePlayerId!==actorId&&machineControllerPresent(sim,state,now))fail('This machine is in use. Watch the shared screen until the player finishes or leaves.');
 if(op==='select-game'){
  if(!baseProfile.multiGame)fail('This cabinet has one built-in game.');const selected=ARCADE_LIBRARY.find(item=>item.id===command.gameId);if(!selected)fail('Choose a game from the cabinet library.');
  for(const gamer of Object.values(state.gamers))for(const field of ['game','hand','phase','question','reels','award'])delete gamer[field];
  const gamer=state.gamers[actorId] ||= {name:player.username,credits:100,round:0};gamer.lastPlay=0;if(selected.kind==='trivia')gamer.question=questions[gamer.round%questions.length].slice(0,2);
  state.selectedGame=selected.id;state.kind=selected.kind;state.game=selected.game;state.running=false;state.activePlayerId=actorId;state.lastInputAt=now;state.updatedBy=player.username;state.updatedAt=now;state.revision++;return {deviceId:actor.id,deviceKind:selected.kind,message:selected.name+' selected.'};
 }
 if(['audio','video','image'].includes(profile.kind)){
  if(op==='enqueue'){
   if(state.queue.length>=20)fail('The shared queue is full.');const url=sharedMediaUrl(command.url,profile.kind),item={id:command.requestId,url,title:String(command.title||'Community media').slice(0,100),addedBy:player.username};
   if(!state.current){state.current=item;state.offset=0;state.startedAt=now;state.playing=profile.kind!=='image';}else state.queue.push(item);
  }else if(op==='duration'){if(!state.current||state.current.id!==command.mediaId||!Number.isFinite(command.duration)||command.duration<=0||command.duration>14400)fail('Invalid media duration.');state.current.duration=command.duration;}else if(op==='play'){if(!state.current)fail('Add media first.');if(!state.playing){state.startedAt=now;state.playing=true;}}
  else if(op==='pause'){state.offset=deviceTime(state,now);state.playing=false;}
  else if(op==='seek'){if(!Number.isFinite(command.seconds)||command.seconds<0||command.seconds>14400)fail('Choose a position between 0 and 14400 seconds.');state.offset=command.seconds;state.startedAt=now;}
  else if(op==='next'){state.current=state.queue.shift()||null;state.offset=0;state.startedAt=now;state.playing=!!state.current&&profile.kind!=='image';}
  else if(op==='volume'){if(!Number.isFinite(command.volume)||command.volume<0||command.volume>1)fail('Choose a volume between 0 and 1.');state.volume=command.volume;}
  else fail('Unsupported media control.');
 }else if(profile.kind==='arcade'){
  if(!state.gamers[actorId]&&Object.keys(state.gamers).length>=256)fail('This arcade player list is full.');
  const gamer=state.gamers[actorId] ||= {name:player.username,credits:100,round:0};
  if(now-(gamer.lastPlay||0)<150)fail('Wait a moment before the next move.');
  if(op==='start'){gamer.game=newArcadeGame(profile.game,randomInt);gamer.round++;state.running=['snake','pong','breakout'].includes(profile.game);state.nextStepAt=now+250;}
  else if(op==='pause'||op==='resume'){if(!['snake','pong','breakout'].includes(profile.game))fail('This game advances with player moves.');if(!gamer.game||gamer.game.done)fail('Start a game first.');state.running=op==='resume';state.nextStepAt=now+250;}
  else if(op==='step')fail('Motion is advanced by the server. Use the direction controls.');
  else if(gamer.game?.type==='snake'&&['up','down','left','right'].includes(op)){const opposite={up:'down',down:'up',left:'right',right:'left'};if(op===opposite[gamer.game.direction])fail('Cannot reverse into your tail.');gamer.game={...gamer.game,direction:op};}
  else{if(!gamer.game)fail('Start a game first.');gamer.game=arcadeMove(gamer.game,command,randomInt);}
  gamer.lastPlay=now;
 }else if(profile.kind==='board'){
  if(op!=='post')fail('Post a message to this board.');state.text=String(command.text||'').trim().slice(0,1000);state.author=player.username;
 }else if(['slots','poker','trivia'].includes(profile.kind)){
  if(!state.gamers[actorId]&&Object.keys(state.gamers).length>=256)fail('This arcade player list is full.');
  const gamer=state.gamers[actorId] ||= {name:player.username,credits:100,round:0};if(now-(gamer.lastPlay||0)<1000)fail('Wait a moment before the next play.');
  if(profile.kind==='slots'&&op==='spin'){
   if(gamer.credits<1)fail('No practice credits remain.');const reels=Array.from({length:3},()=>randomInt(6));gamer.credits--;gamer.reels=reels;gamer.award=reels.every(value=>value===reels[0])?20:new Set(reels).size===2?2:0;gamer.credits+=gamer.award;
  }else if(profile.kind==='poker'&&op==='deal'){
   if(gamer.phase==='hold')fail('Finish the current hand first.');if(gamer.credits<1)fail('No practice credits remain.');gamer.credits--;gamer.hand=drawCards(5);gamer.phase='hold';gamer.award=0;
  }else if(profile.kind==='poker'&&op==='draw'){
   if(gamer.phase!=='hold')fail('Deal a hand first.');const holds=Array.isArray(command.holds)?[...new Set(command.holds)].filter(index=>Number.isInteger(index)&&index>=0&&index<5):[];const cards=drawCards(5-holds.length,gamer.hand);gamer.hand=gamer.hand.map((card,index)=>holds.includes(index)?card:cards.shift());gamer.award=pokerPayout(gamer.hand);gamer.credits+=gamer.award;gamer.phase='result';
  }else if(profile.kind==='trivia'&&op==='answer'){
   const question=questions[gamer.round%questions.length];gamer.correct=command.answer===question[2];if(gamer.correct)gamer.credits++;gamer.round++;
  }else fail('Unsupported arcade action.');
  gamer.lastPlay=now;gamer.question=profile.kind==='trivia'?questions[gamer.round%questions.length].slice(0,2):null;
 }else fail('This terminal uses marketplace checkout.');
 if(gameDevice){state.activePlayerId=actorId;state.lastInputAt=now;}
 state.revision++;state.updatedBy=player.username;state.updatedAt=now;return {deviceId:actor.id,message:profile.name+' updated.'};
}

function machineControllerPresent(sim,state,now){
 const player=sim.players?.[state.activePlayerId],actor=sim.actors?.[state.id],gamer=state.gamers?.[state.activePlayerId];
 return Boolean(player&&player.health!==0&&!player.replacedByRoom&&now-player.lastSeen<15000&&now-(state.lastInputAt||0)<(state.kind==='slots'?2000:60000)&&(!gamer?.game||!gamer.game.done)&&(!actor||actor.active!==false&&!actor.holderId&&Math.hypot(actor.position.x-player.position.x,actor.position.y-player.position.y,actor.position.z-player.position.z)<=5));
}
export function advanceDevicePlayback(sim,now){
 for(const [id,state]of Object.entries(sim.devices||{})){
  if(state.kind!=='arcade'||!state.running)continue;
  state.id=id;
  const gamer=state.gamers?.[state.activePlayerId];
  if(!gamer?.game||gamer.game.done||!machineControllerPresent(sim,state,now)){state.running=false;state.revision++;continue;}
  if(!['snake','pong','breakout'].includes(gamer.game.type))continue;
  const next=state.nextStepAt??now+250;if(now<next){state.nextStepAt=next;continue;}
  const steps=Math.min(4,1+Math.floor((now-next)/250));
  for(let i=0;i<steps&&!gamer.game.done;i++){if(gamer.game.moves>=1000){gamer.game={...gamer.game,done:true,message:'Round limit reached. Start a new game.'};break;}gamer.game=arcadeMove(gamer.game,{operation:'step'},randomInt);}
  state.nextStepAt=now+250;state.running=!gamer.game.done;state.updatedAt=now;state.revision++;
 }

 for(const state of Object.values(sim.devices||{})){const duration=state.current?.duration;if(!state.playing||!Number.isFinite(duration)||deviceTime(state,now)<duration)continue;state.current=state.queue.shift()||null;state.offset=0;state.startedAt=now;state.playing=!!state.current;state.revision++;}
}
