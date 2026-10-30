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
  createOscillator(){const value={frequency:{setTargetAtTime:(...args)=>value.frequencyCalls.push(args)},frequencyCalls:[],started:0,stopped:0,disconnected:0,connect(){},start(){this.started++;},stop(at){this.stopped++;this.stopAt=at;},disconnect(){this.disconnected++;}};oscillators.push(value);return value;},
  createGain(){const value={gain:{setTargetAtTime:(...args)=>value.volumeCalls.push(args)},volumeCalls:[],disconnected:0,connect(){},disconnect(){this.disconnected++;}};gains.push(value);return value;},
  resume(){this.resumed++;this.state='running';return Promise.resolve();},close(){this.closed++;return Promise.resolve();}};
 const audio=createDoomsdayAudio({events,getPreferences:()=>preferences,isSpeaking:()=>speaking,makeContext:()=>{creates++;return context;}});
 return {audio,events,preferences,context,oscillators,gains,get creates(){return creates;},setSpeaking:value=>speaking=value,gesture:type=>events.dispatchEvent(new Event(type||'pointerdown'))};
}

test('prominent dual-tone siren requires a gesture, reuses oscillators, and stops for all-clear',()=>{
 const f=fixture();f.audio.update({phase:'warning'},203);assert.equal(f.creates,0);
 f.gesture();f.audio.update({phase:'warning'},203);assert.equal(f.creates,1);assert.equal(f.oscillators.length,2);
 f.audio.update({phase:'warning'},204);assert.equal(f.oscillators.length,2);assert.equal(f.gains[0].volumeCalls.at(-1)[0],.16);
 assert.notEqual(f.oscillators[0].frequencyCalls.at(-1)[0],f.oscillators[1].frequencyCalls.at(-1)[0],'two distinct warning tones');
 f.audio.update({phase:'warning'},215);assert.equal(f.oscillators[0].stopped,1);assert.equal(f.oscillators[1].stopped,1);
 f.audio.update({phase:'fallout'},220);assert.equal(f.oscillators.length,4);
 f.audio.update({phase:'recovery'},221);assert.equal(f.oscillators[2].stopped,1);
 f.audio.update({phase:'all-clear'},236);assert.equal(f.oscillators.length,4);f.audio.dispose();
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

test('scheduled quiet and clearing phases silence sirens and any explosion cue between repeat events',()=>{
 const f=fixture();f.gesture();
 for(const phase of ['idle','all-clear'])f.audio.update({id:null,phase},0);
 assert.equal(f.oscillators.length,0,'no warning audio leaks before the scheduled occurrence');
 f.audio.update({id:'scheduled-1',phase:'detonation'},1);assert.equal(f.oscillators.length,4);
 f.audio.update({id:'scheduled-1',phase:'clearing'},1.1);assert.ok(f.gains.every(gain=>gain.disconnected>0),'clearing releases the explosion cue as well as sirens');
 f.audio.update({id:'scheduled-1',phase:'all-clear'},2);assert.equal(f.oscillators.length,4);
 f.audio.update({id:'scheduled-2',phase:'warning'},181);assert.equal(f.oscillators.length,6,'a later scheduled event starts its own warning');
 f.audio.update({id:'scheduled-2',phase:'detonation'},199);assert.equal(f.oscillators.length,10,'each event gets a single new explosion cue');f.audio.dispose();
});
