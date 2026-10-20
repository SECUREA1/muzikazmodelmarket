import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {OwnedItemPlacement} from '../public/js/owned-item-placement.js';
class Element extends EventTarget{
 constructor(){super();this.hidden=false;this.children=new Map();this.textContent='';}
 setAttribute(){} append(){} setPointerCapture(){} getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}
 querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
 querySelectorAll(){return [...this.children.values()];}
}
async function withPlacement(run){
 const oldDocument=globalThis.document,oldStorage=globalThis.localStorage,stored=new Map();
 globalThis.document={createElement:()=>new Element(),exitPointerLock(){}};
 globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
 const saves=[],canvas=new Element(),scene=new THREE.Scene();let previews=0,fail=false,release;const solids=[];
 const placement=new OwnedItemPlacement({THREE,scene,canvas,stage:new Element(),pointAt:()=>new THREE.Vector3(1,0,2),solids:()=>solids,createPreview:async()=>{previews++;return new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());},save:async(asset,transform,existing,root,requestId)=>{saves.push({asset,transform,existing,requestId});if(fail)throw Error('Not saved');if(release)await new Promise(resolve=>release.resolve=resolve);return{id:'brick-'+saves.length,revision:1};}});
 try{await run({placement,saves,canvas,stored,solids,get previews(){return previews;},setFail:()=>fail=true,block:()=>release={}});}finally{placement.reset();globalThis.document=oldDocument;globalThis.localStorage=oldStorage;}
}
const brick={id:'material:studs',materialId:'studs',name:'Studded block'};
test('set now saves settings and repeats placement without reopening or rebuilding the panel',async()=>{
 await withPlacement(async context=>{
  const {placement,saves}=context;await placement.start(brick);placement.pending.yaw=Math.PI/4;placement.pending.scale=1.5;
  assert.equal(placement.setQuickMode(true),true);await placement.confirm();assert.equal(placement.panel.hidden,true);assert.equal(placement.active,true);
  placement.pending.point.set(3,0,4);await placement.confirm();assert.equal(saves.length,2);assert.notEqual(saves[0].requestId,saves[1].requestId);
  assert.deepEqual(saves[1].transform.rotation,[0,Math.PI/4,0]);assert.deepEqual(saves[1].transform.scale,[1.5,1.5,1.5]);assert.equal(saves[1].existing,null);assert.equal(context.previews,1);
  placement.cancel();await placement.start(brick);assert.equal(saves.length,3);assert.equal(placement.panel.hidden,true,'saved preference bypasses the panel next time');
  placement.editButton.dispatchEvent(new Event('click'));assert.equal(placement.panel.hidden,false);placement.setQuickMode(false);await placement.confirm();assert.equal(placement.active,false);
  await placement.start(brick);assert.equal(placement.panel.hidden,false,'single placement restores the normal panel');
 });
});
test('failed saves reopen controls and retain the request ID for a safe retry',async()=>{
 await withPlacement(async({placement,setFail})=>{
  await placement.start(brick);placement.setQuickMode(true);const requestId=placement.pending.requestId;setFail();
  assert.equal(await placement.confirm(),false);assert.equal(placement.panel.hidden,false);assert.equal(placement.pending.requestId,requestId);assert.equal(placement.pending.quick,false);
 });
});
test('inventory items can repeat while existing-item edits remain single placement',async()=>{
 await withPlacement(async({placement})=>{
  await placement.start({id:'chair',name:'Chair'});assert.equal(placement.setQuickMode(true),true);
  await placement.start(brick,{id:'placed',placement:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});assert.equal(placement.setQuickMode(true),false);
 });
});
test('a tap places exactly once and a drag only positions the preview',async()=>{
 await withPlacement(async({placement,canvas,saves})=>{
  await placement.start(brick);placement.setQuickMode(true);
  const pointer=(type,x,y)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,clientX:x,clientY:y,isPrimary:true});canvas.dispatchEvent(event);};
  pointer('pointerdown',20,20);pointer('pointermove',50,50);pointer('pointerup',50,50);await Promise.resolve();assert.equal(saves.length,0);
  pointer('pointerdown',20,20);pointer('pointerup',20,20);await Promise.resolve();await Promise.resolve();assert.equal(saves.length,1);
  canvas.dispatchEvent(new Event('click',{cancelable:true}));assert.equal(saves.length,1,'synthetic click cannot place a duplicate');
 });
});

test('repeated drops rise on confirmed items and save the visible stacked transform',async()=>{
 await withPlacement(async({placement,saves,solids})=>{
  await placement.start(brick);placement.setQuickMode(true);
  // The fixture cube has a centered origin; real item previews are bottom anchored.
  solids.push(new THREE.Box3(new THREE.Vector3(.5,-.5,1.5),new THREE.Vector3(1.5,.5,2.5)));
  placement.apply();assert.equal(placement.pending.root.position.y,1);
  await placement.confirm();assert.equal(saves[0].transform.position[1],1);
  solids.push(new THREE.Box3(new THREE.Vector3(.5,.5,1.5),new THREE.Vector3(1.5,1.5,2.5)));
  await placement.confirm();assert.equal(saves[1].transform.position[1],2);
 });
});

test('scaled centered items use their collider base rather than their origin as the floor',async()=>{
 await withPlacement(async({placement,saves})=>{
  await placement.start(brick);placement.pending.point.set(1,3,2);placement.pending.scale=2;placement.pending.yaw=.7;
  placement.apply();placement.pending.root.updateMatrixWorld(true);
  assert.equal(new THREE.Box3().setFromObject(placement.pending.root).min.y,3);
  await placement.confirm();assert.equal(saves[0].transform.position[1],4);
 });
});
