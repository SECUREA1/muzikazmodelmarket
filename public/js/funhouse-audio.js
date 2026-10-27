import {createFunhouseAudioEngine} from './funhouse-audio-engine.js';
import {funhouseClownLine} from './funhouse-audio-dialogue.js';
import {normalizeFunhouseAudioSettings,funhouseAudioAllowed} from './funhouse-audio-settings.js';
import {funhouseStations,isFunhouseEnvironment} from './clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_CLUES} from './funhouse-adventure-rules.js';
import {gameSpeech} from './neural-character-speech.js';
import {claimGameSpeech,releaseGameSpeech,isGameSpeechActive} from './game-speech-owner.js';

const storageKey='muzikaz:funhouse-audio:v1';
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const active=value=>value?.status==='active';
const copyPoint=value=>value?{x:value.x,y:value.y||0,z:value.z}:null;

/** Sound is a local presentation of confirmed play. It never changes a game,
 * owns the room connection, or creates a second AudioContext. */
export function createFunhouseAudio({getContext=()=>null,getEnvironment=()=>null,getActors=()=>({}),getPosition=()=>null,
 getCameraDirection=()=>({x:0,y:0,z:-1}),getPreferences=()=>({}),storage=globalThis.localStorage,
 speech=gameSpeech(),onCaption=()=>{},request=(...args)=>globalThis.fetch(...args),now=()=>Date.now(),engine:providedEngine=null}={}){
 let settings;try{settings=normalizeFunhouseAudioSettings(JSON.parse(storage?.getItem(storageKey)||'{}'));}catch{settings=normalizeFunhouseAudioSettings();}
 const engine=providedEngine||createFunhouseAudioEngine({getContext,getPreferences,getSettings:()=>settings,getPosition,getCameraDirection});
 const owner=Symbol('funhouse-clown'),seen=new Set(),rotations=new Map(),buffers=new Map(),pendingBuffers=new Map(),fetches=new Set();
 let scope=null,sequence=-1,state={},previous=null,unlocked=false,disposed=false,paused=false,generation=0;
 let caption=null,lastLine=null,pendingLine=null,voiceOwned=false,voiceLoading=false,lastSpokenAt=-Infinity,lastQueuedAt=-Infinity,nextAmbientAt=Infinity;
 let previewUntil=0,showUntil=0,showStationId=null,welcomePending=true,voiceSequence=0,lastStepPosition=null,stepDistance=0,lastStepAt=0;
 const stations=()=>funhouseStations(getEnvironment(),{actors:getActors()});
 const stationFor=(id,kind)=>stations().find(value=>value.id===id)||(kind?stations().find(value=>value.kind===kind):null);
 const prefs=()=>getPreferences()||{};
 const permitted=channel=>funhouseAudioAllowed(channel,settings,prefs());
 function inWorld(){return isFunhouseEnvironment(getEnvironment())||stations().some(station=>gap(getPosition(),station.position)<24);}
 function remember(id){if(!id||seen.has(id))return false;seen.add(id);if(seen.size>256)seen.delete(seen.values().next().value);return true;}
 function subtitle(line){caption={id:line.key,text:line.clip.caption,speaker:line.clip.speaker,expiresAt:now()+Math.min(9000,(line.clip.durationMs||5000)+500)};onCaption({...caption});}
 function releaseVoice(){if(voiceOwned){voiceOwned=false;releaseGameSpeech(speech,owner);}}
 function stopVoice(reason='stopped'){generation++;pendingLine=null;voiceLoading=false;engine.stopVoice?.(reason);releaseVoice();}
 function line(event,position,{priority=false}={}){
  if(!unlocked||paused||!inWorld())return false;
  if(!priority&&now()-Math.max(lastSpokenAt,lastQueuedAt)<9000)return false;
  const variant=rotations.get(event)||0,clip=funhouseClownLine(event,variant);if(!clip)return false;
  rotations.set(event,variant+1);lastQueuedAt=now();
  const value={clip,position:copyPoint(position||getPosition()),key:'clown:'+ ++voiceSequence,expiresAt:now()+12000};
  lastLine=value;
  if(!permitted('voice')){subtitle(value);return true;}
  pendingLine=value;void playPending();return true;
 }
 async function decoded(clip,context){
  if(buffers.has(clip.url)){const buffer=buffers.get(clip.url);buffers.delete(clip.url);buffers.set(clip.url,buffer);return buffer;}
  if(pendingBuffers.has(clip.url))return pendingBuffers.get(clip.url);
  const abort=new AbortController();fetches.add(abort);
  const timer=setTimeout(()=>abort.abort(),8000);timer.unref?.();
  const task=(async()=>{
   try{
    const response=await request(clip.url,{cache:'force-cache',signal:abort.signal});if(!response?.ok)throw Error('Clown voice unavailable');
    const bytes=await response.arrayBuffer();if(disposed||abort.signal.aborted)throw Error('Clown voice cancelled');
    const buffer=await context.decodeAudioData(bytes);if(disposed||abort.signal.aborted)throw Error('Clown voice cancelled');
    buffers.set(clip.url,buffer);if(buffers.size>8)buffers.delete(buffers.keys().next().value);return buffer;
   }finally{clearTimeout(timer);fetches.delete(abort);}
  })();
  pendingBuffers.set(clip.url,task);try{return await task;}finally{pendingBuffers.delete(clip.url);}
 }
 async function playPending(){
  if(disposed||paused||!unlocked||voiceLoading||voiceOwned||!pendingLine)return;
  const value=pendingLine;if(now()>value.expiresAt){pendingLine=null;return;}
  if(!permitted('voice')){pendingLine=null;subtitle(value);return;}
  // A job briefing or an NPC conversation keeps the one shared voice lane.
  if(isGameSpeechActive(speech))return;
  const context=getContext();if(!context){pendingLine=null;subtitle(value);return;}if(context.state!=='running')return;
  voiceLoading=true;const token=generation;
  try{
   const buffer=await decoded(value.clip,context);
   if(disposed||paused||!unlocked||generation!==token||pendingLine!==value||now()>value.expiresAt||!inWorld())return;
   if(!permitted('voice')){pendingLine=null;subtitle(value);return;}
   if(isGameSpeechActive(speech))return;
   pendingLine=null;claimGameSpeech(speech,owner,()=>{engine.stopVoice?.('conversation');releaseVoice();});voiceOwned=true;
   const started=engine.voice(buffer,{position:value.position,key:value.key,text:value.clip.text,speaker:value.clip.speaker,
    onStarted:()=>{lastSpokenAt=now();subtitle(value);},onEnded:releaseVoice});
   if(!started){releaseVoice();subtitle(value);}
  }catch{if(generation===token&&pendingLine===value){pendingLine=null;subtitle(value);}}
  finally{if(generation===token)voiceLoading=false;}
 }
 function effect(kind,fields={}){if(!unlocked||paused||!inWorld())return false;return engine.effect(kind,fields);}
 function positionFor(value,kind){return copyPoint(value?.position||value?.pose?.position||stationFor(value?.stationId,kind)?.position||getPosition());}
 function changes(next,serverTime){
  const old=previous||{},fresh=value=>value&&serverTime-(value.startedAt||0)<3000;
  const ride=next.ride,prior=old.ride;
  if(active(ride)&&ride.id!==prior?.id&&fresh(ride)){
   effect(ride.kind==='car'?'car-start':'spinner',{position:positionFor(ride,ride.kind),key:'board:'+ride.id});
   line(ride.kind+'-start',positionFor(ride,ride.kind),{priority:true});
  }
  if(active(ride)&&ride.id===prior?.id&&ride.lastActionAt&&ride.lastActionAt!==prior.lastActionAt){
   const position=positionFor(ride,ride.kind);
   effect(ride.kind==='car'?'honk':'spinner',{position,key:'ride-action:'+ride.id+':'+ride.lastActionAt});
   if(ride.kind==='car')line('car-honk',position);else if(ride.hits>prior.hits)line('spinner-hit',position);
  }
  if(ride?.id===prior?.id&&active(prior)&&!active(ride)){
   showUntil=0;effect('car-stop',{position:positionFor(ride,ride.kind),key:'ride-end:'+ride.id});
   if(ride.kind==='car'&&ride.status==='complete')line('car-complete',positionFor(ride,'car'),{priority:true});
  }
  const round=next.round,oldRound=old.round;
  if(round&&oldRound&&round.id===oldRound.id&&round.lastShotAt!==undefined&&round.lastShotAt!==oldRound.lastShotAt){
   const hit=round.hits>oldRound.hits,position=positionFor(round,'water');
   effect(hit?'water-hit':'water-miss',{position,key:'shot:'+round.id+':'+round.lastShotAt});line(hit?'water-hit':'water-miss',position);
  }
  const challenge=next.challenge,before=old.challenge;
  if(active(challenge)&&challenge.id!==before?.id&&fresh(challenge)){
   if(challenge.kind==='mirrors')line('maze-start',positionFor(challenge,'mirrors'),{priority:true});
   else if(challenge.kind==='jackbox')effect('wind',{position:positionFor(challenge,'jackbox'),key:'jack-start:'+challenge.id});
  }
  if(challenge&&before&&challenge.id===before.id){
   const position=positionFor(challenge,challenge.kind);
   if(challenge.kind==='jackbox'&&challenge.windCount>before.windCount){effect('wind',{position,key:'wind:'+challenge.id+':'+challenge.windCount});if(challenge.windCount===1)line('jack-wind',position);}
   if(challenge.kind==='ballpit'&&challenge.shots>before.shots)effect(challenge.hits>before.hits?'ball-hit':'ball-miss',{position,key:'toss:'+challenge.id+':'+challenge.shots});
   if(active(before)&&challenge.status==='complete'){
    if(challenge.kind==='jackbox'){effect(challenge.hits?'catch':'pop',{position,key:'jack-end:'+challenge.id});line(challenge.hits?'jack-catch':'jack-miss',position,{priority:true});}
    if(challenge.kind==='mirrors'&&challenge.hits){effect('bell',{position,key:'maze-end:'+challenge.id});line('maze-complete',position,{priority:true});}
   }
  }
  if(previous&&JSON.stringify(next.costume)!==JSON.stringify(old.costume)&&next.costume){const position=stationFor(null,'dressup')?.position||getPosition();if(next.costume.shoes&&!old.costume?.shoes)effect('squeak',{position,key:'shoes:'+serverTime});if(next.costume.hat&&!old.costume?.hat)effect('propeller',{position,key:'hat:'+serverTime});line('dressup',position,{priority:true});}
  const adventure=next.adventure,oldAdventure=old.adventure;
  if(adventure&&oldAdventure&&adventure.id===oldAdventure.id&&adventure.found?.length>oldAdventure.found?.length){
   const clue=FUNHOUSE_ADVENTURE_CLUES.find(clue=>clue.id===adventure.lastClueId),position=clue?.position||getPosition();
   effect('adventure',{position,key:'clue:'+adventure.id+':'+adventure.lastClueId});
   line(adventure.status==='complete'?'adventure-complete':'adventure:'+adventure.lastClueId,position,{priority:true});
  }
 }
 function receive(snapshot,selfId){
  if(disposed)return;const id=getEnvironment()?.id||null;
  if(scope!==id){if(scope!==null)reset();scope=id;}
  if(Number.isFinite(snapshot?.sequence)){if(snapshot.sequence<=sequence)return;sequence=snapshot.sequence;}
  const next=snapshot?.players?.[selfId]?.funhouse||{};
  if(inWorld())changes(next,snapshot.serverTime||now());
  for(const event of snapshot.events||[]){
   const value=event.funhouseEffect;if(!value||!remember(event.id))continue;
   if(!unlocked||paused||Math.abs((snapshot.serverTime||now())-event.at)>1800)continue;
   const station=stationFor(value.stationId),position=value.position||value.origin||station?.position;
   if(!position||gap(getPosition(),position)>28)continue;
   // Scores and owned actions above come from snapshots; remote shows use the
   // public event so a nearby friend's horn can still be heard in space.
   const own=event.actorId===selfId;
   if(own&&['honk','balance','wind','catch','toss','squirt','dressup','adventure','ride-start','challenge-start'].includes(value.kind))continue;
   const kind={car:'honk',spinner:'spinner',jackbox:'pop',ballpit:'ball-hit','maze-finish':'bell',dressup:'squeak',squirt:value.hit?'water-hit':'water-miss',toss:value.hit?'ball-hit':'ball-miss',balance:'spinner'}[value.kind]||value.kind;
   effect(kind,{position,key:event.id,hit:value.hit});
   if(own&&value.kind==='car'){showUntil=now()+6500;showStationId=value.stationId;line('car-honk',position,{priority:true});}
  }
  state=next;previous=structuredClone(next);
 }
 async function unlock(){
  if(disposed||!inWorld())return false;
  const id=getEnvironment()?.id||null;if(scope!==id){reset();scope=id;}
  paused=false;unlocked=true;
  const ready=await engine.unlock();if(disposed||paused)return false;
  nextAmbientAt=Math.min(nextAmbientAt,now()+30000);return ready!==false;
 }
 function update(delta=0){
  if(disposed)return;
  const id=getEnvironment()?.id||null;if(scope!==null&&id!==scope){reset();scope=id;}
  if(caption&&caption.expiresAt<=now()){caption=null;onCaption(null);}
  if(!unlocked||paused||!inWorld()){engine.setMusic(false);engine.update(delta);return;}
  if(welcomePending&&isFunhouseEnvironment(getEnvironment())&&!isGameSpeechActive(speech)){
   welcomePending=false;line('welcome',stationFor(null,'welcome')?.position||getPosition(),{priority:true});
  }
  const riding=active(state.ride)&&state.ride.kind==='car'&&(state.ride.endsAt||Infinity)>(now()),preview=previewUntil>now();
  const show=showUntil>now()?stationFor(showStationId,'car'):null;
  const source=riding?positionFor(state.ride,'car'):show?.position;
  const music=preview||riding||!!show&&gap(getPosition(),source)<24;
  engine.setMusic(music,{position:preview?getPosition():source,rideId:riding?state.ride.id:preview?'preview':showStationId});
  const listener=getPosition();
  if(listener&&lastStepPosition&&state.costume?.shoes&&!active(state.ride)){
   const moved=Math.hypot(listener.x-lastStepPosition.x,listener.z-lastStepPosition.z);
   stepDistance=moved<4?stepDistance+moved:0;
   if(stepDistance>.75&&now()-lastStepAt>450){lastStepAt=now();stepDistance=0;effect('squeak',{position:{...listener,y:Math.max(0,(listener.y||0)-1.5)},volume:.25,range:12,key:'step:'+now()});}
  }else stepDistance=0;
  lastStepPosition=copyPoint(listener);
  engine.update(delta);void playPending();
  if(now()>=nextAmbientAt&&!pendingLine&&!voiceOwned&&!voiceLoading&&!active(state.ride)&&!active(state.round)&&!active(state.challenge)&&!isGameSpeechActive(speech)){
   nextAmbientAt=now()+45000;
   const nearby=Object.values(getActors()||{}).find(actor=>actor.active!==false&&actor.resident?.funhouseClown&&gap(getPosition(),actor.position)<12);
   if(nearby)line('ambient',nearby.position);
  }
 }
 function setSettings(patch){settings=normalizeFunhouseAudioSettings({...settings,...patch});try{storage?.setItem(storageKey,JSON.stringify(settings));}catch{}if(!permitted('voice'))stopVoice('muted');engine.update(0);return {...settings};}
 function replay(){if(disposed||!inWorld())return false;if(!lastLine){void unlock();return line('welcome',stationFor(null,'welcome')?.position||getPosition(),{priority:true});}void unlock();pendingLine={...lastLine,key:'replay:'+ ++voiceSequence,expiresAt:now()+12000};if(!permitted('voice')){subtitle(pendingLine);pendingLine=null;return false;}void playPending();return true;}
 function previewMusic(){if(disposed||!inWorld())return false;void unlock();previewUntil=now()+10000;update(0);return permitted('music');}
 function pause(){paused=true;unlocked=false;previewUntil=showUntil=0;lastStepPosition=null;stepDistance=0;for(const abort of fetches)abort.abort();stopVoice('paused');engine.reset();caption=null;onCaption(null);}
 function reset(){pause();scope=null;sequence=-1;state={};previous=null;seen.clear();welcomePending=true;nextAmbientAt=Infinity;lastLine=null;lastSpokenAt=lastQueuedAt=-Infinity;lastStepPosition=null;stepDistance=0;lastStepAt=0;}
 return {unlock,receive,update,reset,pause,engine,active:inWorld,settings:()=>({...settings}),setSettings,replay,previewMusic,
  snapshot:()=>({...engine.snapshot(),unlocked,scope,active:inWorld(),paused,caption:caption?{...caption}:null,lastLine:lastLine?{id:lastLine.clip.id,text:lastLine.clip.text,speaker:lastLine.clip.speaker}:null,voicePlaying:voiceOwned,voiceLoading,settings:{...settings}}),
  dispose(){if(disposed)return;reset();disposed=true;engine.dispose();buffers.clear();pendingBuffers.clear();}};
}
