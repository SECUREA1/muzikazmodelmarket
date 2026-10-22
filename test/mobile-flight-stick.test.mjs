import {isWatercraft} from '../public/js/harbor-water.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {isRoadVehicle} from '../public/js/road-vehicles.js';
import {flightStickAxes} from '../public/js/aircraft-input.js';
test('flight sticks steer and look independently without firing or jumping on touch, then restore walking actions',()=>{
 const nodes={};for(const name of ['left','right'])nodes[name]={handlers:{},knob:{style:{}},querySelector(){return this.knob;},getBoundingClientRect:()=>({width:120,height:120,left:0,top:0}),classList:{add(){},remove(){}},addEventListener(type,fn){this.handlers[type]=fn;}};
 let shots=0,jumps=0,requests=0;const axes={leftX:0,leftY:0,rightX:0,rightY:0};const context=vm.createContext({THREE,isAircraft,isWatercraft,isRoadVehicle,flightStickAxes,thumbInput:axes,thumbstickResetters:new Set(),serverVehicleId:'plane',serverActors:{plane:{modelId:'corsair-aircraft'}},authoritativeClient:{requestInput:()=>requests++},document:{querySelector:selector=>selector.includes('left')?nodes.left:nodes.right},window:{addEventListener(){}},walkingStick:(x,y)=>({x,y}),safelyCapturePointer(){},safelyInteract:(_,action)=>action(),shootAtReticle:()=>shots++,jump:()=>jumps++});
 const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8'),start=source.indexOf('  function setupThumbstick(name)');vm.runInContext(source.slice(start,source.indexOf("  setupThumbstick('left')",start)),context);context.setupThumbstick('left');context.setupThumbstick('right');
 const event=(id,x=60,y=60)=>({pointerId:id,button:0,clientX:x,clientY:y,preventDefault(){}});nodes.left.handlers.pointerdown(event(1));nodes.right.handlers.pointerdown(event(2));assert.equal(shots,0);assert.equal(jumps,0);nodes.left.handlers.pointermove(event(1,85,35));nodes.right.handlers.pointermove(event(2,75,55));assert.ok(axes.leftX>0&&axes.leftY<0);assert.ok(axes.rightX>0&&axes.rightY<0);nodes.left.handlers.pointerup(event(1));assert.equal(axes.leftX,0);assert.ok(axes.rightX>0,'releasing flight stick leaves independent look touch active');nodes.right.handlers.pointercancel(event(2));assert.equal(axes.rightX,0);assert.ok(requests>0);
 context.serverVehicleId=null;nodes.left.handlers.pointerdown(event(3));nodes.right.handlers.pointerdown(event(4));assert.equal(shots,1);assert.equal(jumps,1);
});
