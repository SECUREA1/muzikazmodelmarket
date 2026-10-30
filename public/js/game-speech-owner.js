// Browser synthesis has one global queue. Only the active game speaker may
// cancel it; handing it over first invalidates the previous speaker's callbacks.
const activeSpeakers=new WeakMap();
const supported=speech=>speech&&(typeof speech==='object'||typeof speech==='function')&&typeof speech.speak==='function';

export function claimGameSpeech(speech,owner,onInterrupt=()=>{},{priority=0}={}){
 if(!supported(speech)||owner==null)return false;
 const previous=activeSpeakers.get(speech);
 if(previous?.owner===owner){previous.priority=priority;return true;}
 if(previous){
  activeSpeakers.delete(speech);
  try{previous.onInterrupt();}catch{}
  try{speech.cancel?.();}catch{}
 }
 activeSpeakers.set(speech,{owner,onInterrupt,priority});return true;
}
export function releaseGameSpeech(speech,owner){
 if(!supported(speech)||activeSpeakers.get(speech)?.owner!==owner)return false;
 activeSpeakers.delete(speech);return true;
}
export function cancelGameSpeech(speech,owner){
 if(!releaseGameSpeech(speech,owner))return false;
 try{speech.cancel?.();}catch{}
 return true;
}
export function isGameSpeechActive(speech){return !!supported(speech)&&activeSpeakers.has(speech);}
export function gameSpeechPriority(speech){return supported(speech)?activeSpeakers.get(speech)?.priority||0:0;}
