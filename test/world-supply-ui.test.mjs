import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSupplyItems,supplyShipmentTask,supplySourceStock,supplyRouteCapacity,supplyBuildPresentation,supplyShipmentAccess} from '../public/js/world-supply-ui.js';
import {shippingSupplyManifest} from '../public/js/shipping-ui.js';

test('supply catalog search covers names, native identities and GLB paths without losing word matching',()=>{
 const catalog=[{id:'native:chair',name:'Oak chair',buildAssetId:'oak-chair',aliases:['imported-seat-alias'],nativeMaps:[{id:'harbor',name:'Neon Harbor',count:3,aliases:['harbor-seat']}]},{id:'model:harbor',name:'Freighter',modelUrl:'/public/models/sea/freighter.glb'}];
 assert.deepEqual(filterSupplyItems(catalog,'oak chair'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'sea glb'),[catalog[1]]);
 assert.deepEqual(filterSupplyItems(catalog,'native:'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'Neon Harbor'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'imported-seat-alias'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'harbor-seat'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'missing'),[]);
 assert.equal(filterSupplyItems(catalog,'').length,2);
});

test('shipment task instructions distinguish correct map, assigned voyage and delivered inventory',()=>{
 const shipment={phase:'queued',shippingMapId:'hormuz-shipping'};
 assert.match(supplyShipmentTask(shipment,'city'),/Travel/);
 assert.match(supplyShipmentTask(shipment,'hormuz-shipping'),/Board a ship/);
 assert.match(supplyShipmentTask({...shipment,jobId:'captain-job'},'hormuz-shipping'),/Assigned/);
 assert.match(supplyShipmentTask({...shipment,phase:'delivered',jobId:'captain-job'},'city'),/Delivered/);
 assert.match(supplyShipmentTask({...shipment,phase:'cancelled'},'city'),/returned to source inventory/);
});


test('shipping loading bay identifies exact factory cargo and map destination',()=>{
 assert.equal(shippingSupplyManifest({title:'Ordinary cargo'}),'');
 const text=shippingSupplyManifest({shipmentId:'shipment-1',supplyManifest:[{itemId:'native:chair',name:'Oak chair',quantity:40},{itemId:'model:freighter',name:'Freighter GLB',quantity:2}],destinationMapId:'city'});
 assert.match(text,/Oak chair × 40, Freighter GLB × 2/);
 assert.match(text,/Destination inventory: city/);
 assert.match(text,/complete shipping manifest is unloaded/);
});


test('dispatch availability uses exact selected warehouse stock without drawing an initial reserve for maps',()=>{
 const data={factoryStock:{chair:20},worldStock:{chair:1000},maps:[{id:'city',stock:{chair:7}},{id:'untouched-map',stock:{}}]};
 assert.equal(supplySourceStock(data,'factory','chair'),20);
 assert.equal(supplySourceStock(data,'world','chair'),1000);
 assert.equal(supplySourceStock(data,'city','chair'),7);
 assert.equal(supplySourceStock(data,'untouched-map','chair'),0);
 assert.equal(supplySourceStock(data,'missing-map','chair'),0);
});


test('shipping capacity uses item packaging and the selected container manifest',()=>{
 const route={units:4};
 assert.equal(supplyRouteCapacity({recipe:{unitsPerContainer:1000}},route),4000);
 assert.equal(supplyRouteCapacity({recipe:{unitsPerContainer:4}},route),16);
 assert.equal(supplyRouteCapacity({recipe:{unitsPerContainer:1}},route),4);
 assert.equal(supplyRouteCapacity({},route,{itemsPerContainer:500}),2000);
 assert.equal(supplyRouteCapacity({recipe:{unitsPerContainer:1000}},{units:12},{maxQuantity:10000}),10000);
 assert.equal(supplyRouteCapacity({},null),0);
});

test('build clocks wait for server stage completion and never claim locally completed stock',()=>{
 const job={phase:'building',startedAt:0,readyAt:1000,stageIndex:0,stages:[{name:'Assembly',phase:'processing',startedAt:0,readyAt:1000}]};
 assert.equal(supplyBuildPresentation(job,500).progress,.5);
 assert.match(supplyBuildPresentation(job,500).label,/Assembly/);
 assert.match(supplyBuildPresentation(job,2000).label,/confirming completed stage/);
 assert.ok(supplyBuildPresentation(job,2000).progress<1);
 assert.equal(job.phase,'building');
 assert.match(supplyBuildPresentation({...job,phase:'ready'},2000).label,/shipping required/);
});

test('shipment controls require the actual shipping map, boarding, origin eligibility and a free sea job',()=>{
 const shipment={id:'cargo',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',phase:'queued'},route={from:'jebel-ali'};
 assert.equal(supplyShipmentAccess(shipment,'city',null,route).action,'travel');
 assert.equal(supplyShipmentAccess(shipment,'hormuz-shipping',{shipping:{boardingId:'feeder'}},route).action,'board');
 assert.equal(supplyShipmentAccess(shipment,'hormuz-shipping',{vehicleId:'feeder',shipping:{availableContracts:[]}},route).action,'origin');
 assert.equal(supplyShipmentAccess(shipment,'hormuz-shipping',{vehicleId:'feeder',shipping:{availableContracts:['gulf-gateway']}},route).action,'accept');
 assert.equal(supplyShipmentAccess(shipment,'hormuz-shipping',{vehicleId:'feeder',shipping:{job:{phase:'loading'},availableContracts:['gulf-gateway']}},route).action,'none');
 assert.equal(supplyShipmentAccess({...shipment,phase:'reserved'},'hormuz-shipping',null,route).action,'none');
 assert.equal(supplyShipmentAccess({...shipment,phase:'reserved',jobId:'voyage'},'hormuz-shipping',{shipping:{job:{id:'voyage'}}},route).action,'continue');
});
