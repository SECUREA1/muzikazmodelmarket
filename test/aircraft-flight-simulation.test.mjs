import test from 'node:test';
import assert from 'node:assert/strict';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
const plane=(position={x:0,y:.4,z:70},flight={})=>({position:{...position},rotation:{x:0,y:0,z:0},flight:{...flight}});
function fly(aircraft,input,seconds,options={},step=.05){for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=step)Object.assign(aircraft,stepAircraftFlight(aircraft,input,Math.min(step,seconds-elapsed),options));return aircraft;}
test('engine spool and rotation require forward speed, clearance, and a controlled climb',()=>{
 const held=fly(plane(),{forward:1,lift:1},3,{cleared:false});assert.equal(held.position.y,.4);assert.ok(held.flight.speed>8);assert.equal(held.flight.phase,'taxi');
 const takingOff=fly(plane(),{forward:1,lift:0,jump:true},3);assert.ok(takingOff.position.y>8);assert.ok(takingOff.flight.airspeed>takingOff.flight.stallSpeed);assert.ok(takingOff.flight.pitch>0);assert.equal(takingOff.rotation.x,takingOff.flight.pitch);assert.ok(takingOff.flight.rpm>2500);assert.ok(takingOff.flight.verticalSpeed>0);
});
test('throttle retains its setting, explicit throttle overrides it, and bank turns recover smoothly',()=>{
 const aircraft=fly(plane({x:0,y:30,z:90}),{throttle:.7},2);const throttle=aircraft.flight.throttle;fly(aircraft,{forward:0},.5);assert.equal(aircraft.flight.throttleCommand,.7);assert.ok(aircraft.flight.throttle>=throttle);
 fly(aircraft,{throttle:1,lift:.1,side:1},.7);assert.ok(aircraft.flight.bank<-.3);assert.ok(aircraft.rotation.y<-.1);const bank=aircraft.flight.bank;
 fly(aircraft,{throttle:.4,side:0,lift:0},.5);assert.ok(Math.abs(aircraft.flight.bank)<Math.abs(bank));assert.equal(aircraft.flight.throttleCommand,.4);assert.ok(aircraft.flight.heading>=0&&aircraft.flight.heading<360);
});
test('low airspeed produces a stall descent and recovers with power instead of hovering',()=>{
 const aircraft=plane({x:0,y:25,z:90},{airspeed:2,speed:2,throttle:0});fly(aircraft,{throttle:0},.5);assert.equal(aircraft.flight.stall,true);assert.equal(aircraft.flight.warning,'STALL');assert.ok(aircraft.position.y<25);assert.ok(aircraft.flight.verticalSpeed<0);
 fly(aircraft,{throttle:1,lift:.2},3);assert.equal(aircraft.flight.stall,false);assert.ok(aircraft.flight.airspeed>aircraft.flight.stallSpeed);
});
test('landing gear, flaps, touchdowns and impacts have one-step authoritative telemetry',()=>{
 const aircraft=plane({x:0,y:.65,z:10},{speed:18,airspeed:18,pitch:-.4,throttle:0,gear:false});const landing=stepAircraftFlight(aircraft,{lift:-1,gear:false,flaps:.5},.1);assert.equal(landing.position.y,.4);assert.equal(landing.flight.airborne,false);assert.equal(landing.flight.gear,true,'ground contact deploys the gear');assert.equal(landing.flight.touchdown,true);assert.ok(landing.flight.impactDamage>=70);assert.equal(landing.flight.flaps,.5);
 Object.assign(aircraft,landing);const next=stepAircraftFlight(aircraft,{brake:true},.1);assert.equal(next.flight.impactDamage,0);assert.equal(next.flight.touchdown,false);
 const blocked=stepAircraftFlight(plane({x:0,y:20,z:0},{speed:22,airspeed:22}),{throttle:1},.1,{blocked:()=>true});assert.equal(blocked.flight.phase,'hold');assert.equal(blocked.flight.speed,0);assert.ok(blocked.flight.impactDamage>0);assert.equal(blocked.position.z,0);
});
test('bounded substeps produce stable flight at different server step sizes and sanitize corrupt values',()=>{
 const first=fly(plane({x:0,y:25,z:90},{speed:15,airspeed:15}),{throttle:.8,lift:.3,side:.35},2,{},.05),second=fly(plane({x:0,y:25,z:90},{speed:15,airspeed:15}),{throttle:.8,lift:.3,side:.35},2,{},.1);
 for(const axis of ['x','y','z'])assert.ok(Math.abs(first.position[axis]-second.position[axis])<1e-6);
 const corrupt=stepAircraftFlight({position:{x:NaN,y:Infinity,z:-Infinity},rotation:{y:NaN},flight:{speed:NaN,pitch:Infinity}}, {throttle:NaN,side:Infinity,lift:NaN},Infinity);for(const value of [...Object.values(corrupt.position),...Object.values(corrupt.rotation)])assert.ok(Number.isFinite(value));
});
