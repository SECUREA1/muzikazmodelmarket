import {mountDoomsdayUI} from './doomsday-ui.js';
import {createDoomsdayScene} from './doomsday-scene.js';
import {questConversationVoice} from './quest-conversation-voice.js';
import {normalizePlayerPreferences} from './player-preferences.js';

// Native sports use their own match servers. Their response exercise is local
// to this visitor, and never changes a match, puck, score, or park attraction.
export function mountNativeDoomsday({scene,toolbar,getEnvironment,getPosition,announce=()=>{}}){
 const stage=document.createElement('div');stage.className='native-doomsday';stage.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:80';document.body.append(stage);
 let preferences=normalizePlayerPreferences(globalThis.MUZIKAZ_AUDIO_PREFERENCES||{}),disposed=false,preferenceRevision=0;
 const changed=event=>{preferenceRevision++;preferences=normalizePlayerPreferences(event.detail||{});};
 globalThis.addEventListener('muzikaz:audio-preferences',changed);
 const initialRevision=preferenceRevision,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
 const fetchSettings=globalThis.MUZIKAZ_API?.fetch?globalThis.MUZIKAZ_API.fetch.bind(globalThis.MUZIKAZ_API):globalThis.fetch;
 Promise.resolve().then(()=>fetchSettings('/api/player/settings',{credentials:'include',cache:'no-store',signal:controller.signal})).then(response=>response.ok?response.json():null).then(payload=>{
  const value=(payload?.data??payload)?.settings;if(!disposed&&value&&preferenceRevision===initialRevision)preferences=normalizePlayerPreferences(value);
 }).catch(()=>{}).finally(()=>clearTimeout(timeout));
 const ui=mountDoomsdayUI({stage,getEnvironment,getPosition,isShared:()=>false,announce,voice:questConversationVoice(),getPreferences:()=>preferences,effects:createDoomsdayScene({scene,performanceMode:matchMedia('(max-width:600px)').matches})});
 const toggle=stage.querySelector('.doomsday-toggle');toggle.textContent='☢';toggle.title='Doomsday response exercise';toggle.setAttribute('aria-label',toggle.title);toggle.style.pointerEvents='auto';toggle.style.display='none';toolbar.append(toggle);
 const panel=stage.querySelector('.doomsday-panel');panel.style.pointerEvents='auto';panel.style.top='70px';panel.style.maxHeight='calc(100% - 200px)';
 panel.querySelector('.doomsday-context').textContent='Your local nuclear-response exercise. Skate or walk to each response beam and check in. Match scores, rides, and movement remain available.';
 stage.querySelector('.doomsday-banner').style.top='70px';
 return {tick(time){ui.tick(time,{reducedMotion:preferences.reducedMotion||matchMedia('(prefers-reduced-motion:reduce)').matches});toggle.style.display=toggle.hidden?'none':'';},getState:ui.getState,
  reset:ui.reset,dispose(){disposed=true;controller.abort();clearTimeout(timeout);globalThis.removeEventListener('muzikaz:audio-preferences',changed);ui.dispose();stage.remove();}};
}
