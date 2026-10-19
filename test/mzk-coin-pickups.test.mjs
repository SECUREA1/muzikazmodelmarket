import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {refreshMzkCoins,MZK_COIN_COUNT,MZK_COIN_RESPAWN_MS} from '../server-mzk-coins.mjs';

test('coins populate every room type, use safe floors and respawn with new one-use IDs',()=>{
 for(const environment of [{},{builderScene:{}},{proceduralLand:true}]){
  const sim={actors:{}};refreshMzkCoins(sim,environment,1000,p=>({...p,y:2}),()=>.5);
  assert.equal(Object.keys(sim.actors).length,MZK_COIN_COUNT);
  for(const actor of Object.values(sim.actors)){assert.equal(actor.position.y,2);assert.equal(actor.loot.amount,1);}
  const first=Object.values(sim.actors)[0];first.active=false;first.loot.collectedAt=1000;
  refreshMzkCoins(sim,environment,2000,p=>p);assert.ok(sim.actors[first.id]);
  refreshMzkCoins(sim,environment,1000+MZK_COIN_RESPAWN_MS,p=>p);
  assert.equal(Object.keys(sim.actors).length,MZK_COIN_COUNT);assert.equal(sim.actors[first.id],undefined);
 }
});

test('server confirms reach and credits exactly one MZK once across retries, wallets and restarts',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'mzk-coin-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json'));await db.put('alice',{tokens:{MZK:10}});await db.put('bob',{tokens:{MZK:0}});
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000,collectCoin:(identity,key)=>db.grantMzkCoin(identity.walletId,key)});
 const map={id:'coin-world',builderScene:{},spawn:{x:0,y:0,z:0}},identity={accountId:'alice',walletId:'alice',username:'Alice'};
 const send=(action,requestId,extra={})=>runtime.command(map.id,map,identity,{action,requestId,...extra});
 const joined=await send('join','join');const coin=Object.values(joined.actors).find(actor=>actor.loot?.currency==='MZK');
 await assert.rejects(send('collect','far',{entityId:coin.id}),{statusCode:409});
 await store.update(map.id,room=>{room.simulation.players['account:alice'].position={...coin.position};});
 const receipt=await send('collect','first',{entityId:coin.id});assert.equal(receipt.result.loot.amount,1);assert.equal(receipt.result.loot.balance,11);
 await send('collect','first',{entityId:coin.id});await assert.rejects(send('collect','second',{entityId:coin.id}),{statusCode:409});
 assert.equal((await db.get('alice')).tokens.MZK,11);
 const restarted=new UserJsonDatabase(db.file),key='coin:'+coin.loot.token;
 await restarted.grantMzkCoin('alice',key);assert.equal((await restarted.get('alice')).tokens.MZK,11);
 assert.equal((await restarted.grantMzkCoin('bob',key)).claimedByOther,true);assert.equal((await db.get('bob')).tokens.MZK,0);
 assert.throws(()=>db.grantMzkCoin('alice','arbitrary-amount'));
 await db.grantMzkCoin('alice','coin:'+randomUUID());assert.equal((await db.get('alice')).tokens.MZK,12);
});
