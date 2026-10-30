import {normalizePlayerPreferences} from './player-preferences.js';

// This is an explicit session action. Account settings still change only when
// the player uses Save in Settings; late restores retain these chosen overrides.
export function enableDoomsdayAudioPreferences({getPreferences=()=>globalThis.MUZIKAZ_AUDIO_PREFERENCES,voice,scope=globalThis}={}){
 const current=normalizePlayerPreferences(getPreferences()),overrides={masterMuted:false,effectsMuted:false,announcementsMuted:false};
 if(current.effectsVolume===0)overrides.effectsVolume=100;
 scope.MUZIKAZ_AUDIO_SESSION_OVERRIDES={...scope.MUZIKAZ_AUDIO_SESSION_OVERRIDES,...overrides};
 const preferences=normalizePlayerPreferences({...current,...overrides});
 scope.MUZIKAZ_AUDIO_PREFERENCES=preferences;
 voice?.setPreferences?.(preferences);voice?.setMuted?.(false);
 // Resume inside the tap, before any asynchronous browser or settings work.
 try{Promise.resolve(voice?.unlock?.()).catch(()=>{});}catch{}
 scope.dispatchEvent?.(new CustomEvent('muzikaz:audio-preferences',{detail:preferences}));
 return preferences;
}
