import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {deliveryAddressId} from '../world-delivery-addresses.mjs';
import {filterSupplyState} from '../world-supply.mjs';

const WALLET='account:air-supply-sender',OTHER='account:air-other';
const ITEM=GAME_ECONOMY.find(item=>item.buildAssetId==='harbor-skiff').sku;
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'strait-supply-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json'));
 for(const wallet of [WALLET,OTHER])await database.put(wallet,{tokens:{MZK:1000000},items:[],memory:{}});
 const sea=shippingWorld(),map={id:'air-address-market',name:'Air supply receivers',visibility:'public',spawn:{x:0,y:0,z:60},builderScene:{layout:'grand-floor',mapSize:180,objects:[{id:'receiving-store',modelId:'general-store',name:'Receiving Store',position:{x:35,y:0,z:-20},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}]},delivery:{hub:{position:{x:0,y:0,z:60}}}},collision=new ServerBuilderCollision();t.after(()=>collision.clearWorlds());
 let now=1000000;const service=new WorldSupplyService(database,{maps:async()=>[sea,map],rooms:async()=>({}),collision,now:()=>now});
 return {database,service,sea,map,addressId:deliveryAddressId(map.id,'receiving-store'),get now(){return now;},set now(value){now=value;}};
}
async function readyOrder(f,{onwardMode='air',requestId='paid-air-order',contractId='northern-materials'}={}){
 const quote=await f.service.action(WALLET,'quote',{itemId:ITEM,quantity:5}),input={itemId:ITEM,quantity:5,addressId:f.addressId,shippingMapId:f.sea.id,contractId,onwardMode,expectedPriceMzk:quote.priceMzk,requestId},order=await f.service.action(WALLET,'order-address',input);
 let state=await f.service.state({walletId:WALLET});f.now=state.production.find(job=>job.id===order.productionId).readyAt;state=await f.service.state({walletId:WALLET});
 return {order,input,shipment:state.shipments.find(shipment=>shipment.orderId===order.id)};
}
async function unloadSea(f,shipment){
 const identity={walletId:WALLET},player={shipping:{}};
 await f.service.shippingAction(identity,{},player,f.sea,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 const startedAt=f.now,jobId='air-supply-sea-job';player.shipping.job={id:jobId,phase:'loading',contractId:shipment.contractId,environmentId:f.sea.id,deadline:f.now+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,f.sea,{operation:'bind',shipmentId:shipment.id,jobId});
 const route=SHIPPING_ROUTES.find(route=>route.id===shipment.contractId);f.now+=120000;
 return f.service.deliver(identity,{type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:shipment.contractId,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:f.now},f.sea);
}
const stock=(state,f)=>state.maps.find(map=>map.id===f.map.id).stock[ITEM]||0;

test('air routing is reviewed before payment and idempotency cannot swap the onward mode',async t=>{
 const f=await fixture(t),before=await f.database.read();
 for(const onwardMode of ['teleport','AIR'])await assert.rejects(f.service.action(WALLET,'order-address',{itemId:ITEM,quantity:5,addressId:f.addressId,onwardMode,requestId:'bad-'+onwardMode}),{statusCode:422});
 await assert.rejects(f.service.action(WALLET,'order-address',{itemId:ITEM,quantity:5,addressId:f.addressId,onwardMode:'air',contractId:'island-provisions',requestId:'no-qeshm-airstrip'}),{statusCode:422});
 assert.equal((await f.database.get(WALLET)).tokens.MZK,1000000);assert.equal(Object.keys((await f.database.read()).worldSupply?.production||{}).length,0);
 assert.deepEqual((await f.database.read()).transactions,before.transactions);
 const {order,input,shipment}=await readyOrder(f);assert.equal(order.onwardMode,'air');assert.equal(order.onwardPortId,'fujairah');assert.equal(shipment.onwardMode,'air');assert.equal(shipment.onwardPortId,'fujairah');
 await assert.rejects(f.service.action(WALLET,'order-address',{...input,onwardMode:'road'}),/different operation/);
 const tokens=(await f.database.get(WALLET)).tokens.MZK;
 await assert.rejects(f.service.action(WALLET,'dispatch',{itemId:ITEM,quantity:1,sourceMapId:'world',destinationMapId:'world',onwardMode:'air',requestId:'air-needs-address'}),{statusCode:422});assert.equal((await f.database.get(WALLET)).tokens.MZK,tokens);
});

test('sea and partial air receipts keep counted stock escrowed until the exact final doorstep; replay and cancellation preserve quantities',async t=>{
 const f=await fixture(t),{order,shipment}=await readyOrder(f);await unloadSea(f,shipment);
 let state=await f.service.state({walletId:WALLET});assert.equal(stock(state,f),0);assert.equal(state.deliveryTasks.length,0);assert.deepEqual(state.airTasks.map(task=>task.quantity),[4,1]);assert.ok(f.service.hasDeliveryActivity(f.sea.id));
 const initial=state.airTasks[0],actorId='pilot-actor',craft={id:'supply-da40',modelId:'diamond-da40',asset:{buildAssetId:'diamond-da40'},active:true,health:400,holderId:actorId,position:{...initial.route.origin.cargoApron,y:.4},rotation:{x:0,y:0,z:0},flight:{airborne:false,speed:0,airspeed:0}},player={actorId,health:100,lastSeen:f.now,vehicleId:craft.id,shipping:{}};
 const sim={actors:{[craft.id]:craft},players:{[actorId]:player}};
 await assert.rejects(f.service.airAction({walletId:WALLET},sim,player,f.sea,{operation:'reserve',airTaskId:initial.id},f.now),/port truck/);
 f.now+=180000;player.lastSeen=f.now;state=await f.service.state({walletId:WALLET});
 const result=await f.service.airAction({walletId:WALLET},sim,player,f.sea,{operation:'reserve',airTaskId:initial.id},f.now),task=result.task;
 assert.equal(task.quantity,4);assert.equal(task.phase,'reserved');
 const publicState=await f.service.state();assert.equal(publicState.airTasks[0].reservationId,undefined);assert.equal(publicState.airTasks[0].captainId,undefined);assert.equal(publicState.airTasks[0].isCaptain,false);
 const loadedAt=f.now,proof={deliveryId:'server-verified-flight',airTaskId:task.id,shipmentId:shipment.id,reservationId:task.reservationId,aircraftId:craft.id,quantity:task.quantity,loadedAt,securedAt:loadedAt+2000,departedAt:loadedAt+10000,approachAt:loadedAt+20000,landedAt:loadedAt+30000,deliveredAt:loadedAt+32000};f.now=proof.deliveredAt;
 await assert.rejects(f.service.airDelivery({walletId:OTHER},proof,f.sea,f.now),{statusCode:403});
 const receipt=await f.service.airDelivery({walletId:WALLET},proof,f.sea,f.now);state=await f.service.state({walletId:WALLET});assert.equal(stock(state,f),0);assert.equal(state.airReceipts.length,1);assert.equal(state.deliveryTasks.reduce((sum,task)=>sum+task.quantity,0),4);assert.equal(state.orders.find(row=>row.id===order.id).deliveredQuantity,0);
 f.now+=500000;state=await f.service.state({walletId:WALLET});
 // Port handling and the last mile have separate clocks. Starting the local
 // route at this refresh cannot retrospectively finish it during the sea leg.
 f.now+=500000;state=await f.service.state({walletId:WALLET});assert.equal(stock(state,f),4);assert.equal(state.orders.find(row=>row.id===order.id).deliveredQuantity,4);assert.notEqual(state.shipments[0].phase,'delivered');assert.equal(state.portEscrow[0].remainingQuantity,1);
 assert.deepEqual(await f.service.airDelivery({walletId:WALLET},proof,f.sea,f.now),receipt);assert.equal(stock(await f.service.state({walletId:WALLET}),f),4);
 await f.service.action(WALLET,'cancel',{orderId:order.id,requestId:'hold-last-air-unit'});f.now+=1000000;state=await f.service.state({walletId:WALLET});assert.equal(stock(state,f),4);assert.equal(state.airTasks.find(row=>row.quantity===1).phase,'port-held');assert.equal(state.portEscrow[0].remainingQuantity,1);assert.equal(state.portEscrow[0].heldQuantity,1);assert.equal(f.service.hasDeliveryActivity(f.sea.id),false);
});

test('private air manifests and air receipts follow the existing paid-owner and blueprint visibility rules',()=>{
 const state={catalog:[{id:'private-design',privateFactoryBlueprint:true,factoryBlueprintOwnerId:WALLET}],shipments:[{id:'private-shipment',itemId:'private-design',ownerId:WALLET}],airTasks:[{id:'air-private',shipmentId:'private-shipment',itemId:'private-design'}],airReceipts:[{id:'air-receipt-private',shipmentId:'private-shipment',itemId:'private-design'}]};
 for(const walletId of [undefined,OTHER]){const view=filterSupplyState(state,{walletId});assert.equal(view.airTasks.length,0);assert.equal(view.airReceipts.length,0);}
 const owner=filterSupplyState(state,{walletId:WALLET});assert.equal(owner.airTasks.length,1);assert.equal(owner.airReceipts.length,1);
});
