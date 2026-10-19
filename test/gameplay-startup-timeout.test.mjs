import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Cold GLB collision construction can take longer than ordinary inventory
// requests. Advance a fake clock instead of making the test wait in real time.
const source=readFileSync(new URL('../public/js/shared-game-inventory.js',import.meta.url),'utf8').replace(/\bexport /g,'');
function fixture(responseMs=12000){
 let now=0,nextId=0;const timers=new Map();
 const setTimeout=(callback,delay)=>{timers.set(++nextId,{callback,at:now+delay});return nextId;};
 const clearTimeout=id=>timers.delete(id);
 const fetch=(_path,{signal})=>new Promise((resolve,reject)=>{
  const id=setTimeout(()=>resolve({ok:true,json:async()=>({data:{joined:true}})}),responseMs);
  signal.addEventListener('abort',()=>{clearTimeout(id);reject(new Error('request aborted'));},{once:true});
 });
 const Inventory=runInNewContext(source+'\nSharedGameInventory;',{window:{fetch},AbortController,setTimeout,clearTimeout});
 return {inventory:new Inventory(),advance(time){while(true){const entry=[...timers].filter(([,timer])=>timer.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].callback();}now=time;}};
}

test('a cold gameplay join can finish after twelve seconds while ordinary requests retain their short timeout',async()=>{
 const cold=fixture(),joined=cold.inventory.api('/api/rooms/house/gameplay',{timeout:30000});
 cold.advance(12000);assert.equal((await joined).joined,true);
 const ordinary=fixture(),request=ordinary.inventory.api('/api/rpg/state');
 const rejected=assert.rejects(request,/request aborted/);ordinary.advance(8000);await rejected;
 const stalled=fixture(60000),waiting=stalled.inventory.api('/api/rooms/house/gameplay',{timeout:30000});
 const bounded=assert.rejects(waiting,/request aborted/);
 stalled.advance(30000);await bounded;
});
