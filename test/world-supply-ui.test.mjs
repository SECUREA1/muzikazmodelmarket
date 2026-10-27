import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSupplyItems,supplyShipmentTask,supplySourceStock} from '../public/js/world-supply-ui.js';
import {shippingSupplyManifest} from '../public/js/shipping-ui.js';

test('supply catalog search covers names, native identities and GLB paths without losing word matching',()=>{
 const catalog=[{id:'native:chair',name:'Oak chair',buildAssetId:'oak-chair'},{id:'model:harbor',name:'Freighter',modelUrl:'/public/models/sea/freighter.glb'}];
 assert.deepEqual(filterSupplyItems(catalog,'oak chair'),[catalog[0]]);
 assert.deepEqual(filterSupplyItems(catalog,'sea glb'),[catalog[1]]);
 assert.deepEqual(filterSupplyItems(catalog,'native:'),[catalog[0]]);
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
