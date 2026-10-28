import test from 'node:test';
import assert from 'node:assert/strict';
import {createNeuralCharacterSpeech,GameSpeechUtterance,GENERATED_VOICES} from '../public/js/neural-character-speech.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture({request,decode,nativeVoices=[]}={}){
 const calls=[],sources=[],gains=[],timers=new Map(),intervals=new Map(),nativeCalls=[];let serial=0,contexts=0;
 const context={state:'suspended',currentTime:2,destination:{name:'speakers'},resume(){this.state='running';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();},decodeAudioData:decode||(()=>Promise.resolve({duration:2.5})),
  createBufferSource(){const source={buffer:null,playbackRate:{value:5},connected:[],started:0,stopped:0,disconnected:0,connect(target){this.connected.push(target);},start(){this.started++;},stop(){this.stopped++;},disconnect(){this.disconnected++;}};sources.push(source);return source;},
  createGain(){const gain={gain:{value:0,setValueAtTime(value){this.value=value;}},connected:[],disconnected:0,connect(target){this.connected.push(target);},disconnect(){this.disconnected++;}};gains.push(gain);return gain;},
  createConvolver(){throw Error('Voices must stay dry');},createPanner(){throw Error('Voices must not use a world panner');}
 };
 const native={getVoices:()=>nativeVoices,speak:utterance=>nativeCalls.push(utterance),cancelled:0,cancel(){this.cancelled++;},resume(){},addEventListener(){},removeEventListener(){}};
 const engine=createNeuralCharacterSpeech({fetch:async(path,options)=>{calls.push({path,options});return request?request(path,options):{ok:true,arrayBuffer:async()=>new ArrayBuffer(48)};},audioFactory:()=>{contexts++;return context;},nativeSpeech:native,NativeUtterance:class{constructor(text){this.text=text;}},
  setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimer:id=>timers.delete(id),setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id)});
 return {engine,calls,sources,gains,timers,intervals,native,nativeCalls,context,get contexts(){return contexts;}};
}

test('the app supplies actual generated male/female profiles without native voices or eager audio creation',()=>{
 const f=fixture();assert.equal(f.contexts,0);assert.deepEqual(f.engine.getVoices(),GENERATED_VOICES);assert.deepEqual(f.engine.getVoices().map(voice=>voice.gender),['female','male']);
 assert.ok(f.engine.getVoices().every(voice=>voice.generated&&voice.natural));f.engine.dispose();
});

test('generated speech waits for a control gesture and never falls back to an unspecified browser voice',async()=>{
 const f=fixture(),utterance=new GameSpeechUtterance('Hello. This is a generated voice.');let error;
 utterance.onerror=event=>error=event;
 f.engine.speak(utterance);await tick();assert.equal(error.error,'not-allowed');assert.equal(f.calls.length,0);assert.equal(f.nativeCalls.length,0);
 await f.engine.resume();f.engine.speak(utterance);await tick();
 assert.equal(f.calls[0].path,'/api/speech');assert.deepEqual(JSON.parse(f.calls[0].options.body),{text:utterance.text,voice:'female',speed:1});assert.equal(f.nativeCalls.length,0);assert.equal(f.sources[0].started,1);f.engine.dispose();
});

test('male speech uses a dry source/gain graph at native pitch and follows mute/distance volume updates',async()=>{
 const f=fixture(),utterance=new GameSpeechUtterance('Hello from the male voice.');utterance.voice=GENERATED_VOICES[1];utterance.rate=1.04;utterance.pitch=.5;utterance.volume=.7;
 const events=[];utterance.onstart=()=>events.push('start');utterance.onend=()=>events.push('end');
 await f.engine.resume();f.engine.speak(utterance);assert.deepEqual(events,[]);await tick();
 assert.deepEqual(events,['start']);assert.equal(JSON.parse(f.calls[0].options.body).voice,'male');assert.equal(JSON.parse(f.calls[0].options.body).speed,1.04);
 assert.equal(f.sources[0].playbackRate.value,1);assert.equal(f.sources[0].connected[0],f.gains[0]);assert.equal(f.gains[0].connected[0],f.context.destination);assert.equal(f.gains[0].gain.value,.7);
 utterance.volume=.2;for(const update of f.intervals.values())update();assert.equal(f.gains[0].gain.value,.2);
 utterance.volume=0;for(const update of f.intervals.values())update();assert.equal(f.gains[0].gain.value,0);
 f.sources[0].onended();assert.deepEqual(events,['start','end']);assert.equal(f.engine.speaking,false);assert.equal(f.intervals.size,0);assert.equal(f.gains[0].disconnected,1);f.engine.dispose();
});

test('cancelling a request aborts synthesis and stale fetches cannot start a previous line',async()=>{
 const delayed=deferred();let requestCount=0;
 const f=fixture({request:()=>++requestCount===1?delayed.promise:{ok:true,arrayBuffer:async()=>new ArrayBuffer(48)}});await f.engine.resume();
 const first=new GameSpeechUtterance('Old line'),next=new GameSpeechUtterance('New line');let ended=0;
 first.onend=()=>ended++;f.engine.speak(first);await tick();const signal=f.calls[0].options.signal;
 f.engine.speak(next);await tick();assert.equal(signal.aborted,true);assert.equal(f.sources.length,1);assert.equal(f.engine.speaking,true);
 delayed.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});await tick();assert.equal(f.sources.length,1);assert.equal(ended,0);assert.equal(f.engine.speaking,true);f.engine.dispose();
});

test('cancelling while audio is decoding cannot resurrect speech or disrupt a newer voice',async()=>{
 const delayed=deferred();let decodes=0;const f=fixture({decode:()=>++decodes===1?delayed.promise:Promise.resolve({duration:1})});await f.engine.resume();
 f.engine.speak(new GameSpeechUtterance('Decoding old voice'));await tick();f.engine.cancel();f.engine.speak(new GameSpeechUtterance('Current voice'));await tick();
 assert.equal(f.sources.length,1);delayed.resolve({duration:10});await tick();assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,0);assert.equal(f.engine.speaking,true);f.engine.dispose();
});

test('generation failure retains captions and cannot silently invoke a robotic browser default',async()=>{
 const f=fixture({request:async()=>({ok:false,status:503})});await f.engine.resume();let error;
 const utterance=new GameSpeechUtterance('Visible dialogue remains available.');utterance.onerror=event=>error=event;
 f.engine.speak(utterance);await tick();assert.equal(error.error,'synthesis-unavailable');assert.match(f.engine.status,/Captions remain available/);assert.equal(f.nativeCalls.length,0);assert.equal(f.sources.length,0);assert.equal(f.timers.size,0);f.engine.dispose();
});

test('only a deliberately selected acceptable installed voice can use browser synthesis',async()=>{
 const natural={name:'Microsoft Jenny Natural',voiceURI:'jenny',lang:'en-US',localService:true},robot={name:'eSpeak English',voiceURI:'robot',lang:'en-US',localService:true};
 const f=fixture({nativeVoices:[robot,natural]}),selected=new GameSpeechUtterance('An explicitly selected device voice.');selected.voice=natural;selected.pitch=2;
 const events=[];selected.onstart=()=>events.push('start');selected.onend=()=>events.push('end');f.engine.speak(selected);
 assert.equal(f.nativeCalls.length,1);assert.equal(f.calls.length,0);assert.equal(f.nativeCalls[0].voice,natural);assert.equal(f.nativeCalls[0].pitch,1);f.nativeCalls[0].onstart();assert.deepEqual(events,['start']);
 f.nativeCalls[0].onend();assert.deepEqual(events,['start','end']);assert.equal(f.engine.speaking,false);
 const rejected=new GameSpeechUtterance('Do not use the robot voice.');rejected.voice=robot;let error;rejected.onerror=event=>error=event;f.engine.speak(rejected);assert.equal(error.error,'voice-unavailable');assert.equal(f.nativeCalls.length,1);assert.equal(f.calls.length,0);f.engine.dispose();
});

test('request timeouts abort pending synthesis and disposal stops playing audio',async()=>{
 const f=fixture({request:()=>new Promise(()=>{})});await f.engine.resume();let error;const utterance=new GameSpeechUtterance('A bounded request');utterance.onerror=event=>error=event;f.engine.speak(utterance);await tick();
 const deadline=[...f.timers.values()][0];deadline.fn();assert.equal(error.error,'synthesis-unavailable');assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.engine.pending,false);f.engine.dispose();
 const playing=fixture();await playing.engine.resume();playing.engine.speak(new GameSpeechUtterance('Stop on leaving the page.'));await tick();playing.engine.dispose();assert.equal(playing.sources[0].stopped,1);assert.equal(playing.context.state,'closed');assert.equal(playing.intervals.size,0);
});

test('a later touch gesture releases speech even if the first resume promise never settles',async()=>{
 const f=fixture(),first=deferred();let attempts=0;
 f.context.resume=function(){if(++attempts===1)return first.promise;this.state='running';return Promise.resolve();};
 const initiallyPending=f.engine.resume();f.engine.speak(new GameSpeechUtterance('The welcome was not lost.'));await tick();
 assert.equal(f.calls.length,0);assert.equal(f.engine.pending,true);
 assert.equal(await f.engine.resume(),true);assert.equal(await initiallyPending,true);await tick();
 assert.equal(attempts,2);assert.equal(f.sources[0].started,1);assert.equal(f.engine.state.unlocked,true);
 first.reject(Error('Stale pointerdown refusal'));await tick();assert.equal(f.engine.state.unlocked,true);assert.equal(f.engine.lastError,null);f.engine.dispose();
});

test('long guides start at a sentence boundary and prefetch only one upcoming segment',async()=>{
 const f=fixture(),line='Welcome to the island. '+('Follow the marked route to find a boat and choose a job from the local map. ').repeat(5).trim();
 const utterance=new GameSpeechUtterance(line),events=[],boundaries=[];
 utterance.onstart=()=>events.push('start');utterance.onend=()=>events.push('end');utterance.onboundary=event=>boundaries.push(event);
 await f.engine.resume();f.engine.speak(utterance);await tick();
 assert.deepEqual(events,['start']);assert.equal(f.sources.length,1);assert.equal(f.calls.length,2,'Only the playing segment and its successor are requested.');
 assert.ok(JSON.parse(f.calls[0].options.body).text.endsWith('.'));
 let played=0;
 while(f.engine.speaking){assert.ok(++played<10);f.sources.at(-1).onended();await tick();}
 assert.equal(f.calls.map(call=>JSON.parse(call.options.body).text).join(' '),line);
 assert.ok(f.calls.every(call=>JSON.parse(call.options.body).text.length<=180));
 assert.deepEqual(events,['start','end']);assert.equal(boundaries.length,played);assert.equal(boundaries.at(-1).remainingSegments,0);assert.equal(f.intervals.size,0);
 assert.ok(f.sources.every(source=>source.disconnected===1));f.engine.dispose();
});

test('canceling a segmented guide stops current audio and aborts its prefetched successor',async()=>{
 const pending=deferred();let requests=0;
 const f=fixture({request:()=>++requests===1?{ok:true,arrayBuffer:async()=>new ArrayBuffer(48)}:pending.promise});
 await f.engine.resume();const utterance=new GameSpeechUtterance('Welcome to the map. '+('Use the local map to find a new job. ').repeat(8));let starts=0;utterance.onstart=()=>starts++;
 f.engine.speak(utterance);await tick();assert.equal(f.calls.length,2);assert.equal(starts,1);
 const successor=f.calls[1].options.signal;f.engine.cancel();assert.equal(successor.aborted,true);assert.equal(f.sources[0].stopped,1);assert.equal(f.sources[0].onended,null);
 pending.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});await tick();assert.equal(f.sources.length,1);assert.equal(f.engine.speaking,false);assert.equal(f.timers.size,0);f.engine.dispose();
});
