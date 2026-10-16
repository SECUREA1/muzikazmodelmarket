import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraSignaling} from '../server-camera-signaling.mjs';
const fixture=()=>{const members=new Map([['alice',{sessionId:'alice',roomId:'town'}],['bob',{sessionId:'bob',roomId:'town'}],['eve',{sessionId:'eve',roomId:'other'}]]);return {service:new CameraSignaling(),members,alice:members.get('alice'),bob:members.get('bob'),eve:members.get('eve'),options:{now:10000,screen:{kind:'video',position:{x:0,y:0,z:0}},player:{lastSeen:10000,position:{x:0,y:0,z:2}}}};};
test('camera feeds require a nearby active player and a real video device',()=>{
 const {service,members,alice,options}=fixture();for(const override of [{screen:null},{screen:{...options.screen,kind:'slots'}},{player:{...options.player,position:{x:20,y:0,z:0}}},{player:{...options.player,lastSeen:-20000}},{screen:{...options.screen,active:false}},{screen:{...options.screen,holderId:'bob'}}])assert.throws(()=>service.command(alice,members,{operation:'start',deviceId:'screen'},{...options,...override}),/reach/);
 service.command(alice,members,{operation:'start',deviceId:'screen'},options);assert.equal(service.poll(alice,members,10001).feeds.length,1);
});
test('camera negotiation is limited to subscribed viewers in the same room',()=>{
 const {service,members,alice,bob,eve,options}=fixture();service.command(alice,members,{operation:'start',deviceId:'screen'},options);
 assert.equal(service.poll(eve,members,10001).feeds.length,0);assert.throws(()=>service.command(eve,members,{operation:'watch',source:'alice',to:'alice'},{now:10001}),/same/);
 assert.throws(()=>service.command(bob,members,{operation:'answer',source:'alice',to:'alice'},{now:10001}),/Join/);
 service.command(bob,members,{operation:'watch',source:'alice',to:'alice'},{now:10001});assert.equal(service.poll(alice,members,10002).signals[0].operation,'watch');
 service.command(alice,members,{operation:'offer',source:'alice',to:'bob',payload:{type:'offer',sdp:'test'}},{now:10003});assert.equal(service.poll(bob,members,10004).signals[0].payload.sdp,'test');
 service.command(bob,members,{operation:'answer',source:'alice',to:'alice',payload:{type:'answer',sdp:'ok'}},{now:10005});assert.equal(service.poll(alice,members,10006).signals[0].operation,'answer');
});
test('stopping, leaving or expiring a feed removes it; another broadcaster cannot take an active screen',()=>{
 const {service,members,alice,bob,options}=fixture();service.command(alice,members,{operation:'start',deviceId:'screen'},options);
 assert.throws(()=>service.command(bob,members,{operation:'start',deviceId:'screen'},options),/already/);
 assert.equal(service.poll(bob,members,26000).feeds.length,0);service.command(alice,members,{operation:'start',deviceId:'screen'},options);
 members.set('alice',{...alice,roomId:'other'});assert.equal(service.poll(bob,members,10001).feeds.length,0);
 members.set('alice',alice);service.command(alice,members,{operation:'start',deviceId:'screen'},options);service.command(alice,members,{operation:'stop'},{now:10001});assert.equal(service.poll(bob,members,10002).feeds.length,0);
});
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mountLiveCameraScreens} from '../public/js/live-camera-screens.js';
test('camera capture is opt-in, stops tracks on exit, and cancels late permission responses',async()=>{
 const previous=Object.fromEntries(['window','document','localStorage','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const calls=[],tracks=[],surfaces=[],root=new THREE.Group();root.userData.builderObjectId='screen';const screen=new THREE.Group();screen.userData.mediaScreen=true;root.add(screen);let capture;
 const windowMock=new EventTarget();windowMock.MUZIKAZ_HOUSE_TRACKING={roomId:'town'};windowMock.RTCPeerConnection=function(){};
 windowMock.MUZIKAZ_API={async fetch(path,options){const body=options?.body&&JSON.parse(options.body);calls.push(body||path);return {ok:true,json:async()=>path==='/api/market/session'?{csrfToken:'test'}:body?{ok:true}:{feeds:[{source:'alice',deviceId:'screen',roomId:'town'}],signals:[]}};}};
 const node=()=>({style:{},hidden:false,position:{z:0},addEventListener(){},remove(){},play:async()=>{},pause(){}});
 Object.defineProperties(globalThis,{window:{configurable:true,value:windowMock},document:{configurable:true,value:{createElement:node,body:{append(){}}}},localStorage:{configurable:true,value:{getItem:key=>key==='muzikazHouseSessionId'?'alice':'town'}},navigator:{configurable:true,value:{mediaDevices:{getUserMedia:options=>{assert.equal(options.audio,false);return capture();}}}}});
 const camera=mountLiveCameraScreens({THREE:{...THREE,VideoTexture:class{dispose(){}}},getRoots:()=>[root],getPosition:()=>new THREE.Vector3(),screenFor(){const surface={position:{z:0},geometry:{dispose(){}},material:{dispose(){}},removeFromParent(){surface.removed=true;}};surfaces.push(surface);return surface;},announce(){}});
 const stream=()=>{const track={stop(){track.stopped=true;},addEventListener(){}};tracks.push(track);return {getTracks:()=>[track]};};
 try{
  assert.equal(calls.length,0,'loading a map never opens the camera');capture=async()=>stream();await camera.start('screen');assert.ok(calls.some(call=>call.operation==='start'));assert.equal(camera.isLive('screen'),true);
  await camera.stop();assert.equal(tracks[0].stopped,true);assert.equal(surfaces[0].removed,true);assert.equal(camera.isLive('screen'),false);
  let allow;capture=()=>new Promise(resolve=>{allow=resolve;});const pending=camera.start('screen');await Promise.resolve();await camera.stop();allow(stream());await pending;assert.equal(tracks[1].stopped,true);assert.equal(calls.filter(call=>call.operation==='start').length,1);
  capture=async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});};await assert.rejects(camera.start('screen'),/Denied/);assert.equal(camera.isLive('screen'),false);
 }finally{camera.dispose();for(const [name,descriptor]of Object.entries(previous))if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});
