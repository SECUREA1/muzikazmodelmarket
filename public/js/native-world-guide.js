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
 controls.append(enable,mute,replay);parent?.append(controls);
 function render(){enable.textContent=gestured?'Guide audio enabled':'Enable guide audio';enable.disabled=gestured;mute.textContent=preferences.masterMuted||preferences.introductionMuted?'Guide muted':'Mute guide';mute.setAttribute('aria-pressed',String(!!(preferences.masterMuted||preferences.introductionMuted)));mute.setAttribute('aria-label','Mute map guide');replay.disabled=!current||preferences.masterMuted;}
 function flush(){
  if(disposed||!ready||!gestured||!pending)return;
  const entry=pending;pending=null;
  voice.announce(entry.text,{key:'native-arrival:'+entry.visit,worldId:entry.id,category:'introduction',voice:'World narrator',role:'narrator'});
 }
 const unlock=()=>{if(disposed)return;gestured=true;voice.unlock();render();flush();};
 const changed=event=>{preferencesRevision++;preferences=normalizePlayerPreferences(event.detail||{});voice.setPreferences(preferences);render();};
 events.addEventListener('pointerdown',unlock,{capture:true,passive:true});events.addEventListener('keydown',unlock,true);
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
 mute.onclick=()=>{preferencesRevision++;preferences={...preferences,introductionMuted:!(preferences.masterMuted||preferences.introductionMuted)};voice.setPreferences(preferences);render();};
 replay.onclick=()=>{if(!current||preferences.masterMuted)return;unlock();voice.replay({...current,category:'introduction',voice:'World narrator',speaker:'World narrator',role:'narrator'});};
 render();
 return {
  enter(environment,{solo=false}={}){
   if(disposed||!environment?.id||current?.id===environment.id)return loaded;
   current={id:environment.id,text:worldGuideIntroduction(environment,{solo}),visit:++visit};pending=announceOnEnter?current:null;refreshPreferences();render();flush();return loaded;
  },
  leave(){pending=null;current=null;render();},
  dispose(){if(disposed)return;disposed=true;pending=null;current=null;events.removeEventListener('pointerdown',unlock,true);events.removeEventListener('keydown',unlock,true);globalThis.removeEventListener?.('muzikaz:audio-preferences',changed);controls.remove();},
  controls,
  get state(){return {ready,gestured,pending:!!pending,worldId:current?.id||null};}
 };
}
