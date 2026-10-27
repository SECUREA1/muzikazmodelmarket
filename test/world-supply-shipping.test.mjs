import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {stepShipping,grantShippingReward,shippingAccountState} from '../server-shipping.mjs';
import {boatAssistedInput} from '../server-boat-assist.mjs';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {ensureWorldSupply,supplyItem} from '../world-supply.mjs';
import {randomUUID} from 'node:crypto';

async function setup(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'world-supply-shipping-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json')),wallet='account:captain';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:0},items:[],memory:{},revision:0};return {};});
 const environment=shippingWorld();environment.id='copied-shipping-world';
 let now=100000,sequence=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now,shippingState:()=>shippingAccountState(database,wallet),shippingReward:(_identity,result)=>grantShippingReward(database,wallet,result,{now}),...options});
 const identity={accountId:'captain',walletId:wallet,username:'Captain'};
 const send=(operation,fields={})=>{now+=250;return runtime.command(environment.id,environment,identity,{action:'shipping',operation,requestId:'supply-command-'+ ++sequence,...fields});};
 await runtime.command(environment.id,environment,identity,{action:'join',requestId:'join-supply-test'});await send('board');
 return {database,runtime,environment,identity,send,advance:ms=>{now+=ms;},get now(){return now;}};
}

test('factory item shipment reserves and binds at accept, then settles only after actual shipping passage and full unloading on a copied map',async t=>{
 const actions=[],deliveries=[];let boundJob;
 const f=await setup(t,{supplyAction:async(_identity,_sim,player,_environment,command)=>{
  actions.push(command.operation);
  if(command.operation==='reserve')return {shipmentId:'factory-batch',supplyManifest:[{itemId:'native:chair',quantity:100}],destinationMapId:'public-commons'};
  if(command.operation==='bind'){boundJob=command.jobId;assert.equal(command.contractId,'gulf-gateway');assert.equal(player.shipping.job.shipmentId,'factory-batch');}
 },supplyDelivery:async(identity,result,environment)=>{
  assert.equal(identity.walletId,'account:captain');assert.equal(environment.id,'copied-shipping-world');assert.equal(result.worldId,'hormuz-shipping');assert.equal(result.environmentId,environment.id);assert.equal(result.shipmentId,'factory-batch');assert.equal(result.jobId,boundJob);deliveries.push(result);return {id:'supply-delivery-receipt'};
 }});
 let view=await f.send('accept',{shipmentId:'factory-batch',contractId:'gulf-gateway'});
 assert.deepEqual(actions,['reserve','bind']);assert.equal(view.players[view.selfId].shipping.job.destinationMapId,'public-commons');assert.equal(deliveries.length,0);
 await assert.rejects(f.send('unload'),/Dock/);assert.equal(deliveries.length,0);
 for(let index=0;index<4;index++){await f.send('load',{side:index%2?'starboard':'port'});f.advance(2000);}
 await f.send('secure');await f.send('depart');assert.equal(deliveries.length,0);
 // Advance actual server-authored waypoints through boat assistance and physics.
 // This does not set checkpoint indices or bypass dock/manifest validation.
 await f.runtime.store.update(f.environment.id,room=>{
  const sim=room.simulation,player=sim.players['account:captain'],boat=sim.actors[player.vehicleId];let ticks=0;
  for(;ticks<10000;ticks++){
   f.advance(250);player.lastSeen=f.now;stepShipping(sim,f.environment,f.now);
   Object.assign(boat,stepBoatSimulation(boat,boatAssistedInput(boat,{},f.environment,f.now,sim.actors),.25,{environment:f.environment,now:f.now}));player.position={...boat.position,y:.35};
   if(player.shipping.job.checkpointIndex===player.shipping.job.waypoints.length&&Math.abs(boat.boating.speed)<.15)break;
  }
  assert.ok(ticks<10000,'boat reaches every actual passage gate');sim.time=f.now;player.lastSeen=f.now;
 },{persist:false});
 await f.send('dock');assert.equal(deliveries.length,0);
 for(let index=0;index<3;index++){await f.send('unload');f.advance(2000);assert.equal(deliveries.length,0);}
 view=await f.send('unload');assert.equal(deliveries.length,1);assert.equal(view.result.supplyReceipt.id,'supply-delivery-receipt');assert.equal(view.players[view.selfId].shipping.job.phase,'delivered');assert.ok(view.result.shippingReceipt.amountMzk>0,'copied maps commit ordinary shipping rewards');
 await assert.rejects(f.send('unload'),/manifest/);assert.equal(deliveries.length,1);
});

test('failed shipment acceptance releases reservation and unavailable supply storage cannot create a manifest',async t=>{
 const actions=[],f=await setup(t,{supplyAction:async(_identity,_sim,_player,_environment,command)=>{
  actions.push(command.operation);return {shipmentId:'factory-batch',supplyManifest:[],destinationMapId:'public-commons'};
 }});
 await assert.rejects(f.send('accept',{shipmentId:'factory-batch',contractId:'forged-route'}),/listed freight/);assert.deepEqual(actions,['reserve','release']);
 const g=await setup(t);await assert.rejects(g.send('accept',{shipmentId:'unavailable',contractId:'gulf-gateway'}),/World supply storage unavailable/);
});

test('explicit cancellation and map travel release bound goods immediately without releasing completed shipments',async t=>{
 const actions=[],f=await setup(t,{supplyAction:async(_identity,_sim,player,environment,command)=>{
  actions.push({operation:command.operation,shipmentId:command.shipmentId,jobId:command.jobId,mapId:environment.id});
  if(command.operation==='reserve')return {shipmentId:command.shipmentId,supplyManifest:[{itemId:'native:chair',quantity:100}],destinationMapId:'public-commons'};
  if(command.operation==='release')assert.equal(player.shipping.job.phase,'cancelled');
 }});
 await f.send('accept',{shipmentId:'batch-one',contractId:'gulf-gateway'});await f.send('cancel');await f.send('status');
 assert.equal(actions.filter(row=>row.operation==='release').length,1);
 await f.send('accept',{shipmentId:'batch-two',contractId:'gulf-gateway'});
 const other={id:'other-map',spawn:{x:0,y:0,z:0}};
 await f.runtime.command(other.id,other,f.identity,{action:'join',requestId:'travel-supply-test'});
 const released=actions.filter(row=>row.operation==='release');assert.equal(released.length,2);assert.equal(released[1].shipmentId,'batch-two');assert.equal(released[1].mapId,f.environment.id);
});

test('expired shipments release before replacement while completed shipments remain settled',async t=>{
 const actions=[],f=await setup(t,{supplyAction:async(_identity,_sim,_player,_environment,command)=>{
  actions.push(command.operation);if(command.operation==='reserve')return {shipmentId:command.shipmentId,supplyManifest:[],destinationMapId:'public-commons'};
 }});
 await f.send('accept',{shipmentId:'old-batch',contractId:'gulf-gateway'});
 await f.runtime.store.update(f.environment.id,room=>{room.simulation.players['account:captain'].shipping.job.phase='expired';return {};});
 await f.send('accept',{shipmentId:'new-batch',contractId:'gulf-gateway'});assert.deepEqual(actions,['reserve','bind','release','reserve','bind']);
 await f.runtime.store.update(f.environment.id,room=>{room.simulation.players['account:captain'].shipping.job.phase='delivered';return {};});
 await f.send('status');assert.equal(actions.filter(operation=>operation==='release').length,1);
});

test('owned native and GLB deployments consume destination stock once and SKU deployments pass the map to normal charging',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'supply-deploy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const consumed=[],charged=[],assets={native:{id:'owned-native',name:'Native chair',buildAssetId:'market-stall'},glb:{id:'owned-glb',name:'GLB chair',modelUrl:'/models/chair.glb'},sku:{id:'catalog-chair',name:'Catalog chair',sku:'backpack:market-stall',buildAssetId:'market-stall'}};
 const environment={id:'destination-store-map',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}},identity={accountId:'captain',walletId:'account:captain'};
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000,resolveAsset:async(_identity,command)=>assets[command.itemId],consumeAsset:async(...args)=>{consumed.push(args);},charge:async(...args)=>{charged.push(args);}});
 const send=(action,requestId,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId,...fields});await send('join','deploy-join');
 const placement={position:[1,0,1],rotation:[0,0,0],scale:[1,1,1]};
 for(const itemId of ['native','glb','sku']){await send('spawn','deploy-'+itemId,{itemId,placement});await send('spawn','deploy-'+itemId,{itemId,placement});}
 assert.equal(consumed.length,2);assert.equal(consumed[0][1].buildAssetId,'market-stall');assert.equal(consumed[1][1].modelUrl,'/models/chair.glb');assert.equal(consumed[0][2],'deploy-native');assert.equal(consumed[0][3].id,environment.id);assert.equal(charged.length,1);assert.equal(charged[0][3].id,environment.id);
 await assert.rejects(send('spawn','unowned',{itemId:'unowned'}),/Purchase/);assert.equal(consumed.length,2);
});

test('dock exchanges debit finite destination stock atomically, reject shortages and do not debit again on replay',async t=>{
 const f=await setup(t),now=300000,metalId=await f.database.transaction(data=>{
  const ledger=ensureWorldSupply(data,{maps:[f.environment]}),id=supplyItem(data,'material:metal').supplyId;
  ledger.worldStock[id]=5;ledger.maps[f.environment.id].stock[id]=0;
  data.shipping ||= {accounts:{}};data.shipping.accounts[f.identity.walletId] ||= {supplies:{}};
  data.shipping.accounts[f.identity.walletId].supplies['shipping-parts-stock']=4;
  data.users[f.identity.walletId].items.push({id:'shipping-supply:shipping-parts-stock',shippingSupplyId:'shipping-parts-stock',quantity:4});
  return id;
 });
 const trade={type:'trade',tradeId:'parts-metal',stockId:'shipping-parts-stock',exchangeId:randomUUID(),worldId:'hormuz-shipping',environmentId:f.environment.id};
 await assert.rejects(grantShippingReward(f.database,f.identity.walletId,trade,{now}),/out of stock/);
 let data=await f.database.read();assert.equal(data.shipping.accounts[f.identity.walletId].supplies['shipping-parts-stock'],4);assert.equal(data.users[f.identity.walletId].items.find(item=>item.shippingSupplyId==='shipping-parts-stock').quantity,4);assert.equal(data.users[f.identity.walletId].memory.materialCredits?.['material:metal'],undefined);assert.equal(data.worldSupply.worldStock[metalId],5);
 await f.database.transaction(data=>{data.worldSupply.maps[f.environment.id].stock[metalId]=5;return {};});
 const receipt=await grantShippingReward(f.database,f.identity.walletId,trade,{now});assert.equal(receipt.supplies['shipping-parts-stock'],3);
 assert.equal((await grantShippingReward(f.database,f.identity.walletId,trade,{now})).id,receipt.id);
 data=await f.database.read();assert.equal(data.worldSupply.maps[f.environment.id].stock[metalId],0);assert.equal(data.worldSupply.worldStock[metalId],5);assert.equal(data.users[f.identity.walletId].memory.materialCredits['material:metal'],5);
 await assert.rejects(grantShippingReward(f.database,f.identity.walletId,{...trade,exchangeId:randomUUID()},{now}),/out of stock/);
 data=await f.database.read();assert.equal(data.shipping.accounts[f.identity.walletId].supplies['shipping-parts-stock'],3);assert.equal(data.users[f.identity.walletId].memory.materialCredits['material:metal'],5);
});

test('one voyage cannot bind both bulk supply goods and a private certified Atlas model',async t=>{
 const calls=[],f=await setup(t,{supplyAction:async()=>{calls.push('bulk');},shippingBind:async()=>{calls.push('certified');}});
 for(const fields of [{manifestId:'certified-model',contractId:'gulf-gateway'},{factoryManifestId:'certified-model',contractId:'gulf-gateway'},{contractId:'atlas-export'}])await assert.rejects(f.send('accept',{shipmentId:'bulk-batch',...fields}),/one factory cargo manifest/);
 assert.deepEqual(calls,[]);const room=await f.runtime.store.get(f.environment.id);assert.equal(room.simulation.players[f.identity.walletId].shipping.job,null);
});
