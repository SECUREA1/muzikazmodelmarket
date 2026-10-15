import test from 'node:test';
import assert from 'node:assert/strict';
import {GameMarketClient,marketPrice} from '../public/js/in-game-market.js';

test('market client browses for guests but requires a member for mutations',async()=>{
 let calls=0;const client=new GameMarketClient({owner:()=> 'guest-test',request:async()=>{calls++;return {ok:true,json:async()=>({success:true,data:[]})};}});
 assert.deepEqual(await client.listings(),[]);
 await assert.rejects(client.buy('seller','item'),/Connect/);
 assert.throws(()=>client.list('item',5),/Connect/);
 assert.throws(()=>client.message('seller','hello'),/Connect/);
 assert.equal(calls,1);
});

test('buy uses authoritative API, expected price and stable request ID after a failed response',async()=>{
 const calls=[];let attempt=0;
 const client=new GameMarketClient({owner:()=> 'buyer',id:()=> 'fixed-request',request:async(path,options)=>{
  calls.push({path,options});attempt++;return {ok:attempt>1,json:async()=>attempt===1?{success:false,message:'Temporary failure'}:{success:true,data:{id:'trade-1'}}};
 }});
 await assert.rejects(client.buy('seller','item',40),/Temporary/);
 assert.deepEqual(await client.buy('seller','item',40),{id:'trade-1'});
 assert.equal(calls[0].path,'/api/market/trades');
 const first=JSON.parse(calls[0].options.body),second=JSON.parse(calls[1].options.body);
 assert.equal(first.requestId,second.requestId);assert.equal(first.expectedPriceMzk,40);
 assert.equal(calls[0].options.headers['X-Wallet-Address'],'buyer');assert.equal(calls[0].options.retries,0);
 await assert.rejects(client.buy('buyer','item'),/own listing/);
});

test('listing prices and messages are validated before sending',()=>{
 for(const value of [0,-1,1.5,Infinity,1000001])assert.throws(()=>marketPrice(value));
 assert.equal(marketPrice('25'),25);
 const client=new GameMarketClient({owner:()=> 'member',request:()=>assert.fail('invalid request was sent')});
 assert.throws(()=>client.list('item',0));assert.throws(()=>client.message('member','text'));
 assert.throws(()=>client.message('seller',' '));assert.throws(()=>client.message('seller','x'.repeat(501)));
});
