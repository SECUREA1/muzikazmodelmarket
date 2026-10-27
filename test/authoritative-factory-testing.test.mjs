import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {COMPOUND_ID,PROVING_ID,COMPOUND_GATE} from '../public/js/factory-test-config.js';

const identity={accountId:'testing-member',walletId:'account:testing-member',username:'Operator'};
const map=(id,kind)=>({id,name:kind,game:kind==='compound'?'mountain-compound':'factory-proving',proceduralLand:true,playable:true,publicDestination:true,spawn:{x:0,y:.02,z:35},factoryTesting:{enabled:true,kind},builderScene:{version:3,layout:'grand-floor',mapSize:160,objects:[],layoutMeta:{factoryTesting:{enabled:true,kind}},gameplay:{multiplayer:true,radTox:false}}});
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'testing-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=1000000,sequence=0,allowed=false,deep=false;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,testingAccess:async()=>{if(!allowed)throw Object.assign(Error('Compound clearance is locked.'),{statusCode:403});return {compound:true,deep};},testingState:async()=>({session:null,progress:{},eligibleItems:[{id:'private-owned-item'}],clearance:{compound:allowed,deep}}),testingAction:async(_identity,_sim,player,_environment,command)=>{if(command.action==='proving-deep-enter'){deep=true;player.testing.clearance.deep=true;return {testing:player.testing,destination:COMPOUND_ID,travel:{destination:COMPOUND_ID,position:COMPOUND_GATE.deepEntry}};}return {testing:player.testing,message:'Private item list remains private.'};}});
 const send=(environment,action,extra={})=>{now+=100;return runtime.command(environment.id,environment,identity,{action,requestId:'testing-'+ ++sequence,...extra});};
 return {store,runtime,send,allow:()=>{allowed=true;},deny:()=>{allowed=false;},get now(){return now;}};
}

test('compound join requires clearance before a player, old receipt or public map link can open it',async t=>{
 const f=await fixture(t),compound=map(COMPOUND_ID,'compound');
 await assert.rejects(f.send(compound,'join'),error=>error.statusCode===403);
 f.allow();const joined=await f.send(compound,'join',{requestId:'stable-compound-join'});f.deny();await assert.rejects(f.send(compound,'join',{requestId:'stable-compound-join'}),error=>error.statusCode===403);f.allow();assert.equal(joined.players[joined.selfId].testing.clearance.compound,true);
 assert.equal(joined.players[joined.selfId].testing.eligibleItems,undefined);
 assert.equal(joined.radTox,null);assert.ok(!Object.values(joined.actors).some(actor=>actor.loot||actor.roadFleet||actor.runtimeMachine));
});

test('deep compound rejects map jumps and constrains walking until the server grants puzzle clearance',async t=>{
 const f=await fixture(t),compound=map(COMPOUND_ID,'compound');f.allow();const joined=await f.send(compound,'join'),self=joined.selfId;
 await assert.rejects(f.send(compound,'map-access',{position:COMPOUND_GATE.deepEntry}),error=>error.statusCode===403&&error.code==='COMPOUND_DEEP_LOCKED');
 await f.store.update(COMPOUND_ID,room=>{const player=room.simulation.players[self];player.position={x:0,y:.02,z:-25.98};player.yaw=0;player.input={forward:1};player.lastSeen=f.now;});
 let view=await f.send(compound,'input',{input:{forward:1,yaw:0}});assert.ok(view.players[self].position.z>=COMPOUND_GATE.boundaryZ);
 view=await f.send(compound,'proving-deep-enter');assert.ok(view.players[self].position.z<COMPOUND_GATE.boundaryZ);assert.equal(view.result.destination,undefined,'same-map entry relocates rather than reloading the room');
 view=await f.send(compound,'map-access',{position:COMPOUND_GATE.deepEntry});assert.ok(view.players[self].position.z<COMPOUND_GATE.boundaryZ);
});

test('testing command events do not reveal the private Backpack list to other room participants',async t=>{
 const f=await fixture(t),range=map(PROVING_ID,'proving');const joined=await f.send(range,'join');
 const state=await f.send(range,'proving-status');assert.ok(state.result.testing.eligibleItems);
 assert.equal(state.players[joined.selfId].testing.eligibleItems,undefined);assert.equal(state.events.at(-1).testing.eligibleItems,undefined);
 const observer=await f.runtime.command(PROVING_ID,range,{...identity,accountId:'observer',walletId:'account:observer'},{action:'join',requestId:'observer-join'});
 assert.ok(observer.events.every(event=>!event.testing?.eligibleItems));
});
