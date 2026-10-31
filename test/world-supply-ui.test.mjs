import test from 'node:test';
import assert from 'node:assert/strict';
import {supplySelectableCatalog,filterSupplyItems,supplyShipmentTask,supplyPortTransferText,supplySourceStock,supplyRouteCapacity,supplyBuildPresentation,supplyShipmentAccess,supplyOrderPresentation,supplyFreightTraceTarget,supplyFreightTraceMarkup} from '../public/js/world-supply-ui.js';
import {shippingSupplyManifest} from '../public/js/shipping-ui.js';

test('freight links inspect the exact lot before the larger shipment',()=>{
 assert.deepEqual(supplyFreightTraceTarget({lotId:' lot-a ',shipmentId:'ship-a'}),{lotId:'lot-a'});
 assert.deepEqual(supplyFreightTraceTarget({shipmentId:'ship-a'}),{shipmentId:'ship-a'});
 assert.equal(supplyFreightTraceTarget({itemId:'native:forge-blade',section:'trace'}),null);
 const trace={lots:[{id:'lot-a',itemId:'native:forge-blade',blueprint:{name:'Finished blade'},quantity:1,availableQuantity:0},{id:'lot-b',itemId:'native:other',quantity:9,availableQuantity:2}],allocations:[{shipmentId:'ship-a',lots:[{lotId:'lot-a',quantity:1},{lotId:'lot-b',quantity:9}]}],shipments:[{id:'ship-a',itemId:'native:forge-blade',quantity:10,phase:'delivered',destinationMapId:'market-a',sourceMapId:'factory'}],stockReceipts:[{id:'other-lot-receipt',shipmentId:'ship-a',itemId:'native:forge-blade',quantity:9,destinationMapId:'market-a',lotAllocations:[{lotId:'lot-b',quantity:9}]},{id:'wrong-item-receipt',shipmentId:'ship-a',itemId:'native:other',quantity:1,destinationMapId:'market-a',lotAllocations:[{lotId:'lot-a',quantity:1}]},{id:'wrong-port-receipt',shipmentId:'ship-a',itemId:'native:forge-blade',quantity:1,destinationMapId:'market-b',lotAllocations:[{lotId:'lot-a',quantity:1}]}]};
 let output=supplyFreightTraceMarkup({target:{lotId:'lot-a'},trace});
 assert.match(output,/Warehouse lot inspection/);assert.match(output,/Finished blade/);assert.match(output,/factory → market-a/);
 assert.match(output,/no matching stock receipt/);assert.doesNotMatch(output,/other-lot-receipt|wrong-item-receipt|wrong-port-receipt|native:other/);
 trace.stockReceipts.push({id:'exact-receipt',shipmentId:'ship-a',itemId:'native:forge-blade',quantity:10,destinationMapId:'market-a',lotAllocations:[{lotId:'lot-a',quantity:1},{lotId:'lot-b',quantity:9}]});
 output=supplyFreightTraceMarkup({target:{lotId:'lot-a'},trace});assert.match(output,/Destination stock confirmed: 1 units for this lot/);assert.match(output,/exact-receipt/);
 const shipmentOutput=supplyFreightTraceMarkup({target:{shipmentId:'ship-a'},trace:{...trace,lots:[...trace.lots,{id:'unrelated-lot',itemId:'private-unrelated-item',quantity:7}]}});
 assert.match(shipmentOutput,/Shipment inspection/);assert.doesNotMatch(shipmentOutput,/private-unrelated-item/);
 assert.match(supplyFreightTraceMarkup({target:{lotId:'<lot>'}}),/&lt;lot&gt;/);
});

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
 assert.equal(supplySourceStock({...data,availableFactoryStock:{chair:3}},'factory','chair'),3,'deed-held lots cannot be offered as dispatchable shared goods');
 assert.equal(supplySourceStock({...data,availableFactoryStock:{chair:0}},'factory','chair'),0,'a reserved zero cannot fall back to the warehouse accounting count');
});

test('deed order presentation preserves partial receipt counts through holds and cancellation',()=>{
 const partial={phase:'attention',quantity:17,deliveredQuantity:4};
 assert.deepEqual(supplyOrderPresentation(partial),{label:'Order needs attention',delivered:4,total:17});
 assert.deepEqual(supplyOrderPresentation({...partial,phase:'cancelled'}),{label:'Order cancelled',delivered:4,total:17});
 assert.equal(supplyOrderPresentation({...partial,phase:'awaiting-shipping'}).label,'Packed · waiting for a captain');
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

test('factory tasks identify the server staging port and distinguish warehouse transfer from the playable sea leg',()=>{
 const shipment={originPortId:'fujairah',destinationPortId:'muscat',shippingMapId:'hormuz-shipping',portTransferTask:{phase:'staged',toPortId:'fujairah',quantity:37}},route={from:'jebel-ali',to:'bandar-abbas'};
 assert.match(supplyPortTransferText(shipment,route),/Staged at Fujairah.*37 units.*warehouse → port transfer simulated; sea passage playable/);
 assert.match(supplyPortTransferText({...shipment,portTransferTask:{...shipment.portTransferTask,phase:'loading'}},route),/Loading at Fujairah/);
 assert.match(supplyPortTransferText({...shipment,portTransferTask:{...shipment.portTransferTask,phase:'returned'}},route),/Returned to the source warehouse/);
 assert.match(supplyPortTransferText({...shipment,portTransferTask:{...shipment.portTransferTask,phase:'delivered'}},route),/Sea delivery completed/);
 assert.match(supplyShipmentAccess(shipment,'city',null,route).message,/Fujairah/);
 assert.match(supplyShipmentAccess(shipment,'hormuz-shipping',{},route).message,/Fujairah/);
 assert.equal(supplyPortTransferText({phase:'queued'},route),'','legacy shipments do not gain invented staging records');
 const custom={id:'creation:painting',name:'Painted beacon',factoryVariant:true,renderKind:'image',productionSource:'Creator marketplace'};
 assert.deepEqual(filterSupplyItems([custom],'custom artwork'),[custom]);
 assert.deepEqual(filterSupplyItems([custom],'creator marketplace'),[custom]);
});

test('retired paid blueprints remain selectable for stock transfers while an active definition takes precedence',()=>{
 const active={id:'native:chair',name:'Current chair',factoryProducible:true},retired={id:'blueprint:retired',name:'Retired custom seat',recipe:{unitsPerContainer:50}},data={catalog:[active],transferCatalog:[retired,{id:active.id,name:'Old chair',factoryProducible:false}]};
 const combined=supplySelectableCatalog(data);
 assert.equal(combined.length,2);assert.equal(combined[0],active);
 assert.equal(combined[1].id,retired.id);assert.equal(combined[1].factoryProducible,false);
 assert.equal(retired.factoryProducible,undefined,'transfer display does not mutate the saved server record');
 assert.equal(supplyRouteCapacity(combined[1],{units:4}),200,'retired stock retains the item packaging capacity');
 assert.equal(filterSupplyItems(combined,'unlisted stock transfer')[0].id,retired.id);
 assert.deepEqual(supplySelectableCatalog({catalog:[active]}),[active],'older server fixtures retain their existing lineup');
});
