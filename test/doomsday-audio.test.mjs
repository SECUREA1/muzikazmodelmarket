import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoomsdayAudio} from '../public/js/doomsday-audio.js';

class Events {
 hidden=false;listeners=new Map();
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
 removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
 dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);}
}
function fixture({noise=false,initialState='running'}={}){
 const events=new Events(),preferences={effectsVolume:100},oscillators=[],gains=[],noises=[],filters=[],buffers=[];let creates=0,speaking=false;
 const context={state:initialState,currentTime:10,destination:{},closed:0,resumed:0,
  createOscillator(){const value={frequency:{setTargetAtTime:(...args)=>value.frequencyCalls.push(args)},frequencyCalls:[],scheduledStops:[],started:0,stopped:0,disconnected:0,connect(){},start(){this.started++;},stop(at){this.stopped++;this.stopAt=at;if(Number.isFinite(at))this.scheduledStops.push(at);},disconnect(){this.disconnected++;}};oscillators.push(value);return value;},
  createGain(){const value={gain:{setTargetAtTime:(...args)=>value.volumeCalls.push(args)},volumeCalls:[],disconnected:0,connect(){},disconnect(){this.disconnected++;}};gains.push(value);return value;},
  resume(){this.resumed++;this.state='running';return Promise.resolve();},close(){this.closed++;return Promise.resolve();}};
 if(noise)Object.assign(context,{sampleRate:22050,
  createBuffer(channels,length,sampleRate){const samples=new Float32Array(length),value={channels,length,sampleRate,getChannelData:()=>samples};buffers.push(value);return value;},
  createBufferSource(){const value={disconnected:0,connect(){},start(at){this.startAt=at;},stop(at){if(Number.isFinite(at))this.stopAt=at;},disconnect(){this.disconnected++;}};noises.push(value);return value;},
  createBiquadFilter(){const value={Q:{value:0},frequency:{setTargetAtTime:(frequency)=>value.frequencyValue=frequency},disconnected:0,connect(){},disconnect(){this.disconnected++;}};filters.push(value);return value;}
 });
 const audio=createDoomsdayAudio({events,getPreferences:()=>preferences,isSpeaking:()=>speaking,makeContext:()=>{creates++;return context;}});
 return {audio,events,preferences,context,oscillators,gains,noises,filters,buffers,get creates(){return creates;},setSpeaking:value=>speaking=value,gesture:type=>events.dispatchEvent(new Event(type||'pointerdown'))};
}

test('prominent dual-tone siren requires a gesture, reuses oscillators, and stops for all-clear',()=>{
 const f=fixture();f.audio.update({phase:'warning'},203);assert.equal(f.creates,0);
 f.gesture();f.audio.update({phase:'warning'},203);assert.equal(f.creates,1);assert.equal(f.oscillators.length,2);assert.equal(f.gains[0].gain.value,0,'siren attack starts quietly rather than at the Web Audio default full gain');
 f.audio.update({phase:'warning'},204);assert.equal(f.oscillators.length,2);assert.equal(f.gains[0].volumeCalls.at(-1)[0],.16);
 assert.notEqual(f.oscillators[0].frequencyCalls.at(-1)[0],f.oscillators[1].frequencyCalls.at(-1)[0],'two distinct warning tones');
 f.audio.update({phase:'warning'},215);assert.equal(f.oscillators[0].stopped,1);assert.equal(f.oscillators[1].stopped,1);
 f.audio.update({phase:'fallout'},220);assert.equal(f.oscillators.length,4);
 f.audio.update({phase:'recovery'},221);assert.equal(f.oscillators[2].stopped,1);assert.equal(f.oscillators.length,6,'recovery continues its own warning sweep');
 f.audio.update({phase:'all-clear'},236);assert.equal(f.oscillators.length,6);assert.ok(f.gains.every(gain=>gain.disconnected>0));f.audio.dispose();
});

test('siren respects effects/master mute, volume, visibility, and its own mute control',()=>{
 const f=fixture();f.gesture();f.audio.update({phase:'fallout'},0);f.preferences.masterMuted=true;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators[0].stopped,1);
 f.preferences.masterMuted=false;f.preferences.effectsMuted=true;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,2);
 f.preferences.effectsMuted=false;f.preferences.effectsVolume=0;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,2);
 f.preferences.effectsVolume=20;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,4);assert.equal(f.gains[1].volumeCalls.at(-1)[0],.032);
 f.audio.setMuted(true);assert.equal(f.audio.muted,true);assert.equal(f.oscillators[2].stopped,1);f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,4);
 f.audio.setMuted(false);f.audio.update({phase:'warning'},1);assert.equal(f.oscillators.length,6);
 f.events.hidden=true;f.events.dispatchEvent(new Event('visibilitychange'));assert.equal(f.oscillators[4].stopped,1);f.audio.update({phase:'warning'},1);assert.equal(f.oscillators.length,6);f.audio.dispose();
});

test('gesture resumes suspended audio and disposal removes listeners and prevents revival',()=>{
 const f=fixture();f.gesture('keydown');f.audio.update({phase:'warning'},0);f.context.state='suspended';f.gesture();assert.equal(f.context.resumed,1);
 f.audio.dispose();assert.equal(f.context.closed,1);assert.equal(f.oscillators[0].stopped,1);
 f.context.state='suspended';f.gesture();assert.equal(f.context.resumed,1,'disposed player no longer reacts to document gestures');
 f.audio.update({phase:'warning'},0);assert.equal(f.oscillators.length,2);
});

test('clear walkie callouts leave an audible warning underneath and the siren returns after speech',()=>{
 const f=fixture();f.gesture();f.audio.update({id:'run-1',phase:'warning'},203);assert.equal(f.oscillators.length,2);
 f.setSpeaking(true);f.audio.update({id:'run-1',phase:'warning'},204);assert.equal(f.oscillators[0].stopped,0);assert.equal(f.gains[0].volumeCalls.at(-1)[0],.05);
 f.audio.update({id:'run-1',phase:'warning'},219);assert.equal(f.oscillators.length,2);
 f.setSpeaking(false);f.audio.update({id:'run-1',phase:'warning'},220);assert.equal(f.gains[0].volumeCalls.at(-1)[0],.16);
 f.audio.dispose();
});

test('confirmed detonation adds one bounded low rumble and cleans it up when hidden',()=>{
 const f=fixture();f.gesture();f.audio.update({id:'run-1',phase:'detonation'},0);
 assert.equal(f.oscillators.length,4,'two siren tones and two low rumble tones');assert.equal(f.oscillators[2].stopAt,11.6);
 f.audio.update({id:'run-1',phase:'detonation'},1);assert.equal(f.oscillators.length,4,'snapshot updates do not repeat the explosion');
 f.events.hidden=true;f.events.dispatchEvent(new Event('visibilitychange'));assert.ok(f.gains.every(gain=>gain.disconnected>0));
 f.audio.dispose();assert.equal(f.context.closed,1);
});

test('clearing fades the siren, releases explosions, and all-clear stays quiet until the next occurrence',()=>{
 const f=fixture();f.gesture();
 for(const phase of ['idle','all-clear'])f.audio.update({id:null,phase},0);
 assert.equal(f.oscillators.length,0,'no warning audio leaks before the scheduled occurrence');
 f.audio.update({id:'scheduled-1',phase:'detonation'},1);assert.equal(f.oscillators.length,4);
 f.audio.update({id:'scheduled-1',phase:'clearing'},1.1);assert.ok(f.gains.slice(0,3).every(gain=>gain.disconnected>0),'clearing releases old sirens and explosion nodes');assert.equal(f.gains.at(-1).volumeCalls.at(-1)[0],.16,'warning fades alongside the scene');
 f.audio.update({id:'scheduled-1',phase:'clearing'},5.1);assert.ok(Math.abs(f.gains.at(-1).volumeCalls.at(-1)[0]-.08)<1e-9);
 f.audio.update({id:'scheduled-1',phase:'all-clear'},9.1);assert.equal(f.oscillators.length,6);assert.ok(f.gains.every(gain=>gain.disconnected>0));
 f.audio.update({id:'scheduled-2',phase:'warning'},181);assert.equal(f.oscillators.length,8,'a later scheduled event starts its own warning');
 f.audio.update({id:'scheduled-2',phase:'detonation'},199);assert.equal(f.oscillators.length,12,'a later event gets new explosion cues');f.audio.dispose();
});

const detonation=(age,id='blast-1')=>({id,phase:'detonation',phaseStartedAt:10000,presentationTime:10000+age*1000});
const booms=f=>f.oscillators.filter(oscillator=>oscillator.scheduledStops.length);

test('three bounded, distinct booms match the staged skyline rather than snapshot frequency',()=>{
 const f=fixture();f.gesture();
 for(const age of [0,.1,1,1.61,2,3.21,4,6.9])f.audio.update(detonation(age),100+age);
 assert.equal(booms(f).length,6,'each of three blasts has two low tones');
 assert.deepEqual(booms(f).map(oscillator=>oscillator.frequencyCalls[0][0]),[65,190,62,217,59,244]);
 assert.ok(booms(f).every(oscillator=>oscillator.scheduledStops[0]===11.6),'each rumble has a bounded lifetime');
 const firstLevel=f.gains[2],calls=firstLevel.volumeCalls.length;
 f.oscillators[3].onended();assert.ok(f.gains[1].disconnected>0&&firstLevel.disconnected>0);
 f.audio.update(detonation(7),107);assert.equal(firstLevel.volumeCalls.length,calls,'finished cues leave the live gain set');
 f.audio.dispose();assert.ok(f.gains.every(gain=>gain.disconnected>0));
});

test('recovery repeats warnings for an unfinished quest and clearing uses authoritative time even during speech',()=>{
 const f=fixture();f.gesture();
 const recovery={id:'long-event',phase:'recovery',phaseStartedAt:10000,presentationTime:10000};
 f.audio.update(recovery,0);assert.equal(f.oscillators.length,2);
 f.audio.update({...recovery,presentationTime:2414000},2404);assert.equal(f.oscillators[0].stopped,1,'sweeps still include their normal quiet interval');
 f.audio.update({...recovery,presentationTime:2418000},2408);assert.equal(f.oscillators.length,4,'sirens keep repeating forty minutes into an unresolved response');
 const clearing={id:'long-event',phase:'clearing',phaseStartedAt:2500000,phaseEndsAt:2508000,presentationTime:2500000};
 f.audio.update(clearing,2500);assert.equal(f.gains.at(-1).volumeCalls.at(-1)[0],.16);
 f.setSpeaking(true);f.audio.update({...clearing,presentationTime:2504000},2504);assert.equal(f.gains.at(-1).volumeCalls.at(-1)[0],.025,'speech ducks without pausing the eight-second fade');
 f.audio.update({...clearing,presentationTime:2508000},2508);assert.ok(f.gains.every(gain=>gain.disconnected>0),'fade ends without waiting for another snapshot');
 f.audio.dispose();
});

test('late joins, a missing gesture, mute, and hidden returns never catch up old explosions',()=>{
 const late=fixture();late.gesture();late.audio.update(detonation(2),22);assert.equal(booms(late).length,0);
 late.audio.update(detonation(3.21),23.21);assert.equal(booms(late).length,2,'a future third blast still plays');late.audio.dispose();
 const locked=fixture();locked.audio.update(detonation(0),0);locked.gesture();locked.audio.update(detonation(.1),.1);assert.equal(booms(locked).length,0,'unlocking does not replay the first blast');
 locked.audio.update(detonation(1.61),1.61);assert.equal(booms(locked).length,2);locked.audio.dispose();
 const muted=fixture();muted.gesture();muted.audio.setMuted(true);muted.audio.update(detonation(0),0);muted.audio.update(detonation(1.7),1.7);
 muted.audio.setMuted(false);muted.audio.update(detonation(2),2);assert.equal(booms(muted).length,0);
 muted.audio.update(detonation(3.21),3.21);assert.equal(booms(muted).length,2);muted.audio.dispose();
 const hidden=fixture();hidden.gesture();hidden.audio.update(detonation(0),0);hidden.events.hidden=true;hidden.events.dispatchEvent(new Event('visibilitychange'));
 hidden.events.hidden=false;hidden.events.dispatchEvent(new Event('visibilitychange'));hidden.audio.update(detonation(3.25),3.25);assert.equal(booms(hidden).length,2,'returning to a tab skips every onset that happened while hidden');
 hidden.audio.update(detonation(4),4);assert.equal(booms(hidden).length,2);hidden.audio.dispose();
});

test('live explosion gains follow speech and effects volume independently of siren quiet intervals',()=>{
 const f=fixture();f.gesture();f.audio.update(detonation(0),0);const firstLevel=f.gains[2];assert.equal(firstLevel.volumeCalls.at(-1)[0],1);assert.equal(f.gains[1].gain.value,0,'boom envelope starts without a full-gain click');
 f.setSpeaking(true);f.audio.update(detonation(.2),.2);assert.equal(firstLevel.volumeCalls.at(-1)[0],.35);
 f.preferences.effectsVolume=40;f.audio.update(detonation(.4),.4);assert.ok(Math.abs(firstLevel.volumeCalls.at(-1)[0]-.14)<1e-9);
 f.setSpeaking(false);f.audio.update(detonation(1.61),13);assert.equal(booms(f).length,4,'a staged blast is independent of the siren being between sweeps');
 assert.ok(f.oscillators.slice(0,2).every(oscillator=>oscillator.stopped>0));
 f.audio.setMuted(true);assert.ok(f.gains.every(gain=>gain.disconnected>0));f.audio.dispose();
});

test('mobile status distinguishes ready, muted settings, zero volume and interrupted audio',async()=>{
 const f=fixture();assert.equal(f.audio.status.code,'locked');assert.equal(f.creates,0);
 f.gesture('touchend');assert.equal(f.audio.status.code,'ready');assert.equal(f.audio.status.playing,false);
 f.audio.update({id:'mobile',phase:'warning'},0);assert.equal(f.audio.status.code,'playing');
 f.audio.setMuted(true);assert.equal(f.audio.status.code,'muted');f.audio.setMuted(false);
 f.preferences.masterMuted=true;assert.equal(f.audio.status.code,'master-muted');f.preferences.masterMuted=false;
 f.preferences.effectsMuted=true;assert.equal(f.audio.status.code,'effects-muted');f.preferences.effectsMuted=false;
 f.preferences.effectsVolume=0;assert.equal(f.audio.status.code,'zero-volume');f.preferences.effectsVolume=100;
 f.context.state='interrupted';assert.equal(f.audio.status.code,'suspended');assert.equal(await f.audio.resume(),true);assert.equal(f.context.resumed,1);
 f.audio.stop();assert.equal(f.audio.status.code,'ready');f.audio.dispose();assert.equal(f.audio.status.code,'unavailable');
 f.context.state='interrupted';f.gesture('click');assert.equal(f.context.resumed,1,'disposed player removes all mobile gesture listeners');
});

test('explicit unlock reports failures and can retry an unavailable or blocked context',async()=>{
 let failing=true;const f=fixture(),audio=createDoomsdayAudio({events:new Events(),makeContext:()=>{if(failing)throw Error('Unavailable');return f.context;}});
 assert.equal(await audio.unlock(),false);assert.equal(audio.status.code,'unavailable');assert.equal(await audio.preview(),false);
 failing=false;f.context.state='interrupted';f.context.resume=()=>Promise.reject(Error('Tap required'));
 assert.equal(await audio.unlock(),false);assert.equal(audio.status.code,'suspended');
 f.context.resume=()=>{f.context.state='running';return Promise.resolve();};
 assert.equal(await audio.unlock(),true);assert.equal(audio.status.code,'ready');audio.dispose();f.audio.dispose();
});

test('a permitted touch gesture retries a pending resume without an older attempt taking it over',async()=>{
 const f=fixture();await f.audio.unlock();f.context.state='interrupted';let finishFirst,finishSecond,attempts=0;
 f.context.resume=()=>{attempts++;return new Promise(resolve=>{if(attempts===1)finishFirst=resolve;else finishSecond=()=>{f.context.state='running';resolve();};});};
 const first=f.audio.resume();assert.equal(attempts,1);
 f.audio.update({phase:'warning'},0);assert.equal(attempts,1,'automatic frames share the pending attempt');
 f.gesture('touchend');assert.equal(attempts,2,'touchend is allowed to retry a hung pointerdown resume');
 finishFirst();await first;f.audio.update({phase:'warning'},1);assert.equal(attempts,2,'the old finally callback did not discard the newer pending attempt');
 finishSecond();await Promise.resolve();await Promise.resolve();assert.equal(f.audio.status.code,'ready');
 f.audio.update({phase:'warning'},2);assert.equal(f.audio.status.code,'playing');f.audio.dispose();
});

test('the sound check plays a bounded siren and impact in a quiet map without starting an event',async()=>{
 const f=fixture(),idle=Object.freeze({id:null,phase:'idle'}),before=JSON.stringify(idle);
 assert.equal(await f.audio.preview(),true);assert.equal(f.audio.status.previewing,true);assert.equal(f.audio.status.code,'playing');assert.equal(f.oscillators.length,4);
 assert.ok(booms(f).every(oscillator=>oscillator.scheduledStops[0]<=f.context.currentTime+1.81));
 f.audio.update(idle,0);f.audio.update(idle,1);assert.equal(f.audio.status.previewing,true,'idle frames do not immediately cancel a requested sound check');assert.equal(JSON.stringify(idle),before);
 f.oscillators[1].onended();f.oscillators[3].onended();assert.equal(f.audio.status.previewing,false);assert.equal(f.audio.status.code,'ready');assert.ok(f.gains.every(gain=>gain.disconnected>0));
 f.audio.update(detonation(0),2);assert.equal(f.oscillators.length,8,'preview does not consume a later real explosion cue');f.audio.dispose();
});

test('preview replacement, mute, zero volume, background and disposal immediately release its nodes',async()=>{
 const replacement=fixture();await replacement.audio.preview();const old=[...replacement.oscillators];await replacement.audio.preview();assert.ok(old.every(node=>node.disconnected>0));assert.equal(replacement.oscillators.length,8);replacement.audio.dispose();
 for(const change of ['local','master','effects','volume','hidden','dispose']){
  const f=fixture({noise:true});await f.audio.preview();
  if(change==='local')f.audio.setMuted(true);else if(change==='master')f.preferences.masterMuted=true;else if(change==='effects')f.preferences.effectsMuted=true;else if(change==='volume')f.preferences.effectsVolume=0;else if(change==='hidden'){f.events.hidden=true;f.events.dispatchEvent(new Event('visibilitychange'));}else f.audio.dispose();
  f.audio.update({phase:'idle'},0);assert.equal(f.audio.status.previewing,false,change);assert.ok(f.gains.every(gain=>gain.disconnected>0),change);assert.ok(f.noises.every(node=>node.disconnected>0),change);f.audio.dispose();
 }
});

test('phone-speaker explosion cues include midrange bodies and bounded filtered crack and debris',()=>{
 const f=fixture({noise:true});f.gesture('click');
 for(const age of [0,1.61,3.21])f.audio.update(detonation(age),age);
 assert.equal(f.noises.length,3);assert.deepEqual(f.filters.map(filter=>filter.frequencyValue),[1050,1230,1410]);
 assert.ok(f.filters.every(filter=>filter.type==='bandpass'));assert.ok(booms(f).filter(oscillator=>oscillator.type==='sine').every(oscillator=>oscillator.frequencyCalls[0][0]>=190));
 for(const buffer of f.buffers){assert.ok(buffer.length<=buffer.sampleRate*.451);assert.ok(buffer.getChannelData(0).every(Number.isFinite));assert.ok(buffer.getChannelData(0).some(value=>Math.abs(value)>.1));}
 assert.ok(f.noises.every(source=>source.stopAt-source.startAt<=.451));f.audio.update({id:'blast-1',phase:'all-clear'},8);assert.ok(f.noises.every(source=>source.disconnected>0));assert.ok(f.filters.every(filter=>filter.disconnected>0));f.audio.dispose();
});

test('an interrupted active context resumes without playing a backlog of impact sounds',async()=>{
 const f=fixture();await f.audio.unlock();f.audio.update(detonation(0),0);f.context.state='interrupted';f.audio.update(detonation(1.61),1.61);
 assert.equal(f.context.resumed,1);assert.ok(f.oscillators.every(node=>node.disconnected>0));await Promise.resolve();
 f.audio.update(detonation(2),2);assert.equal(booms(f).length,2,'the impact missed during interruption is not replayed');
 f.audio.update(detonation(3.21),3.21);assert.equal(booms(f).length,4,'a later real impact remains audible');f.audio.dispose();
});
