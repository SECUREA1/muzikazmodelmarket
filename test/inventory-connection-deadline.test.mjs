import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedGameInventory} from '../public/js/shared-game-inventory.js';

test('gameplay deadline starts after shared discovery without extending the HTTP deadline',async()=>{
 const previous={window:globalThis.window,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 let ready,complete,requests=0;const timers=new Map();let serial=0;
 globalThis.setTimeout=(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.window={MUZIKAZ_API:{whenReady:()=>new Promise(resolve=>ready=resolve),fetch:async(path,options)=>{
  requests++;assert.equal(options.timeout,8000);assert.equal(options.signal.aborted,false);
  return new Promise(resolve=>complete=()=>resolve({ok:true,status:200,json:async()=>({data:{csrfToken:'confirmed-proof'}})}));
 }}};
 try{
  const pending=new SharedGameInventory().roomSession();
  assert.equal(requests,0);assert.equal(timers.size,0,'cold-start health discovery must not consume the gameplay deadline');
  ready();for(let i=0;i<10;i++)await Promise.resolve();
  assert.equal(requests,1);assert.deepEqual([...timers.values()].map(t=>t.delay),[8000]);
  complete();assert.deepEqual(await pending,{csrfToken:'confirmed-proof'});assert.equal(timers.size,0);
 }finally{Object.assign(globalThis,previous);}
});
