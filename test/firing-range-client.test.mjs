import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFiringRangeSceneBridge,openFiringRangeSession} from '../public/js/firing-range-client.js';
import {firingRangeScopeFov} from '../public/js/firing-range-scope.js';

test('range entry confirms its own server mode and prepares controls before exposing the lobby',async()=>{
 const calls=[],snapshot={firingRange:{state:'ready',participants:{},settings:{mode:'precision'}}};
 const client={ready:true,async send(action){calls.push(action);return snapshot;}};
 const result=await openFiringRangeSession({client,prepare:async()=>{await Promise.resolve();calls.push('prepared');},onReady:state=>{assert.equal(state,snapshot);calls.push('opened');}});
 assert.equal(result,snapshot);assert.deepEqual(calls,['range-ready','prepared','opened']);
});

test('unconfirmed or disconnected range entry keeps the lobby closed and can be retried',async()=>{
 let opened=0;
 await assert.rejects(openFiringRangeSession({client:{ready:false},onReady:()=>opened++}),/Join the live server/);
 const client={ready:true,send:async()=>({firingRange:null})};
 await assert.rejects(openFiringRangeSession({client,onReady:()=>opened++}),/not confirmed/);
 assert.equal(opened,0);
 client.send=async()=>({firingRange:{state:'live',settings:{mode:'freeplay'}}});
 await openFiringRangeSession({client,onReady:()=>opened++});assert.equal(opened,1);
});

test('scope magnification preserves the ordinary field of view and scales the optical angle',()=>{
 assert.equal(firingRangeScopeFov(68,{active:false,zoom:8}),68);
 assert.ok(Math.abs(firingRangeScopeFov(68,{active:true,zoom:1})-68)<1e-10);
 const zoomed=firingRangeScopeFov(68,{active:true,zoom:4});
 assert.ok(zoomed>18&&zoomed<20,'4× optics narrow the 68 degree camera view');
 assert.ok(Math.abs(Math.tan(68*Math.PI/360)/Math.tan(zoomed*Math.PI/360)-4)<1e-10);
});

test('a rotated range module receives its own location state and transformed console interaction',()=>{
 const world=new THREE.Group(),module=new THREE.Group(),range=new THREE.Group(),calls=[];
 module.userData.builderObjectId='east-range';module.position.set(25,.08,10);module.rotation.y=Math.PI/2;module.scale.setScalar(.5);world.add(module);module.add(range);
 range.userData.setFiringRangeState=(state,options)=>calls.push({state,options});
 range.userData.updateFiringRangeEffects=time=>calls.push({time});
 range.userData.rangeInteractions=[{id:'start',intent:'range-start',label:'Start',position:{x:0,y:0,z:16},radius:2.8}];
 world.updateMatrixWorld(true);
 const bridge=createFiringRangeSceneBridge({THREE,getRoots:()=>[world,module]});bridge.refresh();
 const state={locations:[{id:'main',transform:{position:{x:0,y:0,z:0}}},{id:'east-range',transform:{position:{x:25,y:.08,z:10}}}]};
 bridge.render(state,100000);assert.equal(calls.length,1,'nested scene roots update once');assert.equal(calls[0].options.locationId,'east-range');
 const interaction=bridge.nearest(new THREE.Vector3(33,.08,10));assert.equal(interaction.intent,'range-start');assert.equal(interaction.locationId,'east-range');
 assert.equal(bridge.nearest(new THREE.Vector3(0,0,16)),null,'console stays with the placed module');
 bridge.update(100150);assert.equal(calls.at(-1).time,100150);
 bridge.clear();bridge.update(100300);assert.equal(calls.length,2,'leaving a map releases its scene hooks');
});
