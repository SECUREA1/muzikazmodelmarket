import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNeuralVoice,neuralVoiceStatus,shutdownNeuralVoiceEngine} from '../server-neural-voice-engine.mjs';
import {ensureVoiceRuntime} from '../server-voice-runtime.mjs';

test('local voice validation rejects invalid work before starting inference',async()=>{
 for(const input of [{text:''},{text:'x'.repeat(1201)},{text:'Hello.',voice:'unknown'},{text:'Hello.',speed:2}]){
  await assert.rejects(generateNeuralVoice(input),error=>/^SPEECH_(TEXT|VOICE|SPEED)_INVALID$/.test(error.code));
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(generateNeuralVoice({text:'Hello.',signal:controller.signal}),error=>error.name==='AbortError');
 const status=neuralVoiceStatus();assert.equal(typeof status.available,'boolean');assert.equal(typeof status.modelReady,'boolean');assert.equal(typeof status.status,'string');
 await shutdownNeuralVoiceEngine();
});

test('real local neural voices produce distinct playable WAV audio and recover after cancellation',{skip:process.env.MUZIKAZ_TEST_NEURAL_VOICES!=='1',timeout:120000},async t=>{
 await ensureVoiceRuntime();
 assert.equal(neuralVoiceStatus().available,true,'Install the local model before enabling this integration check.');
 t.after(shutdownNeuralVoiceEngine);
 const controller=new AbortController(),cancelled=generateNeuralVoice({text:'Please cancel this request before it is spoken.',signal:controller.signal});
 controller.abort();await assert.rejects(cancelled,error=>error.name==='AbortError');
 const female=await generateNeuralVoice({text:'Hello. Welcome to the world.',voice:'female'});
 const male=await generateNeuralVoice({text:'Hello. Welcome to the world.',voice:'male'});
 for(const audio of [female,male]){
  assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.toString('ascii',8,12),'WAVE');assert.equal(audio.readUInt32LE(24),24000);assert.equal(audio.readUInt16LE(22),1);
  assert.ok(audio.length>48044);assert.ok(audio.length<24000*2*20);
  let peak=0;for(let at=44;at<audio.length;at+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(at)));
  assert.ok(peak>1000&&peak<32767,'Speech is audible without clipped samples.');
 }
 assert.equal(female.equals(male),false,'Male and female use separate neural speaker styles.');
});
