import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {ownedFactoryModel} from '../factory-item-provenance.mjs';
import {factoryCommand,resolveFactoryAsset,assertFactoryDeploymentAvailable} from '../server-missile-factory.mjs';
import {testingCommand} from '../server-factory-testing.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {factoryProvingGroundsWorld} from '../factory-testing-world.mjs';
import {factoryStations} from '../public/js/missile-factory-config.js';
import {testingStations,testingTargets,PROVING_ID} from '../public/js/factory-test-config.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'factory-market-logistics-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),seller='account:manufacturer',buyer='account:customer',itemId='factory-item:market-test',proofId='factory-proof-market';
 await database.transaction(data=>{for(const wallet of [seller,buyer])data.users[wallet]={walletId:wallet,tokens:{MZK:2000},items:[],memory:{},revision:0};data.users[seller].items.push({id:itemId,name:'Tested training model',type:'factory-model',buildAssetId:'factory-training-missile',source:'missile-factory'});data.transactions.push({id:proofId,type:'FACTORY_ITEM_CREATED',walletId:seller,itemId,recipeId:'training-missile',createdAt:new Date(1).toISOString()});data.factoryLogistics={certificates:{[proofId+':'+itemId]:{id:'cert-market-test',proofId,itemId,buildAssetId:'factory-training-missile',profileId:'accuracy',issuedTo:seller,testReceiptId:'qualifying-test',score:100,grade:'Gold',issuedAt:new Date(2).toISOString(),sourceEnvironmentId:PROVING_ID}},manifests:{},itemLocks:{},productionCredits:{}};data.transactions.push({id:'qualifying-test',type:'FACTORY_TEST_COMPLETE',walletId:seller,environmentId:PROVING_ID,itemId,proofId,profileId:'accuracy',qualified:true,score:100},{id:'issued-cert',type:'FACTORY_CERTIFICATE_ISSUED',certificateId:'cert-market-test',itemId,proofId});return {};});
 return {database,seller,buyer,itemId,proofId};
}
test('a certified production model transfers once through the MZK market and remains deployable after trade-feed pruning',async t=>{
 const f=await fixture(t);await f.database.listItem(f.seller,f.itemId,220);const listing=(await f.database.marketListings())[0];assert.equal(listing.certified,true);assert.equal(listing.certification.score,100);assert.equal(listing.certification.proofId,undefined);
 const input={buyerId:f.buyer,sellerId:f.seller,itemId:f.itemId,expectedPriceMzk:220,requestId:'certified-model-sale'};
 const trade=await f.database.trade(input);assert.deepEqual(await f.database.trade(input),trade);assert.equal((await f.database.get(f.seller)).tokens.MZK,2220);assert.equal((await f.database.get(f.buyer)).tokens.MZK,1780);
 await f.database.transaction(data=>{data.trades=[];return {};});const data=await f.database.read();assert.equal(ownedFactoryModel(data,f.seller,f.itemId),null);assert.equal(ownedFactoryModel(data,f.buyer,f.itemId).proofId,f.proofId);
 assert.equal((await resolveFactoryAsset(f.database,f.buyer,f.itemId)).buildAssetId,'factory-training-missile');assert.equal((await f.database.economy(f.buyer)).ownedAssets[0].certified,true);
 await f.database.listItem(f.buyer,f.itemId,230);assert.equal((await f.database.marketListings())[0].certification.id,'cert-market-test');
});
test('sealed freight blocks new and already-listed purchases, tests and display deployment until released',async t=>{
 const f=await fixture(t);await f.database.listItem(f.seller,f.itemId,220);
 await f.database.transaction(data=>{data.factoryLogistics.manifests.packed={id:'packed',status:'booked'};data.factoryLogistics.itemLocks.packed={walletId:f.seller,itemId:f.itemId,manifestId:'packed'};return {};});
 assert.deepEqual(await f.database.marketListings(),[]);await assert.rejects(f.database.listItem(f.seller,f.itemId,220),/freight manifest/);await assert.rejects(f.database.trade({buyerId:f.buyer,sellerId:f.seller,itemId:f.itemId,requestId:'reserved-purchase'}),/freight manifest/);
 await assert.rejects(resolveFactoryAsset(f.database,f.seller,f.itemId),/freight manifest/);await assert.rejects(assertFactoryDeploymentAvailable(f.database,f.seller,{itemId:f.itemId}),/freight manifest/);
 const environment=factoryProvingGroundsWorld(),setup=testingStations(environment).find(station=>station.kind==='setup'),target=testingTargets(environment).find(target=>target.profileId==='accuracy'),player={actorId:f.seller,health:100,position:setup.position};
 await assert.rejects(testingCommand({actors:{}},player,environment,{action:'proving-setup',requestId:'reserved-test',stationId:setup.id,itemId:f.itemId,profileId:'accuracy',targetId:target.id},Date.now(),{database:f.database,walletId:f.seller}),/freight manifest/);
 await f.database.listItem(f.seller,f.itemId,220,false);await f.database.transaction(data=>{data.factoryLogistics.manifests.packed.status='cancelled';return {};});await f.database.listItem(f.seller,f.itemId,220);assert.equal((await f.database.marketListings()).length,1);
});
test('active launch reservations block market settlement and unverified model identities cannot be listed',async t=>{
 const f=await fixture(t);await f.database.listItem(f.seller,f.itemId,220);await f.database.transaction(data=>{data.factoryTesting={itemLocks:{[f.proofId+':'+f.itemId]:{sessionId:'test',expiresAt:Date.now()+60000}}};data.users[f.seller].items.push({id:'fake-model',type:'factory-model',buildAssetId:'factory-cargo-rocket'});return {};});
 await assert.rejects(f.database.trade({buyerId:f.buyer,sellerId:f.seller,itemId:f.itemId,requestId:'launch-purchase'}),/active launch/);await assert.rejects(f.database.listItem(f.seller,'fake-model',50),/verified production/);assert.equal((await f.database.get(f.buyer)).tokens.MZK,2000);
});
test('shipping production credit discounts only a valid new order and duplicate requests cannot spend it twice',async t=>{
 const f=await fixture(t),environment=missileFactoryWorld(),station=factoryStations(environment).find(station=>station.kind==='procurement'),player={actorId:f.seller,health:100,position:{...station.position}},sim={actors:{},players:{}};
 await f.database.transaction(data=>{data.factoryLogistics.productionCredits[f.seller]=2;return {};});const input={action:'factory-start',recipeId:'training-missile',stationId:station.id,requestId:'credited-order'};
 player.position.x+=100;await assert.rejects(factoryCommand(sim,player,environment,input,Date.now(),{database:f.database,walletId:f.seller}),/closer/);assert.equal((await f.database.read()).factoryLogistics.productionCredits[f.seller],2);
 player.position={...station.position};const result=await factoryCommand(sim,player,environment,input,Date.now(),{database:f.database,walletId:f.seller});assert.equal(result.factory.job.costMzk,160);assert.equal(result.factory.job.supplyCreditMzk,20);assert.equal(result.factory.balance,1840);
 await factoryCommand(sim,player,environment,input,Date.now(),{database:f.database,walletId:f.seller});assert.equal((await f.database.read()).factoryLogistics.productionCredits[f.seller],1);assert.equal((await f.database.get(f.seller)).tokens.MZK,1840);
});
