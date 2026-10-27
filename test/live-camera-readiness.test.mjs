import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mountLiveCameraScreens} from '../public/js/live-camera-screens.js';

async function fixture(run){
 const names=['window','document','localStorage','navigator','setInterval','clearInterval'];
 const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const ticks=[],calls=[],tracks=[],root=new THREE.Group();root.userData.builderObjectId='screen';
 const surface=new THREE.Group();surface.userData.mediaScreen=true;root.add(surface);
 const windowMock=new EventTarget();windowMock.MUZIKAZ_HOUSE_TRACKING={roomId:'town'};windowMock.RTCPeerConnection=function(){};
 let ready=false,captures=0,session=()=>Promise.resolve({csrfToken:'fixture-csrf'});
 windowMock.MUZIKAZ_API={ready:Promise.resolve(),async fetch(path,options){calls.push({path,body:options?.body&&JSON.parse(options.body)});return {ok:true,json:()=>path==='/api/market/session'?session():Promise.resolve({feeds:[],signals:[]})};}};
 const node=()=>({style:{},addEventListener(){},remove(){},play:async()=>{},pause(){}});
 Object.defineProperties(globalThis,{
  window:{configurable:true,value:windowMock},document:{configurable:true,value:{createElement:node,body:{append(){}}}},
  localStorage:{configurable:true,value:{getItem:key=>key==='muzikazHouseSessionId'?'self':'town'}},
  navigator:{configurable:true,value:{mediaDevices:{async getUserMedia(){captures++;const track={stop(){track.stopped=true;},addEventListener(){}};tracks.push(track);return {getTracks:()=>[track]};}}}},
  setInterval:{configurable:true,value:callback=>{ticks.push(callback);return ticks.length;}},clearInterval:{configurable:true,value:()=>{}}
 });
 const camera=mountLiveCameraScreens({THREE:{...THREE,VideoTexture:class{dispose(){}}},getRoots:()=>[root],getPosition:()=>new THREE.Vector3(),screenFor:()=>null,announce(){},isRoomReady:()=>ready});
 try{await run({camera,calls,tracks,window:windowMock,setReady:value=>{ready=value;},setSession:value=>{session=value;},captures:()=>captures,async tick(){for(const tick of ticks)tick();for(let n=0;n<4;n++)await new Promise(resolve=>setImmediate(resolve));}});}
 finally{camera.dispose();for(const [name,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}

test('camera screens make no signaling requests or capture prompts before actual room presence',async()=>{
 await fixture(async f=>{
  await f.tick();await f.camera.watch();
  await assert.rejects(f.camera.start('screen'),/Join this multiplayer room/);
  assert.equal(f.calls.length,0);assert.equal(f.captures(),0);
  f.setReady(true);await f.tick();
  assert.deepEqual(f.calls.map(call=>call.path),['/api/market/session','/api/houses/ioncore-house/camera/signal']);
  f.setReady(false);await f.tick();assert.equal(f.calls.length,2);
 });
});

test('leaving while the session proof is loading cannot signal into the next room',async()=>{
 await fixture(async f=>{
  let complete;f.setSession(()=>new Promise(resolve=>{complete=resolve;}));f.setReady(true);
  const polling=f.camera.watch();await new Promise(resolve=>setImmediate(resolve));
  f.setReady(false);f.window.MUZIKAZ_HOUSE_TRACKING.roomId='next';f.window.dispatchEvent(new Event('muzikaz:multiplayer-world-change'));
  complete({csrfToken:'fixture-csrf'});await polling;
  assert.deepEqual(f.calls.map(call=>call.path),['/api/market/session']);
 });
});

test('map travel stops live capture immediately without sending camera requests before rejoining',async()=>{
 await fixture(async f=>{
  f.setReady(true);await f.camera.start('screen');assert.equal(f.captures(),1);
  const sent=f.calls.length;f.setReady(false);f.window.MUZIKAZ_HOUSE_TRACKING.roomId='next';
  f.window.dispatchEvent(new Event('muzikaz:multiplayer-world-change'));await f.tick();
  assert.equal(f.tracks[0].stopped,true);assert.equal(f.camera.isLive('screen'),false);assert.equal(f.calls.length,sent);
 });
});
