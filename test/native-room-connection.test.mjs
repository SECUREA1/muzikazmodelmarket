import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SharedGameInventory} from '../public/js/shared-game-inventory.js';

const flush=async()=>{for(let turn=0;turn<20;turn++)await Promise.resolve();};
const sources={};
for(const [kind,start,end]of [
 ['hockey','async function command(','function accept('],
 ['arcade','async function roomCommand(','function applyMatch(']
]){
 const source=readFileSync(new URL('../public/js/'+kind+'-game.js',import.meta.url),'utf8'),from=source.indexOf(start);
 sources[kind]=source.slice(from,source.indexOf(end,from));
}

async function withRoom(kind,run){
 const previous={window:globalThis.window,performance:globalThis.performance,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const requests=[],timers=new Map();let clock=0,nextTimer=0,sessions=0;
 const performance={now:()=>clock};globalThis.performance=performance;
 globalThis.setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+delay});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.window={fetch:async(path,options)=>{
  if(path==='/api/game/room-session')return {ok:true,json:async()=>({data:{csrfToken:'proof-'+ ++sessions}})};
  return new Promise((resolve,reject)=>{
   const request={path,options,body:JSON.parse(options.body),reject,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>status<400?{data}:data})};
   requests.push(request);
   options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  });
 }};
 const api=new SharedGameInventory(),context=vm.createContext({api,roomApi:api,session:null,roomSession:null,mapId:'hockey-arena',environmentId:'neon-junction',game:4,roomRequestRevision:7,roomInputSequence:10,roomInputEpoch:'current-epoch',performance,encodeURIComponent});
 vm.runInContext(sources[kind],context);
 const command=kind==='hockey'?context.command:context.roomCommand;
 try{await run({command,context,requests,timers,sessions:()=>sessions,advance:async value=>{
  clock=value;
  for(const [id,timer]of [...timers])if(timer.at<=clock&&timers.has(id)){timers.delete(id);timer.callback();await flush();}
 }});}finally{for(const request of requests)request.reject(Error('Test finished'));await flush();Object.assign(globalThis,previous);}
}

for(const kind of ['hockey','arcade']){
 for(const action of ['join','spectate'])test(kind+' '+action+' accepts a valid 24-second room response',()=>withRoom(kind,async({command,requests,advance,timers})=>{
  const pending=command(action,{slot:1,settings:{difficulty:'pro'}}).then(value=>({value}),error=>({error}));await flush();
  assert.equal(requests.length,1);const request=requests[0];
  await advance(8000);await advance(24000);
  assert.equal(request.options.signal.aborted,false);
  request.resolve({selfId:'account:test',role:action==='join'?'player':'spectator'});
  const outcome=await pending;assert.equal(outcome.error,undefined);assert.equal(outcome.value.selfId,'account:test');assert.equal(requests.length,1);assert.equal(timers.size,0);
 }));

 test(kind+' input still aborts at eight seconds without replaying the command',()=>withRoom(kind,async({command,requests,advance})=>{
  const pending=command('input',{input:{forward:1}}).then(()=>null,error=>error);await flush();
  await advance(8000);const error=await pending;
  assert.equal(error.name,'AbortError');assert.equal(requests[0].options.signal.aborted,true);assert.equal(requests.length,1);
 }));

 test(kind+' refreshes only an explicitly invalid proof and preserves the ordered payload',()=>withRoom(kind,async({command,context,requests,sessions})=>{
  const fields={input:{forward:1},...(kind==='hockey'?{inputSequence:12,inputEpoch:'current-epoch'}:{})};
  const pending=command('input',fields);await flush();
  requests[0].resolve({code:'CSRF_INVALID',message:'Refresh the proof.'},401);await flush();
  assert.equal(requests.length,2);assert.equal(sessions(),2);
  assert.equal(requests[0].options.body,requests[1].options.body,'Proof refresh must reuse the exact input packet.');
  assert.equal(requests[0].options.headers['X-CSRF-Token'],'proof-1');assert.equal(requests[1].options.headers['X-CSRF-Token'],'proof-2');
  assert.equal(requests[1].body.inputEpoch,'current-epoch');assert.equal(requests[1].body.inputSequence,kind==='hockey'?12:11);
  if(kind==='arcade')assert.equal(context.roomInputSequence,11,'A proof retry must not consume a second input sequence.');
  requests[1].resolve({sequence:5});assert.equal((await pending).sequence,5);
 }));

 test(kind+' gives up after one rejected proof refresh',()=>withRoom(kind,async({command,requests,sessions})=>{
  const pending=command('join').then(()=>null,error=>error);await flush();
  for(let index=0;index<2;index++){requests[index].resolve({code:'CSRF_INVALID',message:'Proof rejected.'},401);await flush();}
  assert.equal((await pending).code,'CSRF_INVALID');assert.equal(requests.length,2);assert.equal(sessions(),2);
 }));

 test(kind+' does not repeat an ambiguous network failure',()=>withRoom(kind,async({command,requests,sessions})=>{
  const failure=Error('Response lost after the server accepted the command.');
  const pending=command('join').then(()=>null,error=>error);await flush();requests[0].reject(failure);
  assert.equal(await pending,failure);assert.equal(requests.length,1);assert.equal(sessions(),1);
 }));
}
