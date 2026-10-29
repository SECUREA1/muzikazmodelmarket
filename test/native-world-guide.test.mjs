import test from 'node:test';
import assert from 'node:assert/strict';
import {mountNativeWorldGuide} from '../public/js/native-world-guide.js';

class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag;this.children=[];this.style={};this.attributes={};this.disabled=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
 setAttribute(key,value){this.attributes[key]=value;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);}
}
const document=new EventTarget();document.createElement=tag=>new Element(tag);globalThis.document=document;
function fixture(options={}){
 const parent=new Element('nav'),events=new EventTarget(),lifecycle=new EventTarget(),calls=[],settings=[],replays=[];
 let unlocks=0;
 const voice={announce:(text,detail)=>calls.push({text,...detail}),setPreferences:value=>settings.push(value),unlock:()=>++unlocks,replay:value=>replays.push(value)};
 const ui=mountNativeWorldGuide({parent,events,lifecycle,voice,loadPreferences:async()=>null,...options});
 return {ui,parent,events,lifecycle,calls,settings,replays,get unlocks(){return unlocks;}};
}
const hockey={id:'rink',name:'Community Ice',game:'hockey'};

test('native arrival waits for loaded preferences, then queues and starts automatically',async()=>{
 let resolve;const preferences=new Promise(yes=>resolve=yes),f=fixture({loadPreferences:()=>preferences});
 const ready=f.ui.enter(hockey);assert.equal(f.calls.length,0);
 f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.unlocks,1);assert.equal(f.calls.length,0);
 resolve({speechVoiceGender:'male'});await ready;
 assert.equal(f.calls.length,1);assert.match(f.calls[0].text,/Community Ice/);assert.equal(f.calls[0].category,'introduction');assert.equal(f.settings.at(-1).speechVoiceGender,'male');
 assert.equal(f.unlocks,2,'playable entry attempts output resume without a separate control');
 await f.ui.enter(hockey);f.events.dispatchEvent(new Event('keydown'));assert.equal(f.calls.length,1,'input and heartbeat entries do not repeat the guide');
 f.ui.leave();await f.ui.enter(hockey);assert.equal(f.calls.length,2,'new visits announce after readiness');
 const before=f.unlocks;f.ui.dispose();f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.unlocks,before,'disposal removes unlock listeners');
});

test('obsolete entries are discarded while initial preferences are still loading',async()=>{
 let resolve;const preferences=new Promise(yes=>resolve=yes),f=fixture({loadPreferences:()=>preferences});
 const first=f.ui.enter(hockey);
 const current=f.ui.enter({id:'island',name:'Palm Coast',game:'tropical-island'},{solo:true});
 assert.equal(f.calls.length,0);resolve({});await Promise.all([first,current]);
 assert.equal(f.calls.length,1);assert.match(f.calls[0].text,/Palm Coast/);assert.doesNotMatch(f.calls[0].text,/Community Ice/);
 f.ui.dispose();
});

test('saved mutes remain authoritative while native controls retain mute and replay',async()=>{
 const f=fixture({loadPreferences:async()=>({masterMuted:true,introductionMuted:true})});await f.ui.enter(hockey);
 assert.equal(f.settings.at(-1).masterMuted,true);assert.equal(f.settings.at(-1).introductionMuted,true);
 const [mute,replay]=f.ui.controls.children;assert.equal(f.ui.controls.children.length,3);assert.equal(mute.attributes['aria-pressed'],'true');assert.equal(replay.disabled,true);
 replay.onclick();assert.equal(f.replays.length,0);f.ui.dispose();
});

test('explorer controls store a replay guide without duplicating the existing welcome',async()=>{
 const f=fixture({announceOnEnter:false});await f.ui.enter(hockey);
 f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.calls.length,0);
 f.ui.controls.children[1].onclick();assert.equal(f.replays.length,1);assert.match(f.replays[0].text,/Community Ice/);assert.equal(f.replays[0].category,'introduction');
 f.ui.dispose();
});

test('failed preference loading leaves automatic narration and cannot revive a disposed map',async()=>{
 const f=fixture({loadPreferences:async()=>{throw Error('offline');}});await f.ui.enter(hockey);assert.equal(f.calls.length,1);f.ui.dispose();
 let resolve;const waiting=new Promise(yes=>resolve=yes),old=fixture({loadPreferences:()=>waiting});const ready=old.ui.enter(hockey);old.ui.dispose();resolve({});await ready;assert.equal(old.calls.length,0);
});

test('denied activation recovers on a normal control without an activation button',async()=>{
 const output=new EventTarget(),state={unlocked:false,audioReady:false,error:{message:'Use a game control to start audio.'}};
 let resumes=0;
 const voice={state,announce(){},setPreferences(){},unlock(){resumes++;return Promise.resolve(state.audioReady);},addEventListener:(...args)=>output.addEventListener(...args),removeEventListener:(...args)=>output.removeEventListener(...args)};
 const f=fixture({voice});await f.ui.enter(hockey);
 assert.equal(resumes,1,'entry attempts activation automatically');
 const [mute,replay,status]=f.ui.controls.children;
 assert.equal(f.ui.controls.children.length,3);assert.equal(mute.tagName,'button');assert.equal(replay.textContent,'Replay guide');assert.equal(status.textContent,'Use a game control to start audio.');
 state.unlocked=state.audioReady=true;state.error=null;f.events.dispatchEvent(new Event('keydown'));await Promise.resolve();assert.equal(resumes,2);
 output.dispatchEvent(new Event('statechange'));assert.equal(status.textContent,'Guide audio is ready.');
 f.ui.dispose();state.error={message:'After disposal'};output.dispatchEvent(new Event('statechange'));assert.notEqual(status.textContent,'After disposal');
});

test('touch completion and clicks retry output without duplicating the welcome',async()=>{
 const f=fixture();await f.ui.enter(hockey);const before=f.unlocks;
 for(const type of ['pointerup','touchend','click'])f.events.dispatchEvent(new Event(type));
 assert.equal(f.unlocks,before+3);assert.equal(f.calls.length,1);
 f.ui.dispose();for(const type of ['pointerup','touchend','click'])f.events.dispatchEvent(new Event(type));assert.equal(f.unlocks,before+3);
});

test('passive recovery retains saved mutes and explains master mute',async()=>{
 const f=fixture({loadPreferences:async()=>({masterMuted:true,introductionMuted:true})});await f.ui.enter(hockey);
 f.events.dispatchEvent(new Event('click'));f.lifecycle.dispatchEvent(new Event('focus'));
 const [mute,,status]=f.ui.controls.children;assert.equal(mute.disabled,true);assert.equal(mute.textContent,'Muted in Audio settings');assert.match(status.textContent,/All audio is muted in Audio settings/);
 mute.onclick();assert.equal(f.settings.at(-1).masterMuted,true);assert.equal(f.settings.at(-1).introductionMuted,true);f.ui.dispose();
});

test('native page return and interruption retry output without replaying a guide',async()=>{
 const output=new EventTarget(),state={audioReady:true};let resumes=0;const calls=[];
 const voice={state,announce:(text,options)=>calls.push({text,...options}),setPreferences(){},unlock(){resumes++;return true;},addEventListener:(...args)=>output.addEventListener(...args),removeEventListener:(...args)=>output.removeEventListener(...args)};
 const f=fixture({voice});await f.ui.enter(hockey);assert.equal(calls.length,1);
 output.dispatchEvent(new Event('statechange'));state.audioReady=false;output.dispatchEvent(new Event('statechange'));assert.equal(resumes,2,'a running-to-interrupted transition retries automatically');
 output.dispatchEvent(new Event('statechange'));assert.equal(resumes,2,'an unsuccessful retry does not create a state-change loop');
 f.lifecycle.dispatchEvent(new Event('pageshow'));assert.equal(resumes,3);assert.equal(calls.length,1);f.ui.dispose();
 f.lifecycle.dispatchEvent(new Event('focus'));assert.equal(resumes,3);
});
