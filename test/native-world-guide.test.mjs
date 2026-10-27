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
 const parent=new Element('nav'),events=new EventTarget(),calls=[],settings=[],replays=[];
 let unlocks=0;
 const voice={announce:(text,detail)=>calls.push({text,...detail}),setPreferences:value=>settings.push(value),unlock:()=>unlocks++,replay:value=>replays.push(value)};
 const ui=mountNativeWorldGuide({parent,events,voice,loadPreferences:async()=>null,...options});
 return {ui,parent,events,calls,settings,replays,get unlocks(){return unlocks;}};
}
const hockey={id:'rink',name:'Community Ice',game:'hockey'};

test('native arrival waits for playable entry, loaded preferences and first control gesture',async()=>{
 let resolve;const preferences=new Promise(yes=>resolve=yes),f=fixture({loadPreferences:()=>preferences});
 const ready=f.ui.enter(hockey);assert.equal(f.calls.length,0);
 f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.unlocks,1);assert.equal(f.calls.length,0);
 resolve({speechVoiceGender:'male'});await ready;
 assert.equal(f.calls.length,1);assert.match(f.calls[0].text,/Community Ice/);assert.equal(f.calls[0].category,'introduction');assert.equal(f.settings.at(-1).speechVoiceGender,'male');
 await f.ui.enter(hockey);f.events.dispatchEvent(new Event('keydown'));assert.equal(f.calls.length,1,'input and heartbeat entries do not repeat the guide');
 f.ui.leave();await f.ui.enter(hockey);assert.equal(f.calls.length,2,'new visit announces after readiness');
 f.ui.dispose();f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.unlocks,2,'disposal removes unlock listeners');
});

test('a delayed first gesture still receives its map guide, while obsolete arrivals are discarded',async()=>{
 const f=fixture();await f.ui.enter(hockey);assert.equal(f.calls.length,0);
 await f.ui.enter({id:'island',name:'Palm Coast',game:'tropical-island'},{solo:true});
 f.events.dispatchEvent(new Event('keydown'));assert.equal(f.calls.length,1);assert.match(f.calls[0].text,/Palm Coast/);assert.doesNotMatch(f.calls[0].text,/Community Ice/);
 f.ui.dispose();
});

test('saved mute preferences are honored and native controls expose replay without master unmute',async()=>{
 const f=fixture({loadPreferences:async()=>({masterMuted:true,introductionMuted:true})});await f.ui.enter(hockey);
 assert.equal(f.settings.at(-1).masterMuted,true);assert.equal(f.settings.at(-1).introductionMuted,true);
 const [enable,mute,replay]=f.ui.controls.children;assert.equal(enable.textContent,'Enable guide audio');assert.equal(mute.attributes['aria-pressed'],'true');assert.equal(replay.disabled,true);
 replay.onclick();assert.equal(f.replays.length,0);
 f.ui.dispose();
});

test('explorer controls store a replay guide without duplicating the existing welcome',async()=>{
 const f=fixture({announceOnEnter:false});await f.ui.enter(hockey);
 f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.calls.length,0);
 f.ui.controls.children[2].onclick();assert.equal(f.replays.length,1);assert.match(f.replays[0].text,/Community Ice/);assert.equal(f.replays[0].category,'introduction');
 f.ui.dispose();
});

test('failed preference loading leaves a playable guide and late preferences cannot revive a disposed map',async()=>{
 const f=fixture({loadPreferences:async()=>{throw Error('offline');}});await f.ui.enter(hockey);f.events.dispatchEvent(new Event('pointerdown'));assert.equal(f.calls.length,1);f.ui.dispose();
 let resolve;const waiting=new Promise(yes=>resolve=yes),old=fixture({loadPreferences:()=>waiting});const ready=old.ui.enter(hockey);old.events.dispatchEvent(new Event('pointerdown'));old.ui.dispose();resolve({});await ready;assert.equal(old.calls.length,0);
});
