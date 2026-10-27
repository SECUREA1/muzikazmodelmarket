import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_RULES} from '../public/js/shipping-config.js';
const account=()=>({stats:{deliveries:5},supplies:{},unlocks:['shipping-feeder','shipping-container','shipping-tanker']});
async function fixture(t,{environment=shippingWorld(),resolveAsset=async()=>null}={}){
 const dir=await mkdtemp(join(tmpdir(),'shipping-health-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,n=0,settlements=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,resolveAsset,shippingState:async()=>account(),shippingReward:async()=>{settlements++;throw Error('Unexpected shipping settlement.');}}),identity={accountId:'captain',username:'Captain',walletId:'account:captain'},send=(action,fields={})=>{now+=250;return runtime.command(environment.id,environment,identity,{action,requestId:'health-'+ ++n,...fields});};
 return {environment,store,runtime,send,advance:ms=>{now+=ms;},get now(){return now;},get settlements(){return settlements;}};
}
test('cargo hull service preserves canonical strength and respawns repair old 200-health records for every vessel',async t=>{
 const f=await fixture(t);let view=await f.send('join');const self=view.selfId;
 for(const [id,health]of [['shipping-starter-feeder',650],['shipping-northern-container',1200],['shipping-eastern-tanker',1200]]){
  assert.equal(view.actors[id].maxHealth,health);assert.equal(view.actors[id].health,health);
  view=await f.send('map-access',{entityId:id});view=await f.send('shipping',{operation:'service'});assert.equal(view.actors[id].health,health,'repair must never reduce a healthy cargo hull');assert.equal(view.actors[id].maxHealth,health);
  await f.store.update(f.environment.id,room=>{const boat=room.simulation.actors[id];boat.health=90;boat.maxHealth=200;room.simulation.players[self].fuel=12;},{persist:false});view=await f.send('shipping',{operation:'service'});assert.equal(view.actors[id].health,health,'legacy maxHealth200 repaired to canonical hull');assert.equal(view.actors[id].maxHealth,health);assert.equal(view.players[self].fuel,100);
  await f.store.update(f.environment.id,room=>{const boat=room.simulation.actors[id];Object.assign(boat,{health:0,maxHealth:200,active:false,holderId:null,destroyedAt:f.now-16000});room.simulation.players[self].vehicleId=null;},{persist:false});view=await f.runtime.snapshot(f.environment.id,f.environment);assert.equal(view.actors[id].active,true);assert.equal(view.actors[id].health,health,'public cargo replacement restores its full hull strength');assert.equal(view.actors[id].maxHealth,health);
 }
});

test('marketplace deployments receive the same canonical cargo health and definition as authored vessels',async t=>{
 const environment={id:'cargo-health-market',name:'Placement plaza',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[]}},f=await fixture(t,{environment,resolveAsset:async(_identity,command)=>({id:'market-'+command.modelId,buildAssetId:command.modelId,name:'Purchased cargo vessel',assetType:'vehicles',behavior:'vehicle'})});await f.send('join');
 for(const [modelId,health]of [['shipping-feeder',650],['shipping-container',1200],['shipping-tanker',1200]]){const view=await f.send('spawn',{modelId,placement:{position:[1,0,1],rotation:[0,0,0],scale:[1,1,1]}}),boat=view.actors[view.result.spawnedId];assert.equal(boat.health,health);assert.equal(boat.maxHealth,health);assert.equal(boat.definition.gameplay.health,health);}
});

test('an ordered heartbeat after the presence lease cancels freight before resuming the player and cannot earn a delivery',async t=>{
 const f=await fixture(t);let view=await f.send('join');const self=view.selfId;await f.send('shipping',{operation:'board'});await f.send('shipping',{operation:'accept',contractId:'dock-induction'});
 for(let i=0;i<4;i++){await f.send('shipping',{operation:'load',side:i%2?'starboard':'port'});f.advance(SHIPPING_RULES.loadingSeconds*1000);}
 await f.send('shipping',{operation:'secure'});view=await f.send('shipping',{operation:'depart'});const epoch=view.inputEpoch;assert.equal(view.players[self].shipping.job.phase,'sailing');assert.equal(view.actors['shipping-starter-feeder'].boating.assist,'navigate');
 // No background tick occurs during this pause. The fresh ordered heartbeat
 // itself must release the old freight activity before renewing lastSeen.
 f.advance(16000);view=await f.send('input',{inputEpoch:epoch,inputSequence:1,input:{}});assert.equal(view.players[self].shipping.job.phase,'cancelled');assert.match(view.players[self].shipping.message,/Connection paused/);assert.equal(view.actors['shipping-starter-feeder'].boating.cargoCount,0);assert.equal(view.actors['shipping-starter-feeder'].boating.assist,null);assert.equal(f.settlements,0);
 await assert.rejects(f.send('shipping',{operation:'unload'}),/manifest/);assert.equal(f.settlements,0);
});
