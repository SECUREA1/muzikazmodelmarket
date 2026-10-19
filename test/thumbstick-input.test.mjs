import test from 'node:test';
import assert from 'node:assert/strict';
import {thumbstickAxes,mountThumbstick} from '../public/js/thumbstick-input.js';
const rect={left:20,top:100,width:200,height:120};
function target(){const handlers=new Map();return {handlers,addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);},emit(type,fields={}){handlers.get(type)?.({type,pointerId:1,button:0,clientX:120,clientY:160,preventDefault(){},...fields});}};}
function fixture(options={}){const stick=target(),windowTarget=target(),knob={style:{}},values=[];let taps=0,enabled=true,captured=null;stick.classList={add(){},remove(){}};stick.getBoundingClientRect=()=>rect;stick.hasPointerCapture=id=>captured===id;stick.releasePointerCapture=()=>{captured=null;};const controller=mountThumbstick({stick,knob,windowTarget,capture:(_,id)=>{captured=id;},onChange:value=>values.push(value),onTap:()=>taps++,canUse:()=>enabled,...options});return {stick,windowTarget,knob,values,controller,get taps(){return taps;},disable(){enabled=false;}};}
test('both sticks respond immediately from the visible center with no added movement dead zone',()=>{
 const left=fixture(),right=fixture();for(const side of [left,right])side.stick.emit('pointerdown',{clientX:125});
 assert.deepEqual(left.values,right.values);assert.ok(left.values[0].x>0);assert.equal(left.values[0].y,0);
 left.stick.emit('pointermove',{clientX:140});right.stick.emit('pointermove',{clientX:140});assert.deepEqual(left.values,right.values);
});
test('radial clamping preserves direction and diagonal magnitude never exceeds one',()=>{
 const small=thumbstickAxes(rect,121,160);assert.ok(small.x>0);for(const [x,y]of [[500,500],[-300,500],[180,160]]){const axes=thumbstickAxes(rect,x,y);assert.ok(Math.hypot(axes.x,axes.y)<=1.0000001);}
 assert.deepEqual(thumbstickAxes({...rect,width:0},0,0),{x:0,y:0,offsetX:0,offsetY:0});
});
test('release, cancellation, lost capture and blur stop immediately without accidental tap actions',()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture','blur']){const f=fixture();f.stick.emit('pointerdown');f.stick.emit('pointermove',{clientX:170});(type==='blur'?f.windowTarget:f.stick).emit(type);assert.equal(f.values.at(-1).x,0);assert.equal(f.knob.style.transform,'translate(0, 0)');assert.equal(f.taps,0);}
 const tap=fixture();tap.stick.emit('pointerdown');tap.stick.emit('pointerup');assert.equal(tap.taps,1);
});
test('two sticks track their own fingers and menus cancel held input',()=>{
 const a=fixture(),b=fixture();a.stick.emit('pointerdown',{pointerId:1,clientX:150});b.stick.emit('pointerdown',{pointerId:2,clientX:100});a.stick.emit('pointerup',{pointerId:2});assert.ok(a.values.at(-1).x>0);a.disable();a.stick.emit('pointermove',{pointerId:1});assert.equal(a.values.at(-1).x,0);assert.ok(b.values.at(-1).x<0);a.controller.dispose();assert.equal(a.stick.handlers.size,0);
});


test('a directional press moves on pointerdown and never becomes a shot on release',()=>{
 for(const offset of [5,20,-20]){const f=fixture();f.stick.emit('pointerdown',{clientX:120+offset});assert.notEqual(f.values[0].x,0);f.stick.emit('pointerup',{clientX:120+offset});assert.equal(f.taps,0);assert.equal(f.values.at(-1).x,0);}
 const short=fixture();short.stick.emit('pointerdown');short.stick.emit('pointermove',{clientX:124});short.stick.emit('pointermove');short.stick.emit('pointerup');assert.equal(short.taps,0,'returning to centre does not turn a drag into a shot');
 const missingMove=fixture();missingMove.stick.emit('pointerdown');missingMove.stick.emit('pointerup',{clientX:140});assert.equal(missingMove.taps,0,'final release position also detects a drag');
});
test('the optional small dead zone is continuous and preserves fine movement and full travel',()=>{
 const circular={left:0,top:0,width:100,height:100};assert.equal(thumbstickAxes(circular,51,50,{deadzone:.04}).x,0);
 const fine=thumbstickAxes(circular,52,50,{deadzone:.04}).x;assert.ok(fine>0&&fine<.04);
 assert.equal(thumbstickAxes(circular,79,50,{deadzone:.04}).x,1);assert.equal(thumbstickAxes(circular,50,21,{deadzone:.04}).y,-1);
});
test('inactive controls and secondary pointers cannot displace or fire an owned stick',()=>{
 const f=fixture();f.stick.emit('pointerdown',{pointerId:1,clientX:140});const owned=f.values.at(-1);f.stick.emit('pointerdown',{pointerId:2,clientX:80});f.stick.emit('pointermove',{pointerId:2,clientX:80});f.stick.emit('pointerup',{pointerId:2,clientX:80});assert.equal(f.values.at(-1),owned);
 f.disable();f.stick.emit('pointerup',{pointerId:1,clientX:140});assert.equal(f.values.at(-1).x,0);assert.equal(f.taps,0);f.stick.emit('pointerdown');assert.equal(f.values.at(-1).x,0);
});
test('visibility loss resets input without firing and capture failures do not discard movement',()=>{
 const documentTarget=target();documentTarget.hidden=false;const f=fixture({documentTarget,capture(){throw Error('capture unavailable');}});
 f.stick.emit('pointerdown',{clientX:140});assert.ok(f.values.at(-1).x>0);documentTarget.hidden=true;documentTarget.emit('visibilitychange');assert.equal(f.values.at(-1).x,0);assert.equal(f.taps,0);f.controller.dispose();assert.equal(documentTarget.handlers.size,0);
});
