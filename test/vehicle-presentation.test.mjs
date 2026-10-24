import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForVehiclePresentation} from '../public/js/game-action-loading.js';

test('boarding waits for a streamed vehicle model and stops waiting when the world changes',async()=>{
 let time=0,root=null,frames=0;
 assert.equal(await waitForVehiclePresentation({getRoot:()=>root,now:()=>time,frame:async()=>{time+=16;if(++frames===4)root={model:'aircraft'};}}),true);
 assert.equal(frames,4);
 let current=true;root=null;frames=0;
 assert.equal(await waitForVehiclePresentation({getRoot:()=>root,isCurrent:()=>current,now:()=>time,frame:async()=>{time+=16;frames++;current=false;}}),false);
 assert.equal(frames,1);
});
test('a failed model stream has a bounded wait without stopping gameplay controls',async()=>{
 let time=0;
 assert.equal(await waitForVehiclePresentation({getRoot:()=>null,timeoutMs:100,now:()=>time,frame:async()=>{time+=20;}}),false);
 assert.equal(time,100);
});
