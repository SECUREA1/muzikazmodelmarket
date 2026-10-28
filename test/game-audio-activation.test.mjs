import test from 'node:test';
import assert from 'node:assert/strict';
import {mountGameAudioActivation} from '../public/js/game-audio-activation.js';

function fixture(){
 const document=new EventTarget(),events=new EventTarget(),speech=new EventTarget();document.hidden=false;speech.state={unlocked:false};
 const parent={ownerDocument:document,querySelector:()=>null};let unlocks=0;
 const preferences={masterMuted:true,dialogueMuted:true};
 const voice={unlock(){unlocks++;return false;},setMuted(){throw Error('Activation must not change a local mute');},setPreferences(){throw Error('Activation must not overwrite preferences');},preview(){throw Error('Normal controls must not play a sound-check preview');}};
 const activation=mountGameAudioActivation({parent,voice,speech,events});
 return {parent,document,events,speech,voice,preferences,activation,get unlocks(){return unlocks;}};
}

test('normal document controls activate audio without mounting any overlay or preview',()=>{
 const f=fixture();assert.equal(f.unlocks,0);
 for(const type of ['pointerdown','pointerup','touchend','click','keydown'])f.document.dispatchEvent(new Event(type));
 assert.equal(f.unlocks,5,'bottom HUD and page controls use the same document gesture listeners');
 assert.deepEqual(f.preferences,{masterMuted:true,dialogueMuted:true});assert.equal('root' in f.activation,false);
 f.activation.dispose();f.document.dispatchEvent(new Event('click'));assert.equal(f.unlocks,5);
});

test('playable startup and returning to a visible game retry output automatically',()=>{
 const f=fixture();f.events.dispatchEvent(new Event('focus'));assert.equal(f.unlocks,0,'an untouched landing page does not start output');
 f.document.dispatchEvent(new Event('muzikaz:gameplay-ready'));assert.equal(f.unlocks,1);
 f.events.dispatchEvent(new Event('pageshow'));assert.equal(f.unlocks,2);
 f.document.hidden=true;f.events.dispatchEvent(new Event('focus'));f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.unlocks,2);
 f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.unlocks,3);
 f.activation.dispose();f.events.dispatchEvent(new Event('focus'));assert.equal(f.unlocks,3);
});

test('an audio interruption retries once and a denied retry waits for a normal gesture',()=>{
 const f=fixture();f.speech.state.unlocked=true;f.speech.dispatchEvent(new Event('statechange'));
 f.speech.state.unlocked=false;f.speech.dispatchEvent(new Event('statechange'));assert.equal(f.unlocks,1);
 f.speech.dispatchEvent(new Event('statechange'));assert.equal(f.unlocks,1,'blocked resume must not create an event loop');
 f.document.dispatchEvent(new Event('keydown'));assert.equal(f.unlocks,2);
 f.activation.dispose();
});

test('activation mounts once and page teardown removes every recovery listener',()=>{
 const f=fixture();assert.equal(mountGameAudioActivation({parent:f.parent,voice:f.voice,speech:f.speech,events:f.events}),f.activation);
 f.document.dispatchEvent(new Event('click'));assert.equal(f.unlocks,1);
 const persisted=new Event('pagehide');persisted.persisted=true;f.events.dispatchEvent(persisted);f.events.dispatchEvent(new Event('pageshow'));assert.equal(f.unlocks,2);
 f.events.dispatchEvent(new Event('pagehide'));f.document.dispatchEvent(new Event('click'));f.events.dispatchEvent(new Event('focus'));assert.equal(f.unlocks,2);
});
