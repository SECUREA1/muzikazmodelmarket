import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

const inputKey=(actorId,requestId)=>'input-v2:'+createHash('sha256').update(actorId+':'+requestId).digest('base64url');
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'room-input-receipts-'));
 let now=100000,charges=0,coins=0;
 let store=new SharedRoomStore(join(directory,'rooms.json'));
 const world={id:'receipt-room',updatedAt:'v1',spawn:{x:0,y:0,z:2},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},identity={accountId:'alice',username:'Alice',walletId:'alice-wallet'};
 const options={now:()=>now,charge:async()=>{charges++;},collectCoin:async()=>({id:'coin-credit-'+ ++coins,balanceAfterMzk:2000+coins})};
 let runtime=new AuthoritativeRooms({store,...options});
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 const joined=await runtime.command(world.id,world,identity,{action:'join',requestId:'join',radToxEnabled:false}),actorId=joined.selfId;
 const input=(requestId,inputSequence=1,extra={})=>({action:'input',requestId,inputEpoch:joined.inputEpoch,inputSequence,input:{side:1},...extra});
 return {get store(){return store;},world,identity,actorId,joined,input,send:command=>runtime.command(world.id,world,identity,command),tick:ms=>{now+=ms;},get charges(){return charges;},get coins(){return coins;},async reopen(){await store.flush();runtime.clearCaches();store=new SharedRoomStore(store.file);runtime=new AuthoritativeRooms({store,...options});}};
}

test('input receipt storage omits empty results while legacy and current replay responses survive restart',async t=>{
 const f=await fixture(t),legacyResult={message:'Original legacy result'};
 await f.store.update(f.world.id,room=>{room.simulation.receipts[f.actorId+':legacy-input']={action:'input',result:legacyResult};},{persist:true,roomOnly:true});
 assert.deepEqual((await f.send(f.input('legacy-input'))).result,legacyResult);
 const first=await f.send(f.input('current-input',2));assert.deepEqual(first.result,{});
 let saved=await f.store.get(f.world.id);const receipt=saved.simulation.receipts[inputKey(f.actorId,'current-input')];
 assert.deepEqual(receipt,{action:'input'});assert.equal(saved.simulation.receipts[f.actorId+':current-input'],undefined);
 await f.reopen();
 assert.deepEqual((await f.send(f.input('legacy-input',3))).result,legacyResult);
 const replay=await f.send(f.input('current-input',4,{input:{side:-1}}));assert.deepEqual(replay.result,first.result);assert.equal(replay.players[f.actorId].input.side,1);
});

test('receipt IDs cannot be reused across input and chargeable actions in either direction',async t=>{
 const f=await fixture(t);
 await f.send(f.input('input-then-fire'));
 await assert.rejects(f.send({action:'fire',requestId:'input-then-fire',tool:'laser',direction:[0,0,-1]}),{statusCode:409});
 assert.equal(f.charges,0);
 const fired=await f.send({action:'fire',requestId:'fire-then-input',tool:'laser',direction:[0,0,-1]});
 assert.equal(f.charges,1);
 await assert.rejects(f.send(f.input('fire-then-input',2)),{statusCode:409});
 assert.deepEqual((await f.send({action:'fire',requestId:'fire-then-input',tool:'laser',direction:[0,0,-1]})).result,fired.result);
 assert.equal(f.charges,1);
 await f.reopen();
 await assert.rejects(f.send({action:'fire',requestId:'input-then-fire',tool:'laser',direction:[0,0,-1]}),{statusCode:409});
 await assert.rejects(f.send(f.input('fire-then-input',3)),{statusCode:409});
 assert.equal(f.charges,1);
});

test('nonempty coin results replay exactly without issuing another credit, including after restart',async t=>{
 const f=await fixture(t);
 await f.store.update(f.world.id,room=>{
  const coin=Object.values(room.simulation.actors).find(actor=>actor.loot?.currency==='MZK');assert.ok(coin);
  coin.position={...room.simulation.players[f.actorId].position};
 },{persist:false,roomOnly:true});
 const packet=f.input('collect-coin'),first=await f.send(packet);
 assert.equal(f.coins,1);assert.equal(first.result.loot.amount,1);assert.equal(first.result.loot.balance,2001);
 assert.deepEqual((await f.store.get(f.world.id)).simulation.receipts[inputKey(f.actorId,packet.requestId)].result,first.result);
 const replay=await f.send({...packet,inputSequence:2,input:{side:-1}});assert.deepEqual(replay.result,first.result);assert.equal(f.coins,1);
 await f.reopen();assert.deepEqual((await f.send({...packet,inputSequence:3})).result,first.result);assert.equal(f.coins,1);
});

test('the 500-record global replay window and insertion order remain unchanged',async t=>{
 const f=await fixture(t);
 for(let sequence=1;sequence<=501;sequence++)await f.send(f.input('input-'+sequence,sequence));
 const saved=await f.store.get(f.world.id),keys=Object.keys(saved.simulation.receipts);
 assert.equal(keys.length,500);assert.equal(saved.simulation.receipts[f.actorId+':join'],undefined);
 assert.equal(saved.simulation.receipts[inputKey(f.actorId,'input-1')],undefined);
 assert.equal(keys[0],inputKey(f.actorId,'input-2'));assert.equal(keys.at(-1),inputKey(f.actorId,'input-501'));
 await assert.rejects(f.send({action:'fire',requestId:'input-2',tool:'laser',direction:[0,0,-1]}),{statusCode:409});
 assert.equal(f.charges,0);
 await f.send({action:'fire',requestId:'input-1',tool:'laser',direction:[0,0,-1]});assert.equal(f.charges,1);
 const next=await f.store.get(f.world.id);assert.equal(Object.keys(next.simulation.receipts).length,500);assert.equal(next.simulation.receipts[inputKey(f.actorId,'input-2')],undefined);
});

test('an expired receipt replay cannot masquerade as new ordered input to revive presence',async t=>{
 const f=await fixture(t),packet=f.input('completed-input');await f.send(packet);
 const lastSeen=(await f.store.get(f.world.id)).simulation.players[f.actorId].lastSeen;
 f.tick(16000);
 const replay=await f.send({...packet,inputSequence:2});assert.equal(replay.players[f.actorId],undefined);
 assert.equal((await f.store.get(f.world.id)).simulation.players[f.actorId].lastSeen,lastSeen);
 const resumed=await f.send(f.input('new-ordered-input',2));assert.ok(resumed.players[f.actorId]);
 const wrongEpoch=await f.send(f.input('old-epoch',3,{inputEpoch:'old',input:{side:-1}}));assert.equal(wrongEpoch.players[f.actorId].input.side,1);
 assert.equal((await f.store.get(f.world.id)).simulation.players[f.actorId].lastInputSequence,2);
});
