import test from 'node:test';
import assert from 'node:assert/strict';
import {readRadToxEnabled,setRadToxEnabled,watchRadToxEnabled,RAD_TOX_PREFERENCE_KEY} from '../public/js/rad-tox-preference.js';

test('encounter preference persists, synchronizes same-page controls and follows other tabs',()=>{
 const previousStorage=globalThis.localStorage,previousWindow=globalThis.window,records=new Map();
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
 const changes=[],unwatch=watchRadToxEnabled(value=>changes.push(value));
 try{
  assert.equal(readRadToxEnabled(),true);
  setRadToxEnabled(false);
  assert.equal(records.get(RAD_TOX_PREFERENCE_KEY),'false');
  assert.equal(readRadToxEnabled(),false);
  assert.deepEqual(changes,[false]);
  records.set(RAD_TOX_PREFERENCE_KEY,'true');
  window.dispatchEvent(Object.assign(new Event('storage'),{key:RAD_TOX_PREFERENCE_KEY}));
  assert.deepEqual(changes,[false,true]);
  records.clear();
  window.dispatchEvent(Object.assign(new Event('storage'),{key:null}));
  assert.equal(readRadToxEnabled(),true);
  unwatch();setRadToxEnabled(false);assert.deepEqual(changes,[false,true,true]);
 }finally{unwatch();globalThis.localStorage=previousStorage;globalThis.window=previousWindow;}
});

test('blocked browser storage still lets a player turn encounters off and back on',()=>{
 const previousStorage=globalThis.localStorage,previousWindow=globalThis.window;
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:()=>{throw Error('Storage blocked');},setItem:()=>{throw Error('Storage blocked');}};
 try{setRadToxEnabled(false);assert.equal(readRadToxEnabled(),false);setRadToxEnabled(true);assert.equal(readRadToxEnabled(),true);}
 finally{globalThis.localStorage=previousStorage;globalThis.window=previousWindow;}
});
