import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
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

test('the actual API wrapper shares the gameplay deadline through render stalls and cancellation',async()=>{
 const previous={window:globalThis.window,performance:globalThis.performance,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 let clock=0,nextTimer=0,fetches=0,signal,finishFetch,nativeOptions;
 const timers=new Map(),setTimer=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimer=id=>timers.delete(id);
 const fire=id=>{const timer=timers.get(id);timers.delete(id);timer.callback();};
 const storage={getItem:()=>null,setItem(){},removeItem(){}},attributes={};
 const window={URL,Promise,setTimeout:setTimer,clearTimeout:clearTimer,localStorage:storage,sessionStorage:storage,
  location:{href:'https://game.example/model-explorer.html',origin:'https://game.example',protocol:'https:'},
  fetch:async(url,options)=>{
   if(url.endsWith('/api/health'))return new Response(JSON.stringify({success:true,service:'muzikaz-member-market'}));
   fetches++;signal=options.signal;nativeOptions=options;
   return new Promise((resolve,reject)=>{finishFetch=resolve;if(signal.aborted)reject(new DOMException('Aborted','AbortError'));else signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
  }};
 const document={documentElement:{getAttribute:name=>attributes[name]||'',setAttribute:(name,value)=>attributes[name]=value}};
 const source=readFileSync(new URL('../public/js/api-connection.js',import.meta.url),'utf8');
 const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
 try{
  globalThis.window=window;globalThis.performance={now:()=>clock};globalThis.setTimeout=setTimer;globalThis.clearTimeout=clearTimer;
  vm.runInNewContext(source,{window,document,JSON,Error});await window.MUZIKAZ_API.ready;
  assert.equal(timers.size,0);
  const api=new SharedGameInventory(),pending=api.api('/api/rooms/airport/gameplay',{method:'POST',body:'{"action":"input"}'}).then(value=>({value}),error=>({error}));
  await settle();assert.equal(fetches,1);
  // Model a rendering task that holds both the timer and a completed fetch.
  // The old nested wrapper timer rejected before gameplay's grace could help.
  clock=12000;for(const id of [...timers.keys()])fire(id);
  finishFetch(new Response(JSON.stringify({data:{confirmed:true}})));
  const outcome=await pending;assert.deepEqual(outcome,{value:{confirmed:true}});assert.equal(signal.aborted,false);assert.equal(timers.size,0);assert.equal(nativeOptions.deadlineManaged,undefined,'Internal deadline options must not reach native fetch.');

  clock=20000;const offline=api.api('/api/rooms/airport/gameplay',{method:'POST',body:'{"action":"input"}'});const offlineCheck=assert.rejects(offline,{name:'AbortError'});
  await settle();assert.equal(timers.size,1);clock=28000;fire([...timers.keys()][0]);await offlineCheck;
  assert.equal(signal.aborted,true);assert.equal(fetches,2,'An ambiguous movement action must not be replayed.');assert.equal(timers.size,0);

  const lifetime=new AbortController(),closed=api.api('/api/rooms/airport/gameplay',{signal:lifetime.signal});const closedCheck=assert.rejects(closed,{name:'AbortError'});
  await settle();lifetime.abort();await closedCheck;assert.equal(timers.size,0);assert.equal(fetches,3);
 }finally{Object.assign(globalThis,previous);}
});
