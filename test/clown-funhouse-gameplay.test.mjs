import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';
import {funhouseCommand,stepFunhouse,playerFunhouseView,FUNHOUSE_ROUND_MS,FUNHOUSE_SHOT_MS} from '../server-clown-funhouse.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const station=kind=>FUNHOUSE_STATIONS.find(value=>value.kind===kind);
const world={id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',game:'funhouse',proceduralLand:true,spawn:{x:0,y:.02,z:48},builderScene:{version:3,layout:'grand-floor',mapSize:120,objects:[],layoutMeta:{locations:[]},gameplay:{radTox:false}},streets:[]};
function fixture(kind='water'){
 const player={actorId:'tester',username:'Tester',health:100,lastSeen:100000,score:0,grounded:true,position:{...station(kind).position}};
 const sim={players:{tester:player},actors:{},events:[]};let now=100000;
 const send=(action,fields={},at)=>{now=at??now+FUNHOUSE_SHOT_MS;player.lastSeen=now;return funhouseCommand(sim,player,world,{action,...fields},now,{integer:()=>0});};
 return {player,sim,send,move:kind=>{player.position={...station(kind).position};},step:at=>{now=at;player.lastSeen=at;stepFunhouse(sim,world,at);},get now(){return now;}};
}

test('funhouse interactions reject another map, remote stations, invalid target and forged costume values',()=>{
 const f=fixture(),water=station('water');
 assert.throws(()=>funhouseCommand(f.sim,f.player,{id:'other'}, {action:'funhouse-start',stationId:water.id},f.now),/Visit Midnight/);
 f.move('welcome');assert.throws(()=>f.send('funhouse-start',{stationId:water.id}),/Walk closer/);
 f.move('water');const result=f.send('funhouse-start',{stationId:water.id}),round=result.funhouse.round;
 assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:'0'}),/six clown targets/);
 assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:6}),/six clown targets/);
 assert.throws(()=>f.send('funhouse-squirt',{roundId:'stale',targetId:0}),/fresh water-gun/);
 assert.throws(()=>f.send('funhouse-start',{stationId:water.id}),/current water round/);
 f.move('dressup');assert.throws(()=>f.send('funhouse-dress',{hat:'yes',shoes:true}),/Choose whether/);
});

test('water rounds use server targets and refill timing, score once at the deadline and persist personal best',()=>{
 const f=fixture();const round=f.send('funhouse-start',{stationId:station('water').id}).funhouse.round;
 f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId,score:999999,rewardMzk:999999},f.now+300);
 assert.equal(round.score,10);assert.equal(f.player.score,0,'points settle when the round ends');
 assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId},f.now+100),/refill/);
 f.send('funhouse-squirt',{roundId:round.id,targetId:(round.targetId+1)%6},f.now+300);
 assert.equal(round.hits,1);assert.equal(round.shots,2);
 for(let i=0;i<2;i++)f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId});
 assert.equal(round.score,30);assert.equal(round.hits,3);
 f.step(round.endsAt);assert.equal(round.status,'complete');assert.equal(f.player.score,30);assert.equal(f.player.funhouse.bestScore,30);assert.equal(f.player.funhouse.rounds,1);
 assert.deepEqual(f.player.funhouse.stamps,[station('water').id]);
 f.step(round.endsAt+1000);assert.equal(f.player.score,30);assert.equal(f.player.funhouse.rounds,1);
 assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:0}),/has ended/);
 const next=f.send('funhouse-start',{stationId:station('water').id}).funhouse.round;f.send('funhouse-squirt',{roundId:next.id,targetId:next.targetId});f.step(next.endsAt);
 assert.equal(f.player.score,40);assert.equal(f.player.funhouse.bestScore,30);assert.equal(f.player.funhouse.stamps.length,1);
});

test('travel and stale presence cancel water rounds without points or stamps',()=>{
 for(const kind of ['travel','disconnect']){
  const f=fixture(),round=f.send('funhouse-start',{stationId:station('water').id}).funhouse.round;
  f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId});
  if(kind==='travel')f.move('welcome');else f.player.lastSeen=round.startedAt;
  stepFunhouse(f.sim,world,round.startedAt+FUNHOUSE_ROUND_MS);
  assert.equal(round.status,'cancelled');assert.equal(f.player.score,0);assert.equal(f.player.funhouse.rounds,0);assert.deepEqual(f.player.funhouse.stamps,[]);
 }
});

test('six attraction stamps require gallery precision, actual costumes and the remote maze exit',()=>{
 const f=fixture('dressup');f.send('funhouse-dress',{hat:true,shoes:false});assert.equal(f.player.funhouse.stamps.length,0);
 f.send('funhouse-dress',{hat:true,shoes:true});assert.deepEqual(f.player.funhouse.costume,{hat:true,shoes:true});
 f.send('funhouse-dress',{hat:false,shoes:false});assert.equal(f.player.funhouse.stamps.length,1,'earned costume stamp survives removing gear');
 f.move('maze-finish');assert.throws(()=>f.send('funhouse-use',{stationId:station('maze-finish').id}),/Begin at/);
 f.move('mirrors');f.send('funhouse-use',{stationId:station('mirrors').id});
 assert.throws(()=>f.send('funhouse-use',{stationId:station('maze-finish').id}),/Walk closer/);
 f.move('maze-finish');assert.throws(()=>f.send('funhouse-use',{stationId:station('maze-finish').id}),/Follow the mirror/);
 f.send('funhouse-use',{stationId:station('maze-finish').id},f.now+5000);
 for(const kind of ['car','spinner','jackbox']){f.move(kind);f.send('funhouse-use',{stationId:station(kind).id});assert.throws(()=>f.send('funhouse-use',{stationId:station(kind).id}),/still playing/);}
 assert.equal(f.player.funhouse.stamps.length,5);
 f.move('water');const round=f.send('funhouse-start',{stationId:station('water').id}).funhouse.round;
 for(let i=0;i<3;i++)f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId});f.step(round.endsAt);
 assert.equal(f.player.funhouse.stamps.length,6);
 const projected=playerFunhouseView(f.player);projected.costume.hat=true;projected.stamps.push('forged');assert.equal(f.player.funhouse.costume.hat,false);assert.equal(f.player.funhouse.stamps.length,6);
});

test('authoritative shared-room commands project progress, keep free attractions free and deduplicate retries',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0,charges=0;const store=new SharedRoomStore(join(directory,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>now,charge:()=>{charges++;throw new Error('Free attraction tried to charge.');}}),identity={accountId:'funhouse-visitor',username:'Visitor'};
 const send=(action,fields={},at)=>{now=at??now+300;return runtime.command(FUNHOUSE_ID,world,identity,{action,requestId:'funhouse-command-'+ ++request,...fields});};
 let state=await send('join');const self=state.selfId;
 assert.equal(state.radTox,null);assert.equal(state.match,null);assert.equal(state.players[self].radToxEnabled,false);
 assert.ok(!Object.values(state.actors).some(actor=>actor.loot||actor.runtimeMachine||actor.roadFleet));
 await send('map-access',{position:station('dressup').position});
 state=await send('funhouse-dress',{hat:true,shoes:true,requestId:'costume-retry'});assert.equal(state.players[self].funhouse.stamps.length,1);
 const repeat=await send('funhouse-dress',{hat:true,shoes:true,requestId:'costume-retry'});assert.equal(repeat.players[self].funhouse.stamps.length,1);
 await send('map-access',{position:station('water').position});state=await send('funhouse-start',{stationId:station('water').id});let round=state.players[self].funhouse.round;
 const shotId='squirt-retry',targetId=round.targetId;state=await send('funhouse-squirt',{roundId:round.id,targetId,requestId:shotId});
 const replay=await send('funhouse-squirt',{roundId:round.id,targetId,requestId:shotId});assert.equal(replay.players[self].funhouse.round.hits,1);assert.equal(replay.players[self].funhouse.round.shots,1);
 for(let at=now+5000;at<round.endsAt;at+=5000)await send('input',{input:{}},at);state=await send('input',{input:{}},round.endsAt+1000);await store.flush();assert.equal(state.players[self].funhouse.round.status,'complete');assert.equal(state.players[self].score,10);assert.equal(charges,0);
 const reopened=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now});
 state=await reopened.command(FUNHOUSE_ID,world,identity,{action:'join',requestId:'reopened-room'});assert.deepEqual(state.players[self].funhouse.costume,{hat:true,shoes:true});assert.equal(state.players[self].funhouse.bestScore,10);
});

test('fresh input resumes walking after a long pause but cancels the old water round before renewing presence',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-pause-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;const store=new SharedRoomStore(join(directory,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'paused-visitor',username:'Paused Visitor'};
 const send=(action,fields={},at)=>{now=at??now+300;return runtime.command(FUNHOUSE_ID,world,identity,{action,requestId:'paused-command-'+ ++request,...fields});};
 const joined=await send('join'),self=joined.selfId;
 await send('map-access',{position:station('water').position});
 let state=await send('funhouse-start',{stationId:station('water').id});
 for(let i=0;i<3;i++){const round=state.players[self].funhouse.round;state=await send('funhouse-squirt',{roundId:round.id,targetId:round.targetId});}
 assert.equal(state.players[self].funhouse.round.score,30);
 const epoch=state.inputEpoch,before={...state.players[self].position};
 // No heartbeat or simulation tick occurs while the tab is suspended. This
 // fresh input is accepted by presence recovery after the round's deadline.
 now=state.players[self].funhouse.round.endsAt+16000;
 state=await send('input',{input:{forward:1,yaw:0},inputEpoch:epoch,inputSequence:1},now);
 assert.equal(state.players[self].funhouse.round.status,'cancelled');
 assert.equal(state.players[self].score,0);assert.equal(state.players[self].funhouse.rounds,0);assert.deepEqual(state.players[self].funhouse.stamps,[]);
 assert.equal(state.players[self].input.forward,1,'fresh walking controls are still accepted');
 assert.equal((await store.get(FUNHOUSE_ID)).simulation.players[self].lastSeen,now,'presence renews after cancelling the stale round');
 state=await send('input',{input:{forward:1,yaw:0},inputEpoch:epoch,inputSequence:2},now+100);
 assert.ok(Math.hypot(state.players[self].position.x-before.x,state.players[self].position.z-before.z)>.05,'walking resumes normally');
});
