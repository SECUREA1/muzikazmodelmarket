import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {advanceWorldDelivery,deliveryTaskView,receiveDeedShipment,projectWorldDeliveries} from '../world-delivery-runtime.mjs';
import {DeliveryRoutePool} from '../world-delivery-route-pool.mjs';
import {EventEmitter} from 'node:events';
import {planDeedDelivery} from '../world-delivery-routing.mjs';

const OWNER='account:doorstep-owner',CAPTAIN='account:doorstep-captain',ITEM='material:wood',DEED={id:'deed-doorstep-home',worldId:'doorstep-home',name:'Doorstep home',ownerId:OWNER,status:'active'},MAP='plot-'+DEED.id;
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'world-deed-delivery-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json'));
 await database.put(OWNER,{tokens:{MZK:1000000},items:[{id:DEED.id,type:'land-deed',worldId:DEED.worldId}]});await database.put(CAPTAIN,{tokens:{MZK:1000000},items:[]});await database.transaction(data=>{data.landDeeds[DEED.worldId]={...DEED};return {};});
 const maps=[{id:'hormuz-shipping',name:'Hormuz'},{id:MAP,name:'Doorstep plot',memberPlot:true,deedId:DEED.id,builderScene:{layout:'grand-floor',mapSize:80,objects:[]},spawn:{x:0,y:0,z:0},delivery:{hub:{position:{x:0,y:0,z:20}},dropoff:{position:{x:0,y:0,z:0},name:'Front door',kind:'doorstep'}}}],rooms={[MAP]:{objects:{}}};let now=1000000;
 const options={maps:async()=>maps,rooms:async()=>rooms,collision:new ServerBuilderCollision(),now:()=>now},service=new WorldSupplyService(database,options);
 return {database,service,options,maps,rooms,get now(){return now;},set now(value){now=value;}};
}
async function portShipment(f,{quantity=1000,itemId=ITEM,legacy=false,generic=false}={}){
 const accepted=await f.service.action(generic?CAPTAIN:OWNER,generic?'produce':'order',{deedId:DEED.id,itemId,quantity,requestId:'order-'+quantity}),order=generic?{productionId:accepted.id}:accepted;let state=await f.service.state({walletId:OWNER});f.now=state.production.find(job=>job.id===order.productionId).readyAt;state=await f.service.state({walletId:OWNER});let shipment=generic?await f.service.action(CAPTAIN,'dispatch',{itemId,quantity,destinationMapId:MAP,requestId:'direct-deed-transfer'}):state.shipments.find(row=>row.orderId===order.id);
 if(legacy){await f.database.transaction(data=>{delete data.worldSupply.orders[order.id].deliverySchemaVersion;delete data.worldSupply.shipments[shipment.id].deliverySchemaVersion;return {};});}
 const identity={walletId:CAPTAIN},environment=f.maps[0],player={shipping:{}};
 await f.service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId});
 const startedAt=f.now,jobId='doorstep-voyage-'+shipment.id;player.shipping.job={id:jobId,phase:'loading',contractId:shipment.contractId,environmentId:environment.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId});
 const route=SHIPPING_ROUTES.find(row=>row.id===shipment.contractId),result={type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};f.now=result.deliveredAt;
 shipment=await f.service.deliver(identity,result,environment);return {order,shipment,identity,environment,player,result};
}
const stock=state=>state.maps.find(map=>map.id===MAP).stock[ITEM]||0;
async function reachLocalRoad(f){
 let state=await f.service.state({walletId:OWNER});const pending=state.deliveryTasks.filter(task=>task.portHandling&&task.portHandling.phase!=='complete');
 if(!pending.length)return state;
 assert.equal(stock(state),0,'sea unloading and the shore truck cannot credit the receiving inventory');
 const port=await f.service.projection({mapId:'hormuz-shipping'});assert.ok(port.vehicles.length>0&&port.vehicles.length<=16,'a bounded truck projection follows the actual receiving quay road');assert.equal((await f.service.projection({mapId:MAP})).vehicles.length,0,'local trucks do not appear before the explicit map transfer');
 f.now=Math.max(...pending.map(task=>task.portHandling.readyAt))+1;state=await f.service.state({walletId:OWNER});assert.equal(stock(state),0,'arrival at the receiving-map distribution hub still waits for the door');return state;
}

test('sea containers unpack into bounded road crates and exact truck lots, with no stock before doorway receipt',async t=>{
 const f=await fixture(t),v=await portShipment(f);assert.equal(v.shipment.phase,'port-received');let state=await f.service.state({walletId:OWNER});
 assert.equal(state.deliveryTasks.length,5);assert.equal(stock(state),0);assert.equal(state.stockReceipts.length,0);assert.equal(state.portReceipts.length,1);assert.equal(state.portEscrow[0].remainingQuantity,1000);
 assert.deepEqual(state.deliveryTasks.map(task=>task.quantity),[200,200,200,200,200]);assert.ok(state.deliveryTasks.every(task=>task.crateCount===4&&task.unitsPerRoadCrate===50&&task.truckSlots===4));
 assert.equal(state.deliveryTasks.flatMap(task=>task.lotAllocations).reduce((sum,line)=>sum+line.quantity,0),1000);
 await f.service.shippingAction(v.identity,{},v.player,v.environment,{operation:'release',shipmentId:v.shipment.id,jobId:v.result.jobId});assert.equal((await f.service.state()).shipments[0].phase,'port-received','late voyage cleanup cannot return unloaded freight to sea queue');
 state=await reachLocalRoad(f);const reopened=new WorldSupplyService(new UserJsonDatabase(f.database.file),f.options);f.now=Math.max(...state.deliveryTasks.map(task=>task.startedAt+task.totalDurationMs))+1;state=await reopened.state({walletId:OWNER});
 assert.equal(stock(state),1000);assert.equal(state.orders[0].phase,'delivered');assert.equal(state.portEscrow[0].remainingQuantity,0);assert.equal(state.dropoffReceipts.length,5);assert.equal(state.stockReceipts.length,5);assert.equal(state.stockReceipts.reduce((sum,receipt)=>sum+receipt.quantity,0),1000);
 assert.ok(state.dropoffReceipts.every(receipt=>receipt.productionId===v.order.productionId&&receipt.routeRevision&&receipt.dropoff.kind==='doorstep'));
 await reopened.deliver(v.identity,v.result,v.environment);assert.equal(stock(await reopened.state()),1000);assert.equal((await reopened.state()).stockReceipts.length,5,'replayed sea and timer updates cannot duplicate delivery');
});

test('current geometry blocks a delivery and clearing it resumes from the saved position without offline instant credit',async t=>{
 const f=await fixture(t);await portShipment(f,{quantity:10});let state=await reachLocalRoad(f),task=state.deliveryTasks[0];f.now+=task.timeline[0].durationMs+300;state=await f.service.state({walletId:OWNER});task=state.deliveryTasks[0];assert.equal(task.phase,'driving');const position={...task.truckPosition};
 const clear=f.options.collision.hasBodyClearance.bind(f.options.collision);f.options.collision.hasBodyClearance=()=>false;f.rooms[MAP].objects.obstacle={id:'obstacle',position:[0,0,10],materialId:'wall',revision:1};f.now+=100000;
 state=await f.service.state({walletId:OWNER});assert.equal(state.deliveryTasks[0].phase,'blocked');assert.equal(stock(state),0);assert.deepEqual(state.deliveryTasks[0].truckPosition,position);
 delete f.rooms[MAP].objects.obstacle;f.options.collision.hasBodyClearance=clear;f.now+=100000;state=await f.service.state({walletId:OWNER});task=state.deliveryTasks[0];assert.equal(task.phase,'driving');assert.equal(task.elapsedMs,0);assert.equal(stock(state),0);assert.ok(Math.hypot(task.route.origin.position.x-position.x,task.route.origin.position.y-position.y,task.route.origin.position.z-position.z)<1e-6,'rerouting starts where the truck stopped, not at the depot');
 f.now+=task.totalDurationMs+1;assert.equal(stock(await f.service.state()),10);
});

test('multiple pickups depart with headway instead of rendering stacked trucks on the same route',async t=>{
 const f=await fixture(t);await portShipment(f,{quantity:400});let state=await reachLocalRoad(f);assert.equal(state.deliveryTasks.length,2);const [first,second]=state.deliveryTasks;
 assert.equal(second.startedAt-first.startedAt,1500);assert.equal(second.phase,'awaiting-truck');assert.equal((await f.service.projection({mapId:MAP})).vehicles.length,1,'waiting pickup remains at distribution rather than overlapping the live truck');
 f.now=second.startedAt+second.timeline[0].durationMs+800;state=await f.service.state({walletId:OWNER});assert.ok(state.deliveryTasks.every(task=>task.phase==='driving'));const [a,b]=state.deliveryTasks.map(task=>task.truckPosition);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>5,'the pickup departure headway leaves visible vehicle clearance');assert.equal((await f.service.projection({mapId:MAP})).vehicles.length,2);
});

test('received freight can be held at port without refunding completed manufacture or teleporting cargo to the factory',async t=>{
 const f=await fixture(t),v=await portShipment(f,{quantity:10}),paid=(await f.database.get(OWNER)).tokens.MZK;
 const cancelled=await f.service.action(OWNER,'cancel',{orderId:v.order.id,requestId:'hold-port-cargo'});assert.equal(cancelled.phase,'cancelled');let state=await f.service.state({walletId:OWNER});
 assert.equal(state.portEscrow[0].heldQuantity,10);assert.equal(state.portEscrow[0].remainingQuantity,10);assert.equal(state.portEscrow[0].phase,'port-held');assert.equal(state.shipments[0].phase,'port-held');assert.ok(state.deliveryTasks.every(task=>task.phase==='port-held'));assert.equal(state.factoryStock[ITEM]||0,0);assert.equal(stock(state),0);assert.equal((await f.database.get(OWNER)).tokens.MZK,paid);
 f.now+=1000000;state=await f.service.state();assert.equal(stock(state),0);assert.equal(state.stockReceipts.length,0);assert.equal(state.allocations[0].phase,'allocated','port escrow keeps its original physical lot allocation');
});

test('pending unversioned deed freight upgrades automatically while completed historical stock is never awarded again',async t=>{
 const f=await fixture(t),v=await portShipment(f,{quantity:10,legacy:true});let state=await f.service.state();assert.equal(v.shipment.phase,'port-received');assert.equal(v.shipment.deliverySchemaVersion,1);assert.equal(stock(state),0);assert.equal(state.deliveryTasks.length,1);
 await f.database.transaction(data=>{const ledger=data.worldSupply;ledger.shipments.historical={id:'historical',ownerId:OWNER,itemId:ITEM,quantity:3,destinationMapId:MAP,phase:'delivered',createdAt:0};ledger.shipments.cancelledHistory={id:'cancelledHistory',ownerId:OWNER,itemId:ITEM,quantity:2,destinationMapId:MAP,phase:'cancelled',createdAt:0};ledger.maps[MAP].stock[ITEM]=3;return {};});
 state=await f.service.state();assert.equal(stock(state),3);assert.equal(state.shipments.find(shipment=>shipment.id==='historical').deliverySchemaVersion,undefined);assert.equal(state.deliveryTasks.length,1);assert.equal(state.stockReceipts.length,0);
});

test('a manual map transfer to another holder’s deed also requires doorstep delivery and retains sender cancellation rights',async t=>{
 const f=await fixture(t),v=await portShipment(f,{quantity:10,generic:true});assert.equal(v.shipment.ownerId,CAPTAIN);assert.equal(v.shipment.recipientId,OWNER);assert.equal(v.shipment.deedId,DEED.id);assert.equal(v.shipment.deliverySchemaVersion,1);let state=await reachLocalRoad(f);assert.equal(stock(state),0);assert.equal(state.deliveryTasks[0].recipientId,OWNER);assert.equal(state.deliveryTasks[0].phase,'loading');
 f.now+=state.deliveryTasks[0].totalDurationMs+1;state=await f.service.state();assert.equal(stock(state),10);assert.equal(state.shipments[0].phase,'delivered');assert.equal(state.orders.length,0,'a direct inventory transfer does not forge a deed-owner production order');
});

test('public delivery projection exposes route and vehicle poses without private cargo, quantity, or order metadata',async t=>{
 const f=await fixture(t);await portShipment(f,{quantity:10});await reachLocalRoad(f);const projection=await f.service.projection({mapId:MAP});assert.equal(projection.vehicles.length,1);assert.equal(projection.dropoffs[0].kind,'doorstep');
 for(const field of ['itemId','itemName','quantity','orderId','ownerId','shipmentId'])assert.equal(JSON.stringify(projection).includes('"'+field+'"'),false,field+' is private cargo data');
 assert.ok(projection.routes[0].truckWaypoints.length>1);assert.equal(projection.vehicles[0].modelId,'frontier-pickup');
});

test('courier-only indoor access never invents a pickup inside a non-vehicle receiving gateway',()=>{
 const route={id:'indoor-route',deedId:DEED.id,mapId:MAP,revision:'indoor-1',status:'ready',accessMode:'courier-access',hub:{id:'gateway',vehicleAccess:false,position:{x:0,y:0,z:2}},dropoff:{id:'door',mapId:MAP,position:{x:0,y:0,z:0}},truckWaypoints:[],courierWaypoints:[{x:0,y:0,z:2},{x:0,y:0,z:0}],truckDistanceMeters:0,courierDistanceMeters:2,truckDurationMs:0,courierDurationMs:1500,estimatedDurationMs:9800},ledger={factoryLots:{},factoryLotAllocations:{},factoryStockReceipts:{},maps:{[MAP]:{stock:{}}},shipments:{},orders:{order:{id:'order',phase:'awaiting-shipping'}}},data={landDeeds:{home:{...DEED}},users:{[OWNER]:{items:[{id:DEED.id,type:'land-deed'}]}}},shipment={id:'indoor-shipment',orderId:'order',deedId:DEED.id,ownerId:OWNER,recipientId:OWNER,itemId:ITEM,quantity:1,packing:{unitsPerContainer:100},destinationMapId:MAP,destinationPortId:'muscat',deliverySchemaVersion:1};ledger.shipments[shipment.id]=shipment;
 receiveDeedShipment(ledger,shipment,{deliveryId:'indoor-sea',quality:100},100);ledger.deliveryRoutes[DEED.id]=route;advanceWorldDelivery(ledger,data,100,{planFor:()=>route});let task=Object.values(ledger.deliveryTasks)[0];assert.deepEqual(task.timeline.map(step=>step.phase),['loading','courier','dropoff']);assert.equal(projectWorldDeliveries(ledger,MAP,100).vehicles.length,0);
 advanceWorldDelivery(ledger,data,100+task.totalDurationMs+1,{planFor:()=>route});assert.equal(ledger.maps[MAP].stock[ITEM],1);assert.equal(projectWorldDeliveries(ledger,MAP,100+task.totalDurationMs+1).vehicles.length,0);
});

test('route preflight runs outside the wallet transaction and deduplicates pending worker calculations',async t=>{
 const f=await fixture(t);let release,calculations=0;const delayed=new Promise(resolve=>release=resolve),pool={calculate:async input=>{calculations++;await delayed;return planDeedDelivery({...input,collision:f.options.collision});}},service=new WorldSupplyService(f.database,{...f.options,routingWorker:true,routeWorkerPool:pool});
 const first=service.state({walletId:OWNER}),second=service.state({walletId:OWNER});for(let turn=0;turn<100&&!calculations;turn++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(calculations,1);
 const walletResult=await Promise.race([f.database.transaction(data=>{data.users[CAPTAIN].memory.routingProbe='completed';return true;}),new Promise(resolve=>setTimeout(()=>resolve('blocked'),200))]);assert.equal(walletResult,true,'a geometry worker must not own the global wallet queue while it computes');
 release();const states=await Promise.all([first,second]);assert.ok(states.every(state=>state.deliveryRoutes[0].status==='ready'));assert.equal(calculations,1);assert.equal(service.pendingDeliveryPlans.size,0);
});

test('geometry worker failures reject pending requests and lazily restart instead of falling back on the game thread',async()=>{
 let workers=0;
 class FakeWorker extends EventEmitter {ref(){}unref(){}terminate(){this.emit('exit',0);return Promise.resolve();}postMessage({id}){setImmediate(()=>{if(workers===1)this.emit('error',new Error('worker-crashed'));else this.emit('message',{id,plan:{status:'ready',revision:'restarted'}});});}}
 const pool=new DeliveryRoutePool({workerFactory:()=>{workers++;return new FakeWorker();}});await assert.rejects(pool.calculate({}),/worker-crashed/);assert.equal(pool.pending.size,0);assert.equal((await pool.calculate({})).revision,'restarted');assert.equal(workers,2);await pool.close();
});

test('a temporary geometry failure is held safely and retried without editing the map or minting stock',async t=>{
 const f=await fixture(t);let calls=0;const pool={calculate:async input=>{calls++;if(calls===1)throw new Error('Transient geometry startup failure');return planDeedDelivery({...input,collision:f.options.collision});}},service=new WorldSupplyService(f.database,{...f.options,routingWorker:true,routeWorkerPool:pool});
 let state=await service.state({walletId:OWNER});assert.equal(state.deliveryRoutes[0].status,'blocked');assert.match(state.deliveryRoutes[0].reason,/temporarily unavailable/);assert.equal(stock(state),0);
 state=await service.state({walletId:OWNER});assert.equal(state.deliveryRoutes[0].status,'ready');assert.equal(calls,2);assert.equal(stock(state),0);assert.equal(state.deliveryTasks.length,0);
});

test('a real isolated geometry worker calculates the same validated doorstep route as the server collision planner',async t=>{
 const f=await fixture(t),pool=new DeliveryRoutePool();t.after(()=>pool.close());const input={deed:DEED,environment:f.maps[1],room:{objects:{}},portId:'muscat',now:f.now};const plan=await pool.calculate(input),expected=planDeedDelivery({...input,collision:f.options.collision});assert.equal(plan.status,'ready');assert.equal(plan.revision,expected.revision);assert.deepEqual(plan.truckWaypoints,expected.truckWaypoints);assert.deepEqual(plan.courierWaypoints,expected.courierWaypoints);assert.equal(plan.estimatedDurationMs,expected.estimatedDurationMs);
});
