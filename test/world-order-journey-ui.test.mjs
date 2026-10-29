import test from 'node:test';
import assert from 'node:assert/strict';
import {orderJourneyPresentation,orderJourneyStops,orderJourneyMarkup} from '../public/js/world-order-journey-ui.js';

const stage=(id,mode,status,mapId,extra={})=>({id,label:id,mode,status,mapId,quantity:17,completedQuantity:0,...extra});
const sample=()=>{const stages=[stage('Build','factory','completed','world-item-factory',{completedQuantity:17}),stage('Sail','boat','active','hormuz-shipping',{regionName:'Coastal region',position:{x:10,y:0,z:20}}),stage('Fly','plane','locked','hormuz-shipping'),stage('Receive','map-transfer','locked','plot-home'),stage('Road','road','locked','plot-home'),stage('Door','foot','locked','plot-home')];return {id:'journey:private-order',orderId:'private-order',deedId:'deed-home',quantity:17,deliveredQuantity:0,status:'active',stages,nextStop:stages[1]};};

test('travel guidance retains receipt-backed stages and never completes a delivery from counts or visits',()=>{
 const journey=sample(),before=structuredClone(journey),view=orderJourneyPresentation(journey);
 assert.equal(view.label,'Delivery quest in progress');assert.equal(view.completed,1);assert.equal(view.total,6);assert.equal(view.nextStop.id,'Sail');
 const markup=orderJourneyMarkup(journey,{currentMapId:'hormuz-shipping',destinationLabel:'Home front door'});
 assert.match(markup,/1 \/ 6 travel stages confirmed/);assert.match(markup,/Open next stop on this map/);assert.match(markup,/Shipping and final delivery receipts|shipping and final delivery receipts/);assert.match(markup,/0 \/ 17 units confirmed/);
 assert.doesNotMatch(markup,/>Complete quest<|Delivered to deed inventory|Delivery quest completed/);
 assert.equal(orderJourneyPresentation({...journey,deliveredQuantity:17}).label,'Delivery quest in progress','a count cannot replace the server journey state');
 assert.deepEqual(journey,before,'rendering guidance cannot update authoritative progress');
});

test('held, cancelled and confirmed delivery views preserve partial counts and offer no completion command',()=>{
 const journey=sample();journey.stages[1].status='held';journey.stages[1].completedQuantity=4;
 const held=orderJourneyMarkup({...journey,status:'held'});assert.match(held,/quest on hold/);assert.match(held,/4 \/ 17 units confirmed/);
 for(const status of ['completed','cancelled']){
  const markup=orderJourneyMarkup({...journey,status});assert.doesNotMatch(markup,/data-journey-visit/);assert.match(markup,new RegExp('Delivery quest '+status));
 }
 assert.equal(orderJourneyPresentation({...journey,nextStop:{...journey.stages[0]}}).nextStop,null,'a stale completed next stop cannot be activated');
 assert.equal(orderJourneyPresentation({...journey,nextStop:{id:'unknown',mapId:'evil'}}).nextStop,null,'only an existing stage can be the next stop');
});

test('world-route links include only bounded remaining public map ids without order or recipient metadata',()=>{
 const journey=sample(),markup=orderJourneyMarkup(journey,{currentMapId:'world-item-factory'}),href=markup.match(/href="([^"]+)" data-journey-plan/)[1].replaceAll('&amp;','&'),url=new URL(href,'https://world.test/');
 assert.equal(url.pathname,'/index.html');assert.equal(url.searchParams.get('from'),'world-item-factory');assert.deepEqual(url.searchParams.getAll('stop'),['hormuz-shipping','plot-home']);assert.equal(url.hash,'#world-map');
 assert.doesNotMatch(href,/private-order|deed-home|wallet|address/);
 const many={...journey,stages:Array.from({length:40},(_,index)=>stage('stop'+index,'road','locked','map'+index))};
 assert.equal(orderJourneyStops(many).length,8);assert.equal((orderJourneyMarkup(many).match(/data-journey-stage=/g)||[]).length,16);
});

test('transport modes and authored region labels are escaped while absent legacy journeys render nothing',()=>{
 const journey=sample();journey.stages[1].label='Dock <script>';journey.stages[1].regionName='Coast & islands';journey.nextStop=journey.stages[1];
 const markup=orderJourneyMarkup(journey);
 for(const mode of ['Factory','Boat','Plane','Map gateway','Road','Door approach'])assert.ok(markup.includes(mode));
 assert.match(markup,/Dock &lt;script&gt;/);assert.match(markup,/Coast &amp; islands/);assert.doesNotMatch(markup,/<script>/);assert.equal(orderJourneyMarkup(null),'');assert.equal(orderJourneyMarkup({}),'');
});

test('removed travel destinations disable navigation while keeping the receipt-backed quest visible',()=>{
 const journey=sample();journey.nextStop={...journey.nextStop,available:false};
 const markup=orderJourneyMarkup(journey,{currentMapId:'hormuz-shipping'});
 assert.match(markup,/destination is currently unavailable/);assert.match(markup,/data-journey-stop="Sail" disabled/);assert.match(markup,/Delivery quest in progress/);
 assert.doesNotMatch(orderJourneyMarkup(sample()),/data-journey-stop="Sail" disabled/,'older server fixtures without availability retain their valid navigation control');
});
