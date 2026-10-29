import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseStoreAddress,storeAddressFacts,factoryOrderItemId,mergeStoreAddressPage} from '../public/js/store-address-ui.js';

test('store entry points keep exact placed-store identity rather than matching shared building models',()=>{
 const addresses=[{id:'address:town:shop-one',objectId:'shop-one',name:'First store'},{id:'address:town:shop-two',objectId:'shop-two',name:'Second store'}];
 assert.equal(chooseStoreAddress(addresses,{storeObjectId:'shop-two'}),addresses[1]);
 assert.equal(chooseStoreAddress(addresses,{deliveryAddressId:addresses[0].id,storeObjectId:'shop-two'}),addresses[0]);
 assert.equal(chooseStoreAddress(addresses,{storeObjectId:'removed-shop'}),null);
});

test('public address facts show the current recipient and door location without exposing owner identifiers',()=>{
 const address={id:'address:town:store',name:'The Store',addressLine:'12 Market Street',mapName:'Crew Plaza',mapId:'town',owner:{name:'Maya',kind:'member',walletId:'private-wallet'},position:{x:99,y:0,z:99},dropoff:{position:{x:12.25,y:.02,z:-8.5}}};
 assert.deepEqual(storeAddressFacts(address),[['Address','12 Market Street'],['Map','Crew Plaza'],['Recipient','Maya'],['Drop-off','12.3, 0.0, -8.5']]);
 assert.equal(JSON.stringify(storeAddressFacts(address)).includes('private-wallet'),false);
 assert.deepEqual(storeAddressFacts(null),[]);
});

test('factory product links require current production metadata and a catalog identity',()=>{
 assert.equal(factoryOrderItemId({factoryProducible:true,factoryItemId:'native:chair'}),'native:chair');
 assert.equal(factoryOrderItemId({factoryProducible:true,factoryItemId:'blueprint:builder:chair-2'}),'blueprint:builder:chair-2');
 assert.equal(factoryOrderItemId({asset:{factoryProducible:true,factoryItemId:'native:lamp'}}),'native:lamp');
 assert.equal(factoryOrderItemId({factoryProducible:false,asset:{factoryProducible:true,factoryItemId:'native:lamp'}}),null);
 for(const record of [{factoryItemId:'native:chair'},{factoryProducible:true,modelUrl:'/secret.glb'},{factoryProducible:true,factoryItemId:'https://uploads.example/private.glb?token=secret'},{factoryProducible:true,factoryItemId:'data:private'},{factoryProducible:true,factoryItemId:'native:chair\nsecret'}])assert.equal(factoryOrderItemId(record),null);
});

test('address pagination keeps a selected off-page building exact and cannot repeat an invalid next offset',()=>{
 const current={id:'address:town:last',mapId:'town',name:'Old owner'},other={id:'address:elsewhere:wrong',mapId:'elsewhere'};
 const page=mergeStoreAddressPage([current],{addresses:[{...current,name:'Current owner'},{id:'address:town:next',mapId:'town'},other],total:501,hasMore:true,nextOffset:400},{append:true,mapId:'town',offset:200});
 assert.equal(page.addresses.length,2);assert.equal(page.addresses[0].name,'Current owner');assert.equal(page.total,501);assert.equal(page.nextOffset,400);
 assert.equal(chooseStoreAddress(page.addresses,{addressId:current.id}).name,'Current owner');
 for(const nextOffset of [200,0,-1,'400',null,NaN])assert.equal(mergeStoreAddressPage([],{addresses:[current],hasMore:true,nextOffset},{offset:200}).nextOffset,null);
 assert.equal(mergeStoreAddressPage([],{addresses:[],hasMore:true,nextOffset:400},{offset:200}).nextOffset,null,'empty pages never create a load-more loop');
 const large=mergeStoreAddressPage([],Array.from({length:1000},(_,i)=>({id:'address:'+i,mapId:'town'})),{mapId:'town'});assert.equal(large.addresses.length,200,'one response cannot populate an unbounded picker');
});
