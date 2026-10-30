// Prominent dual-tone civil-defence sweeps are quietened under radio speech.
// Every sound still follows user gesture, effects volume and master mute.
export function createDoomsdayAudio({getPreferences=()=>({}),isSpeaking=()=>false,events=globalThis.document,makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let context=null,oscillators=[],gain=null,unlocked=false,muted=false,disposed=false,phaseKey='',phaseAt=0,lastAt=0,detonationHeard=null;
 const cues=new Set();
 const stopSiren=()=>{for(const oscillator of oscillators){try{oscillator.stop();oscillator.disconnect();}catch{}}oscillators=[];gain?.disconnect();gain=null;};
 const stop=()=>{stopSiren();for(const cue of cues){for(const node of cue.nodes){try{node.stop?.();node.disconnect?.();}catch{}}}cues.clear();};
 const unlock=()=>{if(disposed)return;unlocked=true;if(!context){try{context=makeContext();}catch{}}if(context?.state==='suspended')context.resume().catch(()=>{});};
 for(const type of ['pointerdown','keydown'])events?.addEventListener(type,unlock,true);
 const hidden=()=>{if(events?.hidden)stop();};events?.addEventListener('visibilitychange',hidden);
 const settings=()=>{const preferences=getPreferences();return {preferences,volume:Math.max(0,Math.min(1,Number(preferences.effectsVolume??100)/100)),allowed:!disposed&&unlocked&&!muted&&!events?.hidden&&!preferences.masterMuted&&!preferences.effectsMuted};};
 function rumble(volume){
  if(!context?.createGain||!context?.createOscillator)return;
  const output=context.createGain(),low=context.createOscillator(),high=context.createOscillator(),cue={nodes:[low,high,output]};cues.add(cue);
  low.type='triangle';high.type='sine';low.frequency.setTargetAtTime(54,context.currentTime,.02);high.frequency.setTargetAtTime(83,context.currentTime,.02);
  output.gain.setTargetAtTime(volume*.13,context.currentTime,.04);output.gain.setTargetAtTime(0,context.currentTime+.4,.3);
  low.connect(output);high.connect(output);output.connect(context.destination);low.start();high.start();low.stop(context.currentTime+1.6);high.stop(context.currentTime+1.6);
  high.onended=()=>{for(const node of cue.nodes)node.disconnect?.();cues.delete(cue);};
 }
 return {update(state,time=0){
  const phase=state?.phase,key=state?.id+':'+phase;
  if(phaseKey!==key){phaseKey=key;phaseAt=lastAt=time;stopSiren();}
  const speaking=isSpeaking();if(speaking)phaseAt+=Math.max(0,time-lastAt);lastAt=time;
  const {volume,allowed}=settings();
  const audible=allowed&&volume>0&&['warning','detonation','fallout'].includes(phase);
  const cycle=Math.max(0,time-phaseAt)%14,quiet=phase==='fallout'?cycle>=8:cycle>=11;
  if(!audible){stop();return;}
  if(quiet){stopSiren();return;}
  if(!context){try{context=makeContext();}catch{return;}}
  if(context.state==='suspended'){context.resume().catch(()=>{});return;}
  if(!oscillators.length){gain=context.createGain();gain.connect(context.destination);for(let index=0;index<2;index++){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.connect(gain);oscillator.start();oscillators.push(oscillator);}}
  const sweep=Math.sin(cycle*Math.PI/3.5);
  oscillators[0].frequency.setTargetAtTime(445+sweep*165,context.currentTime,.12);
  oscillators[1].frequency.setTargetAtTime(660+sweep*190,context.currentTime,.12);
  // Keep the warning audible underneath the walkie, leaving speech much louder.
  gain.gain.setTargetAtTime(volume*(speaking?.016:.16),context.currentTime,speaking?.06:.2);
  if(phase==='detonation'&&state.id!==detonationHeard){detonationHeard=state.id;rumble(volume*(speaking?.25:1));}
 },setMuted(value){muted=!!value;if(muted)stop();return muted;},get muted(){return muted;},stop,
 dispose(){if(disposed)return;disposed=true;stop();for(const type of ['pointerdown','keydown'])events?.removeEventListener(type,unlock,true);events?.removeEventListener('visibilitychange',hidden);context?.close?.();}};
}
