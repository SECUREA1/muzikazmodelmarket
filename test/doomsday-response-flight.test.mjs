import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoomsdayResponsePlan,sampleDoomsdayResponseFlight,doomsdayResponseStatus} from '../public/js/doomsday-response-flight.js';

const environment={id:'airport',playableSize:2000,spawn:{x:-58,y:.02,z:74},airport:{enabled:true,runways:[{id:'main',x:40,z:0,width:16,length:202}]}};
const state=(phase,seconds,phaseStarted=0)=>({id:'response-1',phase,startedAt:100000,phaseStartedAt:100000+phaseStarted*1000,presentationTime:100000+seconds*1000,falloutAt:125000,objectives:[]});
const distance=(left,right)=>Math.hypot(left.x-right.x,left.y-right.y,left.z-right.z);

test('all maps share bounded copied response plans without anchoring to a viewer',()=>{
 const live=state('warning',0),plan=createDoomsdayResponsePlan(environment,live);
 assert.deepEqual(plan.anchor,{x:40,y:.02,z:0});assert.equal(plan.airport,true);assert.ok(plan.radius<=145);assert.equal(Object.isFrozen(plan),true);
 assert.equal(plan.initialAltitude,8);assert.equal(plan.cruiseAltitude,34);
 const elevated={...state('warning',0),objectives:[{position:{x:600,y:13,z:-500}},{position:{x:606,y:13,z:-506}}]};
 const small=createDoomsdayResponsePlan({id:'small-indoor',playableSize:16,spawn:{x:0,y:0,z:0}},elevated);
 assert.deepEqual(small.anchor,{x:603,y:13,z:-503});assert.equal(small.radius,32);assert.equal(small.initialAltitude,32);
 const pose=sampleDoomsdayResponseFlight(small,elevated).aircraft[0];assert.ok(pose.position.y>=45,'small indoor maps keep aircraft overhead');
 elevated.objectives[0].position.y=999;assert.equal(small.anchor.y,13,'later snapshots do not move the copied route');
 const nested=createDoomsdayResponsePlan({spawn:{position:{x:10,y:20,z:30}}},{});assert.deepEqual(nested.anchor,{x:10,y:20,z:30});
});

test('command departs first and relief aircraft join after the blasts on the same event clock',()=>{
 const plan=createDoomsdayResponsePlan(environment,{});
 const departure=sampleDoomsdayResponseFlight(plan,state('warning',0));
 assert.equal(departure.aircraft[0].stage,'departure');assert.equal(departure.aircraft[0].visible,true);assert.equal(departure.aircraft[1].visible,false);
 assert.ok(departure.aircraft[0].position.z<plan.anchor.z,'the first departure appears in the forward sky rather than behind the default camera');
 assert.ok(departure.aircraft[0].position.y>8);assert.notDeepEqual(departure.aircraft[0].position,{x:-12,y:.4,z:110},'ambient response does not borrow the public command stand');
 const climbing=sampleDoomsdayResponseFlight(plan,state('warning',6));assert.ok(climbing.aircraft[0].position.y>departure.aircraft[0].position.y);assert.ok(climbing.aircraft[0].rotation.x>0);
 const before=sampleDoomsdayResponseFlight(plan,state('detonation',24.999,18)),after=sampleDoomsdayResponseFlight(plan,state('fallout',25,25));
 assert.ok(distance(before.aircraft[0].position,after.aircraft[0].position)<.03,'command motion continues across fallout without a reset');
 assert.equal(before.aircraft[0].stage,'holding-clear');assert.equal(before.aircraft[1].visible,false);assert.equal(after.aircraft[1].visible,true);assert.equal(after.aircraft[1].stage,'departure');
 assert.equal(after.aircraft[1].modelId,'doomsday-evacuation-aircraft');
 for(let seconds=25;seconds<38;seconds+=.25){const joined=sampleDoomsdayResponseFlight(plan,state('fallout',seconds,25));assert.ok(joined.aircraft[1].position.y-joined.aircraft[0].position.y>=10,'relief departure stays above command even where opposite circuits cross');}
 const settled=sampleDoomsdayResponseFlight(plan,state('fallout',45,25));assert.equal(settled.aircraft[1].stage,'relief-circuit');
});

test('late joins and different renderer clocks produce identical synchronized poses',()=>{
 const plan=createDoomsdayResponsePlan(environment,{}),shared=state('fallout',138,25);
 assert.deepEqual(sampleDoomsdayResponseFlight(plan,shared,0),sampleDoomsdayResponseFlight(plan,shared,9000));
 const serverOnly={...shared,serverTime:shared.presentationTime};delete serverOnly.presentationTime;
 assert.deepEqual(sampleDoomsdayResponseFlight(plan,serverOnly,7),sampleDoomsdayResponseFlight(plan,shared,0));
 const elapsedOnly={...shared,phaseElapsedMs:113000};delete elapsedOnly.presentationTime;
 assert.deepEqual(sampleDoomsdayResponseFlight(plan,elapsedOnly,0),sampleDoomsdayResponseFlight(plan,shared,0));
});

test('long quest-held phases retain bounded circuits and meaningful lap counts',()=>{
 const plan=createDoomsdayResponsePlan(environment,{});
 for(const seconds of [300,3600,86400,31536000]){
  const sample=sampleDoomsdayResponseFlight(plan,state('fallout',seconds,25));
  assert.equal(sample.active,true);assert.equal(sample.opacity,1);
  for(const aircraft of sample.aircraft){
   assert.ok(aircraft.lap>=3);assert.ok(Math.abs(aircraft.position.x-plan.anchor.x)<=plan.radius+.001);assert.ok(Math.abs(aircraft.position.z-plan.anchor.z)<=plan.radius*.78+.001);
   assert.ok(aircraft.position.y>=plan.anchor.y+34);assert.ok(Object.values(aircraft.position).every(Number.isFinite));assert.ok(Object.values(aircraft.rotation).every(Number.isFinite));
  }
  assert.ok(Math.abs(sample.aircraft[0].position.y-sample.aircraft[1].position.y)>=10,'crossing paths remain vertically separated');
 }
});

test('recovery continues patrols and clearing spirals outward with the real eight-second fade',()=>{
 const plan=createDoomsdayResponsePlan(environment,{}),before=sampleDoomsdayResponseFlight(plan,state('recovery',120,100));
 assert.equal(before.aircraft[0].stage,'return-patrol');
 const clearState=seconds=>({...state('clearing',120+seconds,120),phaseEndsAt:228000});
 const start=sampleDoomsdayResponseFlight(plan,clearState(0)),middle=sampleDoomsdayResponseFlight(plan,clearState(4)),end=sampleDoomsdayResponseFlight(plan,clearState(8));
 assert.equal(distance(before.aircraft[0].position,start.aircraft[0].position),0,'entering clearing never teleports the aircraft');
 assert.equal(start.opacity,1);assert.equal(middle.opacity,.5);assert.equal(end.opacity,0);assert.equal(end.active,false);assert.ok(end.aircraft.every(aircraft=>!aircraft.visible));
 assert.ok(middle.aircraft[0].position.y>start.aircraft[0].position.y);assert.ok(middle.aircraft.every(aircraft=>aircraft.stage==='returning'));
 for(const phase of ['idle','all-clear']){const hidden=sampleDoomsdayResponseFlight(plan,state(phase,150,150));assert.equal(hidden.active,false);assert.equal(hidden.opacity,0);assert.ok(hidden.aircraft.every(aircraft=>!aircraft.visible&&aircraft.propellerSpeed===0));}
});

test('reduced motion holds steady distant poses while allowing phase visibility and the clearing fade',()=>{
 const plan=createDoomsdayResponsePlan(environment,{}),options={reducedMotion:true};
 const early=sampleDoomsdayResponseFlight(plan,state('fallout',30,25),0,options),late=sampleDoomsdayResponseFlight(plan,state('fallout',3000,25),90,options);
 assert.deepEqual(early.aircraft,late.aircraft);assert.ok(early.aircraft.every(aircraft=>aircraft.propellerSpeed===0&&aircraft.rotation.x===0&&aircraft.rotation.z===0));
 assert.ok(early.aircraft.every(aircraft=>aircraft.position.z<plan.anchor.z),'steady reduced-motion aircraft remain in the forward sky');
 const clear=sampleDoomsdayResponseFlight(plan,{...state('clearing',3004,3000),phaseEndsAt:3108000},0,options);
 assert.equal(clear.opacity,.5);assert.deepEqual(clear.aircraft.map(aircraft=>aircraft.position),early.aircraft.map(aircraft=>aircraft.position));
});

test('phase guidance states neutral aircraft facts and never assigns or gates response quests',()=>{
 for(const [phase,count]of [['warning',1],['detonation',1],['fallout',2],['recovery',2],['clearing',2]]){
  const status=doomsdayResponseStatus({phase});assert.equal(status.aircraftCount,count);assert.equal(status.active,true);assert.equal(Object.isFrozen(status),true);assert.doesNotMatch(status.message,/collect|restore|follow|unlock/i);
 }
 assert.equal(doomsdayResponseStatus(null).active,false);assert.equal(doomsdayResponseStatus({phase:'all-clear'}).aircraftCount,0);
});
