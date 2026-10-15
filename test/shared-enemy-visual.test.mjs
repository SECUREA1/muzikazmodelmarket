import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createSharedEnemyVisual} from '../public/js/shared-enemy-visual.js';
import {roundCountdown} from '../public/js/match-results.js';
test('enemy artwork preserves its SVG texture and cannot be hidden by its transparent shell',()=>{
 const resources={brain:new THREE.Texture(),ghost:new THREE.Texture(),glow:{map:new THREE.Texture()},warning:new THREE.SpriteMaterial()};
 for(const kind of ['toxic','ghost','brain','boss','snake']){
  const root=createSharedEnemyVisual({THREE,actor:{kind},resources});assert.ok(root.children.length);
  if(kind!=='snake'){
   const sprite=root.children.find(child=>child.isSprite);assert.equal(sprite.material.map,kind==='brain'?resources.brain:kind==='ghost'?resources.ghost:resources.glow.map);assert.equal(sprite.material.color.getHex(),0xffffff);
   for(const child of root.children)if(child.isMesh&&child.material.transparent)assert.equal(child.material.depthWrite,false);
  }
  root.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});
 }
});
test('results countdown uses server time, reaches zero, and waits for the server to advance',()=>{
 const snapshot={serverTime:1000,radTox:{transition:{kind:'wave',at:11000}}};
 assert.deepEqual(roundCountdown(snapshot),{kind:'wave',seconds:10});assert.equal(roundCountdown(snapshot,9001).seconds,1);assert.equal(roundCountdown(snapshot,12000).seconds,0);assert.equal(roundCountdown({}),null);
});
