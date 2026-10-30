import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalkieSpeechOutput} from '../public/js/walkie-speech-output.js';

function fixture(){
 const filters=[],gains=[],oscillators=[],destination={name:'speakers'};
 const node=()=>({targets:[],disconnected:0,connect(target){this.targets.push(target);},disconnect(){this.disconnected++;}});
 const context={currentTime:3,destination,createBiquadFilter(){const value={...node(),type:null,frequency:{value:0},Q:{value:0}};filters.push(value);return value;},createGain(){const changes=[];const value={...node(),gain:{setValueAtTime:(value,at)=>changes.push([value,at]),linearRampToValueAtTime:(value,at)=>changes.push([value,at])},changes};gains.push(value);return value;},createOscillator(){const value={...node(),frequency:{value:0},starts:[],stops:[],start(at){this.starts.push(at);},stop(at){this.stops.push(at);}};oscillators.push(value);return value;}};
 return {context,filters,gains,oscillators,destination};
}
test('walkie speech preserves a broad clear band and adds one quiet bounded transmission chirp',()=>{
 const f=fixture(),output=createWalkieSpeechOutput(f.context,{volume:.8});
 assert.equal(output.input,f.filters[0]);assert.equal(f.filters[0].type,'highpass');assert.equal(f.filters[0].frequency.value,180);
 assert.equal(f.filters[1].type,'lowpass');assert.equal(f.filters[1].frequency.value,4400);
 assert.equal(f.filters[0].targets[0],f.filters[1]);assert.equal(f.filters[1].targets[0],f.destination);
 output.cue();assert.equal(f.oscillators.length,1);assert.equal(f.oscillators[0].frequency.value,1250);assert.equal(f.oscillators[0].starts[0],3);
 assert.ok(f.oscillators[0].stops[0]-f.oscillators[0].starts[0]<=.051);assert.ok(Math.abs(f.gains[0].changes[1][0]-.02)<.0001);
 f.oscillators[0].onended();assert.equal(f.oscillators[0].disconnected,1);output.dispose();assert.equal(f.filters[0].disconnected,1);
 output.cue();assert.equal(f.oscillators.length,1,'disposal prevents later transmission sounds');
});
test('cancelling releases the radio graph and current chirp without touching the shared context',()=>{
 const f=fixture(),output=createWalkieSpeechOutput(f.context);output.cue();output.dispose();output.dispose();
 assert.equal(f.filters[0].disconnected,1);assert.equal(f.filters[1].disconnected,1);assert.equal(f.oscillators[0].onended,null);assert.equal(f.oscillators[0].disconnected,1);assert.equal(f.gains[0].disconnected,1);
});
test('a device without optional radio filters still plays the clear speech path',()=>{
 const f=fixture();delete f.context.createBiquadFilter;const output=createWalkieSpeechOutput(f.context);assert.equal(output.input,f.destination);output.cue();output.dispose();
});
