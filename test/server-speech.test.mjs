import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpeechService,normalizeSpeechRequest,validSpeechWav} from '../server-speech.mjs';
import {createVoiceRuntime} from '../server-voice-runtime.mjs';

// PCM fixture checks the WAV transport contract; it is not a voice-quality test.
function wav(){
 const result=Buffer.alloc(44+256);result.write('RIFF');result.writeUInt32LE(result.length-8,4);result.write('WAVEfmt ',8);result.writeUInt32LE(16,16);result.writeUInt16LE(1,20);result.writeUInt16LE(1,22);result.writeUInt32LE(24000,24);result.writeUInt32LE(48000,28);result.writeUInt16LE(2,32);result.writeUInt16LE(16,34);result.write('data',36);result.writeUInt32LE(256,40);return result;
}
const request=(text='Welcome to the world.',voice='female')=>({text,voice});
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('speech validates bounded plain text, voice IDs and moderate numeric speed',()=>{
 assert.deepEqual(normalizeSpeechRequest({text:' Hello ',voice:'muzikaz:neural-male'}),{text:'Hello',voice:'male',speed:1});
 assert.deepEqual(normalizeSpeechRequest({text:'Hello',voice:'female',speed:1.1}),{text:'Hello',voice:'female',speed:1.1});
 for(const input of [null,[],{},request(''),request(' '.repeat(1001)),request('x'.repeat(1001)),request('Bad\0text'),request('Hello','unknown'),{...request(),speed:'1'},{...request(),speed:NaN},{...request(),speed:.89},{...request(),speed:1.11}])assert.throws(()=>normalizeSpeechRequest(input),error=>error.statusCode===400);
});

test('speech rejects non-WAV, partial WAV and inconsistent PCM audio',()=>{
 assert.equal(validSpeechWav(wav()),true);
 const malformed=wav();malformed.writeUInt32LE(1000000,40);
 const badFormat=wav();badFormat.writeUInt16LE(7,20);
 const badRate=wav();badRate.writeUInt32LE(1,28);
 for(const bytes of [Buffer.from('not audio'),wav().subarray(0,45),malformed,badFormat,badRate,new Uint8Array(wav())])assert.equal(validSpeechWav(bytes),false);
});

test('one active generation and three queued requests bound concurrent model work',async()=>{
 const releases=[];let running=0,maximum=0;
 const service=createSpeechService({generate:()=>new Promise(resolve=>{running++;maximum=Math.max(maximum,running);releases.push(()=>{running--;resolve(wav());});})});
 const jobs=Array.from({length:4},(_,index)=>service.generate(request('Line '+index)));
 await turn();assert.deepEqual(service.state,{active:1,queued:3,cached:0,cacheBytes:0});
 await assert.rejects(service.generate(request('Too many')),error=>error.code==='SPEECH_BUSY'&&error.statusCode===503);
 for(let index=0;index<4;index++){releases[index]();assert.equal(validSpeechWav(await jobs[index]),true);await turn();}
 assert.equal(maximum,1);assert.equal(service.state.active,0);assert.equal(service.state.queued,0);
});

test('cache is bounded, expires and keeps voice and speed separate',async()=>{
 let calls=0,time=1000;
 const service=createSpeechService({generate:async()=>{calls++;return wav();},now:()=>time,maxCacheEntries:2,cacheTtlMs:100,requestsPerMinute:100});
 const first=await service.generate(request('One'));first.fill(0);assert.equal(validSpeechWav(await service.generate(request('One'))),true);assert.equal(calls,1);
 await service.generate(request('One','male'));await service.generate(request('One'));await service.generate({...request('One'),speed:1.1});assert.equal(service.state.cached,2);
 await service.generate(request('One','male'));assert.equal(calls,4,'least-recently-used male entry was evicted');
 time+=101;await service.generate(request('One','male'));assert.equal(calls,5);
 assert.ok(service.state.cacheBytes<=600);
});

test('per-client request limits include cache hits and recover after a minute',async()=>{
 let time=0;const service=createSpeechService({generate:async()=>wav(),now:()=>time,requestsPerMinute:2});
 await service.generate(request(),{clientId:'first'});await service.generate(request(),{clientId:'first'});
 await assert.rejects(service.generate(request(),{clientId:'first'}),error=>error.statusCode===429&&error.retryAfter===60);
 assert.equal(validSpeechWav(await service.generate(request(),{clientId:'second'})),true);
 time=60000;assert.equal(validSpeechWav(await service.generate(request(),{clientId:'first'})),true);
});

test('generation deadline aborts engine work and releases queued requests safely',async()=>{
 let aborts=0;
 const service=createSpeechService({timeoutMs:30,generate:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(new Error('Engine stopped'));},{once:true}))});
 const active=service.generate(request('First')),queued=service.generate(request('Second'));
 await Promise.all([assert.rejects(active,error=>error.code==='SPEECH_TIMEOUT'&&error.statusCode===504),assert.rejects(queued,error=>error.code==='SPEECH_TIMEOUT')]);
 await turn();assert.ok(aborts>=1);assert.equal(service.state.active,0);assert.equal(service.state.queued,0);
});

test('canceling a queued request never starts it and a rejected model cannot leak text',async()=>{
 let calls=0,release;
 const service=createSpeechService({generate:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}}),controller=new AbortController();
 const active=service.generate(request('Active')),canceled=service.generate(request('Private text'),{signal:controller.signal});controller.abort();
 await assert.rejects(canceled,error=>error.code==='SPEECH_ABORTED');await turn();release(wav());await active;await turn();assert.equal(calls,1);
 const broken=createSpeechService({generate:async({text})=>{throw new Error('Internal model error: '+text);}});
 await assert.rejects(broken.generate(request('Private conversation')),error=>error.code==='SPEECH_GENERATION_FAILED'&&!error.message.includes('Private'));
 const invalid=createSpeechService({generate:async()=>Buffer.from('model unavailable')});
 await assert.rejects(invalid.generate(request()),error=>error.code==='SPEECH_INVALID_AUDIO'&&error.statusCode===503);assert.equal(invalid.state.cached,0);
 const missing=createSpeechService({generate:async()=>{throw Object.assign(new Error('Local dependency path'),{code:'SPEECH_UNAVAILABLE'});}});
 await assert.rejects(missing.generate(request()),error=>error.code==='SPEECH_UNAVAILABLE'&&error.statusCode===503&&!error.message.includes('dependency path'));
});

test('public voice metadata reports model readiness without generating audio',async()=>{
 let calls=0;
 const service=createSpeechService({generate:async()=>{calls++;return wav();},getStatus:()=>({available:false,modelReady:false,status:'not installed'})});
 const state=await service.voices();assert.equal(calls,0);assert.equal(state.available,false);assert.equal(state.modelReady,false);assert.equal(state.status,'unavailable');
 assert.deepEqual(state.voices.map(item=>[item.id,item.gender,item.generated,item.natural]),[['muzikaz:neural-female','female',true,true],['muzikaz:neural-male','male',true,true]]);
});

test('a speech deadline cancels its preparation wait while the shared runtime finishes for the next player',async()=>{
 let install,modelReady=false,installations=0;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,probe:()=>({dependenciesReady:true,modelReady}),prepareDirectory:async()=>{},run:async()=>{installations++;await new Promise(resolve=>{install=resolve;});modelReady=true;}});
 const startup=runtime.start(),service=createSpeechService({timeoutMs:25,getStatus:runtime.status,generate:async({signal})=>{await runtime.ensure({signal});return wav();}});
 await turn();const loading=await service.voices();assert.equal(loading.status,'loading');assert.match(loading.message,/Preparing/);assert.equal(installations,1);
 await assert.rejects(service.generate(request('First player')),error=>error.code==='SPEECH_TIMEOUT');await turn();
 assert.equal(runtime.status().status,'loading');assert.equal(service.state.active,0,'timed-out HTTP work releases the speech queue without abandoning the shared install');
 install();await startup;
 assert.equal((await service.voices()).status,'ready');assert.equal(validSpeechWav(await service.generate(request('Next player'))),true);assert.equal(installations,1);
});
