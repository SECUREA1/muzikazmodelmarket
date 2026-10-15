import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveStoreCart,COLLECTION_PRICES} from '../store-catalog.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
test('all five collections have server prices and each bought copy remains tradable across restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'collection-pack-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'users.json'),db=new UserJsonDatabase(file);
 const catalog=['aape','voltwolf','sharko','ioncduck','flaminglow'].map(id=>({id:'repository-'+id,name:id,modelUrl:'/public/models/avatars/'+id+'.glb',assetType:'avatar'}));
 const cart=catalog.map(asset=>({quantity:2,name:'fake low price',price:0,deliverable:{id:asset.id,modelUrl:'https://wrong.example/fake.glb'}}));
 const quote=resolveStoreCart(cart,catalog);for(const item of quote.items){assert.equal(item.priceUsd,COLLECTION_PRICES[item.catalogId]);assert.match(item.modelUrl,/^\/public/);assert.equal(item.assetType,'avatar');}
 const account=id=>({accountId:id,mzkBalance:100000,landAssets:[],gameAssets:[],bottleClaims:[]});await db.ensureAccount(account('owner'));await db.ensureAccount(account('buyer'));
 const receipt=await db.purchaseStoreModels('account:owner',quote.items,quote.amountMzk,'buy-collections');assert.equal(receipt.items.length,10);assert.equal(new Set(receipt.items.map(item=>item.id)).size,10);
 await db.purchaseStoreModels('account:owner',quote.items,quote.amountMzk,'buy-collections');assert.equal((await db.get('account:owner')).items.length,10);
 const item=receipt.items[0];await db.listItem('account:owner',item.id,50);await db.trade({buyerId:'account:buyer',sellerId:'account:owner',itemId:item.id,requestId:'resale',expectedPriceMzk:50});
 const restarted=new UserJsonDatabase(file);assert.equal((await restarted.get('account:buyer')).items[0].modelUrl,item.modelUrl);assert.equal((await restarted.get('account:owner')).items.length,9);
});
test('verified crypto delivery credits the purchasing member once and survives wallet linking',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'verified-model-pack-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new UserJsonDatabase(join(dir,'users.json'));
 const account={accountId:'crypto-member',mzkBalance:200,landAssets:[],gameAssets:[],bottleClaims:[]};await db.ensureAccount(account);
 const order={orderId:'verified-order-1',memberAccountId:account.accountId,purchaseType:'MARKETPLACE',paymentStatus:'CONFIRMING',metadata:{items:[{quantity:1,price:44,deliverable:{id:'ioncduck',name:'Crew Penguin',assetType:'avatar',modelUrl:'/penguin.glb'}}]}};
 assert.throws(()=>db.fulfillStoreOrder('account:crypto-member',order),/verified/);order.paymentStatus='PAID';
 const receipt=await db.fulfillStoreOrder('account:crypto-member',order);assert.equal((await db.get('account:crypto-member')).tokens.MZK,200);
 const address='0x'+'3'.repeat(40);await db.ensureAccount({...account,primaryEthereumWallet:address});
 assert.equal((await db.fulfillStoreOrder(address,order)).id,receipt.id);assert.equal((await db.get(address)).items.length,1);
});
