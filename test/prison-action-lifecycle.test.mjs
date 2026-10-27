import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRISON_STATIONS} from '../public/js/prison-config.js';
import {makePrisonActionPacket} from '../public/js/prison-protocol.js';

const source=readFileSync(new URL('../public/js/prison-game.js',import.meta.url),'utf8');
const start=source.indexOf(' async function send(operation');
const send=source.slice(start,source.indexOf(' async function claimItem(',start));
const turns=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
 let respond,reject;const reply=new Promise((yes,no)=>{respond=yes;reject=no;});
 const requests=[],timers=[],accepted=[];
 const context=vm.createContext({PRISON_STATIONS,makePrisonActionPacket,
  selected:PRISON_STATIONS[0],revision:1,disposed:false,busy:false,message:'',readyAt:{},
  clock:()=>1000,blockReason:()=>context.busy?'Wait for the current action to finish.':'',
  render(){},document:{activeElement:null,body:{}},panel:{hidden:false},activity:{querySelectorAll:()=>[]},
  prepareRadio(){},playRadio(){},stopRadio(){},accept:result=>accepted.push(result),
  command:(action,fields)=>{requests.push({action,fields});return reply;},
  setTimeout:(fn,delay)=>timers.push({fn,delay}),
 });
 vm.runInContext(send,context);
 return {context,requests,timers,accepted,respond,reject};
}

test('prison actions stay exclusive through a delayed reply and the post-reply pacing window',async()=>{
 const f=fixture(),pending=f.context.send('role-guard');
 await f.context.send('role-prisoner');assert.equal(f.requests.length,1);assert.equal(f.context.busy,true);
 assert.equal(f.timers.length,0,'no pacing timer runs while a slow request is still pending');
 f.respond({result:{ok:true,message:'Guard shift started.'}});await turns();
 assert.equal(f.accepted.length,1);assert.equal(f.context.busy,true);
 await f.context.send('role-prisoner');assert.equal(f.requests.length,1,'reply arrival cannot immediately dispatch a second action');
 assert.equal(f.timers.length,1);assert.ok(f.timers[0].delay>=250);
 f.timers.shift().fn();await pending;assert.equal(f.context.busy,false);
});

test('a rejected prison action releases controls and retains the useful server message',async()=>{
 const f=fixture(),pending=f.context.send('role-guard');
 f.reject(Error('Walk closer to intake.'));await turns();
 assert.equal(f.context.message,'Walk closer to intake.');assert.equal(f.accepted.length,0);
 f.timers.shift().fn();await pending;assert.equal(f.context.busy,false);
});

test('a reply from a previous prison session cannot overwrite the replacement session',async()=>{
 const f=fixture(),pending=f.context.send('role-guard');
 f.context.revision++;f.context.busy=true;f.context.message='Replacement session';
 f.respond({result:{ok:true,message:'Old guard shift'}});await turns();
 f.timers.shift().fn();await pending;
 assert.deepEqual(f.accepted,[]);assert.equal(f.context.message,'Replacement session');
 assert.equal(f.context.busy,true,'the obsolete request cannot clear a newer request lock');
});
