import {gameSpeech,GameSpeechUtterance} from './neural-character-speech.js';
import {claimGameSpeech,releaseGameSpeech,cancelGameSpeech,gameSpeechPriority} from './game-speech-owner.js';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout} from './character-voice-profile.js';
// Captions always work. Audio is enabled by default but starts only from a gesture.
// Keep one current call and one replacement, never a growing speech backlog.
export function createTowerRadioAudio({speech=gameSpeech(),Utterance=GameSpeechUtterance,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,onCaption=()=>{},onState=()=>{},tone=null,audioFactory=()=>{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;return Context?new Context():null;}}={}){
 let unlocked=false,activated=false,muted=false,disposed=false,current=null,pending=null,blockedCall=null,latest=null,timer=null,deferredTimer=null,context=null,speechFailed=false,token=0,introduced=false,preferences={},voiceURI=null;const seen=new Map(),tones=new Set(),speechOwner=Symbol('tower-radio'),character={id:'muzikaz-tower',name:'MUZIKAZ Tower',role:'dispatcher',personality:'Calm and precise'};
 const speechAvailable=()=>!!(speech?.speak&&Utterance)&&!speechFailed;
 const settingsMuted=()=>!!(preferences.masterMuted||preferences.announcementsMuted);
 const isMuted=call=>muted||settingsMuted()||call?.category==='introduction'&&preferences.introductionMuted;
 const introduction=()=>({text:'MUZIKAZ Tower. Radio connected. Request clearance when ready.',key:'radio-check',priority:'normal',category:'introduction',at:now()});
 const notify=()=>onState({unlocked,muted:isMuted(),localMuted:muted,settingsMuted:settingsMuted(),speaking:!!current,speechAvailable:speechAvailable(),supported:!!(speech?.speak&&Utterance)||!!tone||!!(globalThis.AudioContext||globalThis.webkitAudioContext),status:settingsMuted()?'Tower muted in Settings':muted?'Tower muted':!unlocked?'Tower audio starts with your next control':'Tower audio on'});
 function cancel(){token++;clearTimer(timer);clearTimer(deferredTimer);timer=deferredTimer=null;pending=null;blockedCall=null;current=null;for(const node of tones){try{node.disconnect();}catch{}}tones.clear();cancelGameSpeech(speech,speechOwner);notify();}
 function resumeAudio(){
  speechFailed=false;
  // Each control gesture can release a mobile/background suspension, even
  // when the radio was enabled before the browser paused its output.
  try{if(!context||context.state==='closed')context=audioFactory();Promise.resolve(context?.resume?.()).catch(()=>{});}catch{}
  try{Promise.resolve(speech?.resume?.()).catch(()=>{});}catch{}
 }
 function warningTone(){if(isMuted()||!unlocked||disposed)return;if(tone){try{tone();}catch{}return;}if(!context)return;try{const time=context.currentTime,gain=context.createGain();gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.11,time+.015);gain.gain.exponentialRampToValueAtTime(.0001,time+.42);gain.connect(context.destination);tones.add(gain);let remaining=2;for(const [offset,frequency]of [[0,880],[.17,660]]){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.onended=()=>{oscillator.disconnect();if(!--remaining){gain.disconnect();tones.delete(gain);}};oscillator.start(time+offset);oscillator.stop(time+offset+.17);}}catch{}}
 function speak(call){
  if(!call||disposed||isMuted(call)||!unlocked)return;const age=now()-call.at;if(age>12000)return;
  // Routine taxi instructions wait for urgent emergency dispatch. Keep only
  // the current stage, so a clear radio channel never replays an old checklist.
  if(call.priority!=='warning'&&gameSpeechPriority(speech)>1){
   pending=call;
   if(deferredTimer===null)deferredTimer=setTimer(()=>{deferredTimer=null;const next=pending;pending=null;speak(next);},250);
   notify();return;
  }
  if(deferredTimer!==null){clearTimer(deferredTimer);deferredTimer=null;pending=null;}
  if(call.priority==='warning'&&!call.warningPlayed){call.warningPlayed=true;warningTone();}if(!speechAvailable()){notify();return;}
  current=call;const generation=++token;let attempt=0;
  const spokenText=prepareSpeechText(call.text),style=characterSpeechStyle(character,{text:call.text});
  let voices=[];try{voices=speech.getVoices?.()||[];}catch{}
  const selected=chooseCharacterVoice(voices,character,{language:style.lang,preferredVoiceURI:voiceURI,selectedVoiceURI:preferences.speechVoiceURI,gender:preferences.speechVoiceGender||'auto'});
  if(!selected){current=null;notify();return;}
  function finish(error){
   if(generation!==token||disposed)return;attempt++;clearTimer(timer);timer=null;current=null;releaseGameSpeech(speech,speechOwner);
   if(error&&!['canceled','interrupted'].includes(error.error))speechFailed=true;
   const next=pending;pending=null;notify();if(next)speak(next);
  }
  function attemptSpeech(voice,retry=false){
   if(generation!==token||disposed||isMuted(call))return;
   const attemptId=++attempt;let started=false;
   const active=()=>generation===token&&attemptId===attempt&&!disposed;
   function fail(error){
    if(!active())return;clearTimer(timer);timer=null;
    if(!started&&error?.error==='not-allowed'){
     token++;current=null;unlocked=false;blockedCall=call;
     releaseGameSpeech(speech,speechOwner);notify();return;
    }
    // Online natural voices may be unavailable offline. Fall back only before
    // speech starts, so a partially heard warning is never spoken twice.
    if(!retry&&voice&&!voice.generated&&!preferences.speechVoiceURI&&!started&&['network','voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed'].includes(error?.error)){
     const local=chooseCharacterVoice(voices.filter(candidate=>candidate.localService&&candidate!==voice),character,{language:style.lang,gender:preferences.speechVoiceGender||'auto'});
     if(local){attemptSpeech(local,true);return;}
    }
    finish(error);
   }
   try{
    const utterance=new Utterance(spokenText);if(voice){utterance.voice=voice;if(!retry)voiceURI=voice.voiceURI||null;}
    utterance.lang=voice?.lang||style.lang;utterance.rate=style.rate;utterance.pitch=style.pitch;utterance.volume=.85;
    const watchdog=()=>{if(!active())return;cancelGameSpeech(speech,speechOwner);if(active())finish();};
    utterance.onstart=()=>{if(active()){started=true;clearTimer(timer);timer=setTimer(watchdog,speechTimeout(spokenText,utterance.rate));}};
    utterance.onboundary=event=>{if(active()&&voice?.generated&&Number.isFinite(event.audioDuration)){clearTimer(timer);timer=setTimer(watchdog,Math.max(8000,event.audioDuration*1000+(event.remainingSegments>0?65000:5000)));}};
    utterance.onend=()=>{if(active())finish();};utterance.onerror=fail;
    timer=setTimer(watchdog,65000);
    claimGameSpeech(speech,speechOwner,cancel,{priority:call.priority==='warning'?3:0});speech.speak(utterance);notify();
   }catch{fail({error:'synthesis-failed'});}
  }
  attemptSpeech(selected);
 }

 const api={call(text,{key=text,priority='normal',category='announcements',repeatAfter=7000,force=false}={}){if(disposed||!text)return false;const at=now();latest={text:String(text),key,priority,category,at};onCaption(latest.text);if(!force&&at-(seen.get(key)??-Infinity)<repeatAfter)return false;seen.set(key,at);if(seen.size>64)seen.delete(seen.keys().next().value);if(!unlocked||isMuted(latest)){if(blockedCall&&!isMuted(latest))pending=latest;return true;}if(current){if(current.key===key)return true;if(priority==='warning'){cancel();speak(latest);}else pending=latest;}else speak(latest);return true;},
  unlock({introduce=true}={}){
   if(disposed)return false;const firstUnlock=!activated;activated=true;unlocked=true;resumeAudio();notify();
   if(current)return true;
   if(blockedCall){const call=blockedCall;blockedCall=null;speak({...call,at:now()});return true;}
   if(firstUnlock){const fresh=latest&&now()-latest.at<12000?latest:null;if(fresh)speak(fresh);else if(introduce&&!introduced){introduced=true;speak(introduction());}}
   else if(introduce&&!introduced&&!latest){introduced=true;speak(introduction());}
   return true;
  },
  setMuted(value){muted=!!value;if(muted)cancel();notify();return isMuted();},
  setPreferences(value={}){if((preferences.speechVoiceGender||'auto')!==(value?.speechVoiceGender||'auto')||(preferences.speechVoiceURI||'')!==(value?.speechVoiceURI||'')){cancel();voiceURI=null;}preferences=value||{};if(isMuted(current))cancel();else{if(pending&&isMuted(pending))pending=null;if(blockedCall&&isMuted(blockedCall))blockedCall=null;}notify();},
  replay(){if(disposed)return false;activated=true;unlocked=true;resumeAudio();const call=latest?{...latest,at:now(),warningPlayed:false}:introduction();if(isMuted(call)){notify();return false;}if(call.category==='introduction')introduced=true;cancel();speak(call);return true;},
  reset(){cancel();latest=null;seen.clear();},
  dispose(){disposed=true;cancel();try{context?.close?.()?.catch?.(()=>{});}catch{}},get state(){return {unlocked,muted:isMuted(),localMuted:muted,settingsMuted:settingsMuted(),speaking:!!current,speechAvailable:speechAvailable()};},get latest(){return latest?.text||'';}};notify();return api;
}
