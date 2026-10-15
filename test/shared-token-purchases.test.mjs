import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MzkAccountStore} from '../loadout-code-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {PaymentOrderStore} from '../payment-order-store.mjs';

test('verified crypto top-ups, earned rewards, trading and gameplay share one durable balance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shared-mzk-'));
 try{
  const accounts=new MzkAccountStore(join(dir,'accounts.json')),users=new UserJsonDatabase(join(dir,'users.json'));
  const payments=new PaymentOrderStore(join(dir,'payments.json'),{verifyTransaction:async()=>({verified:true,amountReceived:1,confirmations:10})});
  const member=await accounts.freePlayLogin('SharedTokenPlayer','shared-token-password');
  const other=await accounts.freePlayLogin('OtherTokenPlayer','other-token-password');
  let state=await users.ensureAccount(member);const owner=state.walletId,start=state.tokens.MZK;
  const order=await payments.create({memberAccountId:member.accountId,purchaseType:'MZK_PURCHASE',itemId:'mzk-land-presale',basePrice:5,expectedAmount:1,paymentAsset:'SOL',metadata:{tokens:99999999}});
  await assert.rejects(accounts.fulfillTokenPurchase(order,member.accountId),/verified/);
  const paid=await payments.submit(order.orderId,'confirmed-sol-transaction');
  await assert.rejects(accounts.fulfillTokenPurchase(paid,other.accountId),/different member/);
  state=await users.ensureAccount(await accounts.fulfillTokenPurchase(paid,member.accountId));assert.equal(state.tokens.MZK,start+2000);
  await users.spendGameplay(owner,{amountMzk:30,requestId:'game-one',gameId:'rad-tox'});
  state=await users.ensureAccount(await accounts.fulfillTokenPurchase(paid,member.accountId));assert.equal(state.tokens.MZK,start+1970);
  const again=await payments.create({memberAccountId:member.accountId,purchaseType:'MZK_PURCHASE',basePrice:5,expectedAmount:1,paymentAsset:'SOL'});
  const againPaid=await payments.submit(again.orderId,'second-sol-transaction');
  state=await users.ensureAccount(await accounts.fulfillTokenPurchase(againPaid,member.accountId));assert.equal(state.tokens.MZK,start+2470);
  const reloaded=new UserJsonDatabase(join(dir,'users.json'));assert.equal((await reloaded.get(owner)).tokens.MZK,start+2470);
  await assert.rejects(users.memberReward(owner,'claim',{rewardId:'field:first-contact'}),/Complete/);
  for(let i=0;i<3;i++)await users.memberReward(owner,'progress',{scope:'field',event:'defeat',requestId:'defeat-'+i});
  await users.memberReward(owner,'claim',{rewardId:'field:first-contact'});
  await users.memberReward(owner,'claim',{rewardId:'field:first-contact'});
  assert.equal((await users.get(owner)).tokens.MZK,start+2500);
  await assert.rejects(users.memberReward(owner,'claim',{rewardId:'arbitrary-million-tokens'}),/Unknown/);
  const spend=await users.spendGameplay(owner,{amountMzk:20,requestId:'audio-insert',gameId:'audio-mixer'});
  const duplicate=await users.spendGameplay(owner,{amountMzk:20,requestId:'audio-insert',gameId:'audio-mixer'});assert.equal(duplicate.id,spend.id);
  assert.equal((await users.get(owner)).tokens.MZK,start+2480);
  await users.refundAudioSpend(owner,'audio-insert');await users.refundAudioSpend(owner,'audio-insert');
  assert.equal((await users.get(owner)).tokens.MZK,start+2500);
  await assert.rejects(users.refundAudioSpend(owner,'game-one'),/not found/);

 }finally{await rm(dir,{recursive:true,force:true});}
});
