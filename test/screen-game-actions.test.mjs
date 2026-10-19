import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRadToxController} from '../public/js/rad-tox-controller.js';

// Minimal DOM adapter for exercising controller placement and events without WebGL.
class Element {
 constructor(){this.children=[];this.style={};this.isConnected=true;this.hidden=false;this.classList={add(){},remove(){}};this.listeners={};}
 append(...nodes){for(const node of nodes){node.parent?.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node);}}
 prepend(node){this.append(node);this.children.unshift(this.children.pop());}
 setAttribute(){}
 addEventListener(name,callback){this.listeners[name]=callback;}
 close(){this.open=false;}
 showModal(){this.open=true;}
 set innerHTML(value){
  if(!value.includes('rad-controller-toolbar'))return;
  this.selectors=new Map();
  for(const selector of ['.rad-controller-menu','[data-close-actions]','.rad-controller-actions','.rad-controller-toolbar','[data-thumbstick="left"] .thumbstick-base','[data-thumbstick="right"] .thumbstick-base']){
   const node=new Element();node.firstElementChild=new Element();this.selectors.set(selector,node);
  }
  const menu=this.selectors.get('.rad-controller-menu');menu.append(this.selectors.get('.rad-controller-actions'));
  this.append(menu,this.selectors.get('.rad-controller-toolbar'));
 }
 querySelector(selector){return this.selectors?.get(selector);}
}
test('gameplay buttons stay above the toolbar and invoke actions without stopping movement',()=>{
 const previous={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
 let nextFrame,enabled=true,shots=0,passes=0,moves=0;
 const parent=new Element();
 globalThis.document={createElement:()=>new Element(),querySelector:selector=>selector==='[data-rad-controller-style]'?{}:null,addEventListener(){},hidden:false};
 globalThis.window={addEventListener(){}};globalThis.requestAnimationFrame=callback=>{nextFrame=callback;};
 try{
  const {root}=mountRadToxController({parent,screenActions:true,enabled:()=>enabled,visible:()=>true,onMove:()=>moves++,onShoot:()=>shots++,buttons:[{label:'Pass',primary:true,tap:()=>passes++},{label:'Settings',tap(){}}]});
  const bar=root.children[0];assert.equal(bar.className,'game-screen-actions');
  assert.deepEqual(bar.children.map(button=>button.textContent),['Shoot / play','Pass']);
  const menu=root.querySelector('.rad-controller-menu');assert.ok(!menu.children[0].children.includes(bar.children[0]));
  nextFrame(performance.now());const before=moves;
  bar.children[0].onclick();bar.children[1].onclick();
  assert.equal(shots,1);assert.equal(passes,1);assert.equal(moves,before);assert.equal(menu.open,false);
  enabled=false;nextFrame(performance.now());assert.equal(bar.hidden,true);
  bar.children[0].onclick();assert.equal(shots,1);
 }finally{Object.assign(globalThis,previous);}
});
