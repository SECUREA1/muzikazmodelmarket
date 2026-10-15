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

test('in-game care panel loads the member inventory and records current arena health',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const handlers=new Map(),nodes=new Map();
 const node=()=>({textContent:'',innerHTML:'',value:'',setAttribute(){},removeAttribute(){},querySelectorAll(){return [];}});
 const dialog={...node(),open:false,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},addEventListener(name,fn){handlers.set(name,fn);},showModal(){this.open=true;},close(){this.open=false;}};
 const calls=[];
 globalThis.window={MZKWallet:{walletId:()=> 'guest-test'},addEventListener(){},MUZIKAZ_API:{async fetch(path,options={}){
  calls.push({path,options});let data;
  if(path==='/api/account/bootstrap')data={account:{accountId:'care-member'},csrfToken:'token'};
  else if(path==='/api/market/listings')data=[];
  else if(path==='/api/wallet/state')data={tokens:{MZK:100},items:[]};
  else if(path==='/api/rpg/telemetry')data={};
  else if(path==='/api/rpg/state')data={balance:100,stats:{health:40},history:[],items:[{id:'owned-vial',name:'Health vial'}]};
  else throw new Error('Unexpected request '+path);
  return {ok:true,json:async()=>({success:true,data})};
 }}};
 globalThis.document={createElement:()=>dialog,body:{append(){}},documentElement:{classList:{add(){},remove(){}}},querySelector:()=>null};
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[{id:'ion-health-vial',name:'Health vial',description:'Restore health',price:25}]})});
 try{
  const {createGameMarketplace}=await import('../public/js/in-game-market.js');
  const market=createGameMarketplace({telemetry:()=>({health:40,maxHealth:100})});market.open();
  await new Promise(resolve=>setTimeout(resolve,10));
  handlers.get('click')({target:{closest(selector){return selector==='[data-market-tab]'?{dataset:{marketTab:'care'}}:null;}}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.match(nodes.get('[data-market-body]').innerHTML,/Body telemetry/);
  assert.match(nodes.get('[data-market-body]').innerHTML,/data-market-care-use="0"/);
  const sample=calls.find(call=>call.path==='/api/rpg/telemetry');assert.equal(JSON.parse(sample.options.body).health,40);assert.equal(sample.options.headers['X-CSRF-Token'],'token');
  const pack=calls.find(call=>call.path==='/api/wallet/state');assert.equal(pack.options.headers['X-Wallet-Address'],'account:care-member');
 }finally{Object.assign(globalThis,previous);}
});
