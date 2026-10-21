import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {neonMarina} from '../neon-marina.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {watercraftOverlap} from '../public/js/harbor-water.js';
const marina=neonMarina(),world={id:'quality-marina',name:'Neon Marina',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor,locations:marina.locations},objects:marina.objects}};
test('two live helms share sailing, anchoring, mooring, service and safe pier exits',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'helm-live-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,request=0;const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}};const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'helm-'+ ++request,...fields}),boats=marina.objects.filter(o=>o.modelId==='harbor-skiff'||o.modelId==='harbor-sailboat');
 await send(alice,'join');await send(bob,'join');await send(alice,'map-access',{entityId:boats[0].id});await send(bob,'map-access',{entityId:boats[1].id});await assert.rejects(send(alice,'harbor-radio',{operation:'missing'}),/Choose/);
 let state;for(let i=0;i<12;i++){now+=100;await send(alice,'input',{input:{throttle:.8,anchor:false,forward:0}});state=await send(bob,'input',{input:{throttle:.8,anchor:false,sailTrim:.6,forward:0}});}
 assert.equal(Object.keys(state.players).length,2);for(const boat of boats.slice(0,2)){assert.ok(state.actors[boat.id].position.x>boat.position.x+1);assert.equal(state.actors[boat.id].position.y,0);assert.ok(state.actors[boat.id].boating.speedKnots>0);assert.ok(state.actors[boat.id].boating.fuel<100);assert.ok(state.actors[boat.id].boating.rpm>0);}
 await assert.rejects(send(alice,'interact'),/Slow or anchor/);
 for(let i=0;i<20;i++){now+=100;state=await send(alice,'input',{input:{anchor:true,throttle:0}});await send(bob,'input',{input:{anchor:true,throttle:0}});}
 assert.equal(state.actors[boats[0].id].boating.speed,0);state=await send(alice,'harbor-radio',{operation:'moor'});assert.match(state.result.message,/Moored/);assert.equal(state.actors[boats[0].id].position.x,boats[0].position.x);assert.equal(state.actors[boats[0].id].boating.anchor,true);
 await store.update(world.id,room=>{room.simulation.actors[boats[0].id].health=80;room.simulation.players['account:alice'].fuel=20;});state=await send(alice,'harbor-radio',{operation:'service'});assert.equal(state.actors[boats[0].id].health,200);assert.equal(state.players['account:alice'].fuel,100);
 state=await send(alice,'interact');assert.equal(state.players['account:alice'].vehicleId,null);assert.ok(state.players['account:alice'].position.y>=0,'exit lands on nearby real pier');assert.equal(state.actors[boats[0].id].boating.rpm,0);
 const room=await runtime.snapshot(world.id,world);assert.equal(room.players['account:bob'].vehicleId,boats[1].id);assert.equal(room.players['account:alice'].vehicleId,null);
});
test('oriented hull collision covers occupied vessels and rejects separated boats',()=>{assert.equal(watercraftOverlap({x:0,z:0},0,{x:1.5,z:0},0),true);assert.equal(watercraftOverlap({x:0,z:0},Math.PI/2,{x:3,z:0},0),true);assert.equal(watercraftOverlap({x:0,z:0},0,{x:5,z:0},0),false);});
