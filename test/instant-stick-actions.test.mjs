import {isWatercraft} from '../public/js/harbor-water.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {isRoadVehicle} from '../public/js/road-vehicles.js';
import {flightStickAxes} from '../public/js/aircraft-input.js';
import {walkingStick} from '../public/js/walking-motion.js';
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('  function setupThumbstick('),source.indexOf("  setupThumbstick('left')"));
test('shoot and jump run on press once, with dragging and cancellation resetting axes',()=>{
 for(const name of ['left','right'])for(const end of ['pointerup','pointercancel','lostpointercapture']){
  const handlers={},knob={style:{}},stick={querySelector:()=>knob,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),classList:{add(){},remove(){}},addEventListener:(type,fn)=>handlers[type]=fn};
  let shots=0,jumps=0;const axes={leftX:0,leftY:0,rightX:0,rightY:0};
  const context={gameplayControlsReady:()=>true,document:{querySelector:()=>stick},window:{addEventListener(){}},THREE:{MathUtils:{clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}},thumbInput:axes,thumbstickResetters:new Set(),walkingStick,isAircraft,isWatercraft,isRoadVehicle,flightStickAxes,serverActors:{},serverVehicleId:null,authoritativeClient:null,safelyCapturePointer(){},safelyInteract:(_,fn)=>fn(),shootAtReticle:()=>shots++,jump:()=>jumps++};
  vm.runInNewContext(setup+`;setupThumbstick('${name}');`,context);
  const event={pointerId:1,button:0,clientX:50,clientY:50,preventDefault(){}};
  handlers.pointerdown(event);assert.equal(shots,name==='left'?1:0);assert.equal(jumps,name==='right'?1:0);
  handlers.pointerdown(event);assert.equal(shots+jumps,1);
  handlers.pointermove({...event,clientX:70});assert.ok(axes[`${name}X`]>0);
  handlers[end]({...event,type:end});assert.equal(shots+jumps,1);assert.equal(axes[`${name}X`],0);assert.equal(axes[`${name}Y`],0);
 }
});
