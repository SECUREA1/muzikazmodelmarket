import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunhouseAudio} from '../public/js/funhouse-audio.js';
import {claimGameSpeech,releaseGameSpeech,isGameSpeechActive} from '../public/js/game-speech-owner.js';

const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function fixture({defer=false}={}){
 let time=100000,sequence=0,resolve,world={id:'muzikaz-clown-funhouse',game:'funhouse'},music=false,voice=null;
 const position={x:28,y:1.7,z:25},effects=[],captions=[],voices=[],saved=new Map(),preferences={},speech={speak(){},cancel(){}};
 const engine={unlock:async()=>true,effect:(kind,fields)=>effects.push({kind,...fields}),setMusic:active=>{music=active;},
  voice:(buffer,fields)=>{voice=fields;voices.push(fields);fields.onStarted?.();return true;},stopVoice:reason=>{const old=voice;voice=null;old?.onEnded?.(reason);},
  update(){},reset(){music=false;this.stopVoice('reset');},dispose(){this.reset();},snapshot:()=>({unlocked:true,musicActive:music,activeVoices:voice?1:0})};
 const context={state:'running',decodeAudioData:async()=>({duration:4})};
 const audio=createFunhouseAudio({engine,getContext:()=>context,getEnvironment:()=>world,getActors:()=>({}),getPosition:()=>position,
  getPreferences:()=>preferences,speech,now:()=>time,onCaption:caption=>captions.push(caption),storage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},
  request:()=>defer?new Promise(done=>resolve=done):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)})});
 const receive=(state={},extra={})=>audio.receive({sequence:++sequence,serverTime:time,players:{me:{funhouse:state}},events:[],...extra},'me');
 return {position,audio,engine,effects,captions,voices,preferences,speech,receive,saved,advance:ms=>time+=ms,resolve:()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)}),travel:()=>{world={id:'another-world'};audio.update();}};
}

test('empty progress and sparse snapshots are valid, and repeated confirmations do not repeat attraction sounds',async()=>{
 const f=fixture();assert.doesNotThrow(()=>f.receive());await f.audio.unlock();
 const ride={id:'ride',kind:'car',stationId:'funhouse-clown-car',status:'active',startedAt:100000,endsAt:120000};f.receive({ride});
 f.audio.update();await settle();assert.equal(f.effects.filter(value=>value.kind==='car-start').length,1);assert.equal(f.audio.snapshot().musicActive,true);
 f.receive({ride});assert.equal(f.effects.length,1);
 f.receive({ride:{...ride,status:'cancelled'}});f.audio.update();assert.equal(f.audio.snapshot().musicActive,false);
 assert.equal(f.effects.filter(value=>value.kind==='car-stop').length,1);f.audio.dispose();
});

test('a muted clown still has exact captions and local preferences persist without overriding global mutes',async()=>{
 const f=fixture();f.audio.setSettings({voiceMuted:true,musicVolume:23});await f.audio.unlock();f.audio.update();
 assert.ok(f.captions.at(-1)?.text.length>10);assert.equal(f.voices.length,0);assert.equal(f.audio.settings().musicVolume,23);assert.equal(f.saved.size,1);
 f.preferences.masterMuted=true;assert.equal(f.audio.previewMusic(),false);f.audio.dispose();
});

test('world travel discards a slow voice reply, music and pending captions without closing the shared context',async()=>{
 const f=fixture({defer:true});f.receive();await f.audio.unlock();f.audio.update();await settle();
 assert.equal(f.audio.snapshot().voiceLoading,true);f.travel();f.resolve();await settle();
 assert.equal(f.voices.length,0);assert.equal(f.audio.snapshot().unlocked,false);assert.equal(f.audio.snapshot().musicActive,false);assert.equal(f.audio.snapshot().caption,null);f.audio.dispose();
});

test('NPC conversations retain the speech lane, and a later conversation releases a playing clown voice',async()=>{
 const f=fixture(),npc=Symbol('npc');claimGameSpeech(f.speech,npc,()=>{});
 f.receive();await f.audio.unlock();assert.equal(f.audio.replay(),true);await settle();assert.equal(f.voices.length,0);
 releaseGameSpeech(f.speech,npc);f.audio.update();await settle();assert.equal(f.voices.length,1);assert.equal(isGameSpeechActive(f.speech),true);
 claimGameSpeech(f.speech,npc,()=>{});assert.equal(f.audio.snapshot().voicePlaying,false);assert.equal(isGameSpeechActive(f.speech),true);
 releaseGameSpeech(f.speech,npc);f.audio.pause();assert.equal(f.audio.snapshot().unlocked,false);f.audio.dispose();
});

test('music previews end and remote effects are bounded by age, distance and event identity',async()=>{
 const f=fixture();f.receive();await f.audio.unlock();f.audio.previewMusic();assert.equal(f.audio.snapshot().musicActive,true);
 f.advance(10001);f.audio.update();assert.equal(f.audio.snapshot().musicActive,false);
 const event={id:'friend-honk',actorId:'friend',at:110001,funhouseEffect:{kind:'honk',position:{x:28,y:1,z:25}}};
 f.receive({}, {events:[event]});f.receive({}, {events:[event]});assert.equal(f.effects.filter(value=>value.kind==='honk').length,1);
 f.receive({}, {events:[{...event,id:'old',at:100000},{...event,id:'far',funhouseEffect:{...event.funhouseEffect,position:{x:1000,y:1,z:0}}}]});
 assert.equal(f.effects.filter(value=>value.kind==='honk').length,1);f.audio.dispose();
});

test('oversized shoes squeak with walking distance and never become a rapid held sound',async()=>{
 const f=fixture();f.receive({costume:{shoes:true}});await f.audio.unlock();f.audio.update();
 f.advance(600);f.position.x+=1;f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='squeak').length,1);
 f.advance(100);f.position.x+=1;f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='squeak').length,1);
 f.advance(600);f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='squeak').length,2);
 f.position.x+=20;f.advance(600);f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='squeak').length,2,'relocation does not synthesize a burst of footsteps');f.audio.dispose();
});

test('Night Watch confirmations play one spatial cue and exact caption per seal, then a separate finale',async()=>{
 const f=fixture();f.audio.setSettings({voiceMuted:true});f.receive();await f.audio.unlock();
 const haunt={id:'watch',status:'active',startedAt:100000,endsAt:280000,wardIndex:0,sealed:[]};
 f.receive({haunt});f.audio.update();
 assert.equal(f.effects.filter(value=>value.kind==='haunt-start').length,1);
 assert.match(f.captions.at(-1).text,/nightlight/i);
 const sealed={...haunt,wardIndex:1,sealed:['nursery-lantern'],lastWardId:'nursery-lantern',lastSealedAt:100000};
 const ownEvent={id:'seal-event',actorId:'me',at:100000,funhouseEffect:{kind:'haunt',phase:'seal',position:{x:20,y:.02,z:-16}}};
 f.position.x=20;f.position.z=-16;f.receive({haunt:sealed},{events:[ownEvent]});f.receive({haunt:sealed},{events:[ownEvent]});
 assert.equal(f.effects.filter(value=>value.kind==='haunt-seal').length,1);
 assert.deepEqual(f.effects.find(value=>value.kind==='haunt-seal').position,{x:20,y:.02,z:-16});
 assert.match(f.captions.at(-1).text,/toy chest/i);
 const complete={...sealed,status:'complete',wardIndex:4,sealed:['nursery-lantern','clockwork-lantern','mirror-lantern','portrait-lantern'],lastWardId:'portrait-lantern'};
 f.receive({haunt:complete});f.audio.update();assert.match(f.captions.at(-1).text,/blink/i);
 f.advance(6500);f.audio.update();assert.match(f.captions.at(-1).text,/refund/i);
 assert.equal(f.effects.filter(value=>value.kind==='haunt-complete').length,1);
 f.audio.dispose();
});

test('Night Watch atmosphere follows the room clock, skips missed beats and ends on expiry, stop or pause',async()=>{
 const f=fixture();f.audio.setSettings({voiceMuted:true});f.receive();await f.audio.unlock();
 f.position.x=20;f.position.z=-16;
 const haunt={id:'watch',status:'active',startedAt:100000,endsAt:280000,wardIndex:0,sealed:[]};
 f.receive({haunt});f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='haunt-heartbeat').length,0);
 f.advance(12000);f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='haunt-whisper').length,1);
 // Authoritative time can run ahead of the local device clock.
 f.receive({haunt},{serverTime:225000});f.audio.update();
 assert.equal(f.effects.filter(value=>value.kind==='haunt-heartbeat').length,1);
 f.advance(10000);f.audio.update();assert.equal(f.effects.filter(value=>value.kind==='haunt-heartbeat').length,2,'a slow frame never emits a backlog');
 f.receive({haunt:{...haunt,status:'cancelled'}});const count=f.effects.length;
 f.advance(5000);f.audio.update();assert.equal(f.effects.length,count);
 f.receive({haunt:{...haunt,id:'watch-two',startedAt:127000,endsAt:177000}});f.audio.pause();
 const paused=f.effects.length;f.advance(4000);f.audio.update();assert.equal(f.effects.length,paused);
 f.audio.dispose();
});

test('a saved completed Night Watch never replays its finale when joining or resuming',async()=>{
 const f=fixture();f.audio.setSettings({voiceMuted:true});await f.audio.unlock();
 const haunt={id:'saved',status:'complete',startedAt:1,endsAt:90000,wardIndex:4,sealed:['nursery-lantern','clockwork-lantern','mirror-lantern','portrait-lantern'],lastWardId:'portrait-lantern',lastSealedAt:80000};
 f.receive({haunt});f.advance(7000);f.audio.update();assert.equal(f.effects.filter(value=>value.kind.startsWith('haunt')).length,0);
 assert.doesNotMatch(f.captions.at(-1)?.text||'',/refund/i);f.audio.dispose();
});
