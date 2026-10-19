import test from 'node:test';
import assert from 'node:assert/strict';
import {stickAxes,radToxStickMarkup,runControllerAction} from '../public/js/rad-tox-controller.js';
test('shared RAD-TOX axes keep taps neutral, clamp diagonals, and reject invalid geometry',()=>{assert.deepEqual(stickAxes(5,5,30),{x:0,y:0});assert.deepEqual(stickAxes(0,0,0),{x:0,y:0});assert.deepEqual(stickAxes(NaN,2,30),{x:0,y:0});const diagonal=stickAxes(50,-50,30);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);assert.ok(diagonal.x>0&&diagonal.y<0);assert.deepEqual(stickAxes(15,0,30),{x:.5,y:0});});
test('firing range and sports use the same two accessible stick assemblies',()=>{for(const options of [{},{rightTap:'jump'}]){const markup=radToxStickMarkup(options);assert.equal((markup.match(/class="thumbstick-base"/g)||[]).length,2);assert.match(markup,/data-thumbstick="left"/);assert.match(markup,/data-thumbstick="right"/);assert.match(markup,/aria-label="Right thumbstick/);}});

test('menu actions close the dialog before applying gameplay and release held input',()=>{
 const events=[],menu={close:()=>events.push('close')};let finish;
 runControllerAction(menu,{hold:pressed=>events.push(pressed)},{schedule:callback=>{finish=callback;return 1;}});
 assert.deepEqual(events,['close',true]);finish();assert.deepEqual(events,['close',true,false]);
});
test('menu action cancellation clears the timer and releases input',()=>{
 const events=[];const release=runControllerAction({close:()=>{}},{hold:value=>events.push(value)},{schedule:()=>7,cancel:id=>events.push(id)});
 release();assert.deepEqual(events,[true,7,false]);
});
test('tap actions run after the menu closes without requiring pointer events',()=>{
 const events=[];runControllerAction({close:()=>events.push('closed')},{tap:()=>events.push('shot')});
 assert.deepEqual(events,['closed','shot']);
});
test('a completed hold is released once even when the controller subsequently resets',()=>{
 const events=[];let finish;
 const release=runControllerAction({close(){}},{hold:value=>events.push(value)},{schedule:callback=>{finish=callback;return 7;},cancel(){}});
 finish();release();release();assert.deepEqual(events,[true,false]);
});
