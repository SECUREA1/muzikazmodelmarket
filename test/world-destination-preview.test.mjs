import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorldPreview} from '../public/js/world-destination-preview.js';

class PreviewElement {
 constructor(){this.children=[];this.classList={add(){},toggle(){}};this.isConnected=true;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(){}
 addEventListener(){}
}

test('disposing a filtered-out destination allows the same preview to be mounted again',()=>{
 const before=globalThis.document;
 globalThis.document={querySelector:()=>({}),createElement:()=>new PreviewElement()};
 try{
  const root=new PreviewElement(),world={id:'muzikaz-full-house',thumbnailUrl:'/house.svg'};
  const original=mountWorldPreview(root,world,{resolve:false});
  assert.equal(mountWorldPreview(root,world,{resolve:false}),original);
  original.dispose();
  root.replaceChildren();
  const restored=mountWorldPreview(root,world,{resolve:false});
  assert.notEqual(restored,original);
  assert.equal(root.children.length,2);
  original.dispose();
  assert.equal(mountWorldPreview(root,world,{resolve:false}),restored);
  restored.dispose();
 }finally{
  if(before===undefined)delete globalThis.document;
  else globalThis.document=before;
 }
});

test('automatic map previews wait for visibility, reuse their controller and cancel observation on disposal',()=>{
 const beforeDocument=globalThis.document,beforeObserver=globalThis.IntersectionObserver,observers=[],listeners=new Set();
 globalThis.document={querySelector:()=>({}),createElement:()=>new PreviewElement(),addEventListener:(_,listener)=>listeners.add(listener),removeEventListener:(_,listener)=>listeners.delete(listener)};
 globalThis.IntersectionObserver=class{
  constructor(callback){this.callback=callback;observers.push(this);}
  observe(element){this.element=element;}
  disconnect(){this.disconnected=true;}
 };
 try{
  const root=new PreviewElement(),world={id:'muzikaz-full-house',thumbnailUrl:'/house.svg'};
  const controller=mountWorldPreview(root,world,{resolve:false,auto3d:true});
  assert.equal(observers.length,1);
  assert.equal(observers[0].element,root);
  observers[0].callback([{isIntersecting:false}]);
  assert.equal(listeners.size,1);
  assert.equal(mountWorldPreview(root,world,{resolve:false,auto3d:true}),controller);
  assert.equal(observers.length,1,'presence updates must retain the same preview and visibility observer');
  controller.dispose();
  assert.equal(observers[0].disconnected,true);
  assert.equal(listeners.size,0);
  assert.doesNotThrow(()=>observers[0].callback([{isIntersecting:true}]),'a stale visibility callback must never restart a disposed preview');
 }finally{
  if(beforeDocument===undefined)delete globalThis.document;else globalThis.document=beforeDocument;
  if(beforeObserver===undefined)delete globalThis.IntersectionObserver;else globalThis.IntersectionObserver=beforeObserver;
 }
});
