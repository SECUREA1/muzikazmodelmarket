import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveDeedShipment,receiveAirShipment,advanceWorldDelivery,deliveryTaskView,projectWorldDeliveries,holdShipmentAtPort} from '../world-delivery-runtime.mjs';
import {reserveAirTransfer,settleAirTransfer} from '../world-air-freight.mjs';
import {straitPortFreight,straitAirRoute} from '../public/js/strait-freight-network.js';
import {createPortTransfer,advancePortTransfer,portTransferView} from '../world-port-freight.mjs';

const OWNER='account:air-recipient',CAPTAIN='account:air-pilot',MAP='plot-air-home',DEED='air-home',ITEM='native:test-air-cargo';
function fixture({quantity=33,mode='air',portHandling=false}={}){
 const connection=straitPortFreight('fujairah'),airRoute=straitAirRoute('fujairah'),shipment={id:'sealed-sea-shipment',ownerId:OWNER,recipientId:OWNER,deedId:DEED,itemId:ITEM,itemName:'Counted cargo',quantity,packing:{unitsPerContainer:100},destinationMapId:MAP,destinationPortId:'fujairah',shippingMapId:'hormuz-shipping',onwardMode:mode,onwardPortId:mode==='air'?airRoute.toPortId:'fujairah',deliverySchemaVersion:1,...(portHandling?{portHandling:{mapId:connection.mapId,portId:connection.portId,waypoints:connection.roadWaypoints}}:{})},ledger={maps:{[MAP]:{stock:{}}},worldStock:{},factoryStock:{},factoryLots:{first:{quantity:12,availableQuantity:0},second:{quantity:Math.max(0,quantity-12),availableQuantity:0}},factoryLotAllocations:{[shipment.id]:{shipmentId:shipment.id,phase:'allocated',quantity,lots:quantity>12?[{lotId:'first',quantity:12},{lotId:'second',quantity:quantity-12}]:[{lotId:'first',quantity}]}},factoryStockReceipts:{},orders:{},shipments:{[shipment.id]:shipment}},data={landDeeds:{home:{id:DEED,ownerId:OWNER,status:'active'}},users:{[OWNER]:{items:[{id:DEED,type:'land-deed'}]}}},route={id:'current-home-route',mapId:MAP,deedId:DEED,revision:'route-1',status:'ready',hub:{id:'home-hub',mapId:MAP,position:{x:0,y:0,z:20}},dropoff:{id:'home-door',kind:'doorstep',mapId:MAP,name:'Actual home door',position:{x:0,y:0,z:0}},truckWaypoints:[{x:0,y:0,z:20},{x:0,y:0,z:2}],courierWaypoints:[{x:0,y:0,z:2},{x:0,y:0,z:0}],truckDistanceMeters:18,courierDistanceMeters:2,truckDurationMs:3600,courierDurationMs:1400,estimatedDurationMs:13000};
 ledger.deliveryRoutes={[DEED]:route};let now=1000000;
 return {ledger,shipment,data,route,get now(){return now;},set now(value){now=value;},advance(){advanceWorldDelivery(ledger,data,now,{planFor:()=>route});},stock(){return ledger.maps[MAP].stock[ITEM]||0;}};
}
function receiveSea(f){receiveDeedShipment(f.ledger,f.shipment,{deliveryId:'verified-sea-passage',quality:95},f.now);}
function readyAir(f){
 f.now=Math.max(...Object.values(f.ledger.airTasks).map(task=>task.portHandling.readyAt))+1;f.advance();
}
function landFlight(f,task){
 const reserved=reserveAirTransfer(f.ledger,task.id,{walletId:CAPTAIN,aircraftId:'real-da40',mapId:'hormuz-shipping'},f.now),loadedAt=f.now+1,securedAt=loadedAt+2000,departedAt=securedAt+1000,approachAt=departedAt+10000,landedAt=approachAt+1000,deliveredAt=landedAt+2000,proof={airTaskId:task.id,shipmentId:f.shipment.id,mapId:'hormuz-shipping',captainId:CAPTAIN,aircraftId:'real-da40',reservationId:reserved.reservationId,quantity:task.quantity,deliveryId:'actual-flight:'+task.id,loadedAt,securedAt,departedAt,approachAt,landedAt,deliveredAt};
 f.now=deliveredAt;const receipt=settleAirTransfer(f.ledger,proof,f.now);receiveAirShipment(f.ledger,f.shipment,task,receipt,f.now);return {receipt,proof};
}
function finishRoad(f,task){
 if(task.portHandling){f.now=Math.max(f.now,task.portHandling.readyAt)+1;f.advance();}
 f.now=Math.max(f.now,task.startedAt+task.totalDurationMs)+1;f.advance();
}

test('each verified flight releases only its own counted lot slice, and stock waits for that slice’s actual door receipt',()=>{
 const f=fixture();receiveSea(f);assert.equal(f.stock(),0);assert.equal(Object.keys(f.ledger.deliveryTasks).length,0);assert.equal(f.ledger.portEscrow[f.shipment.id].remainingQuantity,33);
 const flights=Object.values(f.ledger.airTasks);assert.deepEqual(flights.map(task=>task.quantity),[20,13]);assert.deepEqual(flights.map(task=>task.crateCount),[4,3]);assert.deepEqual(flights[0].lotAllocations,[{lotId:'first',quantity:12},{lotId:'second',quantity:8}]);assert.deepEqual(flights[1].lotAllocations,[{lotId:'second',quantity:13}]);
 assert.throws(()=>reserveAirTransfer(f.ledger,flights[0].id,{walletId:CAPTAIN,aircraftId:'real-da40',mapId:'hormuz-shipping'},f.now),/port truck/);
 readyAir(f);assert.equal(f.stock(),0);const first=landFlight(f,flights[0]);assert.equal(f.stock(),0,'landing and unloading do not credit the map');assert.equal(f.ledger.worldStock[ITEM]||0,0);assert.equal(Object.keys(f.ledger.deliveryTasks).length,1);
 const road=Object.values(f.ledger.deliveryTasks)[0];assert.equal(road.quantity,20);assert.equal(road.airTaskId,flights[0].id);assert.equal(road.airDeliveryId,first.receipt.id);assert.equal(road.receivingPortId,flights[0].destinationPortId);assert.deepEqual(road.lotAllocations,flights[0].lotAllocations);assert.equal(road.phase,'port-transfer');
 finishRoad(f,road);assert.equal(f.stock(),20);assert.equal(f.shipment.deliveredQuantity,20);assert.notEqual(f.shipment.phase,'delivered','one complete flight cannot settle the entire sea manifest');assert.equal(f.ledger.factoryLotAllocations[f.shipment.id].phase,'allocated');assert.equal(f.ledger.portEscrow[f.shipment.id].remainingQuantity,13);
 assert.deepEqual(receiveAirShipment(f.ledger,f.shipment,flights[0],first.receipt,f.now).map(task=>task.id),[road.id]);assert.equal(Object.keys(f.ledger.deliveryTasks).length,1);assert.deepEqual(settleAirTransfer(f.ledger,first.proof,f.now),first.receipt);assert.equal(f.stock(),20);
 const second=landFlight(f,flights[1]),secondRoad=f.ledger.deliveryTasks[flights[1].roadDeliveryTaskIds[0]];assert.equal(secondRoad.quantity,13);assert.equal(secondRoad.cargoOffset,20);assert.equal(f.stock(),20);finishRoad(f,secondRoad);
 assert.equal(f.stock(),33);assert.equal(f.shipment.phase,'delivered');assert.equal(f.shipment.airReceivedQuantity,33);assert.equal(f.ledger.portEscrow[f.shipment.id].remainingQuantity,0);assert.equal(f.ledger.factoryLotAllocations[f.shipment.id].phase,'delivered');assert.equal(Object.values(f.ledger.dropoffReceipts).reduce((sum,receipt)=>sum+receipt.quantity,0),33);assert.ok(Object.values(f.ledger.dropoffReceipts).every(receipt=>receipt.airTaskId&&receipt.airDeliveryId&&receipt.seaDeliveryId==='verified-sea-passage'&&receipt.dropoff.id==='home-door'));
 f.now+=1000000;f.advance();receiveAirShipment(f.ledger,f.shipment,flights[1],second.receipt,f.now);assert.equal(f.stock(),33);assert.equal(Object.keys(f.ledger.factoryStockReceipts).length,2);
});

test('forged air arrivals cannot create road tasks and sender holds preserve already received stock without releasing remaining cargo',()=>{
 const f=fixture();receiveSea(f);const flights=Object.values(f.ledger.airTasks);
 assert.throws(()=>receiveAirShipment(f.ledger,f.shipment,flights[0],{id:'forged',quantity:20},f.now),/verified matching air receipt/);assert.equal(Object.keys(f.ledger.deliveryTasks).length,0);assert.equal(f.stock(),0);
 readyAir(f);landFlight(f,flights[0]);const firstRoad=f.ledger.deliveryTasks[flights[0].roadDeliveryTaskIds[0]];finishRoad(f,firstRoad);assert.equal(f.stock(),20);
 reserveAirTransfer(f.ledger,flights[1].id,{walletId:CAPTAIN,aircraftId:'real-da40',mapId:'hormuz-shipping'},f.now);holdShipmentAtPort(f.ledger,f.shipment,f.now);assert.equal(flights[1].phase,'port-held');assert.equal(f.shipment.phase,'port-held');assert.equal(f.ledger.portEscrow[f.shipment.id].heldQuantity,13);
 f.now+=1000000;f.advance();assert.equal(f.stock(),20);assert.equal(Object.keys(f.ledger.dropoffReceipts).length,1);assert.equal(f.ledger.factoryLotAllocations[f.shipment.id].phase,'allocated');assert.equal(flights[0].phase,'air-delivered');assert.throws(()=>reserveAirTransfer(f.ledger,flights[1].id,{walletId:CAPTAIN,aircraftId:'real-da40',mapId:'hormuz-shipping'},f.now),/port truck|existing reservation/);
});

test('source port and arrival-port trucking stay in Strait coordinates before the receiving-map road route begins',()=>{
 const f=fixture({quantity:10,mode:'road',portHandling:true});receiveSea(f);f.advance();let task=Object.values(f.ledger.deliveryTasks)[0],view=deliveryTaskView(task,f.now);
 assert.equal(task.phase,'port-transfer');assert.equal(view.positionMapId,'hormuz-shipping');assert.deepEqual(view.position,straitPortFreight('fujairah').roadWaypoints[0]);assert.equal(projectWorldDeliveries(f.ledger,MAP,f.now).vehicles.length,0);const portProjection=projectWorldDeliveries(f.ledger,'hormuz-shipping',f.now);assert.equal(portProjection.vehicles.length,1);assert.equal(portProjection.routes[0].kind,'port-transfer');assert.equal(portProjection.dropoffs[0].kind,'port-freight-bay');
 for(const field of ['itemId','itemName','quantity','orderId','ownerId','shipmentId'])assert.equal(JSON.stringify(portProjection).includes('"'+field+'"'),false,field+' is private cargo metadata');
 f.now+=task.portHandling.handlingDurationMs+1000;f.advance();view=deliveryTaskView(task,f.now);assert.equal(view.positionMapId,'hormuz-shipping');assert.ok(view.position.z>straitPortFreight('fujairah').dock.z);assert.equal(f.stock(),0);
 f.now=task.portHandling.readyAt+1;f.advance();assert.equal(task.phase,'loading');assert.equal(task.portHandling.phase,'complete');assert.equal(deliveryTaskView(task,f.now).positionMapId,MAP);assert.equal(projectWorldDeliveries(f.ledger,'hormuz-shipping',f.now).vehicles.length,0);assert.equal(projectWorldDeliveries(f.ledger,MAP,f.now).vehicles.length,1);assert.equal(f.stock(),0);
 finishRoad(f,task);assert.equal(f.stock(),10);
});

test('a changed recipient freezes port trucking; restoring it does not count elapsed held time',()=>{
 const f=fixture({quantity:10,mode:'road',portHandling:true});receiveSea(f);f.advance();const task=Object.values(f.ledger.deliveryTasks)[0];f.now+=5000;f.advance();const position=deliveryTaskView(task,f.now).position,elapsed=task.portHandling.elapsedMs;
 f.data.landDeeds.home.ownerId='account:new-owner';f.now+=100000;f.advance();assert.equal(task.phase,'blocked');assert.equal(task.portHandling.elapsedMs,elapsed);assert.deepEqual(deliveryTaskView(task,f.now).position,position);assert.equal(f.stock(),0);
 f.data.landDeeds.home.ownerId=OWNER;f.now+=100;f.advance();assert.equal(task.phase,'port-transfer');assert.equal(task.portHandling.elapsedMs,elapsed+100);assert.equal(f.stock(),0);finishRoad(f,task);assert.equal(f.stock(),10);
});

test('a direct air manifest also pauses its quay-to-airfield transfer after recipient resale',()=>{
 const f=fixture({quantity:10});receiveSea(f);const task=Object.values(f.ledger.airTasks)[0];f.now+=6000;f.advance();const elapsed=task.portHandling.elapsedMs;
 f.data.landDeeds.home.ownerId='account:new-owner';f.now+=100000;f.advance();assert.equal(task.phase,'blocked');assert.equal(task.portHandling.elapsedMs,elapsed);assert.equal(f.stock(),0);assert.equal(Object.keys(f.ledger.deliveryTasks).length,0);
 assert.throws(()=>reserveAirTransfer(f.ledger,task.id,{walletId:CAPTAIN,aircraftId:'real-da40',mapId:task.mapId},f.now),/port truck/);
 f.data.landDeeds.home.ownerId=OWNER;f.now+=100;f.advance();assert.equal(task.phase,'port-transfer');assert.equal(task.portHandling.elapsedMs,elapsed+100);
 const projection=projectWorldDeliveries(f.ledger,'hormuz-shipping',f.now);assert.ok(projection.routes.some(route=>route.kind==='air'&&route.airWaypoints.length>1));assert.ok(projection.dropoffs.some(dropoff=>dropoff.kind==='air-cargo-departure'));
 for(const field of ['itemId','itemName','quantity','orderId','ownerId','shipmentId'])assert.equal(JSON.stringify(projection).includes('"'+field+'"'),false,field+' is private air cargo metadata');
});

test('legacy road manifests retain their existing local timetable and source port schedules apply a real departure headway',()=>{
 const f=fixture({quantity:10,mode:'road'});receiveSea(f);f.advance();const task=Object.values(f.ledger.deliveryTasks)[0];assert.equal(task.phase,'loading');assert.equal(task.portHandling,undefined);assert.deepEqual(task.timeline.map(step=>step.phase),['loading','driving','unloading','courier','dropoff']);finishRoad(f,task);assert.equal(f.stock(),10);
 const ledger={},connection=straitPortFreight('jebel-ali'),fields={mapId:connection.mapId,portId:connection.portId,waypoints:connection.roadWaypoints},a=createPortTransfer(ledger,{...fields,id:'a'},1000),b=createPortTransfer(ledger,{...fields,id:'b'},1000);assert.equal(b.startedAt-a.startedAt,1500);assert.equal(portTransferView(b,1000).phase,'queued');advancePortTransfer(b,2000);assert.equal(b.elapsedMs,0);assert.equal(portTransferView(b,2000).phase,'queued');
});
