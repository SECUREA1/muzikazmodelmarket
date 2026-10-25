import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'movement-presence-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;
 const environment={id:'presence-recovery',name:'Presence recovery',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const identity={accountId:'walker',username:'Walker',stats:{health:100}},selfId='account:walker';
 const send=(action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'presence-'+ ++request,...fields});
 const joined=await send('join',{deferRadTox:true,radToxEnabled:false});
 return {send,store,runtime,environment,selfId,now:()=>now,epoch:joined.inputEpoch,advance(ms){now+=ms;}};
}

test('fresh epoch-scoped movement resumes after slow startup without another join or stale held motion',async t=>{
 const f=await fixture(t);
 await f.send('input',{inputEpoch:f.epoch,inputSequence:1,input:{forward:1,yaw:0}});
 const before=(await f.store.get(f.environment.id)).simulation.players[f.selfId].position;
 f.advance(45000);
 const resumed=await f.send('input',{inputEpoch:f.epoch,inputSequence:2,input:{side:1,yaw:0}});
 assert.equal(resumed.inputEpoch,f.epoch,'resuming does not reset input ordering or the player');
 assert.ok(Math.hypot(...['x','y','z'].map(axis=>resumed.players[f.selfId].position[axis]-before[axis]))<1e-8,'the expired forward hold is not replayed during recovery');
 assert.equal(resumed.players[f.selfId].input.side,1);
 f.advance(100);
 const moved=await f.send('input',{inputEpoch:f.epoch,inputSequence:3,input:{side:1,yaw:0}});
 assert.ok(moved.players[f.selfId].position.x>before.x+.1,'fresh input makes physical progress');
});

test('expired players cannot be revived by missing proofs, obsolete epochs or replayed input sequences',async t=>{
 for(const fields of [{},{inputEpoch:'obsolete',inputSequence:2},{inputEpoch:undefined,inputSequence:2},{inputSequence:1}]){
  const f=await fixture(t);
  await f.send('input',{inputEpoch:f.epoch,inputSequence:1,input:{}});
  f.advance(16000);
  await assert.rejects(f.send('input',{inputEpoch:f.epoch,...fields,input:{}}),error=>error.code==='ROOM_JOIN_REQUIRED');
 }
});

test('fresh input for an old destination cannot revive a player who changed rooms',async t=>{
 const f=await fixture(t);
 await f.store.update(f.environment.id,room=>{room.simulation.players[f.selfId].replacedByRoom='another-room';});
 f.advance(16000);
 await assert.rejects(f.send('input',{inputEpoch:f.epoch,inputSequence:1,input:{forward:1}}),error=>error.code==='ROOM_SWITCHED');
});

test('malformed commands and replayed receipts do not renew an expired presence lease',async t=>{
 const f=await fixture(t);
 await f.send('input',{inputEpoch:f.epoch,inputSequence:1,input:{}});
 const lastSeen=(await f.store.get(f.environment.id)).simulation.players[f.selfId].lastSeen;
 f.advance(16000);
 await assert.rejects(f.send('input',{requestId:'bad id',inputEpoch:f.epoch,inputSequence:2,input:{}}),/request ID/);
 const replay=await f.send('input',{requestId:'presence-2',inputEpoch:f.epoch,inputSequence:2,input:{forward:1}});
 assert.equal(replay.players[f.selfId],undefined);
 assert.equal((await f.store.get(f.environment.id)).simulation.players[f.selfId].lastSeen,lastSeen);
});

test('resuming an expired player respects the room capacity',async t=>{
 const f=await fixture(t);f.runtime.capacity=1;f.advance(16000);
 await f.store.update(f.environment.id,room=>{room.simulation.players['account:other']={...structuredClone(room.simulation.players[f.selfId]),actorId:'account:other',lastSeen:f.now()};});
 await assert.rejects(f.send('input',{inputEpoch:f.epoch,inputSequence:1,input:{forward:1}}),error=>error.statusCode===409&&/room is full/.test(error.message));
});
