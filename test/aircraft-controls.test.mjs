import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
test('server shares engine, configuration and attitude telemetry and resolves a severe landing at safe ground',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'flight-controls-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,request=0;const world=airportWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),user={accountId:'pilot',username:'Pilot',stats:{health:100}};const send=(action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'controls-'+ ++request,...fields});
 await send('join');await send('map-access',{entityId:'airport-flight-1'});await send('airport-radio',{operation:'takeoff'});await store.update(world.id,room=>{const plane=room.simulation.actors['airport-flight-1'];plane.position={x:40,y:.4,z:65};room.simulation.players['account:pilot'].position={...plane.position};});
 let state;for(let i=0;i<30;i++){now+=100;state=await send('input',{input:{throttle:1,lift:1,gear:true,flaps:.3}});}
 let plane=state.actors['airport-flight-1'];assert.ok(plane.flight.altitude>8);assert.ok(plane.flight.rpm>2000);assert.equal(plane.flight.flaps,.3);assert.equal(plane.flight.gear,true);assert.ok(plane.flight.fuel<100);assert.ok(plane.flight.airspeed>7);assert.ok(plane.rotation.x>0);
 for(let i=0;i<5;i++){now+=100;state=await send('input',{input:{throttle:.8,lift:0,side:.4,gear:false,flaps:0}});}
 plane=state.actors['airport-flight-1'];assert.equal(plane.flight.gear,false);assert.ok(plane.flight.bank<0);assert.ok(plane.flight.heading>0);assert.equal(state.players['account:pilot'].vehicleId,plane.id);
 await store.update(world.id,room=>{const plane=room.simulation.actors['airport-flight-1'];plane.position={x:40,y:.65,z:20};plane.rotation={x:-.4,y:0,z:0};plane.health=20;plane.flight={speed:18,airspeed:18,pitch:-.4,gear:false,throttle:0,throttleCommand:0};const pilot=room.simulation.players['account:pilot'];pilot.position={...plane.position};pilot.input={lift:-1,gear:false};});
 now+=100;state=await send('input',{input:{lift:-1,gear:false}});assert.equal(state.actors['airport-flight-1'].active,false);assert.equal(state.players['account:pilot'].health,0);assert.equal(state.players['account:pilot'].vehicleId,null);assert.ok(state.players['account:pilot'].position.y>=0);assert.ok(Number.isFinite(state.players['account:pilot'].position.x));
});
