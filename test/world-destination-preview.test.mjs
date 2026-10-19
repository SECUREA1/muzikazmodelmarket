import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorldPreview} from '../public/js/world-destination-preview.js';

class PreviewElement {
 constructor(){this.children=[];this.classList={add(){}};this.isConnected=true;}
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
