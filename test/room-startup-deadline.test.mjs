import test from 'node:test';
import assert from 'node:assert/strict';
import {connectAuthoritativeRoom} from '../public/js/authoritative-room-client.js';

const flush=async()=>{for(let turn=0;turn<25;turn++)await Promise.resolve();};
const response=data=>({ok:true,json:async()=>({data})});
const snapshot={selfId:'account:test',sequence:1,inputEpoch:'joined',players:{'account:test':{position:{x:0,y:0,z:0}}},actors:{},objects:{}};

async function withClock(run){
 const previous={window:globalThis.window,document:globalThis.document,performance:globalThis.performance,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 const timers=new Map(),requests=[],errors=[];let clock=0,nextTimer=0;
 const setTimer=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+delay});return id;};
 const fire=id=>{const timer=timers.get(id);timers.delete(id);timer.callback();};
 globalThis.performance={now:()=>clock};globalThis.document={hidden:false};
 globalThis.setTimeout=setTimer;globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.setInterval=()=>null;globalThis.clearInterval=()=>{};
 globalThis.window={fetch:(path,options)=>new Promise((resolve,reject)=>{
  requests.push({path,options,resolve:data=>resolve(response(data))});
  options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
 })};
 const client=connectAuthoritativeRoom({roomId:'public-commons',input:()=>({}),render(){},onError:error=>errors.push(error)});
 try{await run({client,requests,errors,timers,setClock:value=>{clock=value;},fire,advance:async value=>{
  clock=value;
  for(const [id,timer]of [...timers])if(timer.at<=clock){fire(id);await flush();}
 }});}finally{client.stop();await flush();Object.assign(globalThis,previous);}
}

test('session setup and a valid slow join can complete before the default readiness deadline',()=>withClock(async({client,requests,advance})=>{
 const ready=client.whenReady().then(()=>({ready:true}),error=>({error}));
 await advance(6000);requests[0].resolve({csrfToken:'proof'});await flush();
 assert.equal(requests[1].path,'/api/rooms/public-commons/gameplay');
 // Each request is within its own deadline: 6 seconds for the proof and
 // 24.5 seconds for the join, even though together they exceed 30 seconds.
 for(const time of [15000,16000,30000,30500])await advance(time);
 assert.equal(requests[1].options.signal.aborted,false);
 requests[1].resolve(snapshot);await flush();
 assert.deepEqual(await ready,{ready:true});assert.equal(client.ready,true);
}));

test('an overdue readiness timer allows a queued join response after a rendering stall',()=>withClock(async({client,requests,timers,setClock,fire})=>{
 const ready=client.whenReady(30000).then(()=>({ready:true}),error=>({error}));
 const deadline=[...timers.keys()].at(-1);
 requests[0].resolve({csrfToken:'proof'});await flush();
 // Both fetch completion and this timer were blocked on the main thread.
 setClock(32000);fire(deadline);
 assert.equal(requests[1].options.signal.aborted,false);
 requests[1].resolve(snapshot);await flush();
 assert.deepEqual(await ready,{ready:true});assert.equal(client.ready,true);assert.equal(timers.size,0);
}));

test('rendering grace expires once and aborts a join that never confirms',()=>withClock(async({client,requests,errors,timers,setClock,fire,advance})=>{
 const ready=client.whenReady(30000).then(()=>null,error=>error),deadline=[...timers.keys()].at(-1);
 requests[0].resolve({csrfToken:'proof'});await flush();
 setClock(32000);fire(deadline);assert.equal(errors.length,0);
 await advance(33000);const error=await ready;
 assert.equal(error.code,'ROOM_CONNECTION_TIMEOUT');assert.match(error.message,/timed out/i);
 assert.equal(requests[1].options.signal.aborted,true);assert.equal(errors.length,1);assert.equal(client.ready,false);assert.equal(timers.size,0);
 requests[1].resolve(snapshot);await flush();assert.equal(client.ready,false);
}));

test('an explicit short readiness deadline still closes an unconfirmed room',()=>withClock(async({client,requests,errors,advance})=>{
 const ready=client.whenReady(1000).then(()=>null,error=>error);
 await advance(1000);const error=await ready;
 assert.equal(error.code,'ROOM_CONNECTION_TIMEOUT');assert.equal(requests[0].options.signal.aborted,true);assert.equal(errors.length,1);
}));
