import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunhouseAudioEngine} from '../public/js/funhouse-audio-engine.js';
import {FUNHOUSE_MUSIC} from '../public/js/funhouse-audio-score.js';

function parameter(){return {value:0,events:[],setValueAtTime(value,at){this.value=value;this.events.push(['set',value,at]);},linearRampToValueAtTime(value,at){this.value=value;this.events.push(['linear',value,at]);},exponentialRampToValueAtTime(value,at){this.value=value;this.events.push(['exponential',value,at]);},cancelScheduledValues(at){this.events.push(['cancel',at]);}};}
function audioContext(){
 const all=[],sources=[],audio={state:'suspended',currentTime:0,resumes:0,closes:0,listener:{},all,sources};
 function node(kind){const result={kind,connections:[],disconnects:0,connect(destination){this.connections.push(destination);return destination;},disconnect(){this.disconnects++;}};all.push(result);return result;}
 function source(kind){const result=Object.assign(node(kind),{start(at){this.startedAt=at;},stop(at=audio.currentTime){this.stopAt=at;},finish(){if(this.finished)return;this.finished=true;this.onended?.();}});sources.push(result);return result;}
 for(const prefix of ['position','forward','up'])for(const axis of ['X','Y','Z'])audio.listener[prefix+axis]=parameter();
 Object.assign(audio,{destination:node('destination'),createPeriodicWave:(real,imag)=>({real,imag}),createGain:()=>Object.assign(node('gain'),{gain:parameter()}),createOscillator:()=>Object.assign(source('oscillator'),{frequency:parameter(),detune:parameter(),setPeriodicWave(wave){this.wave=wave;}}),createBufferSource:()=>source('buffer'),createPanner:()=>Object.assign(node('panner'),{positionX:parameter(),positionY:parameter(),positionZ:parameter()}),createDynamicsCompressor:()=>Object.assign(node('compressor'),{threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter()}),resume:async()=>{audio.resumes++;audio.state='running';},close:()=>audio.closes++});
 audio.advance=seconds=>{audio.currentTime+=seconds;for(const item of sources)if(!item.finished&&item.stopAt!==undefined&&item.stopAt<=audio.currentTime)item.finish();};
 return audio;
}
function fixture(){
 const context=audioContext(),destination={id:'analyser'},state={context,preferences:{effectsVolume:100},settings:{musicVolume:35,effectsVolume:65,voiceVolume:75},position:{x:0,y:1.6,z:0},direction:{x:0,y:0,z:-1}};
 const engine=createFunhouseAudioEngine({getContext:()=>state.context,getPreferences:()=>state.preferences,getSettings:()=>state.settings,getPosition:()=>state.position,getCameraDirection:()=>state.direction,destination});
 return {context,state,engine,destination};
}

test('funhouse sounds require a gesture and reuse the game context without replaying old effects',async()=>{
 const f=fixture();assert.equal(f.engine.effect('honk',{key:'old'}),false);assert.equal(f.context.sources.length,0);f.context.state='interrupted';
 assert.equal(await f.engine.unlock(),true);assert.equal(f.context.resumes,1);assert.equal(f.context.sources.length,0,'unlock never replays an old horn');
 assert.equal(f.engine.effect('honk',{key:'fresh'}),true);assert.equal(f.context.sources.length,4);
 await f.engine.unlock();assert.equal(f.context.resumes,1,'an already running shared context is not resumed repeatedly');
 const compressor=f.context.all.find(node=>node.kind==='compressor');assert.ok(compressor.connections.includes(f.destination));
 assert.equal(f.context.all.filter(node=>node.kind==='compressor').length,1);
 f.engine.dispose();assert.equal(f.context.closes,0,'disposing carnival audio never closes the shared game context');
});

test('the original car tune schedules bounded future bars and skips missed playback instead of bursting on slow frames',async()=>{
 const f=fixture();f.engine.setMusic(true,{position:{x:0,y:1,z:0},rideId:'car-seat'});assert.equal(f.context.sources.length,0);
 await f.engine.unlock();assert.equal(f.engine.snapshot().musicActive,true);assert.equal(f.engine.snapshot().musicTitle,FUNHOUSE_MUSIC.title);
 assert.equal(f.engine.snapshot().counts.musicBars,1);assert.equal(f.context.sources.length,19);
 f.context.advance(1.3);f.engine.update();assert.equal(f.engine.snapshot().counts.musicBars,2);
 f.context.advance(20);const before=f.context.sources.length;f.engine.update();
 assert.equal(f.context.sources.length-before,19,'resuming a slow frame schedules only one current bar');
 assert.ok(f.context.sources.slice(before).every(node=>node.startedAt>=f.context.currentTime));
 f.engine.setMusic(false);f.context.advance(.1);f.engine.update();assert.equal(f.engine.snapshot().musicRequested,false);assert.equal(f.engine.snapshot().activeSources,0);assert.equal(f.engine.snapshot().outputs,0);
 f.engine.dispose();
});

test('one-shot effects are deduplicated, enveloped and bounded under repeated controller events',async()=>{
 const f=fixture();await f.engine.unlock();
 assert.equal(f.engine.effect('water-hit',{key:'splash'}),true);assert.equal(f.engine.effect('water-hit',{key:'splash'}),false);
 assert.equal(f.engine.effect('water-miss',{key:'miss'}),true);assert.equal(f.engine.snapshot().counts.effects,2);
 for(const gain of f.context.all.filter(node=>node.kind==='gain'))for(const [,value]of gain.gain.events)if(typeof value==='number')assert.ok(value>=0&&value<=1);
 assert.ok(f.context.sources.every(source=>source.stopAt>source.startedAt&&source.stopAt-source.startedAt<5));
 for(let index=0;index<200;index++)f.engine.effect('laugh',{key:'laugh-'+index});
 assert.ok(f.engine.snapshot().activeSources<=80);assert.ok(f.engine.snapshot().counts.peakSources<=80);
 f.context.advance(4);f.engine.update();assert.equal(f.engine.snapshot().activeSources,0);assert.equal(f.engine.snapshot().outputs,0);f.engine.dispose();
});

test('attraction effects use actual positional audio, listener orientation and the existing spatial switch',async()=>{
 const f=fixture();await f.engine.unlock();f.engine.effect('bell',{position:{x:14,y:1.6,z:0},range:28});
 const panner=f.context.all.find(node=>node.kind==='panner'),route=f.context.all.find(node=>node.kind==='gain'&&node.connections.includes(panner));
 assert.equal(panner.panningModel,'HRTF');assert.equal(panner.positionX.value,14);assert.equal(route.gain.value,.25);
 f.state.position={x:14,y:1.6,z:0};f.state.direction={x:1,y:0,z:0};f.engine.update();assert.equal(route.gain.value,1);assert.equal(f.context.listener.forwardX.value,1);
 f.state.preferences.spatialAudio=false;f.state.position={x:-40,y:1.6,z:0};f.engine.update();assert.equal(route.gain.value,1);assert.equal(panner.positionX.value,-40,'nonspatial audio remains centered on the listener');
 f.engine.dispose();
});

test('live global and carnival mutes silence their own categories and never override the master mute',async()=>{
 const f=fixture(),ended=[];await f.engine.unlock();f.engine.setMusic(true,{rideId:'car'});f.engine.effect('honk');f.engine.voice({duration:1},{key:'line',onEnded:reason=>ended.push(reason)});
 f.state.settings.musicMuted=true;f.engine.update();assert.equal(f.engine.snapshot().gains.music,0);assert.ok(f.engine.snapshot().activeVoices>0);
 f.state.preferences.dialogueMuted=true;f.engine.update();assert.equal(f.engine.snapshot().activeVoices,0);assert.deepEqual(ended,['muted']);
 f.state.preferences.masterMuted=true;f.engine.update();assert.equal(f.engine.snapshot().activeSources,0);assert.deepEqual(f.engine.snapshot().volumes,{music:0,effects:0,voice:0});
 f.state.settings.musicMuted=false;assert.equal(f.engine.effect('honk'),false);assert.equal(f.engine.voice({duration:1}),false);
 f.state.preferences={effectsMuted:true};f.engine.update();assert.equal(f.engine.snapshot().gains.music,0);assert.equal(f.engine.snapshot().gains.effects,0);assert.equal(f.engine.snapshot().gains.voice,.75);
 f.engine.dispose();
});

test('recorded clown voices duck the car tune and release speech ownership on completion, replacement and stop',async()=>{
 const f=fixture(),calls=[];await f.engine.unlock();f.engine.setMusic(true,{rideId:'car'});
 assert.equal(f.engine.voice({duration:.8},{key:'one',onStarted:()=>calls.push('start-one'),onEnded:reason=>calls.push('one:'+reason)}),true);
 assert.equal(f.engine.snapshot().ducked,true);assert.ok(Math.abs(f.engine.snapshot().gains.music-.35*.28)<1e-10);
 assert.equal(f.engine.voice({duration:.8},{key:'one'}),false,'the same speech does not interrupt itself');
 f.engine.voice({duration:.8},{key:'two',onStarted:()=>calls.push('start-two'),onEnded:reason=>calls.push('two:'+reason)});
 assert.deepEqual(calls,['start-one','one:replaced','start-two']);f.context.advance(1);f.engine.update();
 assert.equal(f.engine.snapshot().ducked,false);assert.equal(f.engine.snapshot().gains.music,.35);assert.equal(calls.at(-1),'two:ended');
 f.engine.effect('honk',{key:'shared-event'});assert.equal(f.engine.voice({duration:1},{key:'shared-event',onEnded:reason=>calls.push('three:'+reason)}),true,'voice and sound effects have independent event identities');
 f.engine.stopVoice();assert.equal(calls.at(-1),'three:stopped');f.engine.dispose();
});

test('scope reset, suspension, context replacement and disposal cancel all scoped sounds without leaks',async()=>{
 const f=fixture(),ended=[];await f.engine.unlock();f.engine.setMusic(true,{rideId:'car'});f.engine.voice({duration:2},{onEnded:reason=>ended.push(reason)});f.engine.effect('pop');
 f.engine.reset();assert.equal(f.engine.snapshot().activeSources,0);assert.equal(f.engine.snapshot().outputs,0);assert.equal(f.engine.snapshot().musicRequested,false);assert.equal(ended.length,1);
 f.context.advance(10);f.engine.update();assert.equal(f.engine.snapshot().activeSources,0,'reset leaves no deferred playback');
 f.engine.effect('wind');f.context.state='suspended';f.engine.update();assert.equal(f.engine.snapshot().activeSources,0);assert.equal(f.engine.effect('honk'),false);
 const replacement=audioContext();replacement.state='running';f.state.context=replacement;f.engine.update();assert.equal(f.engine.effect('honk'),true);assert.equal(replacement.sources.length,4);
 f.engine.dispose();assert.equal(f.engine.snapshot().activeSources,0);assert.equal(f.engine.snapshot().outputs,0);assert.equal(replacement.closes,0);assert.equal(f.engine.effect('honk'),false);assert.equal(await f.engine.unlock(),false);
});


test('instrument waves are distinct, cached and use a slow cello attack',async()=>{
 const f=fixture();await f.engine.unlock();f.engine.setMusic(true);
 const sources=f.context.sources;
 assert.equal(new Set(sources.map(n=>n.wave)).size,6);
 assert.ok(sources.every(n=>n.wave?.imag[1]===1));
 const celloGain=sources[1].connections[0];
 const attack=celloGain.gain.events.find(e=>e[0]==='linear');
 assert.ok(attack[2]-sources[1].startedAt>=.13);
 const bassWave=sources[0].wave;
 f.context.advance(1.3);f.engine.update();
 assert.equal(f.context.sources[19].wave,bassWave);
 f.engine.dispose();assert.equal(f.engine.snapshot().activeSources,0);
});
