import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeldGameInput} from '../public/js/held-game-input.js';

test('releasing held input clears all axes and callbacks before one neutral sample',()=>{
 const keys=new Set(['w','shift']),mobile=new Set(['jump']),axes={leftX:1,leftY:-1,rightX:.5,rightY:.6},tasks=[],samples=[];
 let heldVehicleAxis=1,resets=0;
 const resetters=new Set([()=>{resets++;}]);
 const input=createHeldGameInput({keys,mobile,axes,resetters,enqueue:task=>tasks.push(task),onInput:()=>samples.push({keys:[...keys],mobile:[...mobile],axes:{...axes},vehicle:heldVehicleAxis})});
 input.release();input.release();
 assert.equal(resets,2);assert.equal(tasks.length,1);assert.deepEqual([...keys],[]);assert.deepEqual([...mobile],[]);
 // A document listener mounted by a vehicle runs after the central listener.
 heldVehicleAxis=0;tasks.shift()();
 assert.deepEqual(samples,[{keys:[],mobile:[],axes:{leftX:0,leftY:0,rightX:0,rightY:0},vehicle:0}]);
 input.release();assert.equal(tasks.length,1,'a later release still sends a fresh neutral sample');
});

test('an old repeated key cannot restart input after release, and fresh presses still work',()=>{
 const keys=new Set(),input=createHeldGameInput({keys,mobile:new Set(),axes:{},enqueue:()=>{}});
 assert.equal(input.press({key:'W',repeat:false}),true);
 assert.equal(input.press({key:'w',repeat:true}),true);
 input.release();
 assert.equal(input.press({key:'w',repeat:true}),false);assert.equal(keys.size,0);
 assert.equal(input.press({key:'w',repeat:false}),true);assert.ok(keys.has('w'));
});
