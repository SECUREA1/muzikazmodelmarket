import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRadToxController,bindGameActionSelection,updateGameTriggerHint} from '../public/js/rad-tox-controller.js';

// Minimal DOM adapter: actions use their real click, pointer, and selection paths.
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attributes={};this.isConnected=true;this.hidden=false;this.disabled=false;this.listeners={};this.className='';this.classList={add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false),toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
 get parentElement(){return this.parent;}
 append(...nodes){for(const node of nodes){node.parent?.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node);}}
 prepend(node){this.append(node);this.children.unshift(this.children.pop());}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name]??null;}
 addEventListener(name,callback){this.listeners[name]=callback;}
 removeEventListener(name){delete this.listeners[name];}
 getClientRects(){for(let node=this;node;node=node.parent)if(node.hidden)return [];return [{}];}
 getBoundingClientRect(){return {width:100,height:100};}
 setPointerCapture(){}
 matches(selector){return selector==='button'?this.tagName==='BUTTON':selector==='button[data-game-action]'?this.tagName==='BUTTON'&&this.dataset.gameAction!==undefined:false;}
 closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 click(event={detail:0}){if(this.disabled||this.hidden)return;const parents=[];for(let node=this.parent;node;node=node.parent)parents.unshift(node);for(const node of parents)node.listeners.click?.({target:this,...event});this.onclick?.({target:this,...event});}
 close(){this.open=false;}
 showModal(){this.open=true;}
 set innerHTML(value){
  if(!value.includes('rad-controller-toolbar'))return;
  this.selectors=new Map();
  for(const selector of ['.rad-controller-menu','[data-close-actions]','.rad-controller-actions','.rad-controller-toolbar','[data-thumbstick="left"] .thumbstick-base','[data-thumbstick="right"] .thumbstick-base','[data-thumbstick="left"] .thumbstick-label','[data-thumbstick="left"] small','[data-thumbstick="left"]']){
   const node=new Element(selector.includes('base')?'button':'div');node.firstElementChild=new Element();this.selectors.set(selector,node);
  }
  const menu=this.selectors.get('.rad-controller-menu');menu.append(this.selectors.get('.rad-controller-actions'));
  this.append(menu,this.selectors.get('.rad-controller-toolbar'));
 }
 querySelector(selector){return this.selectors?.get(selector)||this.querySelectorAll(selector)[0];}
}
function fixture(run){
 const previous={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
 let nextFrame,enabled=true,dialogOpen=false,shots=0,passes=0,moves=0,visible=true,passVisible=true,passDisabled=false;
 const parent=new Element();
 globalThis.document={createElement:tag=>new Element(tag),querySelector:selector=>selector==='[data-rad-controller-style]'?{}:selector==='dialog[open]:not([data-gameplay-surface])'&&dialogOpen?{}:null,addEventListener(){},removeEventListener(){},hidden:false};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.requestAnimationFrame=callback=>{nextFrame=callback;return 1;};
 let controller;
 try{
  controller=mountRadToxController({parent,screenActions:true,enabled:()=>enabled,visible:()=>visible,onMove:()=>moves++,onShoot:()=>shots++,buttons:[{id:'pass',label:'Pass',primary:true,when:()=>passVisible,disabled:()=>passDisabled,tap:()=>passes++},{label:'Settings',tap(){}}]});
  return run({controller,root:controller.root,frame:()=>nextFrame(performance.now()),get shots(){return shots;},get passes(){return passes;},get moves(){return moves;},set enabled(value){enabled=value;},set visible(value){visible=value;},set passVisible(value){passVisible=value;},set passDisabled(value){passDisabled=value;},set dialogOpen(value){dialogOpen=value;}});
 }finally{controller?.destroy();Object.assign(globalThis,previous);}
}

test('gameplay actions stay above navigation and the selected action drives the left trigger',()=>fixture(c=>{
 const bar=c.root.children[0];assert.equal(bar.className,'game-screen-actions');
 assert.deepEqual(bar.children.map(button=>button.textContent),['Shoot / play','Pass']);
 const [shoot,pass]=bar.children;assert.equal(shoot.attributes['aria-pressed'],'true');
 c.frame();const before=c.moves;shoot.click();pass.click();
 assert.equal(c.shots,1);assert.equal(c.passes,1);assert.equal(c.moves,before);
 assert.equal(pass.classList.contains('is-selected'),true);assert.equal(shoot.attributes['aria-pressed'],'false');
 assert.equal(c.controller.selectedAction.id,'pass');assert.equal(c.root.querySelector('[data-thumbstick="left"] small').textContent,'Drag to move · tap to pass');
 const left=c.root.querySelector('[data-thumbstick="left"] .thumbstick-base');
 left.onpointerdown({button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){}});
 left.listeners.pointerup({type:'pointerup',pointerId:1});assert.equal(c.passes,2);assert.equal(c.shots,1);
 left.onclick({detail:0});assert.equal(c.passes,3,'keyboard click activates the same selected action');
 left.onclick({detail:1});assert.equal(c.passes,3,'compatibility pointer clicks cannot duplicate a tap');
}));

test('hidden selections reset, temporary disabled selections stay selected and cancellations do not fire',()=>fixture(c=>{
 const pass=c.root.children[0].children[1];pass.click();assert.equal(c.controller.selectedAction.id,'pass');
 c.passDisabled=true;c.frame();assert.equal(c.controller.selectedAction.id,'pass');assert.equal(c.controller.triggerSelected(),false);assert.equal(c.passes,1);
 c.passDisabled=false;c.frame();c.controller.triggerSelected();assert.equal(c.passes,2);
 c.passVisible=false;c.frame();assert.equal(c.controller.selectedAction.id,'shoot');
 const left=c.root.querySelector('[data-thumbstick="left"] .thumbstick-base');
 left.onpointerdown({button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){}});left.listeners.pointercancel({type:'pointercancel',pointerId:1});assert.equal(c.shots,0);
 c.enabled=false;c.frame();assert.equal(c.root.children[0].hidden,true);assert.equal(c.controller.selectedAction,null);assert.equal(c.controller.triggerSelected(),false);
}));

test('gameplay surfaces allow walking while action dialogs pause it',()=>fixture(c=>{
 c.frame();const before=c.moves;c.frame();assert.equal(c.moves,before+1,'an open marked gameplay surface is not a blocking menu');
 c.dialogOpen=true;c.frame();const stopped=c.moves;c.frame();assert.equal(c.moves,stopped,'a real settings dialog blocks movement');
}));

test('native action binding selects before the existing click handler and trigger hint follows it',()=>{
 const root=new Element(),shoot=new Element('button'),pass=new Element('button');shoot.dataset.gameAction='shoot';shoot.textContent='Shoot';pass.dataset.gameAction='pass';pass.textContent='Pass · E';root.append(shoot,pass);
 let selection,observed;pass.onclick=()=>{observed=selection.selected.id;};
 selection=bindGameActionSelection(root);pass.click();assert.equal(observed,'pass');assert.equal(selection.selected.label,'Pass');
 pass.hidden=true;selection.sync();assert.equal(selection.selected.id,'shoot');
 const labels=new Element();labels.innerHTML='rad-controller-toolbar';updateGameTriggerHint(labels,'Catch');assert.equal(labels.querySelector('[data-thumbstick="left"] .thumbstick-base').attributes['aria-label'],'Left thumbstick: drag to move, tap to catch');
 selection.destroy();
});
