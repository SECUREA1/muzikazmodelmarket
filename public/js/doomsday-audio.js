// Emergency audio has an explicit mobile unlock and a bounded sound check.
// Event cues still follow the room clock, user volume, mute and visibility.
export function createDoomsdayAudio({getPreferences=()=>({}),isSpeaking=()=>false,events=globalThis.document,makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let context=null,oscillators=[],gain=null,unlocked=false,muted=false,disposed=false,unavailable=false,resuming=null,resumeSequence=0,phaseKey='',phaseAt=0,sirenAt=0,lastAt=0,eventId=null,blastPhase='',blastMask=0,skipPastBlasts=false;
 const blastOffsets=[0,1.6,3.2],blastGrace=.35,gestureTypes=['pointerdown','keydown','touchend','click'];
 const cues=new Set();
 const disconnect=node=>{try{node.stop?.();}catch{}try{node.disconnect?.();}catch{}};
 const stopSiren=()=>{for(const oscillator of oscillators)disconnect(oscillator);oscillators=[];if(gain)disconnect(gain);gain=null;};
 const release=cue=>{if(cue.released)return;cue.released=true;for(const node of cue.nodes)disconnect(node);cues.delete(cue);};
 const stopCues=(includePreview=true)=>{for(const cue of cues)if(includePreview||!cue.preview)release(cue);};
 const stop=()=>{stopSiren();stopCues();};
 function ensureContext(retry=false){
  if(disposed||unavailable&&!retry)return false;
  if(context?.state==='closed'){stop();context=null;resuming=null;}
  if(!context){try{context=makeContext();if(!context)throw Error('Audio is unavailable');unavailable=false;}catch{unavailable=true;return false;}}
  return true;
 }
 function resumeContext(force=false){
  if(!context||disposed)return Promise.resolve(false);
  if(context.state==='running')return Promise.resolve(true);
  if(context.state!=='suspended'&&context.state!=='interrupted')return Promise.resolve(false);
  if(resuming&&!force)return resuming;
  // Call resume before yielding: Safari requires this call in the tap handler.
  // A pointerdown attempt can remain pending until a permitted touchend. Each
  // real gesture gets a fresh attempt; automatic frames share the latest one.
  const attempt=++resumeSequence,current=context;
  try{const result=current.resume();resuming=Promise.resolve(result).then(()=>!disposed&&context===current&&current.state==='running',()=>false).finally(()=>{if(resumeSequence===attempt)resuming=null;});return resuming;}catch{if(resumeSequence===attempt)resuming=null;return Promise.resolve(false);}
 }
 function unlock(){
  if(disposed)return Promise.resolve(false);unlocked=true;
  if(!ensureContext(true))return Promise.resolve(false);
  return resumeContext(true);
 }
 const gestureUnlock=()=>{void unlock();};
 for(const type of gestureTypes)events?.addEventListener(type,gestureUnlock,true);
 const hidden=()=>{if(events?.hidden){skipPastBlasts=true;stop();}else if(unlocked&&context)void resumeContext();};events?.addEventListener('visibilitychange',hidden);
 const settings=()=>{const preferences=getPreferences()||{},raw=Number(preferences.effectsVolume??100),volume=Number.isFinite(raw)?Math.max(0,Math.min(1,raw/100)):1;return {preferences,volume,allowed:!disposed&&unlocked&&!muted&&!events?.hidden&&!preferences.masterMuted&&!preferences.effectsMuted};};
 const previewing=()=>{for(const cue of cues)if(cue.preview)return true;return false;};
 const updateLevels=(volume,speaking)=>{for(const cue of cues)cue.level.gain.setTargetAtTime(volume*(speaking?cue.duck:1)*cue.scale,context.currentTime,.04);};
 function transient(cue,volume,when,index){
  if(!context.createBuffer||!context.createBufferSource||!context.createBiquadFilter)return;
  // Midrange crack and debris remain audible on phone speakers, unlike a
  // bass-only rumble. The small buffer belongs to this bounded cue only.
  const rate=context.sampleRate||22050,buffer=context.createBuffer(1,Math.ceil(rate*.45),rate),samples=buffer.getChannelData(0);let seed=9173+index*101;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/2147483648-1)*Math.exp(-i/samples.length*5);}
  const noise=context.createBufferSource(),filter=context.createBiquadFilter(),attack=context.createGain();noise.buffer=buffer;filter.type='bandpass';filter.frequency.setTargetAtTime(1050+index*180,when,.01);filter.Q.value=.65;
  attack.gain.value=0;attack.gain.setTargetAtTime(volume,when,.003);attack.gain.setTargetAtTime(0,when+.035,.08);
  noise.connect(filter);filter.connect(attack);attack.connect(cue.level);noise.start(when);noise.stop(when+.45);cue.nodes.push(noise,filter,attack);
 }
 function rumble(volume,speaking,index,{preview=false,delay=0}={}){
  if(!context?.createGain||!context?.createOscillator)return;
  const when=context.currentTime+delay,output=context.createGain(),level=context.createGain(),low=context.createOscillator(),body=context.createOscillator(),cue={nodes:[low,body,output,level],level,scale:1,duck:.35,preview};cues.add(cue);
  low.type='triangle';body.type='sine';low.frequency.setTargetAtTime(65-index*3,when,.02);body.frequency.setTargetAtTime(190+index*27,when,.02);body.frequency.setTargetAtTime(125+index*16,when+.12,.15);
  output.gain.value=0;level.gain.value=volume*(speaking?cue.duck:1);level.gain.setTargetAtTime(level.gain.value,when,.02);output.gain.setTargetAtTime(.11,when,.018);output.gain.setTargetAtTime(0,when+.2,.2);
  low.connect(output);body.connect(output);output.connect(level);level.connect(context.destination);low.start(when);body.start(when);low.stop(when+1.6);body.stop(when+1.6);
  transient(cue,.07,when,index);body.onended=()=>release(cue);
 }
 async function preview(){
  if(!await unlock())return false;
  const {volume,allowed}=settings();if(!allowed||volume<=0||context.state!=='running')return false;
  for(const cue of cues)if(cue.preview)release(cue);stopSiren();
  const when=context.currentTime,output=context.createGain(),level=context.createGain(),tones=[context.createOscillator(),context.createOscillator()],cue={nodes:[...tones,output,level],level,scale:.16,duck:.35,preview:true};cues.add(cue);
  output.gain.value=0;output.gain.setTargetAtTime(1,when,.04);output.gain.setTargetAtTime(0,when+1.1,.12);level.gain.value=volume*.16*(isSpeaking()?.35:1);output.connect(level);level.connect(context.destination);
  tones.forEach((tone,index)=>{tone.type='sine';tone.frequency.setTargetAtTime(index?660:445,when,.01);tone.frequency.setTargetAtTime(index?850:610,when+.3,.12);tone.frequency.setTargetAtTime(index?570:330,when+.8,.15);tone.connect(output);tone.start(when);tone.stop(when+1.8);});
  tones[1].onended=()=>release(cue);rumble(volume,isSpeaking(),0,{preview:true,delay:.2});return true;
 }
 return {unlock,resume:unlock,preview,testSound:preview,update(state,time=0){
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
   for(let index=0;index<blastOffsets.length;index++)if(age>=blastOffsets[index]&&!(blastMask&(1<<index))){blastMask|=1<<index;if(!skipPastBlasts&&age-blastOffsets[index]<=blastGrace&&(!firstSnapshot||index===0))blastIndex=index;}
   blastPhase=key;skipPastBlasts=false;
  }else if(allowed)skipPastBlasts=false;
  if(!allowed||volume<=0){stop();return;}
  if(!ensureContext())return;
  if(context.state!=='running'){stop();void resumeContext();return;}
  updateLevels(volume,speaking);
  const clearingDuration=Number.isFinite(state?.phaseEndsAt)&&Number.isFinite(state?.phaseStartedAt)?Math.max(.001,(state.phaseEndsAt-state.phaseStartedAt)/1000):8;
  const fade=phase==='clearing'?Math.max(0,1-age/clearingDuration):1;
  const audible=fade>0&&['warning','detonation','fallout','recovery','clearing'].includes(phase);
  if(!audible){stopSiren();stopCues(false);return;}
  if(phase==='clearing')stopCues(false);
  const cycle=Math.max(0,time-sirenAt)%14,quiet=phase!=='clearing'&&cycle>=(['fallout','recovery'].includes(phase)?8:11);
  if(quiet||previewing()){if(blastIndex>=0)rumble(volume,speaking,blastIndex);stopSiren();return;}
  if(!oscillators.length){gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);for(let index=0;index<2;index++){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.connect(gain);oscillator.start();oscillators.push(oscillator);}}
  const sweep=Math.sin(cycle*Math.PI/3.5);
  oscillators[0].frequency.setTargetAtTime(445+sweep*165,context.currentTime,.12);oscillators[1].frequency.setTargetAtTime(660+sweep*190,context.currentTime,.12);
  // Duck only for audible speech; retain an identifiable warning underneath.
  gain.gain.setTargetAtTime(volume*fade*(speaking?.05:.16),context.currentTime,speaking?.06:.2);
  if(blastIndex>=0)rumble(volume,speaking,blastIndex);
 },get status(){
  const {preferences,volume}=settings(),active=!!context&&context.state==='running'&&(oscillators.length>0||cues.size>0);
  const code=disposed||unavailable?'unavailable':muted?'muted':preferences.masterMuted?'master-muted':preferences.effectsMuted?'effects-muted':volume<=0?'zero-volume':events?.hidden?'hidden':!unlocked?'locked':context?.state!=='running'?'suspended':active?'playing':'ready';
  const labels={locked:'Tap Enable sounds',muted:'Emergency sounds off','master-muted':'Game audio muted','effects-muted':'Sound effects muted','zero-volume':'Sound effects volume is zero',suspended:'Tap to resume sounds',unavailable:'Audio unavailable',hidden:'Sounds paused in background',ready:'Sounds ready',playing:previewing()?'Sound test playing':'Emergency sounds playing'};
  return {state:code,code,label:labels[code],unlocked,muted,volume,contextState:context?.state||'none',playing:code==='playing',previewing:previewing()};
 },setMuted(value){muted=!!value;if(muted){skipPastBlasts=true;stop();}return muted;},get muted(){return muted;},stop,
 dispose(){if(disposed)return;disposed=true;stop();for(const type of gestureTypes)events?.removeEventListener(type,gestureUnlock,true);events?.removeEventListener('visibilitychange',hidden);context?.close?.();}};
}
