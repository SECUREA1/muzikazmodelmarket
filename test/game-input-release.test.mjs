import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_INPUT_RELEASE_EVENT,requestGameInputRelease} from '../public/js/game-input-release.js';

test('panel release signals clear held controls without invoking their actions',()=>{
 const target=new EventTarget(),held=new Set(['forward','jump','fire']),reasons=[];
 let actions=0;
 target.addEventListener('click',()=>actions++);
 target.addEventListener('pointercancel',()=>actions++);
 target.addEventListener(GAME_INPUT_RELEASE_EVENT,event=>{
  held.clear();reasons.push(event.detail.reason);
  assert.equal(event.bubbles,true,'host window controls can observe a document release');
 });
 assert.equal(requestGameInputRelease('map-open',target),true);
 assert.equal(held.size,0);assert.deepEqual(reasons,['map-open']);assert.equal(actions,0);
 held.add('forward');
 assert.ok(held.has('forward'),'a release signal does not keep later movement locked');
 requestGameInputRelease('map-close',target);
 assert.equal(held.size,0);assert.deepEqual(reasons,['map-open','map-close']);assert.equal(actions,0);
});

test('release signaling is harmless when no game document exists',()=>{
 assert.equal(requestGameInputRelease('panel-open',null),false);
});
