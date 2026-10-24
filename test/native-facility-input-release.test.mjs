import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GAME_INPUT_RELEASE_EVENT} from '../public/js/game-input-release.js';

for(const [file,name,next]of [['hockey-game.js','Hockey','const hockeyChallenges='],['arcade-game.js','Arcade','const nativeChallenges=']]){
 test(name+' facility releases clear keyboard and controller holds before fresh input',()=>{
  const source=readFileSync(new URL('../public/js/'+file,import.meta.url),'utf8'),start=source.indexOf('function release'+name+'GameInput()'),end=source.indexOf(next,start);
  assert.ok(start>=0&&end>start);
  const keys=new Set(['w',' ','shift']),pressed=new Set(['ArrowRight']),walkKeys=new Set(['KeyW']),touchKeys=new Set(['forward']),controllerWalkKeys=new Set(['back']);
  let resets=0,flushes=0;
  const context=vm.createContext({keys,pressed,walkKeys,touchKeys,controllerWalkKeys,controllerMove:{x:1,y:-1},lookDrag:{id:1},drag:true,hockeyTrigger:{reset(){resets++;}},hockeyController:{reset(){resets++;}},arcadeController:{reset(){resets++;}},flushInput(){flushes++;},requestGameInput(){flushes++;},document:new EventTarget(),GAME_INPUT_RELEASE_EVENT});
  vm.runInContext(source.slice(start,end),context);
  context.document.dispatchEvent(new Event(GAME_INPUT_RELEASE_EVENT));
  assert.deepEqual({...context.controllerMove},{x:0,y:0});
  if(name==='Hockey'){assert.equal(keys.size,0);assert.equal(context.lookDrag,null);assert.equal(resets,2);}
  else{for(const held of [pressed,walkKeys,touchKeys,controllerWalkKeys])assert.equal(held.size,0);assert.equal(context.drag,false);assert.equal(resets,1);}
  assert.equal(flushes,1,'The room receives a neutral sample.');
  keys.add('s');pressed.add('ArrowLeft');
  assert.ok(keys.has('s')&&pressed.has('ArrowLeft'),'A release does not disable future game input.');
 });
}
