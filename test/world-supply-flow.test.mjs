import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {stepShipping,shippingAccountState,grantShippingReward} from '../server-shipping.mjs';
import {boatAssistedInput} from '../server-boat-assist.mjs';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {SHIPPING_RULES} from '../public/js/shipping-config.js';

for(const scenario of [{sku:'tool:scanner',quantity:10},{sku:GAME_ECONOMY.find(item=>item.buildAssetId==='factory-cargo-rocket').sku,quantity:4,challengeId:'rocket-convoy'}])test(''+scenario.sku+' paid factory production travels the actual authoritative shipping passage, restocks a map, and purchases deplete that delivered stock exactly once',async t=>{
 const {sku,quantity,challengeId}=scenario;
 const dir=await mkdtemp(join(tmpdir(),'world-supply-flow-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json')),wallet='account:captain',identity={accountId:'captain',walletId:wallet,username:'Captain'};
 await database.put(wallet,{tokens:{MZK:1000000},items:[]});
 const environment=shippingWorld(),destination={id:'factory-testing-range',name:'Destination Market',builderScene:{objects:[{id:'destination-store',name:'Destination Store'}]}};
 let now=100000,sequence=0;
 const service=new WorldSupplyService(database,{now:()=>now,maps:async()=>[environment,destination]});
 const quote=await service.action(wallet,'quote',{itemId:sku,quantity});
 const production=await service.action(wallet,'produce',{itemId:sku,quantity,expectedPriceMzk:quote.priceMzk,requestId:'factory-flow-production'});
 assert.equal((await database.get(wallet)).tokens.MZK,1000000-quote.priceMzk);
 assert.equal((await service.state()).factoryStock[sku]||0,0);
 now=production.readyAt;await service.state();
 const shipment=await service.action(wallet,'dispatch',{itemId:sku,quantity,destinationMapId:destination.id,shippingMapId:environment.id,contractId:'gulf-gateway',requestId:'factory-flow-dispatch',...(challengeId?{challengeId}:{})});
 let state=await service.state();assert.equal(state.worldStock[sku],1000);assert.equal(state.factoryStock[sku],0);
 assert.equal(state.maps.find(map=>map.id===destination.id).stock[sku],undefined);
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now,
  shippingState:id=>shippingAccountState(database,id.walletId),shippingReward:(id,result)=>grantShippingReward(database,id.walletId,result,{now}),
  supplyAction:(...args)=>service.shippingAction(...args),supplyDelivery:(...args)=>service.deliver(...args)});
 const send=(operation,fields={})=>{now+=250;return runtime.command(environment.id,environment,identity,{action:'shipping',operation,requestId:'factory-flow-command-'+ ++sequence,...fields});};
 await runtime.command(environment.id,environment,identity,{action:'join',requestId:'factory-flow-join'});await send('board');
 const accept=await send('accept',{shipmentId:shipment.id,contractId:'gulf-gateway'}),self=accept.selfId;
 assert.equal(accept.players[self].shipping.job.shipmentId,shipment.id);
 assert.equal(accept.players[self].shipping.job.destinationMapId,destination.id);
 assert.equal((await service.state()).shipments[0].phase,'reserved');
 await assert.rejects(send('unload'),/Dock/);
 for(let index=0;index<4;index++){await send('load',{side:index%2?'starboard':'port'});now+=SHIPPING_RULES.loadingSeconds*1000;}
 await send('secure');await send('depart');
 await runtime.store.update(environment.id,room=>{
  const sim=room.simulation,player=sim.players[self],boat=sim.actors[player.vehicleId];let ticks=0;
  for(;ticks<10000;ticks++){
   now+=250;player.lastSeen=now;stepShipping(sim,environment,now);
   Object.assign(boat,stepBoatSimulation(boat,boatAssistedInput(boat,{},environment,now,sim.actors),.25,{environment,now}));player.position={...boat.position,y:.35};
   if(player.shipping.job.checkpointIndex===player.shipping.job.waypoints.length&&Math.abs(boat.boating.speed)<.15)break;
  }
  assert.ok(ticks<10000,'actual ship physics reaches every passage checkpoint and the receiving berth');
  assert.equal(player.shipping.job.phase,'sailing');sim.time=now;player.lastSeen=now;
 },{persist:false});
 await send('dock');
 for(let index=0;index<3;index++){
  await send('unload');now+=SHIPPING_RULES.loadingSeconds*1000;
  assert.equal((await service.state()).maps.find(map=>map.id===destination.id).stock[sku],undefined,'partial unloading does not create map stock');
 }
 const finalRequest='factory-flow-final-unload';now+=250;
 const delivered=await runtime.command(environment.id,environment,identity,{action:'shipping',operation:'unload',requestId:finalRequest});
 if(challengeId){assert.equal(delivered.players[self].shipping.job.supplyChallenge.id,challengeId);assert.equal(delivered.result.supplyReceipt.challengeResult.completed,true);assert.equal((await service.state()).challenges.find(row=>row.id===challengeId).completionCount,1);}
 assert.equal(delivered.players[self].shipping.job.phase,'delivered');assert.equal(delivered.result.supplyReceipt.phase,'delivered');
 assert.equal(delivered.result.supplyReceipt.transferTask.destinationMapId,destination.id);assert.ok(delivered.result.shippingReceipt.amountMzk>0);
 await runtime.command(environment.id,environment,identity,{action:'shipping',operation:'unload',requestId:finalRequest});
 state=await service.state();assert.equal(state.maps.find(map=>map.id===destination.id).stock[sku],quantity);assert.equal(state.worldStock[sku],1000);
 const purchase=await database.economyAction(wallet,'buy',sku,'factory-flow-market-sale',destination.id);
 const retry=await database.economyAction(wallet,'buy',sku,'factory-flow-market-sale',destination.id);
 assert.equal(purchase.id,retry.id);
 const reopened=new WorldSupplyService(new UserJsonDatabase(database.file),{now:()=>now,maps:async()=>[environment,destination]});state=await reopened.state();
 assert.equal(state.maps.find(map=>map.id===destination.id).stock[sku],quantity-1);
 assert.equal(state.worldStock[sku],1000);assert.equal(state.shipments[0].phase,'delivered');
});
