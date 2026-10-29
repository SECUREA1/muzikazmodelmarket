import test from 'node:test';
import assert from 'node:assert/strict';
import {airFreightAccess,airFreightPresentation,airFreightTaskMarkup} from '../public/js/world-air-freight-ui.js';
import {supplyOnwardAvailability,supplyShipmentTask,supplyOrderPresentation} from '../public/js/world-supply-ui.js';
import {straitAirRoute} from '../public/js/strait-freight-network.js';
import {deedDeliveryRouteMarkup,deedDeliveryTasksMarkup} from '../public/js/world-deed-delivery-ui.js';
const route=straitAirRoute('fujairah'),task={id:'air-task',shipmentId:'shipment',itemId:'native:crate',itemName:'Counted freight',quantity:37,crateCount:4,mapId:'hormuz-shipping',phase:'awaiting-pilot',route};
const aircraft={id:'plane',modelId:'diamond-da40',holderId:'pilot',active:true,flight:{speed:0,airspeed:0,airborne:false}};
const context={mapId:'hormuz-shipping',ownerId:'wallet:sender',selfId:'pilot',self:{vehicleId:'plane'},aircraft,now:1000};
const session=(phase,extra={})=>({...context,self:{...context.self,airFreight:{airTaskId:task.id,aircraftId:aircraft.id,phase,...extra}}});
test('onward route choices preserve actual port availability and never invent a Qeshm runway',()=>{
 assert.equal(supplyOnwardAvailability({to:'fujairah'}).available,true);
 assert.equal(supplyOnwardAvailability({to:'qeshm'}).available,false);
 assert.match(supplyOnwardAvailability({to:'qeshm'}).reason,/shore road and truck/);
 assert.equal(supplyOnwardAvailability({to:'fujairah'},'private-shipping-map').available,false);
 assert.equal(supplyOnwardAvailability({}).available,false);
 assert.match(supplyShipmentTask({onwardMode:'air',seaReceipt:{},phase:'port-received'},'hormuz-shipping'),/verified air delivery required/);
 assert.match(supplyOrderPresentation({onwardMode:'air',phase:'port-received'}).label,/air freight pending/);
});
test('air task controls require the correct live map, bound aircraft and current reservation',()=>{
 assert.equal(airFreightAccess(task,{...context,mapId:'city'}).buttons[0].action,'travel');
 assert.equal(airFreightAccess(task,{...context,aircraft:null}).buttons.length,0);
 assert.equal(airFreightAccess(task,context).buttons[0].action,'reserve');
 assert.equal(airFreightAccess({...task,phase:'reserved'},context).buttons.length,0,'another reserved manifest cannot be rebound from the UI');
 assert.equal(airFreightAccess({...task,readyAt:2000},context).buttons.length,0,'shore transfer completes before pilot reservation');
 assert.equal(airFreightAccess(task,{...context,self:{...context.self,shipping:{job:{phase:'sailing'}}}}).buttons.length,0,'an existing sea voyage cannot overlap air freight');
 assert.deepEqual(airFreightAccess(task,{...session('reserved'),aircraft:{...aircraft,id:'another-plane'}}).buttons.map(button=>button.action),['release']);
 assert.deepEqual(airFreightAccess(task,{...session('cancelled'),aircraft:null}).buttons.map(button=>button.action),['release'],'an interrupted pilot can release a reservation without being trapped in the old cockpit');
});
test('load and unload require server dwell while flight does not claim a receiving stock receipt',()=>{
 assert.equal(airFreightAccess(task,session('reserved')).buttons[0].action,'load');
 assert.equal(airFreightAccess(task,session('loading',{loadReadyAt:2000})).buttons[0].disabled,true);
 assert.equal(airFreightAccess(task,{...session('loading',{loadReadyAt:2000}),now:2001}).buttons[0].disabled,false);
 assert.equal(airFreightAccess(task,session('loaded')).buttons[0].action,'secure');
 assert.equal(airFreightAccess(task,session('secured')).buttons[0].action,'fly');
 assert.equal(airFreightAccess(task,session('approach')).buttons.some(button=>button.action==='unload'),false);
 assert.equal(airFreightAccess(task,session('landed')).buttons[0].action,'unload');
 assert.equal(airFreightAccess(task,session('unloading',{unloadReadyAt:2000})).buttons[0].disabled,true);
 const done=airFreightAccess({...task,phase:'air-delivered'},session('delivered'));
 assert.equal(done.buttons.length,0);assert.match(done.message,/stock still waits for the final delivery drop-off/);
 assert.equal(airFreightPresentation(task,session('loading').self.airFreight).finished,false);
});
test('air manifest cards retain exact quantities and escaped public fields without rendering private identities',()=>{
 const html=airFreightTaskMarkup({...task,itemName:'<unsafe> crate',captainId:'wallet-secret',reservationId:'private-reservation'},context);
 assert.match(html,/&lt;unsafe&gt; crate × 37/);assert.match(html,/4 sealed freight crates/);assert.match(html,/Taking off or landing does not credit stock/);
 assert.ok(!html.includes('wallet-secret'));assert.ok(!html.includes('private-reservation'));
});
test('receiving views distinguish dock road transport and the reviewed air chain before final stock arrives',()=>{
 const local={status:'ready',dropoff:{kind:'doorstep',name:'Shop entrance',position:{x:3,y:0,z:2}}};
 assert.match(deedDeliveryRouteMarkup(local,{onwardMode:'air'}),/Departure cargo apron.*Verified flight.*Receiving airfield/);
 assert.doesNotMatch(deedDeliveryRouteMarkup(local),/Departure cargo apron/);
 const html=deedDeliveryTasksMarkup([{id:'road-1',airTaskId:task.id,phase:'port-transfer',quantity:37,crateCount:4,stageProgress:.5}]);
 assert.match(html,/Dock truck on the shore freight road/);assert.match(html,/Verified air freight received/);assert.match(html,/0 \/ 1 truck loads dropped off/);
});
