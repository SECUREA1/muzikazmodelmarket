import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {WalkingMotion} from '../public/js/walking-motion.js';

async function fixture(t,{scheduledInputs=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'scheduled-room-inputs-'));let now=100000,sequence=0,coins=0;const telemetry=[];
 const store=new SharedRoomStore(join(directory,'rooms.json')),environment={id:'scheduled',updatedAt:'v1',spawn:{x:0,y:0,z:2},builderScene:{layout:'grand-floor',mapSize:80,objects:[]}},identity={accountId:'alice',username:'Alice',walletId:'alice-wallet'};
 const runtime=new AuthoritativeRooms({store,now:()=>now,scheduledInputs,collectCoin:async()=>({id:'coin-'+ ++coins,balanceAfterMzk:2000+coins}),telemetry:async(_wallet,value)=>telemetry.push(value)});
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 let joined=await runtime.command(environment.id,environment,identity,{action:'join',requestId:'join',radToxEnabled:false});
 const send=packet=>runtime.command(environment.id,environment,identity,packet);
 return {store,runtime,environment,identity,telemetry,get joined(){return joined;},get now(){return now;},get coins(){return coins;},advance:ms=>{now+=ms;},input:(input={},extra={})=>send({action:'input',requestId:'input-'+ ++sequence+'-'+joined.inputEpoch,inputEpoch:joined.inputEpoch,inputSequence:sequence,input,...extra}),send,async frame(ms=50){now+=ms;await runtime.tickActive();},async rejoin(){joined=await send({action:'join',requestId:'rejoin-'+now,radToxEnabled:false});sequence=0;return joined;}};
}

test('scheduled input acknowledges controls while only 20 Hz frames advance continuous movement and NPC clocks',async t=>{
 const f=await fixture(t),id=f.joined.selfId,start={...f.joined.players[id].position},initial=(await f.store.get(f.environment.id)).simulation;
 assert.ok(Object.values(initial.actors).some(actor=>actor.resident));
 let previousSequence=f.joined.sequence;
 for(let tick=1;tick<=40;tick++){
  f.advance(25);const ack=await f.input({side:1,yaw:0});
  assert.equal(ack.simulationTime,100000+(tick-1)*50);assert.ok(ack.sequence>previousSequence);previousSequence=ack.sequence;
  assert.ok(Math.abs(ack.players[id].position.x-(start.x+(tick-1)*.2))<1e-6);
  await f.frame(25);
  const room=await f.store.get(f.environment.id);
  assert.equal(room.simulation.time,100000+tick*50);assert.ok(Math.abs(room.simulation.players[id].position.x-(start.x+tick*.2))<1e-6);
 }
 const final=(await f.store.get(f.environment.id)).simulation;
 assert.ok(final.residentUpdatedAt>initial.residentUpdatedAt,'resident updates continue independently of request acknowledgments');
 assert.ok(final.sequence>previousSequence);
});

test('default mode retains request-driven advancement for the existing API',async t=>{
 const f=await fixture(t,{scheduledInputs:false}),id=f.joined.selfId,start=f.joined.players[id].position.x;
 await f.input({side:1});f.advance(50);const next=await f.input({side:1});
 assert.equal(next.simulationTime,f.now);assert.ok(next.players[id].position.x>start+.1);
});

test('a quick jump press and release is consumed once by physics and cannot create an airborne extra jump',async t=>{
 const f=await fixture(t),id=f.joined.selfId,y=f.joined.players[id].position.y;
 f.advance(1);await f.input({jump:true});f.advance(9);await f.input({jump:false});
 let sim=(await f.store.get(f.environment.id)).simulation;assert.ok(sim.players[id].pendingJump);assert.equal(sim.time,100000);assert.equal(sim.players[id].position.y,y);
 await f.frame(40);sim=(await f.store.get(f.environment.id)).simulation;
 assert.equal(sim.players[id].pendingJump,undefined);assert.ok(sim.players[id].position.y>y+.1);assert.ok(sim.players[id].velocityY>0);assert.equal(sim.players[id].input.jump,false);
 f.advance(1);await f.input({jump:true});f.advance(1);await f.input({jump:false});
 assert.equal((await f.store.get(f.environment.id)).simulation.players[id].pendingJump,undefined,'an airborne press cannot buffer another jump');
 let airborne=true,landings=0,highest=sim.players[id].position.y;
 for(let tick=0;tick<30;tick++){
  await f.input({jump:false});await f.frame(tick===0?48:50);const p=(await f.store.get(f.environment.id)).simulation.players[id];
  highest=Math.max(highest,p.position.y);if(airborne&&p.grounded)landings++;airborne=!p.grounded;
 }
 const landed=(await f.store.get(f.environment.id)).simulation.players[id];assert.equal(landings,1);assert.equal(landed.grounded,true);assert.ok(highest>y+.5);assert.ok(Math.abs(landed.position.y-y)<1e-6);
});

test('join and input epoch rotation discard pending edges, and stale packets cannot replace current controls',async t=>{
 const f=await fixture(t),id=f.joined.selfId,oldEpoch=f.joined.inputEpoch;
 await f.input({jump:true});assert.ok((await f.store.get(f.environment.id)).simulation.players[id].pendingJump);
 const rejoined=await f.rejoin();assert.notEqual(rejoined.inputEpoch,oldEpoch);assert.equal((await f.store.get(f.environment.id)).simulation.players[id].pendingJump,undefined);
 await f.input({side:1});
 await f.send({action:'input',requestId:'old-epoch',inputEpoch:oldEpoch,inputSequence:999,input:{side:-1,jump:true}});
 const saved=(await f.store.get(f.environment.id)).simulation.players[id];assert.equal(saved.input.side,1);assert.equal(saved.pendingJump,undefined);assert.equal(saved.lastInputSequence,1);
});

test('legacy, changed-scene, attachment and overdue-frame inputs retain the full simulation path',async t=>{
 const f=await fixture(t);let steps=0;const step=f.runtime.step.bind(f.runtime);f.runtime.step=(...args)=>{steps++;return step(...args);};
 await f.input({side:1});assert.equal(steps,0);
 f.advance(50);await f.send({action:'input',requestId:'legacy',input:{side:1}});assert.equal(steps,1);
 f.environment.updatedAt='v2';await f.input({side:1});assert.equal(steps,2);
 await f.store.update(f.environment.id,room=>{room.revision++;},{persist:false,roomOnly:true});await f.input({side:1});assert.equal(steps,3);
 await f.store.update(f.environment.id,room=>{room.simulation.players[f.joined.selfId].heldId='removed-item';},{persist:false,roomOnly:true});await f.input({side:1});assert.equal(steps,4);
 f.advance(300);const recovered=await f.input({side:1});assert.equal(steps,5);assert.equal(recovered.simulationTime,f.now,'a paused scheduler recovers through the full path');
});

test('coin receipts, telemetry and queue failure isolation still run through the ordinary command handler',async t=>{
 const f=await fixture(t),id=f.joined.selfId;
 await f.store.update(f.environment.id,room=>{const coin=Object.values(room.simulation.actors).find(actor=>actor.loot?.currency==='MZK');assert.ok(coin);coin.position={...room.simulation.players[id].position};},{persist:false,roomOnly:true});
 const packet={action:'input',requestId:'coin-input',inputEpoch:f.joined.inputEpoch,inputSequence:1,input:{}};
 const pickup=await f.send(packet);assert.equal(pickup.result.loot.amount,1);assert.equal(f.coins,1);
 assert.deepEqual((await f.send(packet)).result,pickup.result);assert.equal(f.coins,1);
 await assert.rejects(f.send({...packet,requestId:'bad-sequence',inputSequence:-1}),{statusCode:422});
 assert.equal((await f.store.get(f.environment.id)).simulation.players[id].lastInputSequence,1);
 for(let tick=0;tick<105;tick++){await f.frame();await f.input({});}
 assert.ok(f.telemetry.length>=2,'periodic telemetry continues with scheduled input');
 const recovered=await f.input({side:1});assert.equal(recovered.players[id].input.side,1);
});

test('repeated frame acknowledgments do not rewind or pause local walking prediction',()=>{
 const motion=new WalkingMotion({immediate:true,staleAfter:Infinity,staleFade:0,maxDelta:.25}),target={x:0,z:0};
 motion.reconcile({x:0,z:0},{serverTime:100000,simulationTime:100000,sentAt:0,receivedAt:0});
 let previous=0;
 for(let frame=1;frame<=120;frame++){
  const now=frame*1000/60,source=Math.floor(now/50)*50;
  motion.reconcile({x:source*.004,z:0},{serverTime:100000+now,simulationTime:100000+source,sentAt:now,receivedAt:now});
  motion.sample(now,1/60,{side:1},4,target);
  assert.ok(Math.abs(target.x-previous-4/60)<1e-6,'render motion remains independent of repeated authoritative frame time');previous=target.x;
 }
 assert.ok(Math.abs(target.x-8)<1e-6);
});
