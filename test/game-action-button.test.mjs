import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGameActionButton} from '../public/js/game-action-button.js';
function fixture(){const listeners=new Map(),documentTarget=new EventTarget();let actions=0;const button={ownerDocument:documentTarget,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)},dispose=bindGameActionButton(button,()=>actions++);return {listeners,dispose,release:()=>documentTarget.dispatchEvent(new Event('muzikaz:release-game-input')),get actions(){return actions;},emit(type,fields={}){const event={type,pointerType:'touch',pointerId:1,clientX:40,clientY:40,detail:1,preventDefault(){},stopPropagation(){},...fields};listeners.get(type)?.(event);}};}
test('boarding fires once when a delayed touch click arrives after the visible action changes to exit',()=>{
 const f=fixture();f.emit('pointerdown');f.emit('pointerup');assert.equal(f.actions,1);f.emit('click');assert.equal(f.actions,1);f.emit('click');assert.equal(f.actions,1);
 f.emit('pointerdown',{pointerId:2});f.emit('pointerup',{pointerId:2});assert.equal(f.actions,2,'a new real tap still works');
});
test('dragging, cancellation and unrelated finger releases do not activate an action',()=>{
 const f=fixture();f.emit('pointerdown');f.emit('pointerup',{pointerId:2});assert.equal(f.actions,0);f.emit('pointerup',{clientY:80});f.emit('click');assert.equal(f.actions,0);
 f.emit('pointerdown');f.emit('pointercancel');f.emit('pointerup');assert.equal(f.actions,0);
});
test('keyboard, assistive clicks and a real mouse work immediately after touch',()=>{
 const f=fixture();f.emit('pointerdown');f.emit('pointerup');f.emit('click',{pointerType:'',detail:0});assert.equal(f.actions,2);
 f.emit('pointerdown',{pointerType:'mouse'});f.emit('click',{pointerType:'mouse'});assert.equal(f.actions,3);f.dispose();assert.equal(f.listeners.size,0);
});
test('releasing game input discards an unfinished action and its delayed click while fresh actions still work',()=>{
 const f=fixture();f.emit('pointerdown');f.release();f.emit('pointerup');f.emit('click');assert.equal(f.actions,0,'an old tap must not activate after release');
 f.emit('click',{pointerType:'',detail:0});assert.equal(f.actions,1,'a fresh accessible activation stays usable');
 f.emit('pointerdown',{pointerId:2});f.emit('pointerup',{pointerId:2});assert.equal(f.actions,2,'the next real touch is accepted');f.dispose();
});
