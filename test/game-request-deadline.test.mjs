import test from 'node:test';import assert from 'node:assert/strict';
import {SharedGameInventory} from '../public/js/shared-game-inventory.js';
test('late rendering timers allow queued responses, while actual network deadlines still abort',async()=>{
 const oldWindow=globalThis.window,oldPerformance=globalThis.performance,oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 let clock=0,next=0,signal,resolveFetch;const timers=new Map();globalThis.performance={now:()=>clock};globalThis.setTimeout=(callback,delay)=>{const id=++next;timers.set(id,{callback,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.window={fetch:async(path,options)=>{signal=options.signal;return new Promise((resolve,reject)=>{resolveFetch=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});}};
 try{
  const api=new SharedGameInventory(),request=api.api('/api/test');clock=12000;const first=[...timers.values()][0];first.callback();assert.equal(signal.aborted,false);assert.ok([...timers.values()].some(t=>t.delay===1000));resolveFetch({ok:true,json:async()=>({data:{confirmed:true}})});assert.deepEqual(await request,{confirmed:true});
  timers.clear();clock=0;const offline=api.api('/api/test');clock=8000;[...timers.values()][0].callback();await assert.rejects(offline,{name:'AbortError'});
 }finally{globalThis.window=oldWindow;globalThis.performance=oldPerformance;globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
});
