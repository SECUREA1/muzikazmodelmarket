import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {SHIPPING_RULES} from '../public/js/shipping-config.js';
import {migrateGameplayWallet} from '../gameplay-wallet-migration.mjs';

test('connecting a recipient wallet preserves truck cargo and the receiving deed identity',()=>{
 const old='account:delivery-recipient',wallet='0x'+'b'.repeat(40),sender='account:independent-sender',shipment={id:'shipment',ownerId:sender,recipientId:old,deedId:'deed-home',quantity:5},task={id:'truck',shipmentId:'shipment',ownerId:sender,recipientId:old,phase:'driving',quantity:5};
 const data={worldSupply:{worldStock:{item:1000},maps:{'plot-deed-home':{stock:{item:0}}},shipments:{shipment},deliveryTasks:{truck:task},portEscrow:{shipment:{ownerId:sender,recipientId:old,remainingQuantity:5,deliveredQuantity:0}},dropoffReceipts:{}}};
 migrateGameplayWallet(data,old,wallet);
 assert.equal(shipment.recipientId,wallet);assert.equal(task.recipientId,wallet);assert.equal(data.worldSupply.portEscrow.shipment.recipientId,wallet);
 assert.equal(shipment.ownerId,sender);assert.equal(task.ownerId,sender);assert.equal(task.phase,'driving');assert.equal(task.quantity,5);assert.equal(shipment.deedId,'deed-home');
 assert.equal(data.worldSupply.worldStock.item,1000);assert.equal(data.worldSupply.maps['plot-deed-home'].stock.item,0);assert.equal(data.worldSupply.portEscrow.shipment.remainingQuantity,5);
});

test('connecting a wallet moves paid batches, reserved voyages, proof ownership and durable replay receipts without reseeding supply',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'supply-wallet-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json')),account={accountId:'migration-captain',mzkBalance:1000000},old='account:migration-captain',wallet='0x'+'a'.repeat(40);
 await db.ensureAccount(account);let now=100000;
 const environment={id:'hormuz-shipping'},maps=[environment,{id:'destination'}],service=new WorldSupplyService(db,{now:()=>now,maps:async()=>maps});
 const input={itemId:'tool:scanner',quantity:10,requestId:'original-paid-build'};
 const build=await service.action(old,'produce',input);now=build.readyAt;await service.state();
 const shipment=await service.action(old,'dispatch',{...input,requestId:'original-dispatch',destinationMapId:'destination'});
 const player={shipping:{job:null}},identity={walletId:old};
 await service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 player.shipping.job={id:'real-room-job',phase:'loading',contractId:shipment.contractId,environmentId:environment.id,deadline:now+SHIPPING_RULES.contractLimitMs};
 await service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:'real-room-job'});
 const unfinished=await service.action(old,'produce',{...input,requestId:'unfinished-build'});
 await db.transaction(data=>{
  data.shipping={accounts:{[old]:{dailyEarnedMzk:275,supplies:{'shipping-parts-stock':2},leagueClaims:{saved:{walletId:old}}}}};
  data.factoryTesting={accounts:{[old]:{completedTests:2,actorId:old}},itemLocks:{proof:{walletId:old,actorId:old}}};
  data.factoryLogistics={accounts:{[old]:{stats:{deliveries:1}}},certificates:{proof:{issuedTo:old}},productionCredits:{[old]:3}};
  data.factoryModelOwnership={[old+'\ncrafted']:{walletId:old,itemId:'crafted',proofId:'immutable-proof'}};return {};
 });
 const balance=(await db.get(old)).tokens.MZK;await db.ensureAccount({...account,primaryEthereumWallet:wallet});
 let data=await db.read();assert.equal(data.users[old],undefined);assert.equal(data.users[wallet].tokens.MZK,balance);
 assert.equal(data.worldSupply.production[unfinished.id].ownerId,wallet);assert.equal(data.worldSupply.shipments[shipment.id].captainId,wallet);
 assert.equal(data.factoryTesting.accounts[wallet].actorId,old,'room actor identity stays stable');assert.equal(data.factoryTesting.itemLocks.proof.walletId,wallet);
 assert.equal(data.factoryLogistics.certificates.proof.issuedTo,wallet);assert.equal(data.factoryLogistics.productionCredits[wallet],3);
 assert.equal(data.factoryModelOwnership[wallet+'\ncrafted'].proofId,'immutable-proof');assert.equal(data.factoryModelOwnership[old+'\ncrafted'],undefined);
 assert.equal(data.shipping.accounts[wallet].dailyEarnedMzk,275);assert.equal(data.shipping.accounts[wallet].supplies['shipping-parts-stock'],2);
 const replay=await service.action(wallet,'produce',input);assert.equal(replay.id,build.id);assert.equal((await db.get(wallet)).tokens.MZK,balance);
 const cancel={productionId:unfinished.id,requestId:'refund-after-connect'};
 await service.action(wallet,'cancel',cancel);await service.action(wallet,'cancel',cancel);
 assert.equal((await db.get(wallet)).tokens.MZK,balance+unfinished.priceMzk);
 await service.shippingAction({walletId:wallet},{},player,environment,{operation:'release',shipmentId:shipment.id,jobId:'real-room-job'});
 const returned=await service.action(wallet,'cancel',{shipmentId:shipment.id,requestId:'return-after-connect'});assert.equal(returned.phase,'cancelled');
 data=await db.read();assert.equal(data.worldSupply.factoryStock['tool:scanner'],10);assert.equal(data.worldSupply.worldStock['tool:scanner'],1000);
 assert.equal(data.worldSupply.shipments[shipment.id].releasedReservations[wallet+':real-room-job'],true);
});
