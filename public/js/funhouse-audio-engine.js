import {FUNHOUSE_AUDIO_DEFAULTS} from './funhouse-audio-settings.js';
import {createSpatialEffectOutput} from './shared-effect-audio.js';
import {FUNHOUSE_MUSIC,funhouseMusicBar,funhouseEffectScore,midiFrequency} from './funhouse-audio-score.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]))?{x:value.x,y:value.y,z:value.z}:null;
const maxSources=80,lookAhead=.24;
// Harmonic spectra and envelopes give each original synthesized instrument a
// distinct body. Cache waves per context; no samples or downloads are required.
export const FUNHOUSE_INSTRUMENTS=Object.freeze({
 bass:{harmonics:[1,.38,.16,.07],attack:.012,sustain:.3},
 cello:{harmonics:[1,.62,.4,.25,.16,.10,.07],attack:.14,sustain:.78},
 guitar:{harmonics:[1,.5,.26,.15,.09,.04],attack:.006,sustain:.22},
 piano:{harmonics:[1,.48,.2,.12,.06,.03],attack:.008,sustain:.32},
 flute:{harmonics:[1,.1,.035],attack:.035,sustain:.65},
 bell:{harmonics:[1,.04,.35,.03,.18,.06,.08],attack:.004,sustain:.16}
});

/** Original carnival audio uses the game's existing AudioContext. No samples,
 * network requests, timers or new contexts are needed for music and effects. */
export function createFunhouseAudioEngine({getContext=()=>null,getPreferences=()=>({}),getSettings=()=>({}),getPosition=()=>null,getCameraDirection=()=>({x:0,y:0,z:-1}),getSpatialAudio=null,destination=null}={}){
 let context=null,buses=null,master=null,limiter=null,musicOutput=null,unlocked=false,disposed=false,musicIntent=null,nextBarAt=null,barIndex=0,lastEffect=null;
 const waves=new Map();
 const records=new Set(),outputs=new Set(),seen=new Map(),lastKinds=new Map();
 const counts={effects:0,voices:0,musicBars:0,sources:0,peakSources:0};
 const preferences=()=>getPreferences()||{};
 const settings=()=>getSettings()||{};
 const spatial=()=>getSpatialAudio?getSpatialAudio()!==false:preferences().spatialAudio!==false;
 function level(category){
  const global=preferences(),local=settings();
  if(global.masterMuted||local[category+'Muted']||(category==='voice'?global.dialogueMuted:global.effectsMuted))return 0;
  const localVolume=clamp(finite(local[category+'Volume'],FUNHOUSE_AUDIO_DEFAULTS[category+'Volume']),0,100)/100;
  return localVolume*(category==='voice'?1:clamp(finite(global.effectsVolume,100),0,100)/100);
 }
 function parameter(param,value,time){if(param?.setValueAtTime)param.setValueAtTime(value,time);else if(param)param.value=value;}
 function currentSource(output){return typeof output.source==='function'?point(output.source()):point(output.source);}
 function updateOutput(output){
  output.route.update({source:currentSource(output),listener:point(getPosition()),direction:point(getCameraDirection())||undefined,spatial:spatial(),volume:clamp(finite(output.volume,1),0,1)});
 }
 function makeOutput(category,{position,range=28,volume=1}={}){
  const output={category,source:position,volume,route:createSpatialEffectOutput(context,{range,destination:buses[category]})};
  outputs.add(output);updateOutput(output);return output;
 }
 function removeOutput(output){if(!output||!outputs.delete(output))return;output.route.dispose();if(output===musicOutput)musicOutput=null;}
 function refreshLevels(){
  if(!buses||!context)return;
  const talking=[...records].some(record=>record.category==='voice'&&!record.closed&&!record.fading);
  for(const category of ['effects','voice','music'])parameter(buses[category].gain,level(category)*(category==='music'&&talking ? .28 : 1),context.currentTime);
 }
 function release(record,reason='ended',stop=false){
  if(record.closed)return;record.closed=true;records.delete(record);record.source.onended=null;
  if(stop)try{record.source.stop();}catch{}
  try{record.source.disconnect();record.envelope.disconnect();}catch{}
  if(record.category!=='music'&&![...records].some(value=>value.output===record.output))removeOutput(record.output);
  if(record.category==='music'&&!musicIntent&&![...records].some(value=>value.category==='music'))removeOutput(musicOutput);
  if(record.category==='voice'){
   try{record.onEnded?.(reason);}catch{}
   refreshLevels();
  }
 }
 function stopCategory(category,reason='stopped',{fade=false}={}){
  for(const record of [...records])if(record.category===category){
   if(fade&&context?.state==='running'&&!record.fading){
    record.fading=true;const at=context.currentTime;
    record.envelope.gain.cancelScheduledValues?.(at);
    parameter(record.envelope.gain,Math.max(.0001,finite(record.envelope.gain.value,.01)),at);
    record.envelope.gain.linearRampToValueAtTime?.(.0001,at+.03);
    record.expires=at+.05;try{record.source.stop(at+.04);}catch{release(record,reason,true);}
   }else release(record,reason,true);
  }
  if(category==='music'&&!records.size)removeOutput(musicOutput);
 }
 function clearGraph(reason='reset'){
  for(const record of [...records])release(record,reason,true);
  for(const output of [...outputs])removeOutput(output);
  if(buses)for(const bus of Object.values(buses))try{bus.disconnect();}catch{}
  try{master?.disconnect();limiter?.disconnect();}catch{}
  waves.clear();buses=master=limiter=null;context=null;nextBarAt=null;barIndex=0;
 }
 function acquire(){
  if(disposed)return null;let next;try{next=getContext();}catch{return null;}
  if(!next||next.state==='closed'||!next.createGain||!next.createOscillator){if(context)clearGraph('context-unavailable');return null;}
  if(next!==context){
   clearGraph('context-changed');context=next;
   master=context.createGain();parameter(master.gain,.8,context.currentTime);
   if(context.createDynamicsCompressor){
    limiter=context.createDynamicsCompressor();
    for(const [key,value]of Object.entries({threshold:-16,knee:12,ratio:4,attack:.005,release:.15}))parameter(limiter[key],value,context.currentTime);
    master.connect(limiter);limiter.connect(destination||context.destination);
   }else master.connect(destination||context.destination);
   buses={};for(const category of ['music','effects','voice']){const bus=context.createGain();bus.connect(master);buses[category]=bus;}
   refreshLevels();
  }
  return context;
 }
 function ready(){return unlocked&&!!acquire()&&context.state==='running';}
 function remembered(key){
  if(!key)return false;const at=context.currentTime,previous=seen.get(key);
  if(previous!==undefined&&at-previous<30)return true;seen.set(key,at);if(seen.size>128)seen.delete(seen.keys().next().value);return false;
 }
 function note(spec,at,category,output){
  if(records.size>=maxSources)return false;
  const oscillator=context.createOscillator(),envelope=context.createGain(),duration=clamp(finite(spec.duration,.2),.025,4),gain=clamp(finite(spec.gain,.04),.0001,.2);
  const instrument=FUNHOUSE_INSTRUMENTS[spec.instrument];
  oscillator.type=['sine','triangle','square','sawtooth'].includes(spec.type)?spec.type:'sine';
  if(instrument&&context.createPeriodicWave&&oscillator.setPeriodicWave){
   if(!waves.has(spec.instrument)){
    const real=new Float32Array(instrument.harmonics.length+1),imag=new Float32Array(real.length);
    imag.set(instrument.harmonics,1);waves.set(spec.instrument,context.createPeriodicWave(real,imag));
   }
   oscillator.setPeriodicWave(waves.get(spec.instrument));
  }
  parameter(oscillator.frequency,clamp(finite(spec.frequency,440),35,5000),at);
  if(Number.isFinite(spec.endFrequency))oscillator.frequency.exponentialRampToValueAtTime?.(clamp(spec.endFrequency,35,5000),at+duration);
  parameter(oscillator.detune,clamp(finite(spec.detune,0),-50,50),at);
  const attack=Math.min(instrument?.attack??.018,duration*.2),releaseAt=at+duration;
  parameter(envelope.gain,.0001,at);envelope.gain.linearRampToValueAtTime?.(gain,at+attack);
  if(instrument)envelope.gain.exponentialRampToValueAtTime?.(gain*instrument.sustain,at+Math.max(attack,duration*.6));
  envelope.gain.exponentialRampToValueAtTime?.(.0001,releaseAt);
  oscillator.connect(envelope);envelope.connect(output.route.input);
  const record={category,output,source:oscillator,envelope,expires:releaseAt+.04,closed:false};records.add(record);
  oscillator.onended=()=>release(record);oscillator.start(at);oscillator.stop(releaseAt+.025);
  counts.sources++;counts.peakSources=Math.max(counts.peakSources,records.size);return true;
 }
 function beginMusic(){
  if(!musicOutput)musicOutput=makeOutput('music',{position:musicIntent.position,range:musicIntent.range||24});
  musicOutput.source=musicIntent.position;updateOutput(musicOutput);
  const now=context.currentTime,beat=60/FUNHOUSE_MUSIC.tempo,bar=beat*FUNHOUSE_MUSIC.beatsPerBar;
  if(nextBarAt===null){nextBarAt=now+.04;barIndex=0;}
  // Slow frames skip missed bars instead of firing a backlog of old notes.
  if(nextBarAt<now-.1){barIndex+=Math.ceil((now-nextBarAt)/bar);nextBarAt=now+.04;}
  for(let scheduled=0;scheduled<2&&nextBarAt<now+lookAhead;scheduled++){
   for(const entry of funhouseMusicBar(barIndex))note({...entry,gain:entry.gain*2,frequency:midiFrequency(entry.midi),duration:entry.duration*beat},nextBarAt+entry.beat*beat,'music',musicOutput);
   counts.musicBars++;barIndex++;nextBarAt+=bar;
  }
 }
 const api={
  async unlock(){
   if(disposed)return false;unlocked=true;const audio=acquire();if(!audio)return false;
   try{if(audio.state!=='running')await audio.resume?.();}catch{return false;}
   if(disposed||audio!==context)return false;api.update(0);return audio.state==='running';
  },
  effect(kind,{position,hit=true,key,volume=1,range=28}={}){
   if(!ready()||level('effects')<=0)return false;
   const score=funhouseEffectScore(kind,{hit});if(!score.length||remembered(key&&'effect:'+key))return false;
   const now=context.currentTime;if(!key&&now-(lastKinds.get(kind)??-Infinity)<.09)return false;
   lastKinds.set(kind,now);if(lastKinds.size>64)lastKinds.delete(lastKinds.keys().next().value);
   const output=makeOutput('effects',{position,range,volume});let played=false;
   for(const entry of score)played=note(entry,now+.01+entry.at,'effects',output)||played;
   if(!played){removeOutput(output);return false;}counts.effects++;lastEffect=kind;refreshLevels();return true;
  },
  setMusic(active,fields={}){
   if(disposed)return false;
   if(!active){musicIntent=null;nextBarAt=null;barIndex=0;stopCategory('music','stopped',{fade:true});return false;}
   const identity=fields.rideId||fields.key||'nearby-car';
   if(musicIntent&&musicIntent.identity!==identity){stopCategory('music','replaced');nextBarAt=null;barIndex=0;}
   musicIntent={...fields,identity};
   if(ready()&&level('music')>0)beginMusic();return true;
  },
  voice(buffer,{position,range=24,volume=1,key,text,speaker,onStarted,onEnded}={}){
   if(!ready()||level('voice')<=0||!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>30)return false;
   if(remembered(key&&'voice:'+key))return false;api.stopVoice('replaced');
   const source=context.createBufferSource?.();if(!source)return false;
   const envelope=context.createGain(),output=makeOutput('voice',{position,range,volume}),at=context.currentTime+.01;
   source.buffer=buffer;parameter(envelope.gain,.85,at);source.connect(envelope);envelope.connect(output.route.input);
   const record={category:'voice',output,source,envelope,expires:at+buffer.duration+.05,closed:false,onEnded,text,speaker};records.add(record);
   source.onended=()=>release(record);source.start(at);source.stop(at+buffer.duration+.025);
   counts.voices++;counts.sources++;counts.peakSources=Math.max(counts.peakSources,records.size);refreshLevels();
   try{onStarted?.();}catch{}return true;
  },
  stopVoice(reason='stopped'){stopCategory('voice',reason);refreshLevels();},
  update(){
   if(disposed||!unlocked||!acquire())return;
   for(const record of [...records])if(context.currentTime>record.expires)release(record);
   for(const category of ['effects','voice','music'])if(level(category)<=0)stopCategory(category,'muted');
   refreshLevels();for(const output of outputs)updateOutput(output);
   if(context.state!=='running'){
    stopCategory('effects','suspended');stopCategory('voice','suspended');stopCategory('music','suspended');nextBarAt=null;return;
   }
   if(musicIntent&&level('music')>0)beginMusic();
  },
  stop(){musicIntent=null;nextBarAt=null;barIndex=0;for(const record of [...records])release(record,'stopped',true);for(const output of [...outputs])removeOutput(output);refreshLevels();},
  reset(){api.stop();seen.clear();lastKinds.clear();lastEffect=null;},
  dispose(){if(disposed)return;api.stop();disposed=true;clearGraph('disposed');},
  snapshot:()=>({unlocked,disposed,supported:!!context,musicActive:!!musicIntent&&level('music')>0&&context?.state==='running',musicRequested:!!musicIntent,musicTitle:FUNHOUSE_MUSIC.title,bar:barIndex%FUNHOUSE_MUSIC.bars,activeSources:records.size,activeVoices:[...records].filter(record=>record.category==='voice').length,outputs:outputs.size,volumes:{music:level('music'),effects:level('effects'),voice:level('voice')},ducked:[...records].some(record=>record.category==='voice'),gains:{music:buses?.music.gain.value||0,effects:buses?.effects.gain.value||0,voice:buses?.voice.gain.value||0},lastEffect,counts:{...counts}})
 };
 return api;
}
