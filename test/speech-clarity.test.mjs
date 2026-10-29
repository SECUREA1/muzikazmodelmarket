import test from 'node:test';
import assert from 'node:assert/strict';
import {speechClarityGain} from '../public/js/speech-clarity.js';
function buffer(amplitude,{silence=0,spike=false}={}){
 const samples=new Float32Array(24000*(1+silence));
 for(let i=0;i<24000;i++)samples[i]=amplitude*Math.sin(2*Math.PI*240*i/24000);
 if(spike)samples[100]=.95;
 return {numberOfChannels:1,sampleRate:24000,getChannelData:()=>samples};
}
test('male and female speech levels converge without changing their samples',()=>{
 for(const amplitude of [.04,.16,.5]){
  const clip=buffer(amplitude),before=clip.getChannelData().slice(),gain=speechClarityGain(clip);
  assert.ok(Math.abs(amplitude/Math.sqrt(2)*gain-.1)<.0001);
  assert.deepEqual(clip.getChannelData(),before);
 }
});
test('pauses do not inflate gain and consonant peaks keep headroom',()=>{
 assert.ok(Math.abs(speechClarityGain(buffer(.08))-speechClarityGain(buffer(.08,{silence:4})))<.0001);
 const clip=buffer(.04,{spike:true});assert.ok(speechClarityGain(clip)*.95<=.891);
 assert.ok(speechClarityGain(buffer(.02))<=4);
});
test('silent or unavailable audio is never amplified',()=>{
 assert.equal(speechClarityGain(buffer(0)),1);assert.equal(speechClarityGain({}),1);
});
