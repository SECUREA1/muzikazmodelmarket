import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_PORTS} from '../public/js/shipping-config.js';

const environment={id:'logistics-builder-room',name:'Freight workshop',proceduralLand:true,publicDestination:true,spawn:{x:0,y:.02,z:0},factoryLogistics:{enabled:true,editableStations:true},builderScene:{version:3,layout:'grand-floor',mapSize:100,objects:[],layoutMeta:{factoryLogistics:{enabled:true,editableStations:true}},gameplay:{multiplayer:true,radTox:false}}};
const owner={accountId:'freight-owner',walletId:'account:private-wallet-key',username:'Maker'};
const privateState={eligibleItems:[{id:'private-owned-model'}],manifest:{id:'private-manifest',walletId:owner.walletId},history:[{itemId:'private-history-model'}],certificates:[{id:'private-certificate'}],balance:980,stats:{deliveries:2},certifiedCount:1,activeCount:1};
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'freight-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=1000000,sequence=0;
 const store=new SharedRoomStore(join(directory,'rooms.json')),calls=[];
 const runtime=new AuthoritativeRooms({store,now:()=>now,logisticsState:async identity=>identity.accountId===owner.accountId?structuredClone(privateState):{stats:{},certifiedCount:0,activeCount:0},logisticsAction:async(identity,sim,player,map,command,time)=>{calls.push({identity,map,command,time});player.logistics=structuredClone(privateState);return {message:'Freight ready.',logistics:player.logistics};},resolveAsset:async()=>({id:'owned-export-terminal',buildAssetId:'factory-export-terminal',name:'Owned export terminal',assetType:'props'})});
 const send=(action,extra={},identity=owner)=>{now+=100;return runtime.command(environment.id,environment,identity,{action,requestId:'freight-'+ ++sequence,...extra});};
 return {runtime,store,send,calls};
}
function assertPublic(state){assert.deepEqual(Object.keys(state).sort(),['activeCount','certifiedCount','stats']);assert.equal(state.certifiedCount,1);assert.equal(state.stats.deliveries,2);}

test('freight joins and commands return own private state while all room and saved-event projections stay public',async t=>{
 const {runtime,store,send,calls}=await fixture(t),joined=await send('join');
 assert.equal(joined.result.logistics.eligibleItems[0].id,'private-owned-model');assertPublic(joined.players[joined.selfId].logistics);
 const status=await send('logistics-status');assert.equal(calls.length,1);assert.equal(calls[0].identity.walletId,owner.walletId);assert.equal(calls[0].map.id,environment.id);
 assert.equal(status.result.logistics.manifest.id,'private-manifest');assertPublic(status.events.at(-1).logistics);
 await store.update(environment.id,room=>{room.simulation.events.push({id:'legacy-private-event',action:'logistics-status',actorId:joined.selfId,logistics:structuredClone(privateState)});});
 const observer=await send('join',{}, {...owner,accountId:'freight-observer',walletId:'account:freight-observer'});
 assertPublic(observer.players[joined.selfId].logistics);
 assert.ok(observer.events.filter(event=>event.actorId===joined.selfId).every(event=>!event.logistics||Object.keys(event.logistics).every(key=>['stats','certifiedCount','activeCount'].includes(key))));
 const publicRoom=runtime.view(await store.get(environment.id));
 for(const secret of ['private-owned-model','private-manifest','private-history-model','private-certificate',owner.walletId])assert.ok(!JSON.stringify(publicRoom).includes(secret),secret+' must not enter a public snapshot');
});

test('purchased freight terminals deploy with a usable logistics role and immediately appear in the station resolver',async t=>{
 const {send}=await fixture(t);await send('join');const result=await send('spawn',{itemId:'owned-export-terminal'}),id=result.result.spawnedId;
 assert.equal(result.actors[id].definition.gameplay.logisticsStation,'export');
 const station=result.logistics.stations.find(station=>station.objectId===id);
 assert.ok(station,'freshly purchased terminal participates in authoritative logistics');assert.equal(station.kind,'export');assert.ok(Number.isFinite(station.position.z));
});


test('real shipping accept binds its new voyage before returning and cancelled freight reconciles once',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'freight-bind-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const sea=shippingWorld(),store=new SharedRoomStore(join(directory,'rooms.json')),binds=[],returns=[];let now=1000000,sequence=0,deny=false;
 const runtime=new AuthoritativeRooms({store,now:()=>now,shippingState:async()=>({stats:{},supplies:{},unlocks:['shipping-feeder'],factoryExport:{manifestId:'private-bound-manifest'}}),logisticsState:async()=>structuredClone(privateState),shippingBind:async(identity,player,command,time)=>{binds.push({identity,job:structuredClone(player.shipping.job),command,time});if(deny)throw Error('The sealed model was already reserved.');player.shipping.job.factoryManifestId='private-bound-manifest';},shippingReturn:async(identity,player,time)=>{returns.push({identity,job:structuredClone(player.shipping.job),time});delete player.shipping.job.factoryManifestId;}});
 const send=(action,fields={})=>{now+=100;return runtime.command(sea.id,sea,owner,{action,requestId:'bind-'+ ++sequence,...fields});};
 const joined=await send('join'),port=SHIPPING_PORTS[0];
 await store.update(sea.id,room=>{const sim=room.simulation,player=sim.players[joined.selfId];sim.actors['test-freight-feeder']={id:'test-freight-feeder',modelId:'shipping-feeder',position:{x:port.x,y:0,z:port.z},rotation:{x:0,y:port.berth.yaw,z:0},health:650,active:true,holderId:joined.selfId,boating:{anchor:true,speed:0}};player.vehicleId='test-freight-feeder';player.position={...sim.actors[player.vehicleId].position};});
 const accepted=await send('shipping',{operation:'accept',contractId:'atlas-export',manifestId:'private-bound-manifest'});
 assert.equal(binds.length,1);assert.equal(binds[0].job.phase,'loading');assert.equal(binds[0].job.id,accepted.players[joined.selfId].shipping.job.id);assert.equal(binds[0].identity.walletId,owner.walletId);
 assert.equal(accepted.players[joined.selfId].shipping.job.factoryManifestId,undefined,'the private binding never enters the public vessel manifest');
 await send('shipping',{operation:'cancel'});assert.equal(returns.length,1);assert.equal(returns[0].job.phase,'cancelled');assert.equal(returns[0].job.factoryManifestId,'private-bound-manifest');
 await send('input',{input:{}});assert.equal(returns.length,1,'successful reconciliation releases the runtime binding');
 deny=true;await assert.rejects(send('shipping',{operation:'accept',contractId:'atlas-export'}),/already reserved/);
 const saved=await store.get(sea.id);assert.equal(saved.simulation.players[joined.selfId].shipping.job.phase,'cancelled','a rejected bind cannot create an unbound active voyage');
});
