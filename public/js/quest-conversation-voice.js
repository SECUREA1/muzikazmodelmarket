import {gameSpeech,GameSpeechUtterance} from './neural-character-speech.js';
import {claimGameSpeech,releaseGameSpeech,cancelGameSpeech} from './game-speech-owner.js';
import {spatialEffectGain} from './shared-effect-audio.js';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout} from './character-voice-profile.js';

export function createQuestConversationVoice({speech=gameSpeech(),Utterance=GameSpeechUtterance,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now()}={}){
 let unlocked=false,muted=false,disposed=false,failed=false,current=null,utterance=null,timer=null,generation=0,scope=null,latest=null;
 let preferences={},listener=null,actors={},voiceWait=null,voicesWaited=false,previewSequence=0;
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
 function cancelCurrent(){const stopped=current,owned=!!current;generation++;clearTimer(timer);timer=null;current=null;utterance=null;if(owned)cancelGameSpeech(speech,speechOwner);stopped?.onCancelled?.();}
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
  while(queue.length){const candidate=queue.shift(),ttl=candidate.category==='dialogue'?120000:30000;if(now()-candidate.queuedAt<ttl&&volume(candidate)>0){call=candidate;break;}}
  if(!call)return;
  const token=++generation,character=characterFor(call),style=characterSpeechStyle(character,{text:call.text}),spokenText=prepareSpeechText(call.text),available=voices();
  const selected=chooseCharacterVoice(available,character,{language:style.lang,preferredVoiceURI:cast.get(character.id),selectedVoiceURI:preferences.speechVoiceURI,gender:preferences.speechVoiceGender||'auto'});
  if(!selected){call.onError?.('That voice is unavailable. Choose a generated male or female voice in Audio settings.');play();return;}
  if(selected){cast.set(character.id,selected.voiceURI||selected.name);if(cast.size>128)cast.delete(cast.keys().next().value);}
  claimGameSpeech(speech,speechOwner,stop);
  current=call;let attempt=0;
  function finish(){if(token!==generation||disposed)return;call.onFinished?.();clearTimer(timer);timer=null;current=null;utterance=null;releaseGameSpeech(speech,speechOwner);play();}
  function speak(voice,retry=false){
   if(token!==generation||disposed||blocked(call))return;
   let started=false;const attemptId=++attempt;
   try{
    utterance=new Utterance(spokenText);
    if(voice)utterance.voice=voice;
    utterance.lang=voice?.lang||style.lang;utterance.rate=style.rate;utterance.pitch=style.pitch;utterance.volume=volume(call);
    const watchdog=()=>{if(token!==generation||attemptId!==attempt)return;call.onError?.('Voice playback took too long. Please try again.');cancelCurrent();play();};
    utterance.onstart=()=>{if(attemptId!==attempt||token!==generation)return;started=true;clearTimer(timer);timer=setTimer(watchdog,speechTimeout(spokenText,style.rate));call.onStarted?.(voice);};
    utterance.onend=()=>{if(attemptId===attempt)finish();};
    utterance.onerror=error=>{
     if(token!==generation||attemptId!==attempt||disposed)return;
     clearTimer(timer);timer=null;
     // A device's online natural voice can be unavailable offline. Retry once
     // with a local voice only if no speech began, avoiding repeated sentences.
     if(!retry&&!started&&!voice?.generated&&!preferences.speechVoiceURI&&['network','voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed'].includes(error?.error)){
      const local=chooseCharacterVoice(available.filter(candidate=>candidate.localService&&candidate!==voice),character,{language:style.lang,gender:preferences.speechVoiceGender||'auto'});
      if(local){speak(local,true);return;}
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
 function setScope(worldId){if(scope===worldId)return;stop();seen.clear();scope=worldId;latest=null;}
 function remember(id){if(seen.has(id))return false;seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value);return true;}
 function enqueue(call){latest={...call,queuedAt:now()};if(!blocked(latest)){queue.push(latest);if(queue.length>8)queue.shift()?.onCancelled?.();}play();}
 const api={
  announce(text,{key=text,worldId=scope,voice='World guide',role='guide',category='announcements',source,entityId,range,personality,mood,voiceProfile}={}){
   if(disposed||!text)return false;setScope(worldId);
   const id='announcement:'+worldId+':'+key;if(!remember(id))return false;
   enqueue({id,text:String(text),voice,speaker:voice,role,category,source,entityId,range,personality,mood,voiceProfile});return true;
  },
  unlock(){if(disposed)return;unlocked=true;failed=false;try{speech?.resume?.();}catch{}play();},
  setMuted(value){muted=!!value;if(muted)stop();else play();},
  setPreferences(value={}){if((preferences.speechVoiceGender||'auto')!==(value.speechVoiceGender||'auto')||(preferences.speechVoiceURI||'')!==(value.speechVoiceURI||'')){stop();cast.clear();}preferences={...value};for(let i=queue.length-1;i>=0;i--)if(blocked(queue[i])){queue[i].onCancelled?.();queue.splice(i,1);}if(!queue.length)clearVoiceWait();if(current&&blocked(current))cancelCurrent();play();},
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
  replay(call){if(call)latest={...call,category:call.category||'dialogue',queuedAt:now()};if(!latest||disposed)return false;muted=false;if(blocked(latest))return false;const replay={...latest,queuedAt:now()};stop();unlocked=true;queue.push(replay);play();return true;},
  preview(value=preferences){
   api.setPreferences(value);
   if(blocked({category:'dialogue'}))return Promise.resolve('Unmute all audio and NPC conversations to preview the voice.');
   stop();api.unlock();
   return new Promise(resolve=>{let settled=false;const done=status=>{if(!settled){settled=true;resolve(status);}};
    enqueue({id:'voice-preview:'+ ++previewSequence,text:'Hello. This is your selected voice. You are ready to explore the world.',voice:'Voice preview',role:'narrator',category:'dialogue',
     onStarted:voice=>done('Playing '+(voice?.name||'your selected voice')+'.'),onFinished:()=>done('Voice preview finished.'),onError:done,onCancelled:()=>done('Voice preview stopped.')});
   });
  },
  reset(){stop();seen.clear();scope=null;latest=null;},
  dispose(){disposed=true;stop();speech?.removeEventListener?.('voiceschanged',onVoicesChanged);cast.clear();},
  get state(){return {unlocked,muted:muted||!!preferences.masterMuted||!!preferences.dialogueMuted,supported:supported(),speaking:!!current,pending:queue.length};}
 };
 return api;
}
let shared;
export function questConversationVoice(){return shared||=createQuestConversationVoice();}
export function unlockQuestConversation(){questConversationVoice().unlock();}
