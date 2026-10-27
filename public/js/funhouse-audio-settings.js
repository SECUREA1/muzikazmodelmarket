export const FUNHOUSE_AUDIO_DEFAULTS=Object.freeze({musicMuted:false,voiceMuted:false,effectsMuted:false,musicVolume:35,voiceVolume:75,effectsVolume:65});

export function normalizeFunhouseAudioSettings(value={}){
 const settings={};
 for(const [key,fallback]of Object.entries(FUNHOUSE_AUDIO_DEFAULTS))settings[key]=typeof fallback==='boolean'?(typeof value?.[key]==='boolean'?value[key]:fallback):value?.[key]!==null&&value?.[key]!==''&&Number.isFinite(Number(value?.[key]))?Math.max(0,Math.min(100,Math.round(Number(value[key])))):fallback;
 return settings;
}

export function funhouseAudioNotice(preferences={}){
 preferences||={};
 if(preferences.masterMuted)return 'All game audio is muted in Player settings. Captions remain available.';
 const messages=[];
 if(preferences.dialogueMuted)messages.push('Clown voices are muted in Player settings.');
 if(preferences.effectsMuted||preferences.effectsVolume===0)messages.push('Game effects and music are muted in Player settings.');
 return messages.join(' ')||'Your Player settings also control these sounds. Captions remain available.';
}

export function funhouseAudioAllowed(channel,settings={},preferences={}){
 preferences||={};
 const value=normalizeFunhouseAudioSettings(settings);
 return !preferences.masterMuted&&!value[channel+'Muted']&&value[channel+'Volume']>0&&(channel==='voice'?!preferences.dialogueMuted:!preferences.effectsMuted&&preferences.effectsVolume!==0);
}
