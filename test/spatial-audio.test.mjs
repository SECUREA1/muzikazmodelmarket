import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpatialEffectOutput,updateAudioListener} from '../public/js/shared-effect-audio.js';

function parameter(){return {value:0,setValueAtTime(value){this.value=value;}};}
function node(){return {connections:[],disconnects:0,connect(target){this.connections.push(target);},disconnect(){this.disconnects++;}};}
function context({panner=true}={}){
 const result={currentTime:2,destination:node(),listener:{}};
 for(const prefix of ['position','forward','up'])for(const axis of ['X','Y','Z'])result.listener[prefix+axis]=parameter();
 result.createGain=()=>({...node(),gain:parameter()});
 if(panner)result.createPanner=()=>({...node(),positionX:parameter(),positionY:parameter(),positionZ:parameter()});
 return result;
}
const origin={x:0,y:0,z:0};

test('spatial routing uses HRTF direction and bounded distance falloff, following listener motion',()=>{
 const audio=context(),output=createSpatialEffectOutput(audio,{range:40}),source={x:20,y:0,z:0};
 assert.equal(output.panner.panningModel,'HRTF');assert.equal(output.panner.rolloffFactor,0,'distance is applied once');
 assert.equal(output.input.connections[0],output.panner);assert.equal(output.panner.connections[0],audio.destination);
 output.update({source,listener:origin,direction:{x:1,y:0,z:0}});
 assert.equal(output.input.gain.value,.25);assert.equal(output.panner.positionX.value,20);assert.equal(audio.listener.forwardX.value,1);
 output.update({source,listener:{x:10,y:0,z:0},direction:{x:-1,y:0,z:0}});
 assert.equal(output.input.gain.value,.5625);assert.equal(audio.listener.positionX.value,10);assert.equal(audio.listener.forwardX.value,-1);
 output.update({source,listener:{x:-20,y:0,z:0}});assert.equal(output.input.gain.value,0);
 output.update({source,listener:origin,spatial:false,volume:.7});assert.equal(output.input.gain.value,.7);assert.equal(output.panner.positionX.value,0);
 output.update({source,listener:origin,volume:0});assert.equal(output.input.gain.value,0,'mute affects an existing output immediately');
 output.dispose();output.dispose();assert.equal(output.input.disconnects,1);assert.equal(output.panner.disconnects,1);
});

test('distance audio remains available without panners and legacy listener setters are supported',()=>{
 const audio=context({panner:false}),output=createSpatialEffectOutput(audio,{range:40});
 output.update({source:{x:20,y:0,z:0},listener:origin});assert.equal(output.input.gain.value,.25);assert.equal(output.input.connections[0],audio.destination);
 const legacy={currentTime:0,listener:{setPosition(...values){this.position=values;},setOrientation(...values){this.orientation=values;}}};
 updateAudioListener(legacy,{x:2,y:3,z:4},{x:1,y:0,z:0});assert.deepEqual(legacy.listener.position,[2,3,4]);assert.deepEqual(legacy.listener.orientation,[1,0,0,0,1,0]);
 updateAudioListener(legacy,{x:NaN,y:3,z:4});assert.deepEqual(legacy.listener.position,[2,3,4]);
 output.dispose();
});
