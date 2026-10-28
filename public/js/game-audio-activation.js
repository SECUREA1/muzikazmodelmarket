import {gameSpeech} from './neural-character-speech.js';
import {questConversationVoice} from './quest-conversation-voice.js';

// Run inside Start's original gesture, before loading the deferred 3D engine.
// Resuming the output never changes a player's saved or local mute choices.
export function activateGameAudio(){
 try{return questConversationVoice().unlock();}catch{return false;}
}

const mounted=new WeakMap();

// Audio follows the game lifecycle and normal controls. There is no separate
// activation button or unsolicited voice preview over the game viewport.
export function mountGameAudioActivation({parent=document.querySelector('.house-stage'),speech=gameSpeech(),voice=questConversationVoice(),events=globalThis}={}){
 if(!parent)return null;
 if(mounted.has(parent))return mounted.get(parent);
 parent.querySelector?.('[data-game-audio-activation]')?.remove();
 const documentEvents=parent.ownerDocument||globalThis.document||parent,cleanup=[];
 let disposed=false,started=false,gestured=false,wasReady=!!speech?.state?.unlocked;
 const visible=()=>documentEvents.hidden!==true;
 function listen(target,type,callback,options){target?.addEventListener?.(type,callback,options);cleanup.push(()=>target?.removeEventListener?.(type,callback,options));}
 function activate(){
  if(disposed)return false;
  try{const result=voice.unlock();return result?.then?Promise.resolve(result).catch(()=>false):result;}catch{return false;}
 }
 const gesture=()=>{gestured=true;activate();};
 const ready=()=>{started=true;if(visible())activate();};
 const returned=()=>{if(visible()&&(started||gestured||wasReady))activate();};
 const changed=()=>{
  const previous=wasReady;wasReady=!!speech?.state?.unlocked;
  // Retry a resumed page or an OS audio interruption once. A denied attempt
  // waits for the next ordinary gesture instead of spinning on state changes.
  if(previous&&!wasReady&&visible())activate();
 };
 for(const type of ['pointerdown','pointerup','touchend','click','keydown'])listen(documentEvents,type,gesture,{capture:true,passive:true});
 listen(documentEvents,'muzikaz:gameplay-ready',ready);
 listen(documentEvents,'visibilitychange',returned);
 for(const type of ['focus','pageshow'])listen(events,type,returned);
 listen(speech,'statechange',changed);
 const api={dispose(){if(disposed)return;disposed=true;for(const remove of cleanup)remove();mounted.delete(parent);}};
 listen(events,'pagehide',event=>{if(!event.persisted)api.dispose();});
 mounted.set(parent,api);return api;
}
