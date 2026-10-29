import test from 'node:test';
import assert from 'node:assert/strict';
import {deedDeliveryRoute,deedDeliveryRouteMarkup,deedDeliveryTasksMarkup,deedDeliveryTaskPresentation} from '../public/js/world-deed-delivery-ui.js';
import {supplyShipmentAccess,supplyShipmentTask,supplyOrderPresentation} from '../public/js/world-supply-ui.js';

test('port and road phases never offer a second sea manifest or call the deed stocked',()=>{
 for(const phase of ['port-received','loading-trucks','land-transit','doorstep-delivery','port-held']){
  const shipment={phase,jobId:'finished-voyage',shippingMapId:'sea',destinationMapId:'plot-deed-home'};
  const access=supplyShipmentAccess(shipment,'sea',{vehicleId:'ship',shipping:{job:{id:'finished-voyage'}}});
  assert.equal(access.action,'none');assert.doesNotMatch(access.message,/Delivered to destination inventory/);
 }
 assert.match(supplyShipmentTask({phase:'cancelled',seaReceipt:{id:'sea-receipt'}},'plot'),/held at the receiving port/);
 assert.equal(supplyShipmentAccess({phase:'blocked',jobId:'finished',seaReceipt:{id:'sea-receipt'}},'sea',{shipping:{job:{id:'finished'}}}).action,'none','a route hold cannot resurrect a completed sea job');
 assert.match(supplyOrderPresentation({phase:'land-transit',quantity:100,deliveredQuantity:20}).label,/Truck/);
 assert.equal(supplyOrderPresentation({phase:'doorstep-delivery',quantity:100,deliveredQuantity:20}).delivered,20);
});

test('calculated routes distinguish a blocked entrance from an actual doorstep and escape authored names',()=>{
 const route={id:'route',deedId:'deed-home',mapId:'plot-home',status:'ready',dropoff:{kind:'doorstep',name:'Front <door>',mapId:'plot-home'},truckWaypoints:[{x:0,z:0},{x:40,z:0}],courierWaypoints:[{x:40,z:0},{x:40,z:8}],truckDistanceMeters:40,courierDistanceMeters:8,estimatedDurationMs:65000};
 assert.equal(deedDeliveryRoute({deliveryRoutes:{'deed-home':route}},'deed-home'),route);
 const markup=deedDeliveryRouteMarkup(route,{navigate:true});
 assert.match(markup,/Truck: 40 m/);assert.match(markup,/Door approach: 8 m/);assert.match(markup,/2 min/);assert.match(markup,/Front &lt;door&gt;/);assert.match(markup,/Inter-map freight link/);assert.match(markup,/data-delivery-navigate="plot-home"/);assert.equal((markup.match(/<polyline/g)||[]).length,2);
 const blocked=deedDeliveryRouteMarkup({...route,status:'blocked',reason:'Door obstructed',dropoff:{kind:'plot-entrance',name:'Lot 1'}});
 assert.match(blocked,/Marked plot entrance/);assert.match(blocked,/Door obstructed/);assert.match(blocked,/data-delivery-route-status="blocked"/);
 assert.doesNotMatch(blocked,/Clear approach calculated/);
});

test('road task rendering keeps stages provisional until a confirmed final receipt',()=>{
 const task={id:'truck-a',quantity:25,crateCount:2,phase:'driving',stageProgress:1};
 assert.equal(deedDeliveryTaskPresentation(task).progress,.99);assert.equal(deedDeliveryTaskPresentation(task).finished,false);
 const markup=deedDeliveryTasksMarkup([task,{...task,id:'held',phase:'blocked',blockedReason:'New wall across approach'}]);
 assert.match(markup,/25 units/);assert.match(markup,/New wall across approach/);assert.doesNotMatch(markup,/inventory received/);
 const delivered=deedDeliveryTasksMarkup([{...task,phase:'delivered',deliveredAt:1000}]);assert.match(delivered,/Dropped off · inventory received/);assert.match(delivered,/Drop-off confirmed/);
});

test('large manifests keep active road loads visible in a bounded overview',()=>{
 const tasks=Array.from({length:500},(_,index)=>({id:'queued-'+index,phase:'awaiting-truck',quantity:5,crateCount:1}));tasks.push({id:'moving-current',phase:'driving',quantity:5,crateCount:1});
 const markup=deedDeliveryTasksMarkup(tasks);
 assert.equal((markup.match(/data-delivery-task=/g)||[]).length,6);assert.match(markup,/501 truck loads/);assert.match(markup,/data-delivery-task="moving-current"/);assert.match(markup,/showing 6 current loads/);
});
