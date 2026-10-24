import test from 'node:test';
import assert from 'node:assert/strict';
import {mountGamePanelNavigation} from '../public/js/game-panel-navigation.js';
function node(){return {children:[],listeners:{},hidden:false,attributes:{},append(...items){this.children.push(...items);},prepend(item){this.children.unshift(item);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,fn){this.listeners[key]=fn;},focus(){this.focused=true;}};}
test('Select shows one screen, Back restores history, and reset returns to the main panel',()=>{
 const previous=globalThis.document,events=[];globalThis.document={createElement:node,dispatchEvent:event=>{events.push(event.detail.reason);return true;}};
 try{
  const host=node(),screens=['tools','worlds','backpack'].map(id=>({id,label:id,element:node()}));let activations=0;screens[1].onShow=()=>activations++;
  const navigation=mountGamePanelNavigation(host,screens),[back,select]=host.children[0].children;
  assert.deepEqual(screens.map(screen=>screen.element.hidden),[false,true,true]);assert.equal(back.disabled,true);
  assert.deepEqual(events,[],'initial construction has no held game input to release');
  select.value='worlds';select.listeners.change();assert.equal(activations,1);assert.equal(screens[1].element.hidden,false);assert.equal(screens[0].element.attributes['aria-hidden'],'true');
  navigation.show('backpack');back.listeners.click();assert.equal(select.value,'worlds');back.listeners.click();assert.equal(select.value,'tools');assert.equal(back.disabled,true);
  navigation.show('worlds');navigation.reset();assert.equal(select.value,'tools');assert.equal(back.disabled,true);
  assert.equal(navigation.show('missing'),false);assert.equal(select.value,'tools');
  assert.deepEqual(events,Array(6).fill('panel-navigation'),'each actual screen transition releases previous held input');
  navigation.show('tools');assert.equal(events.length,6,'reopening the same screen preserves fresh controls');
 }finally{globalThis.document=previous;}
});
