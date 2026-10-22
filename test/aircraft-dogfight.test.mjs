import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {aircraftRayDistance,aircraftAimTarget} from '../public/js/aircraft-combat.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
test('aircraft targeting covers wings, rotated hulls, misses, and nearest live targets',()=>{
 const plane={id:'target',modelId:'corsair-aircraft',active:true,health:400,position:{x:0,y:20,z:-90},rotation:{y:Math.PI/2}};
 assert.ok(aircraftRayDistance(plane,{x:0,y:21,z:0},[0,0,-1])>80);
 assert.equal(aircraftRayDistance(plane,{x:20,y:21,z:0},[0,0,-1]),null);
 assert.equal(aircraftAimTarget({plane},'self',{x:0,y:21,z:0},[0,0,-1]).aircraft.id,'target');
 assert.equal(aircraftAimTarget({plane:{...plane,active:false}},'self',{x:0,y:21,z:0},[0,0,-1]),null);
});
test('live pilots exchange consecutive cannon fire, share damage, respect cover and recover after a shot-down',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'dogfight-'));t.after(()=>rm(dir,{recursive:true,force:true}));const world=airportWorld();world.builderScene.objects.find(object=>object.id==='airport-flight-2').modelId='corsair-aircraft';const store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,request=0,charges=0;const runtime=new AuthoritativeRooms({store,now:()=>now,charge:async()=>charges++});
 const alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}};
 const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'dogfight-'+ ++request,...fields});
 await send(alice,'join');await send(bob,'join');await send(alice,'map-access',{entityId:'airport-flight-1'});await send(bob,'map-access',{entityId:'airport-flight-2'});
 await store.update(world.id,room=>{for(const [id,who,z,yaw]of [['airport-flight-1','alice',50,0],['airport-flight-2','bob',-50,Math.PI]]){const plane=room.simulation.actors[id];plane.position={x:40,y:25,z};plane.rotation.y=yaw;plane.flight={airborne:true,altitude:25,speed:16,airspeed:16,throttle:1,throttleCommand:1,pitch:0,bank:0,phase:'cruise'};room.simulation.players['account:'+who].position={...plane.position};}});
 let state=await send(alice,'fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.result.hitId,'airport-flight-2');assert.equal(state.result.targetType,'aircraft');assert.equal(state.actors['airport-flight-2'].health,350);assert.equal(state.players['account:bob'].health,100,'hull shields the pilot');assert.equal(state.result.origin.y,26);assert.equal(charges,0,'built-in cannon requires no separately purchased weapon');
 state=await send(alice,'fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.result.hitId,'airport-flight-2');assert.equal(state.actors['airport-flight-2'].health,300,'consecutive cannon input fires without a laser cooldown');assert.equal(charges,0,'consecutive cannon shots remain included with the aircraft');
 state=await send(bob,'fire',{tool:'laser',direction:[0,0,1]});assert.equal(state.actors['airport-flight-1'].health,350);assert.ok(state.events.filter(event=>event.action==='fire').length>=2,'both pilots receive shared tracers');
 await store.update(world.id,room=>{room.simulation.actors['airport-flight-1'].rotation.y=Math.PI/2;});now+=250;state=await send(alice,'fire',{tool:'laser',direction:[1,0,0]});assert.equal(state.result.hitId,null);assert.equal(state.actors['airport-flight-2'].health,300);
 await store.update(world.id,room=>{room.simulation.actors['airport-flight-1'].rotation.y=0;room.simulation.actors['airport-flight-1'].position.x=40;});
 for(let i=0;i<6;i++){now+=250;state=await send(alice,'fire',{tool:'laser',direction:[0,0,-1]});}
 assert.equal(state.actors['airport-flight-2'].active,false);assert.equal(state.actors['airport-flight-2'].health,0);assert.equal(state.players['account:bob'].vehicleId,null);assert.equal(state.players['account:bob'].health,0);assert.ok(state.players['account:bob'].position.y>=0);assert.equal(state.players['account:alice'].combat.playerKills,1);
 await send(bob,'respawn');now+=15001;state=await send(alice,'join');assert.equal(state.actors['airport-flight-2'].active,true);assert.equal(state.actors['airport-flight-2'].health,400);assert.equal(state.actors['airport-flight-2'].position.z,62);
 // A brick wall protects an occupied plane; player-built cover participates too.
 await store.update(world.id,room=>{Object.assign(room.simulation.actors['airport-flight-1'],{position:{x:-18,y:.4,z:62},flight:{airborne:false,speed:0}});});await send(alice,'map-access',{entityId:'airport-flight-1'});await send(bob,'join');await send(bob,'map-access',{entityId:'airport-flight-2'});
 await store.update(world.id,room=>{room.simulation.actors['airport-flight-1'].position={x:40,y:25,z:50};room.simulation.players['account:alice'].position={x:40,y:25,z:50};room.simulation.actors['airport-flight-2'].position={x:40,y:25,z:-50};room.simulation.players['account:bob'].position={x:40,y:25,z:-50};room.objects.cover={id:'cover',position:[40,26,0],rotation:[0,0,0],scale:[10,10,10],materialId:'brick',paint:[1,1,1,1,1,1]};});
 now+=250;state=await send(alice,'fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.actors['airport-flight-2'].health,400,'cover prevents aircraft damage');
 await store.update(world.id,room=>{delete room.objects.cover;const player=room.simulation.players['account:alice'];player.vehicleId=null;player.position={x:40,y:.02,z:-30};room.simulation.actors['airport-flight-1'].holderId=null;const plane=room.simulation.actors['airport-flight-2'];plane.position={x:40,y:.4,z:-50};plane.flight={speed:0,airborne:false,phase:'parked'};room.simulation.players['account:bob'].position={...plane.position};});
 now+=250;state=await send(alice,'fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.result.hitId,'airport-flight-2');assert.equal(state.actors['airport-flight-2'].health,350,'ground weapons also damage occupied aircraft');
});
