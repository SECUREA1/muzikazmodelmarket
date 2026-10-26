import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingPresentation} from '../public/js/shipping-ui.js';
import {shippingChartPoint} from '../public/js/shipping-map.js';
import {SHIPPING_PORTS} from '../public/js/shipping-config.js';

test('shipping Auto alternates cargo weight and waits for a full manifest before securing',()=>{
 const job={phase:'loading',units:4,loaded:[]};assert.deepEqual(shippingPresentation({job}).next.fields,{side:'port'});
 job.loaded.push({side:'port',mass:3});assert.deepEqual(shippingPresentation({job}).next.fields,{side:'starboard'});
 job.loaded.push({side:'starboard',mass:1});assert.equal(shippingPresentation({job}).next.fields.side,'starboard');
 job.loaded.push({side:'starboard',mass:2},{side:'port',mass:1});assert.equal(shippingPresentation({job}).next.operation,'secure');assert.ok(shippingPresentation({job}).balance<0);
});
test('each delivery phase and hazard presents the correct authoritative operation',()=>{
 const job={phase:'secured',waypoints:[{x:0,z:0}],checkpointIndex:0};assert.equal(shippingPresentation({job}).next.operation,'depart');
 job.phase='sailing';assert.equal(shippingPresentation({job}).next.operation,'navigate');job.hazard={type:'pirates',resolved:false};assert.equal(shippingPresentation({job}).next.operation,'escort');
 job.hazard={type:'mines',resolved:false};assert.equal(shippingPresentation({job}).next.operation,'radio');job.hazard.resolved=true;job.checkpointIndex=1;assert.equal(shippingPresentation({job}).next.operation,'dock');
 job.phase='unloading';assert.equal(shippingPresentation({job}).next.operation,'unload');job.phase='delivered';assert.equal(shippingPresentation({job}).next.operation,'chart');
});
test('shipping chart accurately maps the configured ports and invalid coordinates stay absent',()=>{
 const west=shippingChartPoint(SHIPPING_PORTS.find(p=>p.id==='jebel-ali')),east=shippingChartPoint(SHIPPING_PORTS.find(p=>p.id==='fujairah'));assert.ok(west.x<east.x);assert.ok(west.y<east.y);
 for(const port of SHIPPING_PORTS){const p=shippingChartPoint(port);assert.ok(p.x>0&&p.x<800&&p.y>0&&p.y<600);}
 assert.equal(shippingChartPoint({x:NaN,z:0}),null);assert.equal(shippingChartPoint(null),null);
});
