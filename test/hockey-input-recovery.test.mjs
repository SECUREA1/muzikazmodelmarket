import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHockeyInputPump} from '../public/js/hockey-local-motion.js';

const source=readFileSync(new URL('../public/js/hockey-game.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function inputFailure('),source.indexOf('const inputPump=',source.indexOf('async function inputFailure(')));
const drain=async()=>{for(let index=0;index<30;index++)await Promise.resolve();};
function fixture(){
 let resets=0,rejoins=0;const keys=new Set(),context=vm.createContext({
  keys,controllerMove:{x:0,y:0},hockeyTrigger:{reset(){resets++;}},connectionError:'',running:true,live:true,busy:false,spectating:false,
  inputPump:{reset(){}},localSkating:{reset(){}},accept(){},
  $:()=>({value:'',checked:false}),command:async()=>{rejoins++;return {};}
 });
 vm.runInContext(handler,context);
 return {keys,context,resets:()=>resets,rejoins:()=>rejoins};
}

test('a delayed transient input failure preserves newer held keyboard and stick controls',async()=>{
 for(const failure of [Error('late timeout'),Object.assign(Error('late upstream error'),{status:503}),Object.assign(Error('slow request'),{status:408}),Object.assign(Error('retry later'),{status:429}),Object.assign(Error('proof race'),{status:401,code:'CSRF_INVALID'})]){
  const state=fixture(),requests=[];
  const pump=createHockeyInputPump({send:input=>new Promise((resolve,reject)=>requests.push({input,resolve,reject})),onSnapshot(){},onError:state.context.inputFailure});
  try{
   pump.push({x:0,z:0});await drain();
   state.keys.add('w');state.context.controllerMove={x:.75,y:-.5};
   pump.push({x:.75,z:1});await drain();requests[1].resolve({sequence:2});await drain();
   requests[0].reject(failure);await drain();
   assert.ok(state.keys.has('w'),'an obsolete failed request cannot release a currently held key');
   assert.equal(state.context.controllerMove.x,.75);assert.equal(state.context.controllerMove.y,-.5);
   assert.equal(state.resets(),0);assert.equal(state.rejoins(),0);
   state.keys.delete('w');state.context.controllerMove={x:0,y:0};pump.push({x:0,z:0});await drain();
   assert.deepEqual(requests[2].input,{x:0,z:0},'an explicit release still sends neutral controls');
   requests[2].resolve({sequence:3});await drain();
  }finally{pump.stop();}
 }
});

test('terminal session loss and room replacement clear held controls while an expired room may rejoin',async()=>{
 for(const failure of [Object.assign(Error('expired session'),{status:401}),Object.assign(Error('permission revoked'),{status:403}),Object.assign(Error('joined another map'),{status:409,code:'ROOM_SWITCHED'}),Object.assign(Error('room expired'),{status:409})]){
  const state=fixture();state.keys.add('w');state.context.controllerMove={x:1,y:1};
  await state.context.inputFailure(failure);
  assert.equal(state.keys.size,0);assert.equal(state.context.controllerMove.x,0);assert.equal(state.context.controllerMove.y,0);assert.equal(state.resets(),1);
  assert.equal(state.rejoins(),failure.status===409&&failure.code!=='ROOM_SWITCHED'?1:0,'a replaced room must not take the player back from the new map');
 }
});
