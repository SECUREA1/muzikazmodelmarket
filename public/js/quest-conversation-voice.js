import {gameSpeech,GameSpeechUtterance} from './neural-character-speech.js';
import {claimGameSpeech,releaseGameSpeech,cancelGameSpeech} from './game-speech-owner.js';
import {spatialEffectGain} from './shared-effect-audio.js';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout} from './character-voice-profile.js';

export function createQuestConversationVoice({speech=gameSpeech(),Utterance=GameSpeechUtterance,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now()}={}){
 let unlocked=false,muted=false,disposed=false,failed=false,current=null,currentStarted=false,utterance=null,timer=null,generation=0,scope=null,latest=null;
 let preferences={},listener=null,actors={},voiceWait=null,voicesWaited=false,previewSequence=0,introduction=null,introductionHeard=false;
 const queue=[],seen=new Set(),cast=new Map(),speechOwner=Symbol('world-voice');
 const supported=()=>!!(speech?.speak&&Utterance)&&!failed;
 const blocked=call=>muted||preferences.masterMuted||preferences[({introduction:'introductionMuted',announcements:'announcementsMuted',dialogue:'dialogueMuted'})[call.category||'dialogue']];
 const voices=()=>{try{return speech?.getVoices?.()||[];}catch{return [];}};
 function volume(call){
  if(blocked(call))return 0;
  const source=call.source||actors[call.speakerId||call.entityId]?.position;
  // Browser speech synthesis exposes volume, but cannot connect to a Web Audio
  // panner. World voices use distance attenuation; radio/objectives stay clear.
  if(call.category==='introduction')return .85;
  return .9*(preferences.spatialAudio!==false&&source&&listener?spatialEffectGain({...source,y:source.y??0},{...listener,y:listener.y??0},call.range||32):1);
 }
 function characterFor(call){
  if(call.category==='introduction')return {id:'world-narrator',name:'World narrator',role:'narrator'};
  const actor=actors[call.speakerId||call.entityId],resident=actor?.resident||{};
  return {id:call.role==='player'?(call.speakerId||call.speaker):resident.personalityId||resident.name||actor?.name||call.voice||call.speaker||'World guide',name:resident.name||actor?.name||call.speaker||call.voice,role:resident.role||call.role,personality:call.personality||resident.personality,mood:call.mood||resident.mood,voiceProfile:call.voiceProfile||resident.voiceProfile||actor?.voiceProfile};
 }
 function clearVoiceWait(){clearTimer(voiceWait);voiceWait=null;}
 function cancelCurrent(){const stopped=current,owned=!!current;generation++;clearTimer(timer);timer=null;current=null;currentStarted=false;utterance=null;if(owned)cancelGameSpeech(speech,speechOwner);stopped?.onCancelled?.();}
 function stop(){clearVoiceWait();cancelCurrent();for(const call of queue)call.onCancelled?.();queue.length=0;}
 function play(){
  if(disposed||!unlocked||current||!supported())return;
  // Voice lists often arrive asynchronously. Give the installed natural voices
  // one bounded chance to load before falling back to the browser default.
  if(queue.length&&!voicesWaited&&!voices().length&&speech?.getVoices&&speech?.addEventListener){
   if(voiceWait===null)voiceWait=setTimer(()=>{voiceWait=null;voicesWaited=true;play();},700);
   return;
  }
  clearVoiceWait();
  let call;
  // A map welcome may wait through login or a slow load before the first
  // gesture. Scope changes already discard the previous map's introduction.
  while(queue.length){const candidate=queue.shift(),ttl=candidate.category==='introduction'?Infinity:candidate.category==='dialogue'?120000:30000;if(now()-candidate.queuedAt<ttl&&volume(candidate)>0){call=candidate;break;}}
  if(!call)return;
  const token=++generation,character=characterFor(call),style=characterSpeechStyle(character,{text:call.text}),spokenText=prepareSpeechText(call.text),available=voices();
  const selection={language:style.lang,preferredVoiceURI:cast.get(character.id),selectedVoiceURI:preferences.speechVoiceURI,gender:preferences.speechVoiceGender||'auto'};
  // A member's saved device voice may be missing on their phone, or have been
  // removed by the browser. Our named generated voices are available on every
  // device, so a stale device selection must not silently consume the guide.
  const generatedFallback=()=>chooseCharacterVoice(available.filter(candidate=>candidate.generated),character,{...selection,selectedVoiceURI:'',preferredVoiceURI:''});
  const selected=chooseCharacterVoice(available,character,selection)||generatedFallback();
  if(!selected){call.onError?.('That voice is unavailable. Choose a generated male or female voice in Audio settings.');play();return;}
  if(selected){cast.set(character.id,selected.voiceURI||selected.name);if(cast.size>128)cast.delete(cast.keys().next().value);}
  claimGameSpeech(speech,speechOwner,stop);
  current=call;currentStarted=false;let attempt=0;
  function finish(){if(token!==generation||disposed)return;call.onFinished?.();clearTimer(timer);timer=null;current=null;utterance=null;releaseGameSpeech(speech,speechOwner);play();}
  function speak(voice,retry=false){
   if(token!==generation||disposed||blocked(call))return;
   let started=false;const attemptId=++attempt;
   try{
    utterance=new Utterance(spokenText);
    if(voice)utterance.voice=voice;
    if(voice?.generated){utterance.recordedIntroduction=call.category==='introduction';if(call.preview)utterance.audioURL='/public/audio/voices/'+voice.gender+'-preview.wav';}
    utterance.lang=voice?.lang||style.lang;utterance.rate=style.rate;utterance.pitch=style.pitch;utterance.volume=volume(call);
    const watchdog=()=>{if(token!==generation||attemptId!==attempt)return;call.onError?.('Voice playback took too long. Please try again.');cancelCurrent();play();};
    utterance.onstart=()=>{if(attemptId!==attempt||token!==generation)return;started=true;currentStarted=true;if(call.id===introduction?.id)introductionHeard=true;clearTimer(timer);timer=setTimer(watchdog,speechTimeout(spokenText,style.rate));call.onStarted?.(voice);};
    if(voice?.generated)utterance.onboundary=boundary=>{if(token!==generation||attemptId!==attempt||!Number.isFinite(boundary?.audioDuration))return;clearTimer(timer);timer=setTimer(watchdog,Math.max(8000,boundary.audioDuration*1000+(boundary.remainingSegments>0?65000:5000)));};
    utterance.onend=()=>{if(attemptId===attempt)finish();};
    utterance.onerror=error=>{
     if(token!==generation||attemptId!==attempt||disposed)return;
     clearTimer(timer);timer=null;
     // Touch activation and returning from a background tab can leave the
     // output suspended. Keep unheard words for the next real control gesture.
     // A failed unlock must not consume the one map introduction.
     if(!started&&error?.error==='not-allowed'){
      generation++;current=null;utterance=null;unlocked=false;
      releaseGameSpeech(speech,speechOwner);queue.unshift(call);
      call.onError?.(error.message||'Tap Enable guide audio or a game control to resume the voice.');
      return;
     }
     // A selected installed voice may also fail at playback time. Retry once
     // with a named generated voice before any words were heard. Never repeat
     // speech that has already started or fall through to a browser default.
     if(!retry&&!started&&!voice?.generated&&['network','voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed'].includes(error?.error)){
      const generated=generatedFallback();
      if(generated){speak(generated,true);return;}
      const local=chooseCharacterVoice(available.filter(candidate=>candidate.localService&&candidate!==voice),character,{language:style.lang,gender:preferences.speechVoiceGender||'auto'});
      if(local&&!preferences.speechVoiceURI){speak(local,true);return;}
     }
     call.onError?.('The voice could not play. Please try Preview voice again.');finish();
    };
    timer=setTimer(watchdog,65000);
    speech.speak(utterance);
   }catch{call.onError?.('The voice could not play. Captions remain available.');failed=true;cancelCurrent();}
  }
  speak(selected);
 }
 function onVoicesChanged(){if(disposed||!voices().length)return;voicesWaited=true;clearVoiceWait();play();}
 speech?.addEventListener?.('voiceschanged',onVoicesChanged);
 function setScope(worldId){if(scope===worldId)return;stop();seen.clear();scope=worldId;latest=null;introduction=null;introductionHeard=false;}
 function remember(id){if(seen.has(id))return false;seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value);return true;}
 function enqueue(call){latest={...call,queuedAt:now()};if(latest.category==='introduction'){introduction=latest;introductionHeard=false;}if(!blocked(latest)){queue.push(latest);if(queue.length>8){const expendable=queue.findIndex(call=>call.category!=='introduction');queue.splice(expendable<0?0:expendable,1)[0]?.onCancelled?.();}}play();}
 const api={
  announce(text,{key=text,worldId=scope,voice='World guide',role='guide',category='announcements',source,entityId,range,personality,mood,voiceProfile}={}){
   if(disposed||!text)return false;setScope(worldId);
   const id='announcement:'+worldId+':'+key;if(!remember(id))return false;
   enqueue({id,text:String(text),voice,speaker:voice,role,category,source,entityId,range,personality,mood,voiceProfile});return true;
  },
  unlock(){if(disposed)return false;unlocked=true;failed=false;let resumed;try{resumed=speech?.resume?.();}catch{unlocked=false;return false;}if(resumed===false){unlocked=false;return false;}play();if(resumed?.then)return Promise.resolve(resumed).then(value=>{if(!disposed&&value===false)unlocked=false;return value!==false;},()=>{if(!disposed)unlocked=false;return false;});return true;},
  resumeIntroduction(){if(disposed||!introduction||introductionHeard||blocked(introduction))return false;if(current?.id===introduction.id||queue.some(call=>call.id===introduction.id))return true;queue.unshift({...introduction,queuedAt:now()});play();return true;},
  setMuted(value){muted=!!value;if(muted)stop();else play();},
  setPreferences(value={}){if((preferences.speechVoiceGender||'auto')!==(value.speechVoiceGender||'auto')||(preferences.speechVoiceURI||'')!==(value.speechVoiceURI||'')){
   // Account settings can arrive after the first world snapshot. Retain a
   // welcome whose audio has not started, then use the newly loaded voice.
   // A completed or already audible welcome is never restarted by settings.
   const unheard=[...(current?.category==='introduction'&&!currentStarted?[current]:[]),...queue.filter(call=>call.category==='introduction')];
   stop();queue.push(...unheard);cast.clear();
  }preferences={...value};for(let i=queue.length-1;i>=0;i--)if(blocked(queue[i])){queue[i].onCancelled?.();queue.splice(i,1);}if(!queue.length)clearVoiceWait();if(current&&blocked(current))cancelCurrent();play();},
  setScene({listener:position,actors:worldActors={}}={}){listener=position;actors=worldActors;if(current){const gain=volume(current);if(gain<=0){cancelCurrent();play();}else if(utterance)utterance.volume=gain;}},
  ingest(calls,{worldId,actorId,serverTime,instanceId}={}){
   if(disposed)return;setScope(worldId);
   for(const call of calls||[]){
    if(!call.conversation||call.questInstance!==instanceId&&!call.interaction||call.recipients&&!call.recipients.includes(actorId)||seen.has(call.id)||serverTime-call.at>30000)continue;
    remember(call.id);
    // Historical dialogue seen before the gesture is consumed, not replayed later.
    if(unlocked)enqueue({...call,category:'dialogue'});else latest={...call,category:'dialogue',queuedAt:now()};
   }play();
  },
  replay(call){if(call)latest={...call,category:call.category||'dialogue',queuedAt:now()};if(!latest||disposed)return false;muted=false;if(blocked(latest))return false;const replay={...latest,queuedAt:now()};stop();queue.push(replay);api.unlock();return true;},
  preview(value=preferences){
   api.setPreferences(value);
   if(preferences.masterMuted||preferences.dialogueMuted)return Promise.resolve('Unmute all audio and NPC conversations to preview the voice.');
   // Preview and Enable all audio are explicit actions. A local World radio
   // mute must not override their newly enabled preference switches.
   muted=false;
   stop();api.unlock();
   return new Promise(resolve=>{let settled=false;const done=status=>{if(!settled){settled=true;resolve(status);}};
    enqueue({id:'voice-preview:'+ ++previewSequence,text:'Hello. This is your selected voice. You are ready to explore the world.',voice:'Voice preview',role:'narrator',category:'dialogue',preview:true,
     onStarted:voice=>done('Playing '+(voice?.name||'your selected voice')+'.'),onFinished:()=>done('Voice preview finished.'),onError:done,onCancelled:()=>done('Voice preview stopped.')});
   });
  },
  reset(){stop();seen.clear();scope=null;latest=null;introduction=null;introductionHeard=false;},
  addEventListener(type,callback){speech?.addEventListener?.(type,callback);},
  removeEventListener(type,callback){speech?.removeEventListener?.(type,callback);},
  dispose(){disposed=true;stop();speech?.removeEventListener?.('voiceschanged',onVoicesChanged);cast.clear();},
  get state(){const output=speech?.state;return {unlocked,audioReady:unlocked&&output?.unlocked!==false,muted:muted||!!preferences.masterMuted||!!preferences.dialogueMuted,supported:supported(),speaking:!!current,pending:queue.length,loading:!!output?.loading,error:output?.error||null,status:output?.status||''};}
 };
 return api;
}
let shared;
export function questConversationVoice(){return shared||=createQuestConversationVoice();}
export function unlockQuestConversation(){questConversationVoice().unlock();}
