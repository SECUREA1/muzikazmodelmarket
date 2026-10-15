import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
test('server room controls movement, interactions, health, cooldowns, replay and durable state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'authoritative-room-'));let now=100000;const charged=[],recorded=[],rewards=[];
 try{const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,charge:async(...args)=>charged.push(args),telemetry:async(...args)=>recorded.push(args),reward:async(...args)=>rewards.push(args)});
 const map={id:'test',updatedAt:'v1',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[{id:'door',modelId:'door',position:{x:1,y:0,z:0},functionalSettings:{behavior:'door'}},{id:'enemy',modelId:'enemy',position:{x:0,y:0,z:-4},functionalSettings:{behavior:'hostile',health:100,damage:10}}]}};
 const identity={accountId:'alice',username:'Alice',walletId:'alice-wallet',stats:{health:100}};
 const send=(action,extra={},requestId='command-'+now)=>runtime.command('test',map,identity,{action,requestId,...extra});
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]}),{statusCode:409});
 let state=await send('join');assert.equal(state.authoritative,true);assert.equal(state.players['account:alice'].username,'Alice');
 await send('input',{input:{side:1,yaw:0,position:{x:99999},health:0}},'input-1');now+=250;
 state=await runtime.snapshot('test',map);assert.equal(state.players['account:alice'].position.x,1);assert.equal(state.players['account:alice'].health,100);
 await send('input',{input:{}},'input-stop');await send('interact',{},'door-on');assert.equal((await runtime.snapshot('test',map)).actors.door.open,true);
 await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-1');await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-1');assert.equal(charged.length,1);
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]},'shot-too-soon'),{statusCode:429});now+=500;await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-2');assert.equal(charged.length,2);
 assert.equal((await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now}).snapshot('test',map)).actors.door.open,true);
 assert.ok(recorded.every(([,sample])=>sample.health===100));assert.ok(rewards.length>0);
 await assert.rejects(send('client-health',{health:1000},'spoof'),{statusCode:422});
 await runtime.care('account:alice',{id:'care-1',effect:{stat:'health',amount:35}});await runtime.care('account:alice',{id:'care-1',effect:{stat:'health',amount:35}});assert.equal((await runtime.player('test','account:alice')).careReceipts.length,1);
 now+=20000;await assert.rejects(send('input',{input:{}},'expired'),{statusCode:409});
 assert.equal((await runtime.snapshot('other',{id:'other',spawn:{x:0,y:0,z:0}})).players['account:alice'],undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
