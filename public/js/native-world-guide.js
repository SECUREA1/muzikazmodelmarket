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

// Native games have their own startup lifecycle. Keep their guide pending
// until the map is playable, preferences have loaded, and a control is used.
export function mountNativeWorldGuide({parent,events=document,voice=questConversationVoice(),loadPreferences=savedPreferences,announceOnEnter=true}={}){
 let disposed=false,gestured=false,ready=false,pending=null,current=null,visit=0,loading=false,loaded,preferencesRevision=0;
 let preferences=normalizePlayerPreferences(globalThis.MUZIKAZ_AUDIO_PREFERENCES||{});
 const controls=document.createElement('span');controls.className='native-world-guide-audio';controls.style.cssText='display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center';
 const enable=document.createElement('button'),mute=document.createElement('button'),replay=document.createElement('button');enable.type=mute.type=replay.type='button';replay.textContent='Replay guide';
 const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(enable,mute,replay,status);parent?.append(controls);
 function render(){
  const audio=voice.state||{},audioReady=audio.audioReady??audio.unlocked??gestured;
  // An initial touch may not unlock Web Audio, and a backgrounded tab can
  // suspend it again. Keep a working resume control after either case.
  enable.textContent=audioReady?'Resume guide audio':'Enable guide audio';enable.disabled=false;
  mute.textContent=preferences.masterMuted?'Muted in Audio settings':preferences.introductionMuted?'Unmute guide':'Mute guide';mute.disabled=preferences.masterMuted;
  mute.setAttribute('aria-pressed',String(!!(preferences.masterMuted||preferences.introductionMuted)));mute.setAttribute('aria-label','Mute map guide');replay.disabled=!current||preferences.masterMuted;
  status.textContent=preferences.masterMuted?'All audio is muted in Audio settings.':preferences.introductionMuted?'Map guides are muted.':audio.error?.message|| (audio.loading?'Preparing voice audio…':audioReady?'Guide audio is ready.':'Use Enable guide audio or a game control to hear the guide.');
 }
 function flush(){
  if(disposed||!ready||!gestured||!pending)return;
  const entry=pending;pending=null;
  voice.announce(entry.text,{key:'native-arrival:'+entry.visit,worldId:entry.id,category:'introduction',voice:'World narrator',role:'narrator'});
 }
 const unlock=()=>{if(disposed)return;gestured=true;const result=voice.unlock();render();flush();if(result?.then)Promise.resolve(result).then(()=>{if(!disposed)render();},()=>{if(!disposed)render();});};
 const changed=event=>{preferencesRevision++;preferences=normalizePlayerPreferences(event.detail||{});voice.setPreferences(preferences);render();};
 const gestureEvents=['pointerdown','pointerup','touchend','click','keydown'];
 for(const type of gestureEvents)events.addEventListener(type,unlock,{capture:true,passive:true});
 voice.addEventListener?.('statechange',render);
 globalThis.addEventListener?.('muzikaz:audio-preferences',changed);
 function refreshPreferences(){
  if(loading)return loaded;
  loading=true;ready=false;const revision=preferencesRevision;
  loaded=Promise.resolve().then(()=>loadPreferences()).catch(()=>null).then(value=>{
   loading=false;if(disposed)return;
   if(value&&revision===preferencesRevision)preferences=normalizePlayerPreferences(value);
   voice.setPreferences(preferences);ready=true;render();flush();
  });return loaded;
 }
 refreshPreferences();
 enable.onclick=unlock;
 mute.onclick=()=>{if(preferences.masterMuted)return;preferencesRevision++;preferences={...preferences,introductionMuted:!preferences.introductionMuted};voice.setPreferences(preferences);render();};
 replay.onclick=()=>{if(!current||preferences.masterMuted)return;unlock();voice.replay({...current,category:'introduction',voice:'World narrator',speaker:'World narrator',role:'narrator'});};
 render();
 return {
  enter(environment,{solo=false}={}){
   if(disposed||!environment?.id||current?.id===environment.id)return loaded;
   current={id:environment.id,text:worldGuideIntroduction(environment,{solo}),visit:++visit};pending=announceOnEnter?current:null;refreshPreferences();render();flush();return loaded;
  },
  leave(){pending=null;current=null;render();},
  dispose(){if(disposed)return;disposed=true;pending=null;current=null;for(const type of gestureEvents)events.removeEventListener(type,unlock,true);voice.removeEventListener?.('statechange',render);globalThis.removeEventListener?.('muzikaz:audio-preferences',changed);controls.remove();},
  controls,
  get state(){return {ready,gestured,pending:!!pending,worldId:current?.id||null};}
 };
}
