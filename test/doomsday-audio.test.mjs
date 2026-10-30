import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoomsdayAudio} from '../public/js/doomsday-audio.js';

class Events {
 hidden=false;listeners=new Map();
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
 removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
 dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);}
}
function fixture(){
 const events=new Events(),preferences={effectsVolume:100},oscillators=[],gains=[];let creates=0,speaking=false;
 const context={state:'running',currentTime:10,destination:{},closed:0,resumed:0,
  createOscillator(){const value={frequency:{setTargetAtTime:(...args)=>value.frequencyCalls.push(args)},frequencyCalls:[],scheduledStops:[],started:0,stopped:0,disconnected:0,connect(){},start(){this.started++;},stop(at){this.stopped++;this.stopAt=at;if(Number.isFinite(at))this.scheduledStops.push(at);},disconnect(){this.disconnected++;}};oscillators.push(value);return value;},
  createGain(){const value={gain:{setTargetAtTime:(...args)=>value.volumeCalls.push(args)},volumeCalls:[],disconnected:0,connect(){},disconnect(){this.disconnected++;}};gains.push(value);return value;},
  resume(){this.resumed++;this.state='running';return Promise.resolve();},close(){this.closed++;return Promise.resolve();}};
 const audio=createDoomsdayAudio({events,getPreferences:()=>preferences,isSpeaking:()=>speaking,makeContext:()=>{creates++;return context;}});
 return {audio,events,preferences,context,oscillators,gains,get creates(){return creates;},setSpeaking:value=>speaking=value,gesture:type=>events.dispatchEvent(new Event(type||'pointerdown'))};
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

test('clear walkie callouts duck the warning by 90 percent and the siren returns after speech',()=>{
 const f=fixture();f.gesture();f.audio.update({id:'run-1',phase:'warning'},203);assert.equal(f.oscillators.length,2);
 f.setSpeaking(true);f.audio.update({id:'run-1',phase:'warning'},204);assert.equal(f.oscillators[0].stopped,0);assert.equal(f.gains[0].volumeCalls.at(-1)[0],.016);
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
 assert.deepEqual(booms(f).map(oscillator=>oscillator.frequencyCalls[0][0]),[54,83,50,94,46,105]);
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
 f.setSpeaking(true);f.audio.update({...clearing,presentationTime:2504000},2504);assert.equal(f.gains.at(-1).volumeCalls.at(-1)[0],.008,'speech ducks without pausing the eight-second fade');
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
 f.setSpeaking(true);f.audio.update(detonation(.2),.2);assert.equal(firstLevel.volumeCalls.at(-1)[0],.25);
 f.preferences.effectsVolume=40;f.audio.update(detonation(.4),.4);assert.equal(firstLevel.volumeCalls.at(-1)[0],.1);
 f.setSpeaking(false);f.audio.update(detonation(1.61),13);assert.equal(booms(f).length,4,'a staged blast is independent of the siren being between sweeps');
 assert.ok(f.oscillators.slice(0,2).every(oscillator=>oscillator.stopped>0));
 f.audio.setMuted(true);assert.ok(f.gains.every(gain=>gain.disconnected>0));f.audio.dispose();
});
