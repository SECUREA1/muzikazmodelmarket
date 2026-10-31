import {mountDoomsdayUI} from './doomsday-ui.js';
import {createDoomsdayScene} from './doomsday-scene.js';
import {questConversationVoice} from './quest-conversation-voice.js';
import {normalizePlayerPreferences} from './player-preferences.js';
import {enableDoomsdayAudioPreferences} from './doomsday-audio-preferences.js';

// Native sports use their own match servers. Their response exercise is local
// to this visitor, and never changes a match, puck, score, or park attraction.
export function mountNativeDoomsday({scene,getEnvironment,getPosition,announce=()=>{}}){
 const stage=document.createElement('div');stage.className='native-doomsday';stage.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:80';document.body.append(stage);
 let preferences=normalizePlayerPreferences(globalThis.MUZIKAZ_AUDIO_PREFERENCES||{}),disposed=false,preferenceRevision=0;
 const changed=event=>{preferenceRevision++;preferences=normalizePlayerPreferences(event.detail||{});};
 globalThis.addEventListener('muzikaz:audio-preferences',changed);
 const initialRevision=preferenceRevision,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
 const fetchSettings=globalThis.MUZIKAZ_API?.fetch?globalThis.MUZIKAZ_API.fetch.bind(globalThis.MUZIKAZ_API):globalThis.fetch;
 Promise.resolve().then(()=>fetchSettings('/api/player/settings',{credentials:'include',cache:'no-store',signal:controller.signal})).then(response=>response.ok?response.json():null).then(payload=>{
  const value=(payload?.data??payload)?.settings;if(!disposed&&value&&preferenceRevision===initialRevision)preferences=normalizePlayerPreferences({...value,...globalThis.MUZIKAZ_AUDIO_SESSION_OVERRIDES});
 }).catch(()=>{}).finally(()=>clearTimeout(timeout));
 const voice=questConversationVoice();
 const ui=mountDoomsdayUI({stage,getEnvironment,getPosition,isShared:()=>false,announce,voice,getPreferences:()=>preferences,onEnableAudio:()=>enableDoomsdayAudioPreferences({getPreferences:()=>preferences,voice}),effects:createDoomsdayScene({scene,performanceMode:matchMedia('(max-width:600px)').matches})});
 const menu=document.createElement('details');menu.className='native-radio-menu';const summary=document.createElement('summary');summary.textContent='•••';summary.setAttribute('aria-label','More controls');summary.setAttribute('role','button');summary.setAttribute('aria-expanded','false');summary.title='More controls';const controls=document.createElement('div');controls.className='native-emergency-controls';controls.append(stage.querySelector('.emergency-nuclear-toggle'),stage.querySelector('.doomsday-menu'));menu.append(summary,controls);stage.append(menu);menu.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(menu.open)));menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){event.preventDefault();event.stopPropagation();menu.open=false;summary.focus({preventScroll:true});}});
 const panel=stage.querySelector('.doomsday-guide');panel.style.pointerEvents='auto';
 return {tick(time){ui.tick(time,{reducedMotion:preferences.reducedMotion||matchMedia('(prefers-reduced-motion:reduce)').matches});},getState:ui.getState,
  reset:ui.reset,dispose(){disposed=true;controller.abort();clearTimeout(timeout);globalThis.removeEventListener('muzikaz:audio-preferences',changed);ui.dispose();stage.remove();}};
}
