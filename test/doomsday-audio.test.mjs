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
  createOscillator(){const value={frequency:{setTargetAtTime:(...args)=>value.frequencyCalls.push(args)},frequencyCalls:[],started:0,stopped:0,disconnected:0,connect(){},start(){this.started++;},stop(){this.stopped++;},disconnect(){this.disconnected++;}};oscillators.push(value);return value;},
  createGain(){const value={gain:{setTargetAtTime:(...args)=>value.volumeCalls.push(args)},volumeCalls:[],disconnected:0,connect(){},disconnect(){this.disconnected++;}};gains.push(value);return value;},
  resume(){this.resumed++;this.state='running';return Promise.resolve();},close(){this.closed++;return Promise.resolve();}};
 const audio=createDoomsdayAudio({events,getPreferences:()=>preferences,isSpeaking:()=>speaking,makeContext:()=>{creates++;return context;}});
 return {audio,events,preferences,context,oscillators,gains,get creates(){return creates;},setSpeaking:value=>speaking=value,gesture:type=>events.dispatchEvent(new Event(type||'pointerdown'))};
}

test('siren requires a gesture, uses quiet gaps and stops when the response ends',()=>{
 const f=fixture();f.audio.update({phase:'warning'},0);assert.equal(f.creates,0);
 f.gesture();f.audio.update({phase:'warning'},0);assert.equal(f.creates,1);assert.equal(f.oscillators[0].started,1);
 f.audio.update({phase:'warning'},1);assert.equal(f.oscillators.length,1,'updates reuse one oscillator');assert.ok(f.gains[0].volumeCalls.at(-1)[0]<=.035);
 f.audio.update({phase:'warning'},6);assert.equal(f.oscillators[0].stopped,1);assert.equal(f.oscillators[0].disconnected,1);
 f.audio.update({phase:'fallout'},18);assert.equal(f.oscillators.length,2);
 f.audio.update({phase:'recovery'},19);assert.equal(f.oscillators[1].stopped,1);
 f.audio.update({phase:'all-clear'},36);assert.equal(f.oscillators.length,2);f.audio.dispose();
});

test('siren respects effects/master mute, volume, visibility, and its own mute control',()=>{
 const f=fixture();f.gesture();f.audio.update({phase:'fallout'},0);f.preferences.masterMuted=true;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators[0].stopped,1);
 f.preferences.masterMuted=false;f.preferences.effectsMuted=true;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,1);
 f.preferences.effectsMuted=false;f.preferences.effectsVolume=0;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,1);
 f.preferences.effectsVolume=20;f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,2);assert.ok(f.gains[1].volumeCalls.at(-1)[0]>.006&&f.gains[1].volumeCalls.at(-1)[0]<.008);
 f.audio.setMuted(true);assert.equal(f.audio.muted,true);assert.equal(f.oscillators[1].stopped,1);f.audio.update({phase:'fallout'},1);assert.equal(f.oscillators.length,2);
 f.audio.setMuted(false);f.audio.update({phase:'warning'},1);assert.equal(f.oscillators.length,3);
 f.events.hidden=true;f.events.dispatchEvent(new Event('visibilitychange'));assert.equal(f.oscillators[2].stopped,1);f.audio.update({phase:'warning'},1);assert.equal(f.oscillators.length,3);f.audio.dispose();
});

test('gesture resumes suspended audio and disposal removes listeners and prevents revival',()=>{
 const f=fixture();f.gesture('keydown');f.audio.update({phase:'warning'},0);f.context.state='suspended';f.gesture();assert.equal(f.context.resumed,1);
 f.audio.dispose();assert.equal(f.context.closed,1);assert.equal(f.oscillators[0].stopped,1);
 f.context.state='suspended';f.gesture();assert.equal(f.context.resumed,1,'disposed player no longer reacts to document gestures');
 f.audio.update({phase:'warning'},0);assert.equal(f.oscillators.length,1);
});


test('siren cadence starts at the current phase and yields to spoken briefings',()=>{
 const f=fixture();f.gesture();f.audio.update({id:'run-1',phase:'warning'},203);assert.equal(f.oscillators.length,1,'first warning is audible regardless of animation-clock time');
 f.setSpeaking(true);f.audio.update({id:'run-1',phase:'warning'},204);assert.equal(f.oscillators[0].stopped,1);assert.equal(f.oscillators.length,1);
 f.setSpeaking(false);f.audio.update({id:'run-1',phase:'warning'},205);assert.equal(f.oscillators.length,2,'siren resumes in the audible interval after speech');
 f.audio.update({id:'run-1',phase:'warning'},209);assert.equal(f.oscillators[1].stopped,1);
 f.audio.update({id:'run-1',phase:'fallout'},210);assert.equal(f.oscillators.length,3,'new phase starts a fresh audible warning');f.audio.dispose();
});


test('long spoken briefings preserve the first siren sweep until speech finishes',()=>{
 const f=fixture();f.gesture();f.setSpeaking(true);
 f.audio.update({id:'long-briefing',phase:'warning'},100);f.audio.update({id:'long-briefing',phase:'warning'},115);
 assert.equal(f.oscillators.length,0);f.setSpeaking(false);f.audio.update({id:'long-briefing',phase:'warning'},116);
 assert.equal(f.oscillators.length,1,'warning sounds immediately after the briefing');f.audio.dispose();
});
