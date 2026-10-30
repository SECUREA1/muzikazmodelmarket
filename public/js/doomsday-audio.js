// A low-volume civil-defence sweep. It only runs after a real user gesture,
// follows the existing effects controls, and never competes with spoken cues.
export function createDoomsdayAudio({getPreferences=()=>({}),isSpeaking=()=>false,events=globalThis.document,makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let context=null,oscillator=null,gain=null,unlocked=false,muted=false,disposed=false,phaseKey='',phaseAt=0,lastAt=0;
 const stop=()=>{try{oscillator?.stop();oscillator?.disconnect();gain?.disconnect();}catch{}oscillator=gain=null;};
 const unlock=()=>{unlocked=true;if(!context){try{context=makeContext();}catch{}}if(context?.state==='suspended')context.resume().catch(()=>{});};
 for(const type of ['pointerdown','keydown'])events?.addEventListener(type,unlock,true);
 const hidden=()=>{if(events?.hidden)stop();};events?.addEventListener('visibilitychange',hidden);
 return {update(state,time=0){
  const preferences=getPreferences(),phase=state?.phase,key=state?.id+':'+phase;
  if(phaseKey!==key){phaseKey=key;phaseAt=lastAt=time;stop();}
  const speaking=isSpeaking();if(speaking)phaseAt+=Math.max(0,time-lastAt);lastAt=time;
  const audible=!disposed&&unlocked&&!muted&&!events?.hidden&&!speaking&&!preferences.masterMuted&&!preferences.effectsMuted&&Number(preferences.effectsVolume??100)>0&&['warning','fallout'].includes(phase);
  // Quiet intervals leave room for radio and objective announcements.
  const cycle=Math.max(0,time-phaseAt)%18;if(!audible||cycle>=5){stop();return;}
  if(!context){try{context=makeContext();}catch{return;}}
  if(context.state==='suspended'){context.resume().catch(()=>{});return;}
  if(!oscillator){oscillator=context.createOscillator();gain=context.createGain();oscillator.type='sine';oscillator.connect(gain);gain.connect(context.destination);oscillator.start();}
  oscillator.frequency.setTargetAtTime(420+Math.sin(cycle*Math.PI/2.5)*150,context.currentTime,.15);
  gain.gain.setTargetAtTime(Math.min(1,Number(preferences.effectsVolume??100)/100)*.035,context.currentTime,.15);
 },setMuted(value){muted=!!value;if(muted)stop();return muted;},get muted(){return muted;},stop,
 dispose(){disposed=true;stop();for(const type of ['pointerdown','keydown'])events?.removeEventListener(type,unlock,true);events?.removeEventListener('visibilitychange',hidden);context?.close?.();}};
}
