import test from 'node:test';
import assert from 'node:assert/strict';
import {stickAxes,radToxStickMarkup,mountRadToxController} from '../public/js/rad-tox-controller.js';
test('shared RAD-TOX axes keep taps neutral, clamp diagonals, and reject invalid geometry',()=>{assert.deepEqual(stickAxes(5,5,30),{x:0,y:0});assert.deepEqual(stickAxes(0,0,0),{x:0,y:0});assert.deepEqual(stickAxes(NaN,2,30),{x:0,y:0});const diagonal=stickAxes(50,-50,30);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);assert.ok(diagonal.x>0&&diagonal.y<0);assert.deepEqual(stickAxes(15,0,30),{x:.5,y:0});});
test('firing range and sports use the same two accessible stick assemblies',()=>{for(const options of [{},{rightTap:'jump'}]){const markup=radToxStickMarkup(options);assert.equal((markup.match(/class="thumbstick-base"/g)||[]).length,2);assert.match(markup,/data-thumbstick="left"/);assert.match(markup,/data-thumbstick="right"/);assert.match(markup,/aria-label="Right thumbstick/);}});

function controllerFixture(t){
 class Element{
  constructor(){this.handlers=new Map();this.style={};this.dataset={};this.classList={add(){},remove(){}};this.isConnected=true;this.open=false;this.captured=null;}
  addEventListener(type,handler,options){const entries=this.handlers.get(type)||[];entries.push({handler,capture:options===true||options?.capture===true});this.handlers.set(type,entries);}
  removeEventListener(type,handler){this.handlers.set(type,(this.handlers.get(type)||[]).filter(entry=>entry.handler!==handler));}
  emit(type,event,phase){for(const entry of this.handlers.get(type)||[])if(phase===undefined||entry.capture===phase)entry.handler(event);if(phase!==true)this['on'+type]?.(event);}
  setAttribute(){} append(){} before(){} showModal(){this.open=true;} close(){this.open=false;}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
  setPointerCapture(id){this.captured=id;} hasPointerCapture(id){return this.captured===id;}
  releasePointerCapture(id){if(this.captured!==id)return;this.captured=null;this.emit('lostpointercapture',{type:'lostpointercapture',pointerId:id});}
 }
 const left=new Element(),right=new Element();left.firstElementChild=new Element();right.firstElementChild=new Element();
 const root=new Element(),menu=new Element(),toolbar=new Element(),actions=new Element(),close=new Element();
 const nodes=new Map([['[data-thumbstick="left"] .thumbstick-base',left],['[data-thumbstick="right"] .thumbstick-base',right],['.rad-controller-menu',menu],['[data-close-actions]',close],['.rad-controller-toolbar',toolbar],['.rad-controller-actions',actions]]);
 root.querySelector=selector=>nodes.get(selector);
 const windowTarget=new Element(),documentTarget=new Element(),frames=[];
 documentTarget.body=new Element();documentTarget.head=new Element();documentTarget.hidden=false;documentTarget.querySelector=()=>null;documentTarget.createElement=tag=>tag==='section'?root:new Element();
 const previous={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
 Object.assign(globalThis,{document:documentTarget,window:windowTarget,requestAnimationFrame:callback=>frames.push(callback)});
 t.after(()=>Object.assign(globalThis,previous));
 let enabled=true,movement={x:0,y:0},look={x:0,y:0},shots=0,views=0,now=performance.now();
 const controller=mountRadToxController({enabled:()=>enabled,onMove:axis=>{movement={...axis};},onLook:axis=>{look={...axis};},onShoot:()=>shots++,onView:()=>views++});
 const send=(target,type,fields={})=>{const event={type,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:100,preventDefault(){},...fields};windowTarget.emit(type,event,true);target?.emit(type,event);windowTarget.emit(type,event,false);};
 const frame=()=>{now+=16;frames.shift()?.(now);};
 return {controller,left,right,windowTarget,documentTarget,send,frame,get movement(){return movement;},get look(){return look;},get shots(){return shots;},get views(){return views;},disable(){enabled=false;}};
}
test('sports sticks recover a missed terminal event on a fresh primary gesture while visible',t=>{
 const f=controllerFixture(t);f.send(f.left,'pointerdown');f.send(f.left,'pointermove',{clientX:150});f.frame();assert.ok(f.movement.x>.5);
 // No pointerup, cancellation, lost capture, blur, or visibility change arrives.
 f.send(f.left,'pointerdown',{pointerId:3});f.send(f.left,'pointermove',{pointerId:3,clientX:50});f.frame();
 assert.ok(f.movement.x<-.5,'the new finger must acquire the stick instead of retaining stale rightward input');
 assert.equal(f.shots,2);f.send(f.left,'pointerup',{pointerId:3});assert.deepEqual(f.movement,{x:0,y:0});
});
test('fresh primary gestures clear both stale sticks while concurrent fingers remain independent',t=>{
 const f=controllerFixture(t);f.send(f.left,'pointerdown');f.send(f.left,'pointermove',{clientX:150});
 f.send(f.right,'pointerdown',{pointerId:2,isPrimary:false,clientX:150});f.frame();assert.ok(f.movement.x>.5);assert.ok(f.look.x>.5);
 f.send(null,'pointerup',{pointerId:2,isPrimary:false});f.frame();assert.ok(f.movement.x>.5);assert.deepEqual(f.look,{x:0,y:0});
 f.send(f.right,'pointerdown',{pointerId:4,clientX:150});f.frame();assert.deepEqual(f.movement,{x:0,y:0});assert.ok(f.look.x>.5);
 f.send(f.left,'pointerdown',{pointerId:5,isPrimary:false});f.send(f.left,'pointermove',{pointerId:5,isPrimary:false,clientX:50});f.frame();assert.ok(f.movement.x<-.5);assert.ok(f.look.x>.5);
});
test('sports controller terminal capture and suspension reset without accidental view actions',t=>{
 const f=controllerFixture(t);
 for(const type of ['pointerup','pointercancel']){f.send(f.left,'pointerdown');f.send(f.left,'pointermove',{clientX:150});f.frame();f.send(null,type);assert.deepEqual(f.movement,{x:0,y:0});}
 for(const type of ['pagehide','blur']){f.send(f.right,'pointerdown');f.send(f.left,'pointerdown',{pointerId:2,isPrimary:false});f.send(f.left,'pointermove',{pointerId:2,isPrimary:false,clientX:150});f.frame();f.windowTarget.emit(type,{type});f.frame();assert.deepEqual(f.movement,{x:0,y:0});assert.deepEqual(f.look,{x:0,y:0});assert.equal(f.views,0);}
 f.send(f.right,'pointerdown');f.send(f.right,'pointerup');assert.equal(f.views,1,'normal right-stick taps still change view exactly once');
 f.send(f.left,'pointerdown');f.send(f.left,'pointermove',{clientX:150});f.frame();f.documentTarget.hidden=true;f.documentTarget.emit('visibilitychange',{type:'visibilitychange'});assert.deepEqual(f.movement,{x:0,y:0});
 f.documentTarget.hidden=false;f.send(f.left,'pointerdown');f.send(f.left,'pointermove',{clientX:150});f.frame();assert.ok(f.movement.x>.5);f.disable();f.frame();assert.deepEqual(f.movement,{x:0,y:0});
});

test('an off-center sports walking press moves immediately, including a second finger while looking',t=>{
 const f=controllerFixture(t);f.send(f.left,'pointerdown',{clientX:100,clientY:60});f.frame();assert.ok(f.movement.y<-.5);f.send(f.left,'pointerup');
 f.send(f.right,'pointerdown',{pointerId:3,clientX:130});f.send(f.left,'pointerdown',{pointerId:4,isPrimary:false,clientX:60,clientY:100});f.frame();assert.ok(f.movement.x<-.5);assert.ok(f.look.x>.1);
 f.send(null,'pointercancel',{pointerId:4,isPrimary:false});f.frame();assert.deepEqual(f.movement,{x:0,y:0});assert.ok(f.look.x>.1);
});

test('small sports walking adjustments use a proportional dead zone rather than eight fixed pixels',t=>{
 const f=controllerFixture(t);f.send(f.left,'pointerdown',{clientX:106,clientY:100});f.frame();assert.ok(f.movement.x>.05);f.send(f.left,'pointerup');assert.deepEqual(f.movement,{x:0,y:0});
});
