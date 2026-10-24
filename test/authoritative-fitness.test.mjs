import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {grantFitnessReward,fitnessAccountState} from '../server-fitness.mjs';
import {FITNESS_ID,FITNESS_STATIONS,FITNESS_RESIDENTS,FITNESS_TRAINERS} from '../public/js/fitness-config.js';
import {FITNESS_GAMES} from '../public/js/fitness-rules.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'authoritative-fitness-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:fitness-player',identity={accountId:'fitness-player',username:'Gym Member',walletId:wallet};
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:100},items:[],memory:{},revision:0};return {};});
 let now=1000000,request=0;
 const makeRuntime=file=>new AuthoritativeRooms({store:new SharedRoomStore(join(directory,file)),now:()=>now,fitnessReward:(actor,result)=>grantFitnessReward(database,actor.walletId,result,{now}),fitnessState:actor=>fitnessAccountState(database,actor.walletId)});
 const runtime=makeRuntime('rooms.json'),world=fitnessWorld();
 const send=(action,fields={},at)=>{now=at??now+100;return runtime.command(FITNESS_ID,world,identity,{action,requestId:'gym-command-'+ ++request,...fields});};
 return {runtime,world,database,identity,wallet,send,makeRuntime,setNow:value=>now=value,get now(){return now;}};
}

test('authoritative gym joins with two trainers and workout members, keeps encounters off, and holds a training stance',async t=>{
 const f=await fixture(t),joined=await f.send('join'),selfId=joined.selfId;
 assert.equal(joined.radTox,null);assert.equal(joined.match,null);assert.equal(joined.players[selfId].radToxEnabled,false);
 const cast=Object.values(joined.actors).filter(actor=>actor.resident?.fitness);
 assert.equal(cast.length,FITNESS_RESIDENTS.length);assert.equal(cast.filter(actor=>actor.resident.duty==='trainer').length,FITNESS_TRAINERS.length);
 assert.ok(!Object.values(joined.actors).some(actor=>actor.radTox||actor.loot||actor.runtimeMachine||actor.roadFleet));
 const fired=await f.send('fire',{tool:'laser',direction:[0,1,0]});assert.equal(fired.result.tool,'laser');assert.equal(fired.radTox,null);assert.equal(fired.match,null);
 const station=FITNESS_STATIONS.find(place=>place.kind==='bench-press');
 const arrived=await f.send('map-access',{position:station.position});assert.ok(Math.hypot(arrived.players[selfId].position.x-station.position.x,arrived.players[selfId].position.z-station.position.z)<.1);
 let state=await f.send('fitness-start',{stationId:station.id}),position={...state.players[selfId].position};
 assert.equal(state.players[selfId].fitness.status,'countdown');
 state=await f.send('input',{input:{forward:1,side:1,yaw:0}},f.now+500);
 state=await f.send('input',{input:{forward:1,side:1,yaw:0}},f.now+500);
 assert.deepEqual(state.players[selfId].position,position,'training owns the stationary stance despite walking input');
 await f.send('fitness-cancel',{roundId:state.players[selfId].fitness.id});
 state=await f.send('input',{input:{forward:1,side:0,yaw:0}},f.now+100);
 state=await f.send('input',{input:{forward:0,side:0,yaw:0}},f.now+200);
 assert.ok(Math.hypot(state.players[selfId].position.x-position.x,state.players[selfId].position.z-position.z)>.05,'walking resumes after cancelling the set');
});

test('room-scored fitness rounds settle once into the wallet and restore progress in a fresh room',async t=>{
 const f=await fixture(t),joined=await f.send('join'),selfId=joined.selfId,station=FITNESS_STATIONS.find(place=>place.kind==='bench-press');
 await f.send('map-access',{position:station.position});
 let state=await f.send('fitness-start',{stationId:station.id}),round=state.players[selfId].fitness;
 await assert.rejects(f.send('fitness-finish',{roundId:round.id}),/Complete the set/);
 for(const [cueIndex,cue]of round.cues.entries())state=await f.send('fitness-input',{roundId:round.id,cueIndex,input:cue.input,score:999999,rewardMzk:999999},cue.at);
 assert.equal(state.players[selfId].fitness.score,1200);assert.equal(state.players[selfId].fitness.hits,12);
 state=await f.send('fitness-finish',{roundId:round.id},round.endsAt+10);
 const receipt=state.result.fitnessReceipt;
 assert.equal(receipt.amountMzk,FITNESS_GAMES[station.kind].rewardMzk);assert.equal(receipt.score,1200);assert.equal(state.players[selfId].fitness.settled,true);
 assert.equal(state.players[selfId].fitness.rewardReceipt,undefined,'shared workout snapshots omit the private wallet receipt');
 assert.equal(state.players[selfId].fitnessProgress.completedSets,1);assert.equal(state.players[selfId].fitnessProgress.skills.strength,12);
 const replay=await f.send('fitness-finish',{roundId:round.id});assert.equal(replay.result.fitnessReceipt.id,receipt.id);
 const saved=await fitnessAccountState(f.database,f.wallet);assert.equal(saved.balance,100+receipt.amountMzk);assert.equal(saved.history.length,1);assert.equal(saved.progress.completedSets,1);
 const restarted=f.makeRuntime('fresh-rooms.json');f.setNow(f.now+1000);
 const restored=await restarted.command(FITNESS_ID,f.world,f.identity,{action:'join',requestId:'restored-gym-join'});
 assert.equal(restored.players[selfId].fitnessProgress.completedSets,1);assert.equal(restored.players[selfId].fitnessProgress.totalEarnedMzk,receipt.amountMzk);assert.equal(restored.players[selfId].fitnessProgress.bestScores[station.id],1200);
});

test('local-map relocation cancels a live set before an MZK claim',async t=>{
 const f=await fixture(t);await f.send('join');const station=FITNESS_STATIONS.find(place=>place.kind==='bench-press');
 await f.send('map-access',{position:station.position});const started=await f.send('fitness-start',{stationId:station.id}),round=started.players[started.selfId].fitness;
 await f.send('map-access',{position:{x:0,y:0,z:20}});
 await assert.rejects(f.send('fitness-finish',{roundId:round.id}),/Cancelled sets/);
 const saved=await fitnessAccountState(f.database,f.wallet);assert.equal(saved.balance,100);assert.equal(saved.history.length,0);
});
