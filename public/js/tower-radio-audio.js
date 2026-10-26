import {claimGameSpeech,releaseGameSpeech,cancelGameSpeech} from './game-speech-owner.js';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout} from './character-voice-profile.js';
// Captions always work. Audio is enabled by default but starts only from a gesture.
// Keep one current call and one replacement, never a growing speech backlog.
export function createTowerRadioAudio({speech=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,onCaption=()=>{},onState=()=>{},tone=null,audioFactory=()=>{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;return Context?new Context():null;}}={}){
 let unlocked=false,muted=false,disposed=false,current=null,pending=null,latest=null,timer=null,context=null,speechFailed=false,token=0,introduced=false,preferences={},voiceURI=null;const seen=new Map(),tones=new Set(),speechOwner=Symbol('tower-radio'),character={id:'muzikaz-tower',name:'MUZIKAZ Tower',role:'dispatcher',personality:'Calm and precise'};
 const speechAvailable=()=>!!(speech?.speak&&Utterance)&&!speechFailed;
 const settingsMuted=()=>!!(preferences.masterMuted||preferences.announcementsMuted);
 const isMuted=call=>muted||settingsMuted()||call?.category==='introduction'&&preferences.introductionMuted;
 const introduction=()=>({text:'MUZIKAZ Tower. Radio connected. Request clearance when ready.',key:'radio-check',priority:'normal',category:'introduction',at:now()});
 const notify=()=>onState({unlocked,muted:isMuted(),localMuted:muted,settingsMuted:settingsMuted(),speaking:!!current,speechAvailable:speechAvailable(),supported:!!(speech?.speak&&Utterance)||!!tone||!!(globalThis.AudioContext||globalThis.webkitAudioContext),status:settingsMuted()?'Tower muted in Settings':muted?'Tower muted':!unlocked?'Tower audio starts with your next control':'Tower audio on'});
 function cancel(){token++;clearTimer(timer);timer=null;pending=null;current=null;for(const node of tones){try{node.disconnect();}catch{}}tones.clear();cancelGameSpeech(speech,speechOwner);notify();}
 function warningTone(){if(isMuted()||!unlocked||disposed)return;if(tone){try{tone();}catch{}return;}if(!context)return;try{const time=context.currentTime,gain=context.createGain();gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.11,time+.015);gain.gain.exponentialRampToValueAtTime(.0001,time+.42);gain.connect(context.destination);tones.add(gain);let remaining=2;for(const [offset,frequency]of [[0,880],[.17,660]]){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.onended=()=>{oscillator.disconnect();if(!--remaining){gain.disconnect();tones.delete(gain);}};oscillator.start(time+offset);oscillator.stop(time+offset+.17);}}catch{}}
 function speak(call){
  if(!call||disposed||isMuted(call)||!unlocked)return;const age=now()-call.at;if(age>12000)return;
  if(call.priority==='warning')warningTone();if(!speechAvailable()){notify();return;}
  current=call;const generation=++token;let attempt=0;
  const spokenText=prepareSpeechText(call.text),style=characterSpeechStyle(character,{text:call.text});
  let voices=[];try{voices=speech.getVoices?.()||[];}catch{}
  const selected=chooseCharacterVoice(voices,character,{language:style.lang,preferredVoiceURI:voiceURI});
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
    // Online natural voices may be unavailable offline. Fall back only before
    // speech starts, so a partially heard warning is never spoken twice.
    if(!retry&&voice&&!started&&['network','voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed'].includes(error?.error)){
     const local=chooseCharacterVoice(voices.filter(candidate=>candidate.localService&&candidate!==voice),character,{language:style.lang});
     attemptSpeech(local,true);return;
    }
    finish(error);
   }
   try{
    const utterance=new Utterance(spokenText);if(voice){utterance.voice=voice;if(!retry)voiceURI=voice.voiceURI||null;}
    utterance.lang=voice?.lang||style.lang;utterance.rate=style.rate;utterance.pitch=style.pitch;utterance.volume=.85;
    utterance.onstart=()=>{if(active())started=true;};utterance.onend=()=>{if(active())finish();};utterance.onerror=fail;
    timer=setTimer(()=>{if(!active())return;cancelGameSpeech(speech,speechOwner);if(active())finish();},speechTimeout(spokenText,utterance.rate));
    claimGameSpeech(speech,speechOwner,cancel);speech.speak(utterance);notify();
   }catch{fail({error:'synthesis-failed'});}
  }
  attemptSpeech(selected);
 }

 const api={call(text,{key=text,priority='normal',category='announcements',repeatAfter=7000,force=false}={}){if(disposed||!text)return false;const at=now();latest={text:String(text),key,priority,category,at};onCaption(latest.text);if(!force&&at-(seen.get(key)??-Infinity)<repeatAfter)return false;seen.set(key,at);if(seen.size>64)seen.delete(seen.keys().next().value);if(!unlocked||isMuted(latest))return true;if(current){if(current.key===key)return true;if(priority==='warning'){cancel();speak(latest);}else pending=latest;}else speak(latest);return true;},
  unlock({introduce=true}={}){if(disposed)return false;if(unlocked){if(introduce&&!introduced&&!current&&!latest){introduced=true;speak(introduction());}return true;}unlocked=true;try{context=audioFactory();context?.resume?.()?.catch?.(()=>{});speech?.resume?.();}catch{}notify();const fresh=latest&&now()-latest.at<12000?latest:null;if(fresh)speak(fresh);else if(introduce&&!introduced){introduced=true;speak(introduction());}return true;},
  setMuted(value){muted=!!value;if(muted)cancel();notify();return isMuted();},
  setPreferences(value={}){preferences=value||{};if(isMuted(current))cancel();else if(pending&&isMuted(pending))pending=null;notify();},
  replay(){if(disposed)return false;api.unlock({introduce:false});const call=latest?{...latest,at:now()}:introduction();if(isMuted(call))return false;if(call.category==='introduction')introduced=true;cancel();speak(call);return true;},
  reset(){cancel();latest=null;seen.clear();},
  dispose(){disposed=true;cancel();try{context?.close?.()?.catch?.(()=>{});}catch{}},get state(){return {unlocked,muted:isMuted(),localMuted:muted,settingsMuted:settingsMuted(),speaking:!!current,speechAvailable:speechAvailable()};},get latest(){return latest?.text||'';}};notify();return api;
}
