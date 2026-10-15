import test from 'node:test';
import assert from 'node:assert/strict';
import {fullscreenPanel} from '../public/js/fullscreen-panels.js';

test('Backpack opens synchronously, clears stale hidden state, and survives a queued close event',()=>{
 const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver};
 class Element{
  constructor(){this.hidden=false;this.children=[];this.attributes=new Map();this.handlers=new Map();const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};}
  setAttribute(name,value){this.attributes.set(name,value);}
  getAttribute(name){return this.attributes.get(name);}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  prepend(...children){children.forEach(child=>child.parentElement=this);this.children.unshift(...children);}
  addEventListener(name,handler){this.handlers.set(name,handler);}
  showModal(){this.open=true;this.shown=(this.shown||0)+1;}
  close(){this.open=false;}
 }
 const body=new Element(),root=new Element();globalThis.document={createElement:()=>new Element(),body,documentElement:root,querySelector:()=>null};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 try{
  const panel=new Element();panel.id='house-picker-panel';panel.hidden=true;panel.classList.add('is-collapsed');panel.setAttribute('aria-label','Avatar Backpack');
  let opened=0;const menu=fullscreenPanel(panel,{collapsed:true,onOpen:()=>opened++});assert.ok(!menu.dialog.open);
  menu.open();assert.equal(menu.dialog.open,true);assert.equal(panel.hidden,false);assert.equal(panel.classList.contains('is-collapsed'),false);assert.equal(opened,1);
  assert.equal(menu.dialog.children[0].children[0].textContent,'Avatar Backpack');
  menu.close();menu.sync();assert.equal(menu.dialog.open,false);
  panel.setAttribute('aria-label','World chooser');menu.open();menu.dialog.handlers.get('close')();
  assert.equal(menu.dialog.open,true);assert.equal(panel.classList.contains('is-collapsed'),false);assert.equal(menu.dialog.getAttribute('aria-label'),'World chooser');
  menu.dialog.open=false;menu.dialog.handlers.get('close')();assert.equal(panel.classList.contains('is-collapsed'),true);
 }finally{Object.assign(globalThis,previous);}
});
