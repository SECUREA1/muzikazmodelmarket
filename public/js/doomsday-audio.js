// Prominent dual-tone civil-defence sweeps are quietened under radio speech.
// Every sound still follows user gesture, effects volume and master mute.
export function createDoomsdayAudio({getPreferences=()=>({}),isSpeaking=()=>false,events=globalThis.document,makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let context=null,oscillators=[],gain=null,unlocked=false,muted=false,disposed=false,phaseKey='',phaseAt=0,sirenAt=0,lastAt=0,eventId=null,blastPhase='',blastMask=0,skipPastBlasts=false;
 // Match the three distant fireballs; missed onsets are never played later.
 const blastOffsets=[0,1.6,3.2],blastGrace=.35;
 const cues=new Set();
 const stopSiren=()=>{for(const oscillator of oscillators){try{oscillator.stop();oscillator.disconnect();}catch{}}oscillators=[];gain?.disconnect();gain=null;};
 const stopCues=()=>{for(const cue of cues){for(const node of cue.nodes){try{node.stop?.();node.disconnect?.();}catch{}}}cues.clear();};
 const stop=()=>{stopSiren();stopCues();};
 const unlock=()=>{if(disposed)return;unlocked=true;if(!context){try{context=makeContext();}catch{}}if(context?.state==='suspended')context.resume().catch(()=>{});};
 for(const type of ['pointerdown','keydown'])events?.addEventListener(type,unlock,true);
 const hidden=()=>{if(events?.hidden){skipPastBlasts=true;stop();}};events?.addEventListener('visibilitychange',hidden);
 const settings=()=>{const preferences=getPreferences();return {preferences,volume:Math.max(0,Math.min(1,Number(preferences.effectsVolume??100)/100)),allowed:!disposed&&unlocked&&!muted&&!events?.hidden&&!preferences.masterMuted&&!preferences.effectsMuted};};
 function rumble(volume,speaking,index){
  if(!context?.createGain||!context?.createOscillator)return;
  const output=context.createGain(),level=context.createGain(),low=context.createOscillator(),high=context.createOscillator(),cue={nodes:[low,high,output,level],level};cues.add(cue);
  low.type='triangle';high.type='sine';low.frequency.setTargetAtTime(54-index*4,context.currentTime,.02);high.frequency.setTargetAtTime(83+index*11,context.currentTime,.02);
  output.gain.value=0;level.gain.value=volume*(speaking?.25:1);output.gain.setTargetAtTime(.13,context.currentTime,.04);output.gain.setTargetAtTime(0,context.currentTime+.4,.3);level.gain.setTargetAtTime(volume*(speaking?.25:1),context.currentTime,.02);
  low.connect(output);high.connect(output);output.connect(level);level.connect(context.destination);low.start();high.start();low.stop(context.currentTime+1.6);high.stop(context.currentTime+1.6);
  high.onended=()=>{for(const node of cue.nodes)node.disconnect?.();cues.delete(cue);};
 }
 return {update(state,time=0){
  const phase=state?.phase,key=state?.id+':'+phase;
  if(phaseKey!==key){phaseKey=key;phaseAt=sirenAt=lastAt=time;stopSiren();}
  if(eventId!==state?.id){eventId=state?.id;blastMask=0;blastPhase='';}
  const speaking=isSpeaking();if(speaking)sirenAt+=Math.max(0,time-lastAt);lastAt=time;
  const {volume,allowed}=settings();
  const presentationTime=state?.presentationTime??state?.currentServerTime;
  const age=Number.isFinite(presentationTime)&&Number.isFinite(state?.phaseStartedAt)?Math.max(0,(presentationTime-state.phaseStartedAt)/1000):Number.isFinite(state?.phaseElapsedMs)?Math.max(0,state.phaseElapsedMs/1000):Math.max(0,time-phaseAt);
  let blastIndex=-1;
  if(phase==='detonation'){
   const firstSnapshot=blastPhase!==key;
   for(let index=0;index<blastOffsets.length;index++)if(age>=blastOffsets[index]&&!(blastMask&(1<<index))){
    blastMask|=1<<index;
    if(!skipPastBlasts&&age-blastOffsets[index]<=blastGrace&&(!firstSnapshot||index===0))blastIndex=index;
   }
   blastPhase=key;skipPastBlasts=false;
  }else if(allowed)skipPastBlasts=false;
  const clearingDuration=Number.isFinite(state?.phaseEndsAt)&&Number.isFinite(state?.phaseStartedAt)?Math.max(.001,(state.phaseEndsAt-state.phaseStartedAt)/1000):8;
  const fade=phase==='clearing'?Math.max(0,1-age/clearingDuration):1;
  const audible=allowed&&volume>0&&fade>0&&['warning','detonation','fallout','recovery','clearing'].includes(phase);
  const cycle=Math.max(0,time-sirenAt)%14,quiet=phase!=='clearing'&&cycle>=(['fallout','recovery'].includes(phase)?8:11);
  if(!audible){stop();return;}
  if(!context){try{context=makeContext();}catch{return;}}
  if(context.state==='suspended'){context.resume().catch(()=>{});return;}
  if(phase==='clearing')stopCues();
  for(const cue of cues)cue.level.gain.setTargetAtTime(volume*(speaking?.25:1),context.currentTime,.04);
  // Explosions follow the skyline even if a siren happens to be between sweeps.
  if(quiet){if(blastIndex>=0)rumble(volume,speaking,blastIndex);stopSiren();return;}
  if(!oscillators.length){gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);for(let index=0;index<2;index++){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.connect(gain);oscillator.start();oscillators.push(oscillator);}}
  const sweep=Math.sin(cycle*Math.PI/3.5);
  oscillators[0].frequency.setTargetAtTime(445+sweep*165,context.currentTime,.12);
  oscillators[1].frequency.setTargetAtTime(660+sweep*190,context.currentTime,.12);
  // Keep the warning audible underneath the walkie, leaving speech much louder.
  gain.gain.setTargetAtTime(volume*fade*(speaking?.016:.16),context.currentTime,speaking?.06:.2);
  if(blastIndex>=0)rumble(volume,speaking,blastIndex);
 },setMuted(value){muted=!!value;if(muted){skipPastBlasts=true;stop();}return muted;},get muted(){return muted;},stop,
 dispose(){if(disposed)return;disposed=true;stop();for(const type of ['pointerdown','keydown'])events?.removeEventListener(type,unlock,true);events?.removeEventListener('visibilitychange',hidden);context?.close?.();}};
}
