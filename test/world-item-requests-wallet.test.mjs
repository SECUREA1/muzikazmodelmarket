import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrateGameplayWallet} from '../gameplay-wallet-migration.mjs';
import {mapDeliveryAddresses} from '../world-delivery-addresses.mjs';
import {createWorldItemRequest,claimWorldItemRequest,reconcileWorldItemRequests} from '../world-item-requests.mjs';

test('wallet linking keeps a funded request, accepted maker and exact receiving identity through one final payout',()=>{
 const buyer='account:request-buyer',maker='account:request-maker',buyerWallet='0x'+'b'.repeat(40),makerWallet='0x'+'a'.repeat(40);
 const user=name=>({tokens:{MZK:1000},items:[],memory:{account:{accountId:name},profile:{displayName:name}}});
 const data={users:{[buyer]:user('request-buyer'),[maker]:user('request-maker')},transactions:[],worldSupply:{factoryStockReceipts:{},shipments:{},factoryLotAllocations:{}}},ledger=data.worldSupply;
 const map={id:'request-home',ownerId:buyer,name:'Maker quarter',spawn:{x:1,y:0,z:2}};
 const address=mapDeliveryAddresses(data,map)[0],item={supplyId:'native:forge-lantern',name:'Forged lantern'};
 const request=createWorldItemRequest(data,ledger,buyer,{requestId:'fund-before-link',itemId:item.supplyId,quantity:1,rewardMzk:300,addressId:address.id,expectedAddressRevision:address.revision},{item,address,now:100,id:'linked-request'});
 const valid=record=>{const current=mapDeliveryAddresses(data,map)[0];return record.recipientId===current.recipientId&&record.addressRevision===current.revision;};
 claimWorldItemRequest(data,ledger,maker,{inventoryRequestId:request.id},{now:101,addressValid:valid});
 request.shipmentIds=['shipment'];request.bindings={shipment:{shipmentId:'shipment',quantity:1,lots:[{lotId:'completed-lot',quantity:1}],boundAt:102}};
 ledger.shipments.shipment={id:'shipment',inventoryRequestId:request.id,ownerId:maker,recipientId:buyer,itemId:item.supplyId,addressId:address.id,destinationMapId:map.id};
 ledger.factoryLotAllocations.shipment={phase:'allocated',lots:[{lotId:'completed-lot',quantity:1}]};
 const link=(previous,next)=>{data.users[next]=data.users[previous];delete data.users[previous];migrateGameplayWallet(data,previous,next);};
 link(buyer,buyerWallet);link(maker,makerWallet);
 assert.equal(request.claimantId,makerWallet);assert.equal(request.ownerId,buyerWallet);assert.equal(request.recipientId,buyerWallet);assert.ok(valid(request));
 assert.equal(data.users[buyerWallet].tokens.MZK,700);assert.equal(request.escrowMzk,300);
 reconcileWorldItemRequests(data,ledger,{now:200,addressValid:valid});assert.notEqual(request.phase,'delivered');assert.equal(data.users[makerWallet].tokens.MZK,1000);
 ledger.factoryStockReceipts.received={id:'received-once',shipmentId:'shipment',itemId:item.supplyId,addressId:address.id,destinationMapId:map.id,quantity:1,lotAllocations:[{lotId:'completed-lot',quantity:1}],receivedAt:201};
 reconcileWorldItemRequests(data,ledger,{now:202,addressValid:valid});reconcileWorldItemRequests(data,ledger,{now:203,addressValid:valid});
 assert.equal(request.phase,'delivered');assert.equal(data.users[makerWallet].tokens.MZK,1300);assert.equal(request.escrowMzk,0);assert.equal(data.transactions.filter(row=>row.type==='WORLD_ITEM_REQUEST_PAID').length,1);
 assert.equal(data.users[buyerWallet].tokens.MZK+data.users[makerWallet].tokens.MZK,2000,'escrow transfers existing MZK without minting');
});

test('wallet linking does not repair a receiving address that actually moved',()=>{
 const old='account:receiver',wallet='0x'+'c'.repeat(40),address={id:'address:map:shop',position:{x:1,y:0,z:2},name:'Shop',addressLine:'20 Main Street'};
 const data={worldSupply:{itemRequests:{request:{recipientId:old,address:{...address},addressRevision:'original'}}}};
 migrateGameplayWallet(data,old,wallet);
 const moved=createHash('sha256').update(JSON.stringify([address.id,{...address.position,x:20},wallet,address.name,address.addressLine])).digest('hex').slice(0,24);
 assert.notEqual(data.worldSupply.itemRequests.request.addressRevision,moved);
});
