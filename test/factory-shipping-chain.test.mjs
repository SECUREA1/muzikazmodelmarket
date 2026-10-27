import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {factoryProvingGroundsWorld} from '../factory-testing-world.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {testingStations,testingTargets} from '../public/js/factory-test-config.js';
import {logisticsStations,itemLocked} from '../public/js/factory-logistics-config.js';
import {SHIPPING_RULES,SHIPPING_PORTS,SHIPPING_ROUTES} from '../public/js/shipping-config.js';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {testingCommand} from '../server-factory-testing.mjs';
import {logisticsCommand,logisticsAccountState,certifiedItem} from '../server-factory-logistics.mjs';
import {bindFactoryShippingVoyage,reconcileFactoryShippingVoyage} from '../server-factory-shipping.mjs';
import {shippingCommand,stepShipping,grantShippingReward,shippingAccountState,applyShippingAccount,applyShippingSettlement,playerShippingView} from '../server-shipping.mjs';
import {factoryCommand} from '../server-missile-factory.mjs';
import {factoryStations} from '../public/js/missile-factory-config.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'atlas-sea-chain-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:atlas-captain',itemId='crafted-atlas-model',factory=missileFactoryWorld(),range=factoryProvingGroundsWorld(),sea=shippingWorld();let now=100000,sequence=0;
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:2000},items:[{id:itemId,name:'Factory model',buildAssetId:'factory-training-missile',type:'factory-model'}],memory:{},revision:0};data.transactions.push({id:'atlas-craft-proof',type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId,recipeId:'training-missile',createdAt:new Date(1).toISOString()});return {};});
 const origin=SHIPPING_PORTS[0],boat={id:'atlas-feeder',modelId:'shipping-feeder',position:{x:origin.x,y:0,z:origin.z},rotation:{x:0,y:origin.berth.yaw,z:0},health:650,maxHealth:650,active:true,boating:{anchor:true,speed:0}},player={actorId:wallet,username:'Atlas Captain',health:100,position:{...range.spawn},lastSeen:now,grounded:true,movementRevision:0},sim={players:{[wallet]:player},actors:{},events:[]};
 const station=(environment,kind)=>logisticsStations(environment,{actors:sim.actors}).find(station=>station.kind===kind);
 const move=(environment,kind)=>{const value=station(environment,kind);assert.ok(value,kind);player.position={...value.position};return value;};
 const testing=(action,fields={})=>testingCommand(sim,player,range,{action,requestId:'sea-test-'+ ++sequence,...fields},now,{database,walletId:wallet});
 const logistics=(environment,action,fields={})=>logisticsCommand(sim,player,environment,{action,requestId:'sea-logistics-'+ ++sequence,...fields},now,{database,walletId:wallet});
 const ship=(operation,fields={})=>shippingCommand(sim,player,sea,{operation,...fields},now);
 const advance=ms=>{now+=ms;player.lastSeen=now;};
 async function qualify(){
  const stations=testingStations(range),target=testingTargets(range).find(target=>target.profileId==='accuracy');player.position={...stations.find(station=>station.kind==='setup').position};await testing('proving-setup',{itemId,profileId:'accuracy',targetId:target.id});const sessionId=player.testing.session.id,pad=stations.find(station=>station.kind==='pad');player.position={...pad.position};await testing('proving-deploy',{sessionId,padId:pad.id});player.position={...stations.find(station=>station.kind==='control').position};await testing('proving-arm',{sessionId});await testing('proving-launch',{sessionId,aim:{x:0,y:0}});advance(player.testing.session.endsAt-now);await testing('proving-status');move(range,'certify');await logistics(range,'logistics-certify',{itemId});
 }
 async function stage(){await qualify();move(factory,'export');await logistics(factory,'logistics-book',{itemId,destinationId:'atlas-export'});advance(5000);sim.actors[boat.id]=boat;move(sea,'shipping');const manifestId=player.logistics.manifest.id;await logistics(sea,'logistics-stage',{manifestId});applyShippingAccount(player,await shippingAccountState(database,wallet));return manifestId;}
 async function accept(){player.position={...sea.spawn};ship('board');ship('accept',{contractId:'atlas-export'});return bindFactoryShippingVoyage(database,wallet,player,{},now);}
 return {database,wallet,itemId,factory,range,sea,sim,player,boat,move,testing,logistics,ship,advance,qualify,stage,accept,get now(){return now;}};
}

test('a certified production model sails the actual Atlas route and settles inventory and capped MZK atomically once',async t=>{
 const f=await fixture(t),manifestId=await f.stage();assert.ok((await shippingAccountState(f.database,f.wallet)).factoryExport);
 await f.accept();assert.equal((await logisticsAccountState(f.database,f.wallet)).manifest.status,'in-transit');assert.equal(f.player.shipping.job.factoryManifestId,manifestId);assert.equal(playerShippingView(f.sim,f.player).job.factoryManifestId,undefined,'room peers never receive the sealed manifest id');
 for(let i=0;i<4;i++){f.ship('load',{side:i%2?'starboard':'port'});f.advance(2000);}f.ship('secure');f.ship('depart');const job=f.player.shipping.job;
 assert.throws(()=>f.ship('dock'),/every required channel/);let ticks=0;
 for(;ticks<6000&&job.phase==='sailing';ticks++){f.advance(250);stepShipping(f.sim,f.sea,f.now);const input=boatAssistedInput(f.boat,{},f.sea,f.now,f.sim.actors);Object.assign(f.boat,stepBoatSimulation(f.boat,input,.25,{environment:f.sea,now:f.now}));f.player.position={...f.boat.position,y:.35};if(job.checkpointIndex===job.waypoints.length&&Math.abs(f.boat.boating.speed)<.15)break;}
 assert.ok(ticks<6000,'actual feeder physics reaches every authored checkpoint and receiving berth');f.advance(250);stepShipping(f.sim,f.sea,f.now);assert.equal(job.phase,'sailing');assert.equal(job.checkpointIndex,job.waypoints.length);assert.ok(job.distanceSailed>1500);f.ship('dock');let settlement;
 for(let i=0;i<4;i++){settlement=f.ship('unload').settlement;f.advance(2000);}assert.equal(settlement.factoryManifestId,manifestId);const receipt=await grantShippingReward(f.database,f.wallet,settlement,{now:f.now});applyShippingSettlement(f.sim,f.player,settlement,receipt,f.now);
 const data=await f.database.read(),manifest=data.factoryLogistics.manifests[manifestId];assert.equal(manifest.status,'delivered');assert.equal(manifest.voyageId,job.id);assert.equal(manifest.quality,100);assert.equal(itemLocked(data,f.wallet,f.itemId,f.now),false);assert.ok(certifiedItem(data,f.wallet,f.itemId));assert.equal(data.users[f.wallet].items.filter(item=>item.id===f.itemId).length,1);assert.equal(data.users[f.wallet].tokens.MZK,2000+receipt.amountMzk);assert.ok(receipt.amountMzk<=SHIPPING_RULES.dailyRewardCapMzk);assert.equal(receipt.supplies['shipping-parts-stock'],4);
 assert.equal((await grantShippingReward(new UserJsonDatabase(f.database.file),f.wallet,settlement,{now:f.now})).id,receipt.id);assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_FREIGHT_DELIVERY'&&row.manifestId===manifestId).length,1);
 await f.database.listItem(f.wallet,f.itemId,225);assert.equal((await f.database.marketListings()).find(item=>item.itemId===f.itemId).priceMzk,225,'delivered production returns to the existing MZK player market');
});

test('an interrupted voyage retains sealed inventory until recovery at the export desk, including restart and different-contract cases',async t=>{
 const f=await fixture(t),manifestId=await f.stage();await f.accept();f.ship('cancel');await reconcileFactoryShippingVoyage(f.database,f.wallet,f.player,f.now);
 assert.equal(f.player.shipping.job.factoryManifestId,undefined,'terminal jobs reconcile once rather than writing on every input');let saved=await logisticsAccountState(f.database,f.wallet);assert.equal(saved.manifest.status,'return-required');assert.equal(itemLocked(await f.database.read(),f.wallet,f.itemId,f.now),true);
 f.player.vehicleId=null;f.boat.holderId=null;f.move(f.sea,'shipping');await f.logistics(f.sea,'logistics-return',{manifestId});assert.equal(itemLocked(await f.database.read(),f.wallet,f.itemId,f.now),false);assert.equal((await f.database.read()).users[f.wallet].tokens.MZK,2000,'cancellation does not mint a voyage payout');
 f.move(f.factory,'export');await f.logistics(f.factory,'logistics-book',{itemId:f.itemId,destinationId:'atlas-export'});f.advance(5000);f.move(f.sea,'shipping');const second=f.player.logistics.manifest.id;await f.logistics(f.sea,'logistics-stage',{manifestId:second});applyShippingAccount(f.player,await shippingAccountState(f.database,f.wallet));await f.accept();
 const restarted=new UserJsonDatabase(f.database.file);f.player.shipping.job={id:randomUUID(),contractId:'dock-induction',phase:'loading'};await reconcileFactoryShippingVoyage(restarted,f.wallet,f.player,f.now);saved=await logisticsAccountState(restarted,f.wallet);assert.equal(saved.manifest.id,second);assert.equal(saved.manifest.status,'return-required','a replacement runtime contract cannot strand the old sealed model in transit');
});

test('Atlas export refuses unstaged or mismatched models and never pays an unbound delivery',async t=>{
 const f=await fixture(t);f.sim.actors[f.boat.id]=f.boat;f.player.position={...f.sea.spawn};applyShippingAccount(f.player,await shippingAccountState(f.database,f.wallet));f.ship('board');assert.throws(()=>f.ship('accept',{contractId:'atlas-export'}),/Stage a certified factory model/);
 const route=SHIPPING_ROUTES.find(route=>route.id==='atlas-export'),result={type:'delivery',deliveryId:randomUUID(),contractId:route.id,cargoId:route.cargoId,units:4,quality:100,demandBonusMzk:0,amountMzk:route.rewardMzk,startedAt:1000,departedAt:10000,deliveredAt:20000,worldId:f.sea.id,factoryManifestId:'forged'};
 await assert.rejects(grantShippingReward(f.database,f.wallet,result,{now:20000}),/does not belong/);assert.equal((await f.database.read()).users[f.wallet].tokens.MZK,2000);assert.equal((await shippingAccountState(f.database,f.wallet)).stats.deliveries,0);
});

test('canonical shipping parts become one durable next-order production credit and replay cannot duplicate it',async t=>{
 const f=await fixture(t),delivery={type:'delivery',deliveryId:randomUUID(),contractId:'dock-induction',cargoId:'building-supplies',units:4,quality:100,amountMzk:20,startedAt:1000,departedAt:6000,deliveredAt:20000,worldId:f.sea.id};await grantShippingReward(f.database,f.wallet,delivery,{now:20000});
 const exchange={type:'trade',tradeId:'parts-production',stockId:'shipping-parts-stock',exchangeId:randomUUID(),worldId:f.sea.id},first=await grantShippingReward(f.database,f.wallet,exchange,{now:20000});assert.equal(first.supplies['shipping-parts-stock'],3);assert.equal((await grantShippingReward(f.database,f.wallet,exchange,{now:20000})).id,first.id);let data=await f.database.read();assert.equal(data.factoryLogistics.productionCredits[f.wallet],1);
 f.player.position={...factoryStations(f.factory).find(station=>station.kind==='procurement').position};await factoryCommand(f.sim,f.player,f.factory,{action:'factory-start',requestId:'credit-order',recipeId:'training-missile'},f.now,{database:f.database,walletId:f.wallet});assert.equal(f.player.factory.job.supplyCreditMzk,20);assert.equal(f.player.factory.job.costMzk,160);data=await f.database.read();assert.equal(data.factoryLogistics.productionCredits[f.wallet],0);assert.equal(data.users[f.wallet].tokens.MZK,1860);
 await f.database.transaction(state=>{state.shipping.accounts[f.wallet].supplies['shipping-parts-stock']=0;state.users[f.wallet].items.find(item=>item.shippingSupplyId==='shipping-parts-stock').quantity=999;state.users[f.wallet].memory.productionCredits=99;return {};});await assert.rejects(grantShippingReward(f.database,f.wallet,{...exchange,exchangeId:randomUUID()},{now:20000}),/already been exchanged/);assert.equal((await f.database.read()).factoryLogistics.productionCredits[f.wallet],0,'editable Backpack quantities and memory never grant production credit');
});
