import {questConversationVoice} from './quest-conversation-voice.js';
import {normalizePlayerPreferences} from './player-preferences.js';
import {worldGuideIntroduction} from './world-guide.js';

async function savedPreferences(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);
 try{
  const options={headers:{Accept:'application/json'},credentials:'include',cache:'no-store',signal:controller.signal};
  const response=globalThis.MUZIKAZ_API?.fetch?await globalThis.MUZIKAZ_API.fetch('/api/player/settings',options):await fetch('/api/player/settings',options);
  if(!response.ok)return null;
  const payload=await response.json();return (payload?.data??payload)?.settings||null;
 }catch{return null;}finally{clearTimeout(timer);}
}

// Native games have their own startup lifecycle. Queue the guide after its
// preferences load and resume automatically at entry; ordinary controls retry
// browser-blocked audio without requiring a separate activation button.
export function mountNativeWorldGuide({parent,events=document,voice=questConversationVoice(),loadPreferences=savedPreferences,announceOnEnter=true,lifecycle=globalThis}={}){
 let disposed=false,gestured=false,ready=false,pending=null,current=null,visit=0,loading=false,loaded,preferencesRevision=0,wasReady=false;
 const documentEvents=parent?.ownerDocument||globalThis.document||events;
 let preferences=normalizePlayerPreferences(globalThis.MUZIKAZ_AUDIO_PREFERENCES||{});
 const controls=document.createElement('span');controls.className='native-world-guide-audio';controls.style.cssText='display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center';
 const mute=document.createElement('button'),replay=document.createElement('button');mute.type=replay.type='button';replay.textContent='Replay guide';
 const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(mute,replay,status);parent?.append(controls);
 function render(){
  const audio=voice.state||{},audioReady=audio.audioReady??audio.unlocked??gestured;
  mute.textContent=preferences.masterMuted?'Muted in Audio settings':preferences.introductionMuted?'Unmute guide':'Mute guide';mute.disabled=preferences.masterMuted;
  mute.setAttribute('aria-pressed',String(!!(preferences.masterMuted||preferences.introductionMuted)));mute.setAttribute('aria-label','Mute map guide');replay.disabled=!current||preferences.masterMuted;
  status.textContent=preferences.masterMuted?'All audio is muted in Audio settings.':preferences.introductionMuted?'Map guides are muted.':audio.error?.message|| (audio.loading?'Preparing voice audio…':audioReady?'Guide audio is ready.':'Audio starts with the game or your next control.');
 }
 function flush(){
  if(disposed||!ready||!pending)return;
  const entry=pending;pending=null;
  voice.announce(entry.text,{key:'native-arrival:'+entry.visit,worldId:entry.id,category:'introduction',voice:'World narrator',role:'narrator'});
 }
 const unlock=event=>{if(disposed)return;if(event&&gestureEvents.includes(event.type))gestured=true;let result;try{result=voice.unlock();}catch{}render();flush();if(result?.then)Promise.resolve(result).then(()=>{if(!disposed)render();},()=>{if(!disposed)render();});};
 const changed=event=>{preferencesRevision++;preferences=normalizePlayerPreferences(event.detail||{});voice.setPreferences(preferences);render();};
 const gestureEvents=['pointerdown','pointerup','touchend','click','keydown'];
 for(const type of gestureEvents)events.addEventListener(type,unlock,{capture:true,passive:true});
 const outputChanged=()=>{const previous=wasReady;wasReady=!!(voice.state?.audioReady??voice.state?.unlocked);render();if(previous&&!wasReady&&current&&documentEvents.hidden!==true)unlock();};
 const returned=()=>{if(current&&ready&&documentEvents.hidden!==true)unlock();};
 voice.addEventListener?.('statechange',outputChanged);
 documentEvents.addEventListener?.('visibilitychange',returned);
 for(const type of ['focus','pageshow'])lifecycle.addEventListener?.(type,returned);
 globalThis.addEventListener?.('muzikaz:audio-preferences',changed);
 function refreshPreferences(){
  if(loading)return loaded;
  loading=true;ready=false;const revision=preferencesRevision;
  loaded=Promise.resolve().then(()=>loadPreferences()).catch(()=>null).then(value=>{
   loading=false;if(disposed)return;
   if(value&&revision===preferencesRevision)preferences=normalizePlayerPreferences(value);
   voice.setPreferences(preferences);ready=true;render();flush();if(current)unlock();
  });return loaded;
 }
 refreshPreferences();
 mute.onclick=()=>{if(preferences.masterMuted)return;preferencesRevision++;preferences={...preferences,introductionMuted:!preferences.introductionMuted};voice.setPreferences(preferences);render();};
 replay.onclick=()=>{if(!current||preferences.masterMuted)return;unlock();voice.replay({...current,category:'introduction',voice:'World narrator',speaker:'World narrator',role:'narrator'});};
 render();
 return {
  enter(environment,{solo=false}={}){
   if(disposed||!environment?.id||current?.id===environment.id)return loaded;
   current={id:environment.id,text:worldGuideIntroduction(environment,{solo}),visit:++visit};pending=announceOnEnter?current:null;refreshPreferences();render();flush();return loaded;
  },
  leave(){pending=null;current=null;render();},
  dispose(){if(disposed)return;disposed=true;pending=null;current=null;for(const type of gestureEvents)events.removeEventListener(type,unlock,true);voice.removeEventListener?.('statechange',outputChanged);documentEvents.removeEventListener?.('visibilitychange',returned);for(const type of ['focus','pageshow'])lifecycle.removeEventListener?.(type,returned);globalThis.removeEventListener?.('muzikaz:audio-preferences',changed);controls.remove();},
  controls,
  get state(){return {ready,gestured,pending:!!pending,worldId:current?.id||null};}
 };
}
