import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installBuilderTouchGestures} from '../public/js/builder-touch-gestures.js';
function fixture(){const canvas=new EventTarget(),taps=[];const dispose=installBuilderTouchGestures(canvas,event=>taps.push(event));const send=(type,id,x,y,pointerType='touch')=>{const event=new Event(type);Object.assign(event,{pointerId:id,clientX:x,clientY:y,pointerType});canvas.dispatchEvent(event);};return {canvas,taps,send,dispose};}
test('single touch places only after release, while a pan never places',()=>{
 const {send,taps}=fixture();send('pointerdown',1,20,20);assert.equal(taps.length,0);send('pointerup',1,23,23);assert.equal(taps.length,1);
 send('pointerdown',2,20,20);send('pointermove',2,70,20);send('pointerup',2,20,20);assert.equal(taps.length,1,'returning to the original position is still a pan');
});
test('pinch, cancelled touches, and mouse pointers never trigger touch placement',()=>{
 const {send,taps}=fixture();send('pointerdown',1,20,20);send('pointerdown',2,40,20);send('pointerup',2,40,20);send('pointerup',1,20,20);assert.equal(taps.length,0);
 send('pointerdown',3,20,20);send('pointercancel',3,20,20);send('pointerup',3,20,20);send('pointerdown',4,20,20,'mouse');send('pointerup',4,20,20,'mouse');assert.equal(taps.length,0);
 send('pointerdown',5,20,20);send('pointerup',5,20,20);assert.equal(taps.length,1,'normal taps recover after gestures');
});
test('disposing the handler removes gesture listeners',()=>{const {send,taps,dispose}=fixture();dispose();send('pointerdown',1,20,20);send('pointerup',1,20,20);assert.equal(taps.length,0);});
test('builder exposes discoverable mobile list modes and explicit placement controls',async()=>{
 const html=await readFile('environment-builder.html','utf8'),source=await readFile('environment-builder.js','utf8'),css=await readFile('environment-builder.css','utf8');
 for(const id of ['library-browser-toggle','library-browser-content','library-tile-size','touch-open-library','touch-place-center','touch-move','touch-rotate','touch-cancel'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const view of ['tiles','list','slider'])assert.ok(html.includes('data-library-view="'+view+'"'));
 assert.match(source,/addEventListener\('pointerdown',e=>\{\s*if\(e.pointerType==='touch'\|\|e.button!==0/);assert.match(source,/installBuilderTouchGestures\(renderer.domElement,tapBuilderCanvas\)/);assert.match(css,/\.builder-library-open \.object-library#library-panel/);
});
