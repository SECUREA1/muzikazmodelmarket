import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalVehicleView} from '../public/js/local-vehicle-view.js';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
const airport={airport:{enabled:true,ceiling:80,runway:{x:0,z:0,width:16,length:200}},builderScene:{mapSize:256}};
const harbor={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};
const aircraft=()=>({id:'aircraft',holderId:'self',modelId:'corsair-aircraft',active:true,health:400,position:{x:0,y:25,z:75},rotation:{x:0,y:0,z:0},flight:{speed:16,airspeed:16,altitude:24.6,airborne:true,throttle:.7,throttleCommand:.7}});
const boat=()=>({id:'boat',holderId:'self',modelId:'harbor-skiff',active:true,health:200,position:{x:160,y:0,z:25},rotation:{x:0,y:0,z:0},boating:{speed:4,throttle:.5,throttleCommand:.5}});
const timing=(time=0)=>({sentAt:time,receivedAt:time,serverTime:1000000+time,simulationTime:1000000+time});
const options={environment:airport,groundAt:()=>.4,cleared:true};
test('aircraft position, bank, and engine controls respond on the next frame without a server reply',()=>{
 const source=aircraft(),unchanged=structuredClone(source),view=new LocalVehicleView();view.reconcile(source,timing());const result=view.sample(1000/60,1/60,{side:1,throttle:1,lift:.25},options);
 assert.ok(result.position.z<source.position.z);assert.ok(result.rotation.z<0);assert.ok(result.flight.throttle>.7);assert.equal(result.predicted,true);assert.deepEqual(source,unchanged);assert.notEqual(result.flight,source.flight);
});
test('late snapshots replay inputs rather than pausing or rewinding the visible aircraft',()=>{
 const source=aircraft(),view=new LocalVehicleView();view.reconcile(source,timing());const controls={throttle:.8,side:.2,lift:.1};let server=structuredClone(source);
 for(let frame=1;frame<=36;frame++){view.sample(frame*1000/60,1/60,controls,options);if(frame<=12)Object.assign(server,stepAircraftFlight(server,controls,1/60,{ground:.4,half:128,cleared:true}));}
 const before=structuredClone(view.actor);server.health=350;view.reconcile(server,{sentAt:0,receivedAt:600,serverTime:1000200,simulationTime:1000200});assert.ok(Math.hypot(view.actor.position.x-before.position.x,view.actor.position.y-before.position.y,view.actor.position.z-before.position.z)<1e-6);assert.equal(view.actor.health,350);
 const after=view.sample(1000*37/60,1/60,controls,options);assert.ok(after.position.z<before.position.z);assert.ok(after.rotation.y<before.rotation.y);
});
test('prediction stops after lost snapshots and authoritative travel, destruction and ownership changes reset it',()=>{
 const view=new LocalVehicleView();view.reconcile(aircraft(),timing());for(let frame=1;frame<=120;frame++)view.sample(frame*1000/60,1/60,{throttle:1},options);const stopped=structuredClone(view.actor.position);view.sample(2200,.05,{throttle:1},options);assert.deepEqual(view.actor.position,stopped);
 const relocated={...aircraft(),position:{x:50,y:.4,z:0},flight:{speed:0,altitude:0}};view.reconcile(relocated,{...timing(2200),teleport:true});assert.deepEqual(view.actor.position,relocated.position);view.reconcile({...relocated,active:false,health:0},timing(2250));view.sample(2300,.05,{throttle:1},options);assert.equal(view.actor.health,0);assert.equal(view.actor.active,false);assert.deepEqual(view.actor.position,relocated.position);
});
test('aircraft honors local floor, clearance and obstruction checks without applying damage',()=>{
 const view=new LocalVehicleView(),source=aircraft();view.reconcile(source,timing());const result=view.sample(50,.05,{throttle:1},{...options,blocked:()=>true});assert.deepEqual(result.position,source.position);assert.equal(result.flight.phase,'hold');assert.equal(result.flight.impactDamage,0);assert.equal(result.health,400);
 const parked={...aircraft(),position:{x:0,y:.42,z:60},flight:{speed:14,airspeed:14,altitude:0,airborne:false,throttle:1}};view.reconcile(parked,{...timing(50),teleport:true});for(let frame=1;frame<=12;frame++)view.sample(50+frame*1000/60,1/60,{lift:1,throttle:1},{...options,groundAt:()=>({y:.02}),cleared:()=>false});assert.ok(Math.abs(view.actor.position.y-.42)<1e-8);
});
test('boat controls use the same shared simulation between replies and respect shoreline and obstructions',()=>{
 const source=boat(),view=new LocalVehicleView();view.reconcile(source,timing());const result=view.sample(50,.05,{side:1,throttle:1},{environment:harbor});assert.ok(result.position.z<source.position.z);assert.ok(result.rotation.y<0);assert.ok(result.boating.throttle>.5);assert.equal(result.position.y,0);assert.equal(source.boating.throttle,.5);
 const blocked=new LocalVehicleView();blocked.reconcile(source,timing());blocked.sample(50,.05,{throttle:1},{environment:harbor,blocked:()=>true});assert.deepEqual(blocked.actor.position,source.position);assert.equal(blocked.actor.boating.impactDamage,0);
});
test('local assistance changes only the predicted copy and explicit controls take over immediately',()=>{
 const source=aircraft();Object.assign(source.flight,{assist:'cruise',assistTargetAltitude:30,assistSince:1000000});const view=new LocalVehicleView();view.reconcile(source,timing());view.sample(50,.05,{side:1},options);assert.equal(view.actor.flight.assist,null);assert.equal(source.flight.assist,'cruise');
});

test('fuel exhaustion overrides both aircraft and boat power commands without mutating snapshots',()=>{
 for(const [source,environment]of [[aircraft(),airport],[boat(),harbor]]){const original=structuredClone(source),view=new LocalVehicleView();view.reconcile(source,timing());view.sample(50,.05,{throttle:1},{environment,fuel:0,groundAt:()=>.4,cleared:true});const state=view.actor.flight||view.actor.boating;assert.equal(state.throttleCommand,0);assert.deepEqual(source,original);}
});

test('a missing floor ray uses the same world datum as the authoritative aircraft simulation',()=>{const source=aircraft();source.position.y=5.4;source.flight={speed:0,airspeed:0,altitude:0,airborne:false};const view=new LocalVehicleView();view.reconcile(source,timing());view.sample(50,.05,{}, {...options,groundAt:()=>null});assert.ok(view.actor.position.y<5.4);assert.equal(view.actor.flight.airborne,true);});
test('walking-rate render frames retain full aircraft/boat travel across 200 ms acknowledgements at 5 through 120 FPS',()=>{
 const controls={throttle:.7},duration=3;
 for(const kind of ['aircraft','boat']){
  const initial=kind==='aircraft'?aircraft():boat(),environment=kind==='aircraft'?airport:harbor;
  function reference(time){let actor=structuredClone(initial);for(let elapsed=0;elapsed<time-1e-9;){const dt=Math.min(1/120,time-elapsed);elapsed+=dt;Object.assign(actor,kind==='aircraft'?stepAircraftFlight(actor,controls,dt,{ground:.4,half:128,cleared:true}):stepBoatSimulation(actor,controls,dt,{environment,now:1000000+elapsed*1000}));}return actor;}
  const expected=reference(duration),distance=Math.hypot(expected.position.x-initial.position.x,expected.position.z-initial.position.z);let firstDistance=null;
  for(const fps of [5,10,20,30,60,120]){
   const view=new LocalVehicleView();view.reconcile(initial,timing());let previous=structuredClone(initial.position),nextAck=200;
   for(let frame=1;frame<=fps*duration;frame++){
    const now=frame*1000/fps;
    while(nextAck<=now+1e-7){const sourceTime=nextAck-100;view.reconcile(reference(sourceTime/1000),{sentAt:nextAck-200,receivedAt:nextAck,serverTime:1000000+sourceTime,simulationTime:1000000+sourceTime});nextAck+=200;}
    const actor=view.sample(now,1/fps,controls,{environment,groundAt:()=>.4,cleared:true}),expectedBefore=reference((frame-1)/fps),expectedAfter=reference(frame/fps),wantedStep=expectedBefore.position.z-expectedAfter.position.z,actualStep=previous.z-actor.position.z;
    assert.ok(actualStep>wantedStep*.9-.01,`${kind} ${fps} FPS must retain physical frame travel: ${actualStep} vs ${wantedStep}`);assert.ok(actualStep<wantedStep*1.1+.02,`${kind} ${fps} FPS cannot jump beyond its physical frame travel: ${actualStep} vs ${wantedStep}`);previous={...actor.position};
   }
   const actual=Math.hypot(view.actor.position.x-initial.position.x,view.actor.position.z-initial.position.z);assert.ok(Math.abs(actual-distance)<.15,`${kind} ${fps} FPS travels ${actual} m, expected ${distance} m`);if(firstDistance===null)firstDistance=actual;assert.ok(Math.abs(actual-firstDistance)<.15);
  }
 }
});

test('irregular 350 and 500 ms renders follow actual elapsed time even when the frame-start delta underreports work',()=>{
 const controls={throttle:.7};
 for(const kind of ['aircraft','boat']){
  const initial=kind==='aircraft'?aircraft():boat(),environment=kind==='aircraft'?airport:harbor;
  function reference(time){let actor=structuredClone(initial);for(let elapsed=0;elapsed<time-1e-9;){const dt=Math.min(1/120,time-elapsed);elapsed+=dt;Object.assign(actor,kind==='aircraft'?stepAircraftFlight(actor,controls,dt,{ground:.4,half:128,cleared:true}):stepBoatSimulation(actor,controls,dt,{environment,now:1000000+elapsed*1000}));}return actor;}
  const view=new LocalVehicleView();view.reconcile(initial,timing());let now=0,nextAck=200,previous=initial.position;
  for(const interval of [350,500,120,240,450,80,360]){
   const before=now;now+=interval;
   while(nextAck<=now){const source=nextAck-100;view.reconcile(reference(source/1000),{sentAt:nextAck-200,receivedAt:nextAck,serverTime:1000000+source,simulationTime:1000000+source});nextAck+=200;}
   const actor=view.sample(now,.05,controls,{environment,groundAt:()=>.4,cleared:true}),wanted=reference(before/1000).position.z-reference(now/1000).position.z,moved=previous.z-actor.position.z;
   assert.ok(moved>wanted*.85-.05,`${kind} must retain ${interval} ms of travel despite a 50 ms reported delta: ${moved} vs ${wanted}`);assert.ok(moved<wanted*1.15+.10,`${kind} must not exceed physically expected frame travel: ${moved} vs ${wanted}`);previous={...actor.position};
  }
  const wanted=reference(now/1000);assert.ok(Math.abs(view.actor.position.z-wanted.position.z)<.3,`${kind} irregular render timing must not accumulate snap-size error`);
 }
});

test('faster asymmetric boat replies never retime the established movement clock',()=>{
 const initial=boat();initial.boating={speed:0,throttle:0,throttleCommand:0};
 const controls={throttle:.9},environment=harbor,view=new LocalVehicleView();
 function reference(time){
  let actor=structuredClone(initial);
  for(let elapsed=0;elapsed<time-1e-9;){
   const dt=Math.min(1/60,time-elapsed);elapsed+=dt;
   Object.assign(actor,stepBoatSimulation(actor,controls,dt,{environment,now:1000000+elapsed*1000}));
  }
  return actor;
 }
 view.reconcile(initial,{sentAt:-1000,receivedAt:0,serverTime:999500,simulationTime:999500});
 for(let frame=1;frame<=72;frame++)view.sample(frame*1000/60,1/60,controls,{environment});
 view.reconcile(reference(.7),{sentAt:200,receivedAt:1200,serverTime:1000700,simulationTime:1000700});
 for(let frame=73;frame<=90;frame++)view.sample(frame*1000/60,1/60,controls,{environment});
 const before={...view.actor.position},clock=view.clockOffset;
 view.reconcile(reference(1.01),{sentAt:1000,receivedAt:1500,serverTime:1001010,simulationTime:1001010});
 assert.equal(view.clockOffset,clock,'a faster response must not move the source timeline');
 assert.equal(view.bestRtt,500,'latency telemetry still records the faster reply');
 for(let frame=91;frame<=108;frame++){
  const previous={...view.actor.position};
  const actor=view.sample(frame*1000/60,1/60,controls,{environment});
  const wanted=reference((frame-1)/60).position.z-reference(frame/60).position.z;
  const moved=previous.z-actor.position.z;
  assert.ok(moved>wanted*.9,'a delayed reply cannot make a powered boat retrace');
  assert.ok(moved<wanted*1.1,'clock stability retains the physical boat speed');
 }
 assert.ok(view.actor.position.z<before.z);
});

test('construction travel prediction obeys raised-body and active-work interlocks before a server reply',()=>{
 const view=new LocalVehicleView(),actor={id:'truck',modelId:'site-dumptruck',holderId:'me',active:true,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},construction:{kind:'truck',bed:.6},driving:{speed:0,parked:true}},saved=structuredClone(actor),options={groundAt:point=>({...point,y:0}),blocked:()=>false};
 view.reconcile(actor,{serverTime:1000,receivedAt:0});view.sample(0,0,{forward:1},options);const held=view.sample(100,.1,{forward:1},options);assert.equal(held.position.z,0);assert.equal(held.driving.speed,0);assert.deepEqual(actor,saved);
 const working={...actor,construction:{kind:'truck',bed:0,workCycle:{mode:'dump'}}};view.reconcile(working,{serverTime:1100,receivedAt:100});const stopped=view.sample(200,.1,{forward:1},options);assert.equal(stopped.position.z,0);
 view.reconcile({...actor,construction:{kind:'truck',bed:0}},{serverTime:1200,receivedAt:200});const moving=view.sample(300,.1,{forward:1},options);assert.ok(moving.position.z<0,'lowering the body and ending the cycle restores driving');
});

test('crawler prediction stays supported when its center crosses a shallow slab edge before its tracks',()=>{
 const view=new LocalVehicleView(),actor={id:'dozer',modelId:'site-bulldozer',holderId:'me',active:true,position:{x:0,y:.04,z:0},rotation:{x:0,y:0,z:0},construction:{kind:'bulldozer',blade:1},driving:{speed:1,parked:false}},queries=[];
 const settings={groundAt:point=>{queries.push({...point});return {...point,y:point.z>=0?.04:.02};},blocked:()=>false};
 view.reconcile(actor,{serverTime:1000,receivedAt:0});view.sample(0,0,{forward:.5},settings);const moved=view.sample(100,.1,{forward:.5},settings);
 assert.ok(moved.position.z<0,'the chassis center has left the raised slab');assert.equal(moved.position.y,.04,'rear tracks keep the chassis above the slab until they leave it');assert.ok(queries.some(point=>point.z>2),'the physical track footprint is sampled');
});
