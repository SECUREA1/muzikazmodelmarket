import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {FACTORY_ID} from '../public/js/missile-factory-config.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS} from '../public/js/factory-test-config.js';
import {FACTORY_SHIPPING_ID,FACTORY_LOGISTICS_STATIONS,logisticsStations,itemLocked} from '../public/js/factory-logistics-config.js';
import {testingCommand} from '../server-factory-testing.mjs';
import {logisticsCommand,logisticsAccountState,publicLogisticsState,certifiedItem,bindFactoryShipping,settleFactoryShipping,returnFactoryShipping} from '../server-factory-logistics.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'factory-logistics-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:logistics-owner',other='account:logistics-buyer';
 await database.transaction(data=>{for(const owner of [wallet,other])data.users[owner]={walletId:owner,tokens:{MZK:1000},items:[],memory:{},revision:0};data.users[wallet].items=[{id:'finished-model',buildAssetId:'factory-training-missile',name:'Training model'}];data.transactions.push({id:'model-proof',walletId:wallet,type:'FACTORY_ITEM_CREATED',itemId:'finished-model',recipeId:'training-missile',createdAt:new Date(1).toISOString()});return {};});
 let now=1000000,sequence=0;const player={actorId:wallet,username:'Owner',health:100,position:{x:0,y:.02,z:0},lastSeen:now},sim={players:{[wallet]:player},actors:{}};
 const f={database,wallet,other,player,sim,environment:{id:PROVING_ID},get now(){return now;},tick(ms){now+=ms;player.lastSeen=now;},move(kind,mapId){if(mapId)f.environment={id:mapId};const station=logisticsStations(f.environment).find(station=>station.kind===kind);assert.ok(station,kind);player.position={...station.position};return station;},send(action,fields={}){return logisticsCommand(sim,player,f.environment,{action,requestId:'logistics-command-'+ ++sequence,...fields},now,{database,walletId:wallet});}};
 f.qualify=async(extra={})=>database.transaction(data=>{data.transactions.push({id:'qualified-test-'+data.transactions.length,walletId:wallet,type:'FACTORY_TEST_COMPLETE',sessionId:'official-session',environmentId:PROVING_ID,itemId:'finished-model',proofId:'model-proof',buildAssetId:'factory-training-missile',profileId:'accuracy',score:93,qualified:true,createdAt:new Date(now).toISOString(),...extra});return {};});
 f.certify=async()=>{await f.qualify();f.move('certify',PROVING_ID);return f.send('logistics-certify',{itemId:'finished-model'});};
 f.book=async(destinationId=PROVING_ID)=>{f.move('export',FACTORY_ID);return f.send('logistics-book',{itemId:'finished-model',destinationId});};
 f.stage=async()=>{await f.certify();await f.book('atlas-export');f.tick(6000);f.move('shipping',FACTORY_SHIPPING_ID);return f.send('logistics-stage',{manifestId:player.logistics.manifest.id});};return f;
}

test('official exact-item test receipts issue one durable certificate while edited Backpack metadata cannot',async t=>{
 const f=await fixture(t);f.move('certify',PROVING_ID);await assert.rejects(f.send('logistics-certify',{itemId:'finished-model'}),/exact owned model/);
 await f.database.transaction(data=>{data.users[f.wallet].items[0].certificate={id:'fake',score:100};data.users[f.wallet].memory.factoryLogistics={certificates:{'model-proof':true}};return {};});assert.equal(certifiedItem(await f.database.read(),f.wallet,'finished-model'),null);
 await f.qualify({proofId:'wrong-proof'});await assert.rejects(f.send('logistics-certify',{itemId:'finished-model'}),/exact owned model/);await f.qualify({environmentId:'custom-range'});await assert.rejects(f.send('logistics-certify',{itemId:'finished-model'}),/exact owned model/);
 await f.qualify();const first=await f.send('logistics-certify',{itemId:'finished-model',requestId:'one-certificate'}),certificate=first.logistics.certificates[0];assert.equal(certificate.score,93);assert.equal(certificate.proofId,'model-proof');assert.equal(certificate.transferable,true);
 await f.send('logistics-certify',{itemId:'finished-model',requestId:'one-certificate'});await f.send('logistics-certify',{itemId:'finished-model'});assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_CERTIFICATE_ISSUED').length,1);assert.equal(f.player.logistics.stats.certified,1);
 await assert.rejects(f.send('logistics-book',{itemId:'finished-model',destinationId:PROVING_ID,requestId:'one-certificate'}),/another logistics action/);
});

test('a real reusable model range session supplies the immutable proof used by certification',async t=>{
 const f=await fixture(t);const proving={id:PROVING_ID},send=(action,fields={})=>testingCommand(f.sim,f.player,proving,{action,requestId:'range-'+action,...fields},f.now,{database:f.database,walletId:f.wallet});
 f.player.position={...PROVING_STATIONS.find(station=>station.kind==='setup').position};await send('proving-setup',{itemId:'finished-model',profileId:'accuracy',targetId:'target-alpha'});const sessionId=f.player.testing.session.id;f.player.position={...PROVING_STATIONS.find(station=>station.kind==='pad').position};await send('proving-deploy',{sessionId,padId:'proving-pad'});f.player.position={...PROVING_STATIONS.find(station=>station.kind==='control').position};await send('proving-arm',{sessionId});await send('proving-launch',{sessionId,aim:{x:0,y:0}});f.tick(f.player.testing.session.endsAt-f.now);await send('proving-status');
 f.move('certify',PROVING_ID);const result=await f.send('logistics-certify',{itemId:'finished-model'});assert.equal(result.logistics.certificates[0].testSessionId,sessionId);assert.equal(result.logistics.certificates[0].score,100);assert.equal((await f.database.get(f.wallet)).items.length,1);
});

test('certified freight requires actual destination proximity, elapsed transit and releases exactly once',async t=>{
 const f=await fixture(t);await f.certify();const result=await f.book(),manifest=result.logistics.manifest;assert.equal(itemLocked(await f.database.read(),f.wallet,'finished-model',f.now),true);
 f.move('receiving',PROVING_ID);await assert.rejects(f.send('logistics-deliver',{manifestId:manifest.id}),/delivery journey/);f.tick(5000);f.player.position.y+=20;await assert.rejects(f.send('logistics-deliver',{manifestId:manifest.id}),/active receiving|Move closer/);f.move('receiving',PROVING_ID);
 await f.send('logistics-deliver',{manifestId:manifest.id,requestId:'one-delivery'});await f.send('logistics-deliver',{manifestId:manifest.id,requestId:'one-delivery'});await f.send('logistics-deliver',{manifestId:manifest.id});const data=await f.database.read();assert.equal(data.factoryLogistics.manifests[manifest.id].status,'delivered');assert.equal(data.factoryLogistics.accounts[f.wallet].stats.deliveries,1);assert.equal(itemLocked(data,f.wallet,'finished-model',f.now),false);assert.equal(data.transactions.filter(row=>row.type==='FACTORY_FREIGHT_DELIVERY').length,1);assert.equal((await f.database.get(f.wallet)).tokens.MZK,1000);assert.equal((await f.database.get(f.wallet)).items.length,1);
});

test('factory booking rejects listings, active tests, duplicate work and unauthorized mountain destinations',async t=>{
 const f=await fixture(t);await f.certify();await f.database.listItem(f.wallet,'finished-model',250,true);await assert.rejects(f.book(),/Unlist/);await f.database.listItem(f.wallet,'finished-model',250,false);
 await f.database.transaction(data=>{data.factoryTesting={itemLocks:{'model-proof:finished-model':{sessionId:'active-test',expiresAt:f.now+10000}}};return {};});await assert.rejects(f.book(),/already reserved/);await f.database.transaction(data=>{data.factoryTesting.itemLocks={};return {};});await assert.rejects(f.book(COMPOUND_ID),/mountain facility clearance/);
 const booked=await f.book();await assert.rejects(f.book(),/current factory manifest/);f.move('receiving',FACTORY_SHIPPING_ID);f.tick(6000);await assert.rejects(f.send('logistics-deliver',{manifestId:booked.logistics.manifest.id}),/listed receiving destination/);
 f.move('export',FACTORY_ID);await f.send('logistics-cancel',{manifestId:booked.logistics.manifest.id});assert.equal(itemLocked(await f.database.read(),f.wallet,'finished-model',f.now),false);
});

test('a certificate follows genuine MZK trading and forged ownership cannot borrow its provenance',async t=>{
 const f=await fixture(t);await f.certify();await f.database.listItem(f.wallet,'finished-model',250,true);await f.database.trade({buyerId:f.other,sellerId:f.wallet,itemId:'finished-model',requestId:'certified-model-trade',expectedPriceMzk:250});const data=await f.database.read();assert.equal(certifiedItem(data,f.wallet,'finished-model'),null);const certificate=certifiedItem(data,f.other,'finished-model');assert.ok(certificate);assert.equal(certificate.issuedTo,f.wallet);assert.equal(data.users[f.other].tokens.MZK,750);assert.equal(data.users[f.wallet].tokens.MZK,1250);
 await f.database.transaction(data=>{data.users[f.wallet].items.push({id:'finished-model',certificate,buildAssetId:'factory-training-missile'});return {};});assert.equal(certifiedItem(await f.database.read(),f.wallet,'finished-model'),null);
});

test('sealed shipping staging and binding are durable, route-specific and settle atomically once',async t=>{
 const f=await fixture(t);await f.stage();const manifestId=f.player.logistics.manifest.id,deliveryId='atlas-voyage-one';assert.equal(f.player.logistics.manifest.status,'staged');
 await assert.rejects(f.database.transaction(data=>bindFactoryShipping(data,f.wallet,{manifestId,deliveryId,contractId:'other-route',now:f.now})),/official Atlas Export/);
 await f.database.transaction(data=>bindFactoryShipping(data,f.wallet,{manifestId,deliveryId,now:f.now}));const restarted=new UserJsonDatabase(f.database.file),saved=await logisticsAccountState(restarted,f.wallet);assert.equal(saved.manifest.status,'in-transit');assert.equal(saved.manifest.voyageId,deliveryId);assert.equal(itemLocked(await restarted.read(),f.wallet,'finished-model',f.now),true);
 await assert.rejects(restarted.transaction(data=>settleFactoryShipping(data,f.wallet,{manifestId,deliveryId:'wrong-voyage',contractId:'atlas-export',quality:100,now:f.now+8000})),/does not match/);await assert.rejects(restarted.transaction(data=>settleFactoryShipping(data,f.wallet,{manifestId,deliveryId,contractId:'atlas-export',quality:100,now:f.now})),/Complete the linked export/);
 f.tick(8000);await restarted.transaction(data=>settleFactoryShipping(data,f.wallet,{manifestId,deliveryId,contractId:'atlas-export',quality:95,now:f.now}));await restarted.transaction(data=>settleFactoryShipping(data,f.wallet,{manifestId,deliveryId,contractId:'atlas-export',quality:95,now:f.now}));const data=await restarted.read();assert.equal(data.factoryLogistics.manifests[manifestId].status,'delivered');assert.equal(data.factoryLogistics.accounts[f.wallet].stats.exports,1);assert.equal(data.transactions.filter(row=>row.type==='FACTORY_FREIGHT_DELIVERY').length,1);assert.equal(itemLocked(data,f.wallet,'finished-model',f.now),false);
});

test('failed or abandoned sea freight remains sealed until the owner collects it at Jebel Ali',async t=>{
 const f=await fixture(t);await f.stage();const manifestId=f.player.logistics.manifest.id,deliveryId='abandoned-voyage';await f.database.transaction(data=>bindFactoryShipping(data,f.wallet,{manifestId,deliveryId,now:f.now}));
 await assert.rejects(f.send('logistics-cancel',{manifestId}),/Cancel the linked shipping voyage/);await f.database.transaction(data=>returnFactoryShipping(data,f.wallet,{manifestId,deliveryId,reason:'Training vessel returned to port.',now:f.now}));assert.equal(itemLocked(await f.database.read(),f.wallet,'finished-model',f.now),true);
 f.move('export',FACTORY_ID);await assert.rejects(f.send('logistics-return',{manifestId}),/Jebel Ali/);f.move('shipping',FACTORY_SHIPPING_ID);await f.send('logistics-return',{manifestId});await f.send('logistics-return',{manifestId});const data=await f.database.read();assert.equal(itemLocked(data,f.wallet,'finished-model',f.now),false);assert.equal(data.factoryLogistics.accounts[f.wallet].stats.returned,1);assert.equal(data.factoryLogistics.accounts[f.wallet].stats.deliveries,0);assert.equal((await f.database.get(f.wallet)).items.length,1);
});

test('desk status recovers a lost voyage after restart while public state reveals only aggregate counts',async t=>{
 const f=await fixture(t);await f.stage();const manifestId=f.player.logistics.manifest.id;await f.database.transaction(data=>bindFactoryShipping(data,f.wallet,{manifestId,deliveryId:'lost-voyage',now:f.now}));const result=await f.send('logistics-status');assert.equal(result.logistics.manifest.status,'return-required');assert.equal(result.logistics.eligibleItems[0].reservation.manifestId,manifestId);assert.equal(itemLocked(await f.database.read(),f.wallet,'finished-model',f.now),true);
 assert.deepEqual(Object.keys(publicLogisticsState(result.logistics)).sort(),['activeCount','certifiedCount','stats']);assert.equal(publicLogisticsState(null),null);
 const buyer={...f.player,actorId:f.other};await assert.rejects(logisticsCommand(f.sim,buyer,f.environment,{action:'logistics-return',manifestId,requestId:'wrong-owner'},f.now,{database:f.database,walletId:f.other}),/does not belong/);
});

test('custom logistics objects transform correctly but cannot issue official certifications or manifests',async t=>{
 const f=await fixture(t);await f.qualify();const environment={id:'custom-export-map',factoryLogistics:{enabled:true,editableStations:true},builderScene:{objects:[{id:'desk',modelId:'factory-export-terminal',position:{x:20,y:1,z:30},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:2,z:2},functionalSettings:{logisticsStation:'certify',logisticsApproach:{x:0,y:0,z:3.5}}}]}};const station=logisticsStations(environment)[0];assert.equal(station.id,'logistics-instance:desk');assert.ok(Math.abs(station.position.x-27)<1e-9);f.player.position={...station.position};f.environment=environment;await assert.rejects(f.send('logistics-certify',{itemId:'finished-model',stationId:station.id}),/public proving-ground kiosk/);await assert.rejects(f.send('logistics-book',{itemId:'finished-model',destinationId:PROVING_ID,stationId:station.id}),/official factory export/);environment.builderScene.objects=[];assert.deepEqual(logisticsStations(environment),[]);
});
