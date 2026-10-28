import {speechVoiceOptions} from './character-voice-profile.js';

export const GENERATED_VOICES=Object.freeze([
 Object.freeze({name:'MUZIKAZ Natural Female',voiceURI:'muzikaz:neural-female',gender:'female',lang:'en-US',generated:true,natural:true,localService:false,default:true}),
 Object.freeze({name:'MUZIKAZ Natural Male',voiceURI:'muzikaz:neural-male',gender:'male',lang:'en-US',generated:true,natural:true,localService:false,default:false})
]);

// A plain utterance works even on devices with no installed synthesis engine.
export class GameSpeechUtterance {
 constructor(text=''){this.text=String(text);this.voice=null;this.lang='en-US';this.rate=1;this.pitch=1;this.volume=1;this.onstart=null;this.onend=null;this.onerror=null;this.onboundary=null;}
}
const clamp=(value,min,max,fallback=1)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const key=voice=>voice?.voiceURI||[voice?.name,voice?.lang].join(':');
const defaultFetch=(path,options)=>globalThis.MUZIKAZ_API?.fetch?globalThis.MUZIKAZ_API.fetch(path,{...options,deadlineManaged:true,retries:0}):globalThis.fetch(path,{credentials:'include',...options});
const defaultAudioFactory=()=>{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;return Context?new Context():null;};

// Start a long guide after its first sentence instead of waiting for the whole
// map introduction to be generated. Keep only one upcoming sentence in flight.
function speechChunks(text){
 const chunks=[];let remaining=text.trim();
 while(remaining.length>180){
  const head=remaining.slice(0,181),sentences=[...head.matchAll(/[.!?]["')\]]*\s+/g)];
  let end=sentences.length?sentences.at(-1).index+sentences.at(-1)[0].length:head.lastIndexOf(' ',180);
  if(end<1)end=180;
  chunks.push(remaining.slice(0,end).trim());remaining=remaining.slice(end).trim();
 }
 if(remaining)chunks.push(remaining);return chunks;
}

// All generated speech goes straight to a gain and the speakers. Spatial world
// sounds keep their own graph; voices never receive reverb, delay or pitch shifts.
export function createNeuralCharacterSpeech({fetch:request=defaultFetch,audioFactory=defaultAudioFactory,nativeSpeech=globalThis.speechSynthesis,NativeUtterance=globalThis.SpeechSynthesisUtterance,setTimer=setTimeout,clearTimer=clearTimeout,setInterval:repeat=setInterval,clearInterval:clearRepeat=clearInterval,requestTimeout=60000}={}){
 let context=null,unlocking=null,resolveUnlock=null,unlockAttempt=0,unlocked=false,disposed=false,active=null,lastError=null,status='Tap a game control to enable voice audio.';
 const listeners=new Map();
 const emit=(type,event={})=>{for(const callback of listeners.get(type)||[]){try{if(typeof callback==='function')callback({...event,type,target:api});else callback?.handleEvent?.({...event,type,target:api});}catch{}}};
 const notify=()=>emit('statechange');
 const nativeVoices=()=>{try{return speechVoiceOptions(nativeSpeech?.getVoices?.()||[]).map(entry=>entry.voice);}catch{return [];}};
 const isCurrent=job=>!disposed&&active===job;
 function event(job,type,detail={}){try{job.utterance['on'+type]?.({type,target:job.utterance,...detail});}catch{}}
 function clearSource(job){if(job.source){job.source.onended=null;try{job.source.stop();}catch{}try{job.source.disconnect();}catch{}}try{job.gain?.disconnect();}catch{}job.source=null;job.gain=null;}
 function clearJob(job){clearTimer(job.timeout);clearRepeat(job.volumeTimer);job.timeout=null;job.volumeTimer=null;clearSource(job);}
 function finish(job){if(!isCurrent(job))return;active=null;clearJob(job);status='Generated male and female voices are ready.';notify();event(job,'end',{elapsedTime:job.duration||0});}
 function fail(job,code,message){if(!isCurrent(job))return;active=null;clearJob(job);job.abort.abort();lastError={code,message};status=message;notify();event(job,'error',{error:code,message});}
 function volume(job){const value=clamp(job.utterance.volume,0,1);if(job.gain){if(job.gain.gain.setValueAtTime)job.gain.gain.setValueAtTime(value,context.currentTime);else job.gain.gain.value=value;}if(job.native){try{job.native.volume=value;}catch{}}}
 function cancel(){const job=active;if(!job)return;active=null;clearJob(job);job.abort.abort();if(job.native){try{nativeSpeech?.cancel?.();}catch{}}status='Speech stopped.';notify();event(job,'error',{error:'canceled',message:'Speech stopped.'});}
 async function generated(job,voice){
  if(unlocking)await unlocking;
  if(!isCurrent(job))return;
  if(!unlocked||!context||context.state!=='running'){fail(job,'not-allowed','Tap a game control or Preview voice to enable audio.');return;}
  const chunks=speechChunks(job.utterance.text);
  async function load(text){
   if(!isCurrent(job))return null;
   job.timeout=setTimer(()=>{if(isCurrent(job))fail(job,'synthesis-unavailable','Voice generation took too long. Captions remain available.');},requestTimeout);
   try{
    const response=await request('/api/speech',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'audio/wav'},body:JSON.stringify({text,voice:voice.gender,speed:clamp(job.utterance.rate,.9,1.1)}),signal:job.abort.signal});
    if(!isCurrent(job))return null;
    if(!response?.ok){fail(job,'synthesis-unavailable','Generated speech is temporarily unavailable. Try Preview voice again. Captions remain available.');return null;}
    const bytes=await response.arrayBuffer();if(!isCurrent(job))return null;
    if(bytes.byteLength<44){fail(job,'synthesis-failed','The generated voice audio could not be played. Captions remain available.');return null;}
    return await context.decodeAudioData(bytes);
   }catch(error){if(isCurrent(job))fail(job,error?.name==='NotAllowedError'?'not-allowed':'synthesis-unavailable',error?.name==='NotAllowedError'?'Tap Preview voice to enable audio.':'Generated speech is temporarily unavailable. Captions remain available.');return null;}
   finally{clearTimer(job.timeout);job.timeout=null;}
  }
  async function playChunk(pending,index){
   if(!isCurrent(job))return;
   const buffer=await pending;if(!isCurrent(job)||!buffer)return;
   if(context.state!=='running'){fail(job,'not-allowed','Tap a game control or Preview voice again to resume audio.');return;}
   const next=index+1<chunks.length?load(chunks[index+1]):null;
   try{
    job.source=context.createBufferSource();job.gain=context.createGain();job.source.buffer=buffer;job.source.playbackRate.value=1;
    job.source.connect(job.gain);job.gain.connect(context.destination);volume(job);job.duration=(job.duration||0)+buffer.duration;
    job.source.onended=()=>{if(!isCurrent(job))return;clearSource(job);if(next){status=`Preparing ${voice.gender} voice…`;notify();void playChunk(next,index+1);}else finish(job);};
    job.source.start();status=`Playing ${voice.name}.`;lastError=null;
    if(!job.started){job.started=true;job.volumeTimer=repeat(()=>{if(isCurrent(job))volume(job);},50);notify();event(job,'start');}else notify();
    if(isCurrent(job))event(job,'boundary',{name:'sentence',audioDuration:buffer.duration,remainingSegments:chunks.length-index-1});
   }catch{if(isCurrent(job))fail(job,'synthesis-failed','The generated voice audio could not be played. Captions remain available.');}
  }
  status=`Generating ${voice.gender} voice…`;notify();
  await playChunk(load(chunks[0]),0);
 }
 function native(job,voice){
  if(!nativeSpeech?.speak||!NativeUtterance){fail(job,'voice-unavailable','This selected device voice is unavailable. Choose a generated voice.');return;}
  try{
   const utterance=new NativeUtterance(job.utterance.text);job.native=utterance;utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=clamp(job.utterance.rate,.9,1.1);utterance.pitch=1;volume(job);
   utterance.onstart=()=>{if(!isCurrent(job))return;job.started=true;lastError=null;status=`Playing ${voice.name}.`;job.volumeTimer=repeat(()=>{if(isCurrent(job))volume(job);},50);notify();event(job,'start');};
   utterance.onend=()=>finish(job);utterance.onerror=error=>{if(isCurrent(job))fail(job,error?.error||'synthesis-failed','This selected device voice could not play. Choose a generated voice.');};
   status=`Starting ${voice.name}.`;notify();nativeSpeech.speak(utterance);
  }catch{fail(job,'voice-unavailable','This selected device voice could not play. Choose a generated voice.');}
 }
 function speak(utterance){
  if(disposed||!utterance)return;
  cancel();lastError=null;
  const job={utterance,abort:new AbortController(),started:false,timeout:null,volumeTimer:null,source:null,gain:null,native:null};active=job;
  const line=typeof utterance.text==='string'?utterance.text.trim():'';
  if(!line||line.length>1000){fail(job,'invalid-argument','Voice text must contain 1 to 1000 characters.');return;}
  const requested=utterance.voice,generatedVoice=GENERATED_VOICES.find(voice=>key(voice)===key(requested));
  if(!requested||generatedVoice){void generated(job,generatedVoice||GENERATED_VOICES[0]);return;}
  const selected=nativeVoices().find(voice=>key(voice)===key(requested));
  if(!selected){fail(job,'voice-unavailable','The selected voice is not installed on this device. Choose a generated voice.');return;}
  native(job,selected);
 }
 async function resume(){
  if(disposed)return false;
  try{nativeSpeech?.resume?.();}catch{}
  // Called by the user's control gesture. speak() never attempts its own resume.
  // Some mobile browsers leave pointerdown's resume promise pending. A later
  // touchend/click must make a fresh resume attempt and release the same waiter.
  try{if(!context||context.state==='closed')context=audioFactory();}catch{}
  if(!context){lastError={code:'audio-unavailable',message:'This browser cannot play generated voice audio. Captions remain available.'};status=lastError.message;notify();return false;}
  if(!unlocking)unlocking=new Promise(resolve=>{resolveUnlock=resolve;});
  const pending=unlocking,attempt=++unlockAttempt;
  function completed(){
   if(disposed||attempt!==unlockAttempt)return;
   unlocked=context.state==='running';
   if(unlocked){lastError=null;if(!active)status='Generated male and female voices are ready.';}else{lastError={code:'not-allowed',message:'Tap Enable all audio or Preview voice to enable audio.'};status=lastError.message;}
   const resolve=resolveUnlock;resolveUnlock=null;unlocking=null;resolve?.(unlocked);notify();
  }
  try{
   const result=context.state==='running'?Promise.resolve():context.resume();
   Promise.resolve(result).then(completed,completed);
  }catch{completed();}
  return pending;
 }
 const onNativeVoices=()=>emit('voiceschanged');nativeSpeech?.addEventListener?.('voiceschanged',onNativeVoices);
 const api={speak,cancel,resume,
  getVoices:()=>[...GENERATED_VOICES,...nativeVoices()],
  addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
  removeEventListener(type,callback){listeners.get(type)?.delete(callback);},
  dispose(){if(disposed)return;cancel();disposed=true;resolveUnlock?.(false);resolveUnlock=null;unlocking=null;nativeSpeech?.removeEventListener?.('voiceschanged',onNativeVoices);listeners.clear();try{context?.close?.()?.catch?.(()=>{});}catch{}},
  get speaking(){return !!active?.started;},get pending(){return !!active&&!active.started;},get paused(){return false;},get status(){return status;},get lastError(){return lastError;},
  get state(){return {supported:!disposed,unlocked:unlocked&&context?.state==='running',speaking:!!active?.started,loading:!!active&&!active.started,error:lastError,status,selectedVoice:active?.utterance.voice?.name||null};}
 };
 return api;
}
let shared;
export function gameSpeech(){return shared||=createNeuralCharacterSpeech();}
