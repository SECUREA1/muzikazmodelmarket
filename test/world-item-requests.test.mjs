import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureWorldItemRequests,createWorldItemRequest,claimWorldItemRequest,cancelWorldItemRequest,attachWorldItemRequestShipment,reconcileWorldItemRequests,publicWorldItemRequest,eligibleWorldItemRequestLots} from '../world-item-requests.mjs';

const buyer='account:buyer',maker='account:maker',other='account:other',now=100000;
const address={id:'address:shop:store',name:'Smithy Store',mapId:'shop',mapName:'Shop Map',kind:'store',recipientId:buyer,revision:'revision-1',position:{x:1,y:0,z:2},addressLine:'123 Shop Street'};
const item={supplyId:'native:forge-hammer',name:'Forge Hammer'};
const valid=record=>record.recipientId===buyer&&record.addressId===address.id&&record.addressRevision===address.revision;
function fixture(){
 const data={users:{[buyer]:{tokens:{MZK:1000},items:[],memory:{profile:{displayName:'Buyer'}}},[maker]:{tokens:{MZK:500},items:[],memory:{profile:{displayName:'Maker'}}},[other]:{tokens:{MZK:100},items:[]}},transactions:[]};
 const ledger={production:{job:{id:'job',ownerId:maker,schemaVersion:3,phase:'ready',itemId:item.supplyId,quantity:3,outputRecorded:true,outputLotId:'lot',readyAt:now-10,completedAt:now-10,stages:[1,2,3,4].map(id=>({id,phase:'complete',operations:[{phase:'complete'}]})),packingReceipt:{sealHash:'a'.repeat(64)}}},factoryLots:{lot:{id:'lot',itemId:item.supplyId,quantity:3,availableQuantity:3,origin:'production',productionId:'job',createdAt:now-10,packingReceipt:{sealHash:'a'.repeat(64)}}},factoryStock:{[item.supplyId]:3},shipments:{},factoryLotAllocations:{},factoryStockReceipts:{}};
 data.worldSupply=ledger;
 return {data,ledger};
}
function create(f,fields={},context={}){return createWorldItemRequest(f.data,f.ledger,buyer,{requestId:'fund-request',itemId:item.supplyId,addressId:address.id,expectedAddressRevision:address.revision,quantity:2,rewardMzk:120,...fields},{item,address,now,id:'request-1',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',...context});}
function claim(f,id='request-1',wallet=maker){return claimWorldItemRequest(f.data,f.ledger,wallet,{inventoryRequestId:id},{now:now+1,addressValid:valid});}
function ship(f,id='ship',quantity=2,lotId='lot'){
 const shipment={id,ownerId:maker,itemId:item.supplyId,quantity,sourceMapId:'factory',destinationMapId:address.mapId,addressId:address.id,recipientId:buyer,phase:'queued',createdAt:now+2};
 f.ledger.shipments[id]=shipment;f.ledger.factoryLotAllocations[id]={shipmentId:id,itemId:item.supplyId,quantity,phase:'allocated',lots:[{lotId,quantity}]};
 f.ledger.factoryLots[lotId].availableQuantity-=quantity;f.ledger.factoryStock[item.supplyId]-=quantity;
 return shipment;
}
function attach(f,id='ship',request='request-1'){return attachWorldItemRequestShipment(f.data,f.ledger,maker,{inventoryRequestId:request,shipmentId:id},{now:now+3,addressValid:valid});}
function receipt(f,id='receipt',shipmentId='ship',quantity=2,lotId='lot',overrides={}){
 f.ledger.factoryStockReceipts[id]={id,shipmentId,itemId:item.supplyId,quantity,destinationMapId:address.mapId,addressId:address.id,receivedAt:now+100,lotAllocations:[{lotId,quantity}],...overrides};
}
const reconcile=f=>reconcileWorldItemRequests(f.data,f.ledger,{now:now+101,addressValid:valid});

test('requests escrow one exact total reward, validate saved address details, and refund only once before freight',()=>{
 const f=fixture(),record=create(f);
 assert.equal(f.data.users[buyer].tokens.MZK,880);assert.equal(record.escrowMzk,120);
 assert.equal(create(f),record);assert.equal(f.data.users[buyer].tokens.MZK,880);assert.equal(f.data.transactions.length,1);
 assert.throws(()=>create(f,{quantity:3}),/different details/);
 assert.throws(()=>create(f,{requestId:'changed-address',expectedAddressRevision:'stale'}),/address changed/);
 assert.throws(()=>create(f,{requestId:'bad-quantity',quantity:101}),/1 to 100/);
 assert.throws(()=>create(f,{requestId:'bad-reward',rewardMzk:0}),/total reward/);
 claim(f);assert.throws(()=>claim(f,'request-1',other),/Another maker/);
 assert.throws(()=>cancelWorldItemRequest(f.data,f.ledger,maker,{inventoryRequestId:record.id},{now}),/Only the requester/);
 cancelWorldItemRequest(f.data,f.ledger,buyer,{inventoryRequestId:record.id},{now});
 cancelWorldItemRequest(f.data,f.ledger,buyer,{inventoryRequestId:record.id},{now});
 assert.equal(f.data.users[buyer].tokens.MZK,1000);assert.equal(record.phase,'cancelled');assert.equal(f.data.transactions.filter(tx=>tx.type==='WORLD_ITEM_REQUEST_REFUND').length,1);
});

test('only the accepted maker’s genuinely completed paid production or forge export can enter a request',()=>{
 const f=fixture();create(f);claim(f);
 assert.equal(eligibleWorldItemRequestLots(f.data,f.ledger,maker,null,{now}).length,1);
 assert.equal(eligibleWorldItemRequestLots(f.data,f.ledger,other,null,{now}).length,0);
 f.ledger.factoryLots.seed={id:'seed',itemId:item.supplyId,quantity:1000,availableQuantity:1000,origin:'legacy-stock'};
 f.ledger.production.job.phase='building';assert.equal(eligibleWorldItemRequestLots(f.data,f.ledger,maker,item.supplyId,{now}).length,0);
 ship(f);assert.throws(()=>attach(f),/completed, sealed/);
 f.ledger.production.job.phase='ready';f.ledger.production.job.stages[0].operations[0].phase='processing';assert.throws(()=>attach(f),/completed, sealed/);
 f.ledger.production.job.stages[0].operations[0].phase='complete';delete f.ledger.production.job.packingReceipt.sealHash;assert.throws(()=>attach(f),/completed, sealed/);
 const forge={id:'forged-lot',itemId:item.supplyId,quantity:1,availableQuantity:1,origin:'traditional-forge',forgeWalletId:maker,forgeReceiptId:'forged-original',forgeExportReceiptId:'export',qualityReceipt:{completedStages:['heat','hammer','quench','temper','finish']},packingReceipt:{sealed:true,id:'export'}};
 f.ledger.factoryLots[forge.id]=forge;
 f.data.transactions.push({id:'export',type:'FORGE_FREIGHT_EXPORT',walletId:maker,lotId:forge.id,itemId:item.supplyId,quantity:1});
 assert.equal(eligibleWorldItemRequestLots(f.data,f.ledger,maker,item.supplyId,{now}).length,0,'an export without the original paid creation receipt does not count');
 f.data.transactions.push({id:'forged-original',type:'FORGE_ITEM_CREATED'});
 const lots=eligibleWorldItemRequestLots(f.data,f.ledger,maker,item.supplyId,{now});assert.equal(lots.length,1);assert.equal(lots[0].source,'forge');
});

test('a request pays only for exact final addressed stock receipts and rejects phase labels, sea arrival and mismatched proofs',()=>{
 const f=fixture(),record=create(f);claim(f);const shipment=ship(f);attach(f);
 const originalMakerBalance=f.data.users[maker].tokens.MZK;
 shipment.phase='delivered';shipment.seaReceipt={id:'sea'};reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'wrong-address','ship',2,'lot',{addressId:'address:other:shop'});reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'wrong-item','ship',2,'lot',{itemId:'native:forge-shield'});reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'wrong-map','ship',2,'lot',{destinationMapId:'elsewhere'});reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'wrong-lot','ship',2,'other-lot');reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'bad-count','ship',1,'lot',{lotAllocations:[{lotId:'lot',quantity:2}]});reconcile(f);assert.equal(record.deliveredQuantity,0);
 receipt(f,'first-part','ship',1);reconcile(f);assert.equal(record.phase,'partial');assert.equal(record.deliveredQuantity,1);assert.equal(f.data.users[maker].tokens.MZK,originalMakerBalance);
 assert.throws(()=>cancelWorldItemRequest(f.data,f.ledger,buyer,{inventoryRequestId:record.id},{now}),/Received items/);
 receipt(f,'second-part','ship',1);reconcile(f);
 assert.equal(record.phase,'delivered');assert.equal(record.deliveredQuantity,2);assert.equal(record.escrowMzk,0);assert.equal(record.paidMzk,120);assert.equal(f.data.users[maker].tokens.MZK,originalMakerBalance+120);
 reconcile(f);assert.equal(f.data.users[maker].tokens.MZK,originalMakerBalance+120);assert.equal(f.data.transactions.filter(tx=>tx.type==='WORLD_ITEM_REQUEST_PAID').length,1);
 assert.equal(f.data.users[maker].items.length,0);assert.equal(f.data.users[buyer].items.length,0,'request completion never fabricates a Backpack copy');
});

test('partial shipments reserve only their remaining demand and returned unshipped stock can replace a cancelled binding',()=>{
 const f=fixture(),record=create(f);claim(f);ship(f,'first',1);attach(f,'first');
 assert.equal(record.committedQuantity,1);assert.equal(publicWorldItemRequest(record,maker).fulfillableQuantity,1);
 assert.throws(()=>cancelWorldItemRequest(f.data,f.ledger,buyer,{inventoryRequestId:record.id},{now}),/freight first/);
 f.ledger.shipments.first.phase='cancelled';f.ledger.factoryLotAllocations.first.phase='returned';f.ledger.factoryLots.lot.availableQuantity++;f.ledger.factoryStock[item.supplyId]++;
 reconcile(f);assert.equal(record.committedQuantity,0);assert.equal(record.phase,'claimed');
 ship(f,'replacement',2);attach(f,'replacement');assert.equal(record.committedQuantity,2);
 const excess={...f.ledger.shipments.replacement,id:'excess'};f.ledger.shipments.excess=excess;f.ledger.factoryLotAllocations.excess={...f.ledger.factoryLotAllocations.replacement,shipmentId:'excess'};
 assert.throws(()=>attach(f,'excess'),/uncommitted quantity/);
 receipt(f,'received','replacement',2);reconcile(f);assert.equal(record.phase,'delivered');assert.equal(f.data.users[maker].tokens.MZK,620);
});

test('address ownership drift holds request progress and reward, and a shipment cannot be reused for another funded request',()=>{
 const f=fixture(),record=create(f);claim(f);ship(f);attach(f);
 const second=create(f,{requestId:'another-funded-request'},{id:'request-2'});claim(f,second.id);
 assert.throws(()=>attach(f,'ship',second.id),/another request/);
 receipt(f);reconcileWorldItemRequests(f.data,f.ledger,{now:now+101,addressValid:()=>false});
 assert.equal(record.phase,'attention');assert.equal(record.escrowMzk,120);assert.equal(f.data.users[maker].tokens.MZK,500);
 assert.throws(()=>claimWorldItemRequest(f.data,f.ledger,maker,{inventoryRequestId:second.id},{now,addressValid:()=>false}),/address or owner changed/);
 reconcile(f);assert.equal(record.phase,'delivered');assert.equal(f.data.users[maker].tokens.MZK,620);
});

test('trusted AI calls become real payer-funded requests and public board records contain names and capability flags without wallet identities',()=>{
 const f=fixture(),record=create(f,{source:'any',requesterKind:'ai',recipientId:other,completed:true},{call:{id:'call-1',contact:'Kade · Store restock',source:'factory'}});
 assert.equal(record.requesterKind,'ai');assert.equal(record.source,'factory');assert.equal(record.recipientId,buyer);assert.equal(record.phase,'open');assert.equal(f.data.users[buyer].tokens.MZK,880);
 assert.throws(()=>create(f,{requestId:'duplicate-call'},{id:'request-2',call:{id:'call-1',contact:'Kade',source:'factory'}}),/active funded request/);
 let view=publicWorldItemRequest(record,maker);assert.equal(view.mine,false);assert.equal(view.canClaim,true);assert.equal(view.canCancel,false);
 claim(f);view=publicWorldItemRequest(record,maker);assert.equal(view.claimantName,'Maker');assert.equal(view.claimedByMe,true);assert.equal(view.canFulfill,true);assert.equal(view.canClaim,false);
 const publicText=JSON.stringify(view);for(const identity of [buyer,maker,other])assert.ok(!publicText.includes(identity));
 assert.deepEqual(view.address.position,address.position);assert.equal(view.address.addressLine,address.addressLine);assert.equal(ensureWorldItemRequests(f.ledger),f.ledger.itemRequests);
});
