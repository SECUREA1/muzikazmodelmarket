import {gameSpeech} from './neural-character-speech.js';
import {questConversationVoice} from './quest-conversation-voice.js';
import {normalizePlayerPreferences} from './player-preferences.js';

// This small module loads with the launch button, before the deferred 3D engine.
// The original Begin gesture must reach Web Audio before any asynchronous import.
export function activateGameAudio(){
 try{const voice=questConversationVoice();voice.setMuted(false);return voice.unlock();}catch{return false;}
}

export function mountGameAudioActivation({parent=document.querySelector('.house-stage'),speech=gameSpeech(),voice=questConversationVoice(),events=globalThis}={}){
 if(!parent)return null;
 const existing=parent.querySelector('[data-game-audio-activation]');if(existing)return null;
 const root=document.createElement('div');root.className='game-audio-activation';root.dataset.gameAudioActivation='';
 const button=document.createElement('button');button.type='button';button.dataset.gameAudioEnable='';
 const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 root.append(button,status);parent.append(root);
 let preferences=normalizePlayerPreferences(globalThis.MUZIKAZ_AUDIO_PREFERENCES||{}),disposed=false;
 function render(){
  if(disposed)return;
  const state=speech?.state||{},muted=!!preferences.masterMuted,voiceMuted=!!voice?.state?.muted;
  button.textContent=state.unlocked?'Resume audio':'Enable audio';
  button.setAttribute('aria-label',state.unlocked?'Resume game audio':'Enable game audio');
  root.dataset.audioReady=String(!!state.unlocked);
  status.textContent=muted?'All audio is muted in Settings.':state.error?.message|| (voiceMuted?'Voice audio is muted in Settings or World radio.':state.loading?'Preparing voice…':state.speaking?'Voice playing.':state.unlocked?'Audio enabled.':'Tap Enable audio to hear this world.');
 }
 function activate({unmute=false,previewIfIdle=false}={}){
  if(disposed)return;
  if(unmute){
   // This button explicitly promises audio. Clear saved category mutes as well
   // as the separate radio switch, and keep the choice through a late account
   // settings response. Ordinary world/control gestures still honor all mutes.
   const overrides={masterMuted:false,introductionMuted:false,announcementsMuted:false,dialogueMuted:false,effectsMuted:false,mediaMuted:false,effectsVolume:preferences.effectsVolume===0?100:preferences.effectsVolume};
   globalThis.MUZIKAZ_AUDIO_SESSION_OVERRIDES=overrides;
   preferences={...preferences,...overrides};globalThis.MUZIKAZ_AUDIO_PREFERENCES=preferences;
   voice.setPreferences?.(preferences);voice.setMuted(false);
   events?.dispatchEvent?.(new CustomEvent('muzikaz:audio-preferences',{detail:preferences}));
  }
  const result=voice.unlock();render();
  if(result?.then)Promise.resolve(result).then(render,render);
  if(unmute)voice.resumeIntroduction?.();
  // An explicit sound check gives audible confirmation before the world is
  // loaded. A waiting map guide keeps its place and plays instead of a preview.
  if(previewIfIdle&&!preferences.masterMuted&&!preferences.dialogueMuted&&!voice.state?.speaking&&!voice.state?.pending){
   const preview=voice.preview?.(preferences);if(preview?.then)Promise.resolve(preview).then(render,render);
  }
 }
 const changed=event=>{preferences=event.detail||{};render();};
 // Capture the start gesture while the large game graph is still loading.
 const gestures=['pointerdown','pointerup','touchend','click','keydown'];
 for(const type of gestures)parent.addEventListener(type,activate,{capture:true,passive:true});
 button.addEventListener('click',()=>activate({unmute:true,previewIfIdle:true}));
 speech?.addEventListener?.('statechange',render);
 events?.addEventListener?.('muzikaz:audio-preferences',changed);
 render();
 return {root,dispose(){if(disposed)return;disposed=true;for(const type of gestures)parent.removeEventListener(type,activate,true);speech?.removeEventListener?.('statechange',render);events?.removeEventListener?.('muzikaz:audio-preferences',changed);root.remove();}};
}
