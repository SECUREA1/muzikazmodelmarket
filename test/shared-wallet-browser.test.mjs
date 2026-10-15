import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('browser wallet displays the member ledger and waits for server-confirmed spending',async()=>{
 const values=new Map([['muzikazBottleMemberEmail','player'],['muzikazMzkLedgerV1',JSON.stringify([{id:'forged-local',walletId:'player',amount:9999999}])]]);
 const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 let balance=100;const requests=[];
 const api={fetch:async(path,options)=>{requests.push({path,options});let data;
  if(path==='/api/market/session')data={owner_id:'account:member',balance,csrfToken:'csrf',ledger:[],hasTokenPurchase:true};
  else if(path==='/api/wallet/spend'){const input=JSON.parse(options.body);balance-=input.amountMzk;data={balanceAfterMzk:balance};}
  else throw new Error('unexpected endpoint');
  return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
 }};
 const window={MUZIKAZ_API:api,addEventListener(){},dispatchEvent(){},setInterval(){}};
 const document={addEventListener(){},querySelector(){return null;}};
 vm.runInNewContext(await readFile(new URL('../mzk-wallet.js',import.meta.url),'utf8'),{window,document,localStorage,CustomEvent:class{},crypto,Uint32Array,Date,Math,JSON,String,Number,Object,Array,Set});
 await window.MZKWallet.refreshShared();
 assert.equal(window.MZKWallet.walletId(),'account:member');assert.equal(window.MZKWallet.balance(),100);
 assert.equal(window.MZKWallet.purchaseTokens(5),500);
 assert.equal(window.MZKWallet.spend(10,'old client').ok,false);
 const spent=await window.MZKWallet.spendAsync(35,'test spend','idempotent-request');assert.equal(spent.ok,true);assert.equal(window.MZKWallet.balance(),65);
 const request=requests.find(item=>item.path==='/api/wallet/spend');assert.equal(request.options.headers['X-CSRF-Token'],'csrf');assert.equal(JSON.parse(request.options.body).requestId,'idempotent-request');
 window.MZKWallet.creditPurchase(5,{owner:'account:member',transactionHash:'unverified-local'});
 assert.equal(window.MZKWallet.balance(),65,'browser credit cannot increase spendable member funds');
});
