import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
test('mobile assisted flight uses real room collision, exclusive runway access and a safe cockpit exit',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'mobile-flight-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,request=0;const world=airportWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}};const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'mobile-'+ ++request,...fields});
 await send(alice,'join');await send(bob,'join');await store.update(world.id,room=>{room.simulation.players['account:alice'].position={x:-16,y:.4,z:62};});
 let state=await send(alice,'interact',{entityId:'airport-flight-1'});assert.equal(state.players['account:alice'].vehicleSeat,'cockpit');assert.equal(state.actors['airport-flight-1'].holderId,'account:alice');await assert.rejects(send(bob,'map-access',{entityId:'airport-flight-1'}),/Another player/);await send(bob,'map-access',{entityId:'airport-flight-2'});
 state=await send(alice,'aircraft-assist',{operation:'takeoff'});assert.equal(state.actors['airport-flight-1'].flight.assist,'takeoff');await assert.rejects(send(bob,'aircraft-assist',{operation:'takeoff'}),/Another pilot/);
 for(let i=0;i<140;i++){now+=100;state=await send(alice,'input',{input:{forward:0,side:0,lift:0}});if(!state.actors['airport-flight-1'].flight.assist)break;}
 assert.ok(state.actors['airport-flight-1'].flight.altitude>=14);assert.equal(state.actors['airport-flight-1'].flight.assist,null);await assert.rejects(send(alice,'interact'),/Land/);
 state=await send(alice,'aircraft-assist',{operation:'land'});assert.equal(state.actors['airport-flight-1'].flight.assist,'land');
 for(let i=0;i<1200;i++){now+=100;state=await send(alice,'input',{input:{forward:0,side:0,lift:0}});if(!state.actors['airport-flight-1'].flight.assist)break;}
 const plane=state.actors['airport-flight-1'];assert.equal(plane.active,true,JSON.stringify(plane));assert.equal(plane.flight.assist,null,JSON.stringify(plane));assert.equal(plane.flight.airborne,false);assert.ok(plane.flight.speed<.5);assert.ok(Math.abs(plane.position.x-21)<3);assert.equal(state.players['account:alice'].vehicleSeat,'cockpit');
 const before={...plane.position};state=await send(alice,'interact');assert.equal(state.players['account:alice'].vehicleId,null);assert.equal(state.players['account:alice'].vehicleSeat,null);assert.ok(Math.hypot(state.players['account:alice'].position.x-before.x,state.players['account:alice'].position.z-before.z)>=6);assert.ok(state.players['account:alice'].position.y>=0);assert.equal(state.actors['airport-flight-1'].flight.throttleCommand,0);assert.equal(state.actors['airport-flight-1'].holderId,null);
});
