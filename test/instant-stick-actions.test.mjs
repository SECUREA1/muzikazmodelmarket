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
function fixture(name){
 const handlers={},globalHandlers={},knob={style:{}},classes=new Set(),captured=new Set(),captures=[];
 const stick={querySelector:()=>knob,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)},addEventListener:(type,fn)=>handlers[type]=fn,hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
 const actions=[],axes={leftX:0,leftY:0,rightX:0,rightY:0};let ready=true,overlay=false,requests=0;
 const context={gameplayControlsReady:()=>ready,gameplayOverlayOpen:()=>overlay,document:{querySelector:()=>stick},window:{addEventListener:(type,fn)=>globalHandlers[type]=fn},THREE:{MathUtils:{clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}},thumbInput:axes,thumbstickResetters:new Set(),walkingStick,isAircraft,isWatercraft,isRoadVehicle,flightStickAxes,serverActors:{},serverVehicleId:null,authoritativeClient:{requestInput:()=>requests++},safelyCapturePointer(_stick,id){captures.push(id);captured.add(id);},safelyInteract:(_,fn)=>fn(),shootAtReticle:()=>actions.push('shoot'),jump:()=>actions.push('jump')};
 vm.runInNewContext(setup+`;setupThumbstick('${name}');`,context);
 const event=(id=1,x=50,y=50)=>({pointerId:id,isPrimary:true,button:0,clientX:x,clientY:y,preventDefault(){}});
 return {handlers,globalHandlers,knob,classes,captures,axes,actions,event,get requests(){return requests;},setReady:value=>{ready=value;},setOverlay:value=>{overlay=value;}};
}

test('movement and look presses only steer; release and cancellation permit the next gesture',()=>{
 for(const name of ['left','right'])for(const end of ['pointerup','pointercancel','lostpointercapture']){
  const f=fixture(name),press=f.event(1,50,22);
  f.handlers.pointerdown(press);assert.ok(f.axes[`${name}Y`]<-.8);assert.deepEqual(f.actions,[],'A movement press must not shoot, jump or dispatch a world interaction.');
  f.handlers.pointermove(f.event(1,75,35));assert.ok(f.axes[`${name}X`]>0);assert.deepEqual(f.actions,[]);
  f.handlers[end]({...press,type:end});assert.equal(f.axes[`${name}X`],0);assert.equal(f.axes[`${name}Y`],0);assert.equal(f.classes.has('is-active'),false);
  f.handlers.pointerdown(f.event(2,24,50));assert.ok(f.axes[`${name}X`]<-.8,'A fresh gesture still moves after release or cancellation.');assert.deepEqual(f.actions,[]);
 }
});

test('center presses remain neutral and do not activate a nearby item or attraction',()=>{
 for(const name of ['left','right']){
  const f=fixture(name);f.handlers.pointerdown(f.event());assert.equal(f.axes[`${name}X`],0);assert.equal(f.axes[`${name}Y`],0);assert.deepEqual(f.actions,[]);
  f.handlers.pointerup({...f.event(),type:'pointerup'});assert.deepEqual(f.actions,[]);
 }
});

test('login readiness and open modal dialogs reject movement before pointer capture',()=>{
 for(const name of ['left','right']){
  const f=fixture(name);f.setReady(false);f.handlers.pointerdown(f.event(1,50,22));assert.deepEqual(f.captures,[]);assert.equal(f.axes[`${name}Y`],0);
  f.setReady(true);f.setOverlay(true);f.handlers.pointerdown(f.event(2,50,22));assert.deepEqual(f.captures,[]);assert.equal(f.axes[`${name}Y`],0);assert.deepEqual(f.actions,[]);
  f.setOverlay(false);f.handlers.pointerdown(f.event(3,50,22));assert.deepEqual(f.captures,[3]);assert.ok(f.axes[`${name}Y`]<-.8);
 }
});

test('opening a modal during a drag releases steering and a fresh press works after closing it',()=>{
 for(const name of ['left','right']){
  const f=fixture(name);f.handlers.pointerdown(f.event(1,75,50));assert.ok(f.axes[`${name}X`]>0);
  f.setOverlay(true);f.handlers.pointermove(f.event(1,80,50));assert.equal(f.axes[`${name}X`],0);assert.equal(f.classes.has('is-active'),false);
  f.setOverlay(false);f.handlers.pointerdown(f.event(2,22,50));assert.ok(f.axes[`${name}X`]<-.8);assert.deepEqual(f.actions,[]);
 }
});

test('a release over another control clears the held pointer and preserves future movement',()=>{
 for(const name of ['left','right']){
  const f=fixture(name);f.handlers.pointerdown(f.event(1,75,50));assert.ok(f.axes[`${name}X`]>0);
  f.globalHandlers.pointerup({...f.event(1,75,50),type:'pointerup',target:{}});assert.equal(f.axes[`${name}X`],0);
  f.handlers.pointerdown(f.event(2,50,22));assert.ok(f.axes[`${name}Y`]<-.8);assert.deepEqual(f.actions,[]);
 }
});

test('a fresh primary pointer recovers steering when a browser lost the prior release',()=>{
 const f=fixture('left');f.handlers.pointerdown(f.event(1,75,50));f.handlers.pointerdown(f.event(2,50,22));
 assert.ok(f.axes.leftY<-.8);assert.equal(f.axes.leftX,0);assert.deepEqual(f.captures,[1,2]);assert.deepEqual(f.actions,[]);
});
