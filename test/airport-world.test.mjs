import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {isAircraft,stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
test('airport is a permanent public destination with renderable brick construction, facilities and five flyable aircraft',async t=>{
 const world=airportWorld(),rows=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));assert.deepEqual(rows.find(item=>item.id===world.id),world);assert.equal(world.builderScene.objects.filter(isAircraft).length,5);assert.ok(world.builderScene.objects.length>150);assert.equal(new Set(world.builderScene.objects.map(o=>o.id)).size,world.builderScene.objects.length);
 for(const id of new Set(world.builderScene.objects.map(o=>o.modelId))){const model=createBuilderModel(id);assert.ok(model,id);model.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
 const dir=await mkdtemp(join(tmpdir(),'airport-list-'));t.after(()=>rm(dir,{recursive:true,force:true}));const result=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);const listed=result.environments.find(map=>map.id===world.id);assert.ok(listed?.permanent);assert.equal(listed.visibility,'public');assert.ok(listed.travelPortals.length>=2);assert.equal(listed.streets.length,3,'the cargo connector joins the access road and parks west of the runway');
 for(const street of listed.streets)assert.ok(Math.max(street.from.x,street.to.x)+street.width/2<32,'authored roads remain west of the main runway');
 assert.ok(listed.portalTargets.includes('hormuz-shipping'),'the cargo terminal is linked to the hosted Strait network');
});
test('flight physics needs forward speed and clearance, supports steering/climb/descent and bounds',()=>{
 const plane={position:{x:40,y:.4,z:60},rotation:{y:0}};
 let pose=stepAircraftFlight(plane,{forward:1,lift:1},.25,{cleared:false});assert.equal(pose.position.y,.4);
 for(let i=0;i<20;i++){Object.assign(plane,stepAircraftFlight(plane,{forward:1,lift:1},.1));}assert.ok(plane.position.y>5);assert.ok(plane.flight.speed>6);
 const lower=stepAircraftFlight(plane,{forward:.5,lift:-1,side:1},.1);assert.ok(lower.position.y<plane.position.y);assert.notEqual(lower.rotation.y,plane.rotation.y);
 const blocked=stepAircraftFlight(plane,{forward:1},.1,{blocked:()=>true});assert.equal(blocked.flight.phase,'hold');assert.equal(blocked.flight.speed,0);
});
test('shared airport supports boarding, exclusive ATC clearance, taxi/takeoff, landing, services and exits',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'airport-flight-'));t.after(()=>rm(dir,{recursive:true,force:true}));const world=airportWorld(),store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,count=0;const runtime=new AuthoritativeRooms({store,now:()=>now}),alice={accountId:'pilot',walletId:'pilot',username:'Pilot',stats:{health:100}},bob={accountId:'other',walletId:'other',username:'Other',stats:{health:100}};
 const send=(identity,action,fields={})=>runtime.command(world.id,world,identity,{action,requestId:'airport-'+ ++count,...fields});await send(alice,'join');await send(bob,'join');
 async function board(identity,id){const plane=world.builderScene.objects.find(o=>o.id===id);await store.update(world.id,room=>{room.simulation.players['account:'+identity.accountId].position={...plane.position,x:plane.position.x+2};});return send(identity,'interact',{entityId:id});}
 let state=await board(alice,'airport-flight-1');await board(bob,'airport-flight-2');assert.equal(state.players['account:pilot'].vehicleId,'airport-flight-1');
 state=await send(alice,'airport-radio',{operation:'takeoff'});assert.match(state.result.message,/Cleared for takeoff/);state=await send(bob,'airport-radio',{operation:'takeoff'});assert.match(state.result.message,/Hold position/);
 now+=100;await send(alice,'input',{input:{forward:0}});state=await send(bob,'airport-radio',{operation:'takeoff'});assert.match(state.result.message,/Hold position/,'clearance persists while parked before taxi');
 await store.update(world.id,room=>{const plane=room.simulation.actors['airport-flight-1'];plane.position={x:40,y:.5,z:65};plane.rotation.y=0;room.simulation.players['account:pilot'].position={...plane.position};});
 for(let i=0;i<30;i++){now+=100;state=await send(alice,'input',{input:{forward:1,lift:1}});}
 assert.ok(state.actors['airport-flight-1'].flight.altitude>8);assert.ok(state.players['account:pilot'].position.y>8);
 await assert.rejects(send(alice,'interact'),/Land the aircraft/);
 state=await send(bob,'airport-radio',{operation:'takeoff'});assert.match(state.result.message,/Cleared for takeoff/);
 await store.update(world.id,room=>{const plane=room.simulation.actors['airport-flight-2'];plane.position={x:40,y:.5,z:65};plane.rotation.y=0;room.simulation.players['account:other'].position={...plane.position};});
 for(let i=0;i<25;i++){now+=100;await send(alice,'input',{input:{forward:1,lift:1}});state=await send(bob,'input',{input:{forward:1,lift:1}});}
 assert.ok(state.actors['airport-flight-1'].flight.airborne);assert.ok(state.actors['airport-flight-2'].flight.airborne,'two pilots fly concurrently');assert.equal(Object.keys(state.players).length,2);
 state=await send(alice,'airport-radio',{operation:'landing'});assert.match(state.result.message,/Hold position/,'landing waits while the second departure is still low over the runway');
 for(let i=0;i<20;i++){now+=100;await send(alice,'input',{input:{forward:1,lift:1}});state=await send(bob,'input',{input:{forward:1,lift:1}});}
 state=await send(alice,'airport-radio',{operation:'landing'});assert.match(state.result.message,/Cleared to land/);
 for(let i=0;i<160&&state.actors['airport-flight-1'].flight.airborne;i++){now+=100;state=await send(alice,'input',{input:{forward:-1,lift:-1}});}
 assert.equal(state.actors['airport-flight-1'].flight.airborne,false);
 state=await send(alice,'airport-radio',{operation:'service'});assert.match(state.result.message,/refueled/);state=await send(alice,'interact');assert.equal(state.players['account:pilot'].vehicleId,null);
});
