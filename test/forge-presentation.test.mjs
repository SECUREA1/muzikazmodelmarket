import test from 'node:test';
import assert from 'node:assert/strict';
import {forgePresentation} from '../server-forge-presentation.mjs';
import {createForgePresentationClient} from '../public/js/forge-presentation-client.js';

function ledger(){return {worldSupply:{factoryLots:{mine:{id:'mine',origin:'traditional-forge',forgeWalletId:'alice',itemId:'native:forge-dagger',quantity:2,availableQuantity:1},other:{id:'other',origin:'traditional-forge',forgeWalletId:'bob',itemId:'native:forge-warhammer',quantity:3,availableQuantity:2},machine:{id:'machine',origin:'production',quantity:900,availableQuantity:900}},factoryLotAllocations:{ship:{lots:[{lotId:'mine',quantity:1}]},private:{lots:[{lotId:'other',quantity:1}]}},shipments:{ship:{id:'ship',itemId:'native:forge-dagger',phase:'delivered',destinationMapId:'forge-shop'},private:{id:'private',itemId:'native:forge-warhammer',phase:'sailing',destinationMapId:'private-deed'}},factoryStockReceipts:{credited:{id:'stock:ship',shipmentId:'ship',itemId:'native:forge-dagger',destinationMapId:'forge-shop',quantity:1,lotAllocations:[{lotId:'mine',quantity:1}]}}}};}

test('physical forge yard reads exact lot counts without exposing other owners or changing inventory',()=>{
 const data=ledger(),before=structuredClone(data),state=forgePresentation(data,'alice',{now:1000});
 assert.deepEqual(state.warehouse,{sealedUnits:5,availableUnits:3,allocatedUnits:1,deliveredUnits:1,lotCount:2});
 assert.deepEqual(state.lots.map(lot=>lot.id),['mine']);assert.equal(state.shipments.length,1);
 assert.equal(state.shipments[0].stockConfirmed,true);assert.equal(state.shipments[0].stockReceiptId,'stock:ship');
 assert.ok(!JSON.stringify(state).includes('private-deed'));assert.ok(!JSON.stringify(state).includes('bob'));assert.deepEqual(data,before);
 const visitor=forgePresentation(data,'visitor');assert.equal(visitor.lots.length,0);assert.equal(visitor.shipments.length,0);assert.equal(visitor.warehouse.availableUnits,3);
});

test('a delivered label or sea receipt cannot substitute for an actual destination stock receipt',()=>{
 const data=ledger();data.worldSupply.factoryStockReceipts={};data.worldSupply.shipments.ship.seaReceipt={id:'sea-only'};
 const state=forgePresentation(data,'alice');assert.equal(state.shipments[0].seaConfirmed,true);assert.equal(state.shipments[0].stockConfirmed,false);assert.equal(state.shipments[0].stockReceiptId,null);assert.equal(state.warehouse.deliveredUnits,0);
});

test('partial receipts follow their exact owned lot and reject a mismatched item or destination',()=>{
 const data=ledger(),supply=data.worldSupply;
 supply.factoryLots.second={...supply.factoryLots.mine,id:'second',quantity:1,availableQuantity:0};
 supply.factoryLotAllocations.ship.lots.push({lotId:'second',quantity:1});
 supply.factoryStockReceipts.unrelated={...supply.factoryStockReceipts.credited,id:'stock:unrelated',lotAllocations:[{lotId:'other',quantity:1}]};
 supply.factoryStockReceipts.wrongMap={...supply.factoryStockReceipts.credited,id:'stock:wrong-map',destinationMapId:'elsewhere',lotAllocations:[{lotId:'second',quantity:1}]};
 supply.factoryStockReceipts.wrongItem={...supply.factoryStockReceipts.credited,id:'stock:wrong-item',itemId:'native:forge-warhammer',lotAllocations:[{lotId:'second',quantity:1}]};
 const shipment=forgePresentation(data,'alice').shipments[0];
 assert.equal(shipment.stockConfirmed,false);assert.equal(shipment.stockConfirmedQuantity,1);assert.equal(shipment.stockReceiptId,'stock:ship');
 assert.deepEqual(shipment.lotReceipts,[{lotId:'mine',quantity:1,stockConfirmedQuantity:1,stockConfirmed:true,stockReceiptId:'stock:ship'},{lotId:'second',quantity:1,stockConfirmedQuantity:0,stockConfirmed:false,stockReceiptId:null}]);
});

test('forge stock presentation limits requests and refreshes after a confirmed inventory mutation',async()=>{
 let clock=1000,calls=0,environment={id:'traditional-forge'},data=[];
 const client=createForgePresentationClient({getEnvironment:()=>environment,now:()=>clock,onData:value=>data.push(value),request:async()=>({serverTime:++calls})});
 await client.refresh();await client.refresh();assert.equal(calls,1);
 clock+=10000;await client.refresh();assert.equal(calls,2);client.invalidate();await client.refresh();assert.equal(calls,3);
 environment={id:'public-commons'};await client.refresh();assert.equal(calls,3);assert.equal(client.snapshot().activeId,null);client.dispose();
});

test('a previous map response is discarded after switching worlds or resetting the scene',async()=>{
 let resolve,environment={id:'traditional-forge'},delivered=0;
 const client=createForgePresentationClient({getEnvironment:()=>environment,onData:data=>{if(data)delivered++;},request:()=>new Promise(done=>resolve=done)});
 const pending=client.refresh();await Promise.resolve();environment={id:'public-commons'};client.reset();resolve({warehouse:{availableUnits:99}});await pending;
 assert.equal(delivered,0);assert.equal(client.snapshot().pending,false);client.dispose();
});

test('same-map inventory and wallet changes clear private details and discard an earlier pending response',async()=>{
 let resolve;const updates=[];
 const client=createForgePresentationClient({getEnvironment:()=>({id:'traditional-forge'}),onData:data=>updates.push(data),request:()=>new Promise(done=>resolve=done)});
 const pending=client.refresh();await Promise.resolve();client.invalidate();resolve({lots:[{id:'previous-wallet-lot'}]});await pending;
 assert.equal(updates.at(-1),null);assert.ok(updates.every(data=>data===null));assert.equal(client.snapshot().pending,false);
 client.reset();assert.equal(client.snapshot().activeId,null);
});
