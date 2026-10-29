import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {mapDeliveryAddresses,deliveryAddressId,publicDeliveryAddress,addressMapId} from '../world-delivery-addresses.mjs';
import {projectWorldDeliveries} from '../world-delivery-runtime.mjs';
import {SHIPPING_RULES,SHIPPING_ROUTES} from '../public/js/shipping-config.js';

const OWNER='account:store-owner',SENDER='account:store-sender',OTHER='account:store-other',ITEM='tool:scanner';
const store=(id,x,modelId='general-store')=>({id,modelId,name:id,position:{x,y:0,z:-15},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});
async function fixture(t,{deed=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'store-addresses-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json'));
 for(const wallet of [OWNER,SENDER,OTHER])await database.put(wallet,{tokens:{MZK:1000000},items:[],memory:{profile:{displayName:wallet===OWNER?'Store owner':'Sender'}}});
 const mapId=deed?'plot-deed-market':'public-market',map={id:mapId,name:'Market Road',visibility:'public',ownerId:deed?OWNER:undefined,...(deed?{memberPlot:true,deedId:'deed-market'}:{}),builderScene:{layout:'grand-floor',mapSize:120,objects:[store('market-a',-20),store('market-b',20,'community-supermarket')]},delivery:{hub:{position:{x:0,y:0,z:40}}},spawn:{x:0,y:0,z:40},contentUpdatedAt:'original'},maps=[{id:'hormuz-shipping',name:'Hormuz'},map],rooms={[mapId]:{objects:{}}};
 if(deed)await database.transaction(data=>{data.landDeeds.market={id:'deed-market',worldId:'market',name:'Market Deed',ownerId:OWNER,status:'active'};data.users[OWNER].items.push({id:'deed-market',worldId:'market',type:'land-deed'});return {};});
 let now=1000000;const options={maps:async()=>maps,rooms:async()=>rooms,collision:new ServerBuilderCollision(),now:()=>now},service=new WorldSupplyService(database,options);
 return {database,service,options,maps,map,mapId,rooms,get now(){return now;},set now(value){now=value;}};
}
async function orderAndShip(f,{addressId=deliveryAddressId(f.mapId,'market-b'),quantity=10}={}){
 const fields={addressId,itemId:ITEM,quantity,shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:'address-order'},quote=await f.service.action(SENDER,'quote',{itemId:ITEM,quantity});
 const order=await f.service.action(SENDER,'order-address',{...fields,expectedPriceMzk:quote.priceMzk});const current=await f.service.state({walletId:SENDER});f.now=current.production.find(job=>job.id===order.productionId).readyAt;const state=await f.service.state({walletId:SENDER}),shipment=state.shipments.find(row=>row.orderId===order.id);return {fields,quote,order,shipment};
}
async function sea(f,shipment){
 const identity={walletId:SENDER},environment=f.maps[0],player={shipping:{}};await f.service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 const startedAt=f.now,id='store-sea';player.shipping.job={id,contractId:shipment.contractId,environmentId:environment.id,phase:'loading',deadline:startedAt+SHIPPING_RULES.contractLimitMs};await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId:id});
 const route=SHIPPING_ROUTES.find(row=>row.id===shipment.contractId),result={type:'delivery',deliveryId:id,jobId:id,shipmentId:shipment.id,contractId:shipment.contractId,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};f.now=result.deliveredAt;const receipt=await f.service.deliver(identity,result,environment);
 let state=await f.service.state({walletId:SENDER});const pending=state.deliveryTasks.filter(task=>task.shipmentId===shipment.id&&task.portHandling&&task.portHandling.phase!=='complete');
 if(pending.length){
  assert.equal(state.maps.find(map=>map.id===f.mapId).stock[ITEM]||0,0,'the selected store receives no inventory from sea unloading or shore handling');assert.equal((await f.service.projection({mapId:f.mapId})).vehicles.length,0,'the store map has no truck before the explicit port transfer');const port=await f.service.projection({mapId:'hormuz-shipping'});assert.ok(port.vehicles.length>0&&port.vehicles.length<=16,'counted goods take a bounded truck route along the receiving quay');
  f.now=Math.max(...pending.map(task=>task.portHandling.readyAt))+1;state=await f.service.state({walletId:SENDER});assert.equal(state.maps.find(map=>map.id===f.mapId).stock[ITEM]||0,0,'the store door still controls the final stock receipt');
 }
 return receipt;
}

test('stable building addresses cover native shells and layouts without exposing identities or treating merchandise as stores',()=>{
 const map={id:'market:test',name:'Main Street',builderScene:{layout:'grand-floor',objects:[store('shop',2),store('cabin',8,'timber-cabin'),store('estate',20,'estate-house'),{...store('hidden',3),hidden:true},{...store('display',4),storeProductDisplay:true},{...store('forged-owner',6),ownerId:'0xlinked',_parentAddressObjectId:'owned'}]}};
 const data={users:{'0xlinked':{memory:{account:{accountId:'owner-account'},profile:{displayName:'Taylor'}}},'account:license-buyer':{memory:{profile:{displayName:'License buyer'}}}},builderOwnership:{prototype:{owner_id:'account:license-buyer'}}},room={simulation:{actors:{owned:{...store('owned',-10),spawned:true,ownerId:'account:owner-account',asset:{id:'prototype',buildAssetId:'general-store'}}}}};
 const first=mapDeliveryAddresses(data,map,room),shop=first.find(row=>row.objectId==='shop'),owned=first.find(row=>row.objectId==='owned');
 assert.ok(first.some(row=>row.objectId==='cabin'));assert.ok(first.some(row=>row.objectId==='estate'));assert.ok(!first.some(row=>['hidden','display'].includes(row.objectId)));assert.equal(owned.recipientId,'0xlinked');assert.equal(owned.owner.name,'Taylor');assert.equal(shop.owner.kind,'public');assert.equal(first.find(row=>row.objectId==='forged-owner').owner.kind,'public','creator-supplied owner fields cannot impersonate a player');assert.equal(owned.owner.name,'Taylor','reselling a reusable blueprint does not transfer a placed building instance');
 const share=JSON.stringify(first.map(publicDeliveryAddress));assert.ok(!share.includes('0xlinked'));assert.ok(!share.includes('owner-account'));assert.ok(!share.includes('recipientId'));assert.equal(addressMapId(shop.id),map.id);
 map.builderScene.objects[0].position.x=45;const moved=mapDeliveryAddresses(data,map,room).find(row=>row.id===shop.id);assert.equal(moved.id,shop.id);assert.notDeepEqual(moved.position,shop.position);assert.notEqual(moved.revision,shop.revision);assert.ok(moved.addressLine);
 for(const [layout,count]of [['vendor-street',10],['market-square',10],['mega-mall',4]])assert.equal(mapDeliveryAddresses({users:{}},{id:layout,builderScene:{layout,objects:[]}}).filter(row=>row.kind==='store').length,count);
});

test('public stores accept a sender-funded exact-address order and stock only after its own doorstep handover',async t=>{
 const f=await fixture(t),directory=await f.service.addresses({mapId:f.mapId}),address=directory.addresses.find(row=>row.objectId==='market-b');assert.ok(address);assert.equal(address.owner.kind,'public');assert.equal(address.canOrder,true);
 const {fields,quote,order,shipment}=await orderAndShip(f);assert.equal(order.addressId,address.id);assert.equal(order.recipientId,'public:'+f.mapId);assert.equal(order.deedId,null);assert.equal(order.ownerId,SENDER);assert.equal((await f.database.get(SENDER)).tokens.MZK,1000000-quote.priceMzk);
 assert.deepEqual(await f.service.action(SENDER,'order-address',{...fields,expectedPriceMzk:quote.priceMzk}),order);assert.equal((await f.database.get(SENDER)).tokens.MZK,1000000-quote.priceMzk);
 const receipt=await sea(f,shipment);assert.equal(receipt.phase,'port-received');let state=await f.service.state({walletId:SENDER});assert.equal(state.maps.find(map=>map.id===f.mapId).stock[ITEM]||0,0);assert.equal(state.deliveryTasks[0].addressId,address.id);assert.ok(Math.abs(state.deliveryTasks[0].route.dropoff.position.x-address.dropoff.position.x)<1e-6);assert.ok(Math.abs(state.deliveryTasks[0].route.dropoff.position.z-address.dropoff.position.z)<1e-6);
 f.now=Math.max(...state.deliveryTasks.map(task=>task.startedAt+task.totalDurationMs))+1;state=await f.service.state({walletId:SENDER});assert.equal(state.maps.find(map=>map.id===f.mapId).stock[ITEM],10);assert.equal(state.orders.find(row=>row.id===order.id).phase,'delivered');assert.equal(state.stockReceipts.length,1);assert.equal(state.stockReceipts[0].addressId,address.id);assert.equal(state.stockReceipts[0].address.objectId,'market-b');assert.equal(state.stockReceipts[0].quantity,10);
 await f.service.state();assert.equal((await f.service.state()).maps.find(map=>map.id===f.mapId).stock[ITEM],10);
});

test('deed ownership controls the recipient while another player may fund a store shipment without acquiring the deed',async t=>{
 const f=await fixture(t,{deed:true}),{order}=await orderAndShip(f);assert.equal(order.recipientId,OWNER);assert.equal(order.ownerId,SENDER);assert.equal(order.deedId,'deed-market');assert.equal(order.address.owner.name,'Store owner');assert.deepEqual((await f.database.get(SENDER)).items,[]);
 await assert.rejects(f.service.action(OTHER,'cancel',{orderId:order.id,requestId:'foreign-cancel'}),{statusCode:403});
 await f.database.transaction(data=>{data.landDeeds.market.ownerId=OTHER;data.users[OTHER].items.push(data.users[OWNER].items.pop());return {};});
 const state=await f.service.state({walletId:SENDER});assert.equal(state.orders.find(row=>row.id===order.id).phase,'attention');await assert.rejects(f.service.shippingAction({walletId:SENDER},{},{shipping:{}},f.maps[0],{operation:'reserve',shipmentId:state.shipments[0].id,contractId:state.shipments[0].contractId}),/hold/);
});

test('address removal holds cargo and moving the selected store preserves its identity and recalculates its own entrance',async t=>{
 const f=await fixture(t),{shipment}=await orderAndShip(f);await sea(f,shipment);let state=await f.service.state({walletId:SENDER}),task=state.deliveryTasks[0],original=task.route.dropoff.position;
 f.map.builderScene.objects[1].position.x+=8;f.map.contentUpdatedAt='moved';state=await f.service.state({walletId:SENDER});task=state.deliveryTasks[0];assert.equal(task.addressId,shipment.addressId);assert.equal(task.route.dropoff.position.x,original.x+8);assert.notEqual(task.routeRevision,shipment.routeRevision);
 f.map.builderScene.objects=f.map.builderScene.objects.filter(item=>item.id!=='market-b');f.map.contentUpdatedAt='removed';f.now+=100000;state=await f.service.state({walletId:SENDER});assert.equal(state.deliveryTasks[0].phase,'blocked');assert.equal(state.maps.find(map=>map.id===f.mapId).stock[ITEM]||0,0);assert.equal(state.dropoffReceipts.length,0);
 await assert.rejects(f.service.addresses({addressId:shipment.addressId}),{statusCode:404});
});

test('forged or vanished address selections roll back production and destination spoofing cannot redirect an order',async t=>{
 const f=await fixture(t),before=JSON.stringify(await f.database.read());
 await assert.rejects(f.service.action(SENDER,'order-address',{addressId:deliveryAddressId(f.mapId,'missing'),itemId:ITEM,quantity:1,requestId:'missing-address'}),{statusCode:404});assert.equal(JSON.stringify(await f.database.read()),before);
 await assert.rejects(f.service.action(SENDER,'order-address',{addressId:deliveryAddressId(f.mapId,'market-a'),destinationMapId:'hormuz-shipping',itemId:ITEM,quantity:1,requestId:'spoof-destination'}),{statusCode:422});
 assert.equal((await f.database.get(SENDER)).tokens.MZK,1000000);assert.equal(Object.keys((await f.database.read()).worldSupply?.production||{}).length,0);
});

test('a reviewed address revision rejects relocation or deed resale before payment and rejects stale stock dispatch',async t=>{
 const f=await fixture(t,{deed:true}),addressId=deliveryAddressId(f.mapId,'market-b'),address=(await f.service.addresses({addressId})).addresses[0],quote=await f.service.action(SENDER,'quote',{itemId:ITEM,quantity:10}),input={addressId,itemId:ITEM,quantity:10,expectedPriceMzk:quote.priceMzk,expectedAddressRevision:address.revision,requestId:'reviewed-address-order'};
 f.map.builderScene.objects[1].position.x+=4;f.map.contentUpdatedAt='reviewed-store-moved';let before=JSON.stringify(await f.database.read());
 await assert.rejects(f.service.action(SENDER,'order-address',input),/moved or changed owner/);assert.equal(JSON.stringify(await f.database.read()),before);assert.equal((await f.database.get(SENDER)).tokens.MZK,1000000);
 const current=(await f.service.addresses({addressId})).addresses[0];assert.notEqual(current.revision,address.revision);
 await f.database.listItem(OWNER,'deed-market',50);await f.database.trade({buyerId:OTHER,sellerId:OWNER,itemId:'deed-market',expectedPriceMzk:50,requestId:'address-deed-resale'});before=JSON.stringify(await f.database.read());
 await assert.rejects(f.service.action(SENDER,'order-address',{...input,expectedAddressRevision:current.revision,requestId:'resold-reviewed-address'}),/moved or changed owner/);assert.equal(JSON.stringify(await f.database.read()),before);
 await assert.rejects(f.service.action(SENDER,'dispatch',{itemId:ITEM,quantity:1,sourceMapId:'world',destinationMapId:f.mapId,addressId,expectedAddressRevision:current.revision,requestId:'stale-reviewed-dispatch'}),/moved or changed owner/);assert.equal(JSON.stringify(await f.database.read()),before);
});

test('address pagination and exact lookup retain every nested storefront without unbounded response payloads',async t=>{
 const f=await fixture(t);f.map.builderScene.objects=Array.from({length:24},(_,index)=>({id:'market-scene-'+index,modelId:'scene-market-square',position:{x:0,y:0,z:0},rotation:{x:0,y:index*.1,z:0},scale:{x:1,y:1,z:1}}));f.map.contentUpdatedAt='many-stores';
 const first=await f.service.addresses({mapId:f.mapId});assert.equal(first.addresses.length,200);assert.equal(first.total,241);assert.equal(first.hasMore,true);assert.equal(first.nextOffset,200);
 const rest=await f.service.addresses({mapId:f.mapId,offset:first.nextOffset});assert.equal(rest.addresses.length,41);assert.equal(rest.hasMore,false);assert.equal(new Set([...first.addresses,...rest.addresses].map(address=>address.id)).size,241);
 const exact=await f.service.addresses({addressId:rest.addresses.at(-1).id});assert.equal(exact.addresses.length,1);assert.equal(exact.addresses[0].id,rest.addresses.at(-1).id);
 const state=await f.service.state({walletId:SENDER,mapId:f.mapId});assert.equal(state.addresses.length,200);assert.deepEqual(state.addressPage,{mapId:f.mapId,total:241,offset:0,hasMore:true,nextOffset:200});
});

test('a storefront receipt marks only that address even when multiple stores share one deed warehouse',()=>{
 const route=(id,addressId)=>({id,mapId:'market',deedId:'same-deed',...(addressId?{addressId}:{}),status:'ready',dropoff:{id,mapId:'market',position:{x:0,y:0,z:0}}}),ledger={deliveryRoutes:{main:route('main'),a:route('a','address-a'),b:route('b','address-b')},dropoffReceipts:{delivery:{deedId:'same-deed',addressId:'address-b',receivedAt:123}}};
 const view=projectWorldDeliveries(ledger,'market',200);assert.equal(view.dropoffs.find(row=>row.id==='b').deliveredAt,123);assert.equal(view.dropoffs.find(row=>row.id==='a').deliveredAt,undefined);assert.equal(view.dropoffs.find(row=>row.id==='main').deliveredAt,undefined);
});

test('freshly published authored store geometry wins over a stale unspawned room actor',async t=>{
 const f=await fixture(t),addressId=deliveryAddressId(f.mapId,'market-b');
 f.rooms[f.mapId].simulation={actors:{'market-b':{...structuredClone(f.map.builderScene.objects[1]),asset:{buildAssetId:'general-store'}}}};
 const before=(await f.service.addresses({addressId})).addresses[0];
 f.map.builderScene.objects[1].position.x=48;f.map.contentUpdatedAt='published-while-room-running';
 const after=(await f.service.addresses({addressId})).addresses[0];assert.equal(after.position.x,48);assert.notEqual(after.revision,before.revision);
 assert.equal(after.position.z,-15+20/2+.9,'the current published supermarket model supplies its door geometry');
 const {shipment}=await orderAndShip(f,{addressId});await sea(f,shipment);const state=await f.service.state({walletId:SENDER});assert.equal(state.deliveryTasks[0].route.dropoff.position.x,48);
});

test('ordinary-map delivery activity is cached, survives restart and clears after cancellation or handover',async t=>{
 const f=await fixture(t);await f.service.deliveryActivityReady;assert.equal(f.service.hasDeliveryActivity(f.mapId),false);assert.equal(f.service.hasDeliveryActivity('unrelated-map'),false);
 const legacyData=await f.database.read();legacyData.worldSupply=null;await f.database.write(legacyData);const legacyRestart=new WorldSupplyService(new UserJsonDatabase(f.database.file),f.options);await legacyRestart.deliveryActivityReady;assert.equal(legacyRestart.hasDeliveryActivity(f.mapId),false,'a valid legacy null supply ledger starts cleanly');
 const {order}=await orderAndShip(f);assert.equal(f.service.hasDeliveryActivity(f.mapId),true);
 let reads=0;const originalRead=f.database.read.bind(f.database);f.database.read=async()=>{reads++;return originalRead();};
 for(let index=0;index<100;index++)assert.equal(f.service.hasDeliveryActivity(f.mapId),true);assert.equal(reads,0,'gameplay hints never read the database');
 const restarted=new WorldSupplyService(new UserJsonDatabase(f.database.file),f.options);await restarted.deliveryActivityReady;assert.equal(restarted.hasDeliveryActivity(f.mapId),true);
 await restarted.action(SENDER,'cancel',{orderId:order.id,requestId:'cancel-activity'});assert.equal(restarted.hasDeliveryActivity(f.mapId),false);
 const restartedEmpty=new WorldSupplyService(new UserJsonDatabase(f.database.file),f.options);await restartedEmpty.deliveryActivityReady;assert.equal(restartedEmpty.hasDeliveryActivity(f.mapId),false);
 const fresh=await fixture(t);const shipped=await orderAndShip(fresh);await sea(fresh,shipped.shipment);assert.equal(fresh.service.hasDeliveryActivity(fresh.mapId),true);
 const portRestart=new WorldSupplyService(new UserJsonDatabase(fresh.database.file),fresh.options);await portRestart.deliveryActivityReady;assert.equal(portRestart.hasDeliveryActivity(fresh.mapId),true);
 const state=await portRestart.state({walletId:SENDER});fresh.now=Math.max(...state.deliveryTasks.map(task=>task.startedAt+task.totalDurationMs))+1;await portRestart.projection({mapId:fresh.mapId});assert.equal(portRestart.hasDeliveryActivity(fresh.mapId),false);
 const deliveredRestart=new WorldSupplyService(new UserJsonDatabase(fresh.database.file),fresh.options);await deliveredRestart.deliveryActivityReady;assert.equal(deliveredRestart.hasDeliveryActivity(fresh.mapId),false);
});
