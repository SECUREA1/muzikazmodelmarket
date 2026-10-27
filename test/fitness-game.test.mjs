import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {fitnessCommand,fitnessIsTraining,stepFitness,fitnessView,grantFitnessReward,fitnessAccountState} from '../server-fitness.mjs';
import {FITNESS_ID,FITNESS_STATIONS,FITNESS_TRAINERS} from '../public/js/fitness-config.js';
import {FITNESS_GAMES,FITNESS_CUE_COUNT,FITNESS_DAILY_REWARD_CAP,fitnessInputPoints,fitnessRoundReward} from '../public/js/fitness-rules.js';

function fixture(index=0){
 let now=100000;const station=FITNESS_STATIONS[index],environment={id:FITNESS_ID},player={actorId:'account:alice',username:'Alice',position:{...station.position},health:100,grounded:true,lastSeen:now,input:{forward:1}},sim={players:{'account:alice':player}};
 const at=time=>{now=time;player.lastSeen=now;stepFitness(sim,environment,now);};
 const send=(action,fields={})=>fitnessCommand(sim,player,environment,{action,...fields},now,{integer:()=>0});
 function fullSet(){send('fitness-start',{stationId:station.id});const round=player.fitness;for(const [cueIndex,cue]of round.cues.entries()){at(cue.at);send('fitness-input',{roundId:round.id,cueIndex,input:cue.input});}at(round.endsAt);return send('fitness-finish',{roundId:round.id}).settlement;}
 return {sim,player,environment,station,send,at,fullSet,get now(){return now;}};
}
async function databaseFixture(t){const dir=await mkdtemp(join(tmpdir(),'fitness-rewards-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new UserJsonDatabase(join(dir,'users.json')),wallet='account:fitness-tester';await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:100},items:[],memory:{},revision:0};return {};});return {db,wallet};}
const resultFor=(station=FITNESS_STATIONS[0],now=1000000,score=1200)=>({roundId:randomUUID(),stationId:station.id,kind:station.kind,score,hits:Math.ceil(score/100),bestCombo:Math.ceil(score/100),startedAt:now-FITNESS_CUE_COUNT*FITNESS_GAMES[station.kind].intervalMs,endsAt:now,finishedAt:now});

test('fitness station starts require the correct map, physical proximity, hands free and a free station',()=>{
 const f=fixture();f.player.position.x+=20;
 assert.throws(()=>f.send('fitness-start',{stationId:f.station.id}),/Walk to/);
 f.player.position={...f.station.position};f.player.seatedId='seat';assert.throws(()=>f.send('fitness-start',{stationId:f.station.id}),/Stand on/);f.player.seatedId=null;
 assert.throws(()=>fitnessCommand(f.sim,f.player,{id:'other'},{action:'fitness-start',stationId:f.station.id},f.now),/inside the Fitness Centre/);
 f.send('fitness-start',{stationId:f.station.id});assert.equal(fitnessIsTraining(f.player),true);assert.deepEqual(f.player.input,{});assert.equal(f.player.fitness.cues.length,12);
 const bob={...f.player,actorId:'account:bob',fitness:null};f.sim.players[bob.actorId]=bob;
 assert.throws(()=>fitnessCommand(f.sim,bob,f.environment,{action:'fitness-start',stationId:f.station.id},f.now),/station is in use/);
 assert.equal(fitnessView(f.sim,f.now).stations[0].occupiedBy,f.player.actorId);
});

test('every gym skill has a playable timed input sequence with server computed score and reward',()=>{
 for(let index=0;index<FITNESS_STATIONS.length;index++){
  const f=fixture(index),result=f.fullSet();assert.equal(result.score,1200,f.station.id);assert.equal(result.hits,12);assert.equal(f.player.fitness.status,'complete');assert.equal(f.player.fitness.medal,'Gold');assert.equal(f.player.fitness.rewardMzk,FITNESS_GAMES[f.station.kind].rewardMzk);assert.equal(fitnessIsTraining(f.player),false);assert.equal(f.player.score,1200);
  if(f.station.kind==='rowing')assert.deepEqual(f.player.fitness.cues.slice(0,4).map(cue=>cue.input),['pull','recover','pull','recover']);
 }
});

test('server timing rejects future cues and repeat attempts; forged scores and client timestamps have no effect',()=>{
 const f=fixture();f.send('fitness-start',{stationId:f.station.id});const round=f.player.fitness,first=round.cues[0];
 assert.throws(()=>f.send('fitness-input',{roundId:round.id,cueIndex:0,input:first.input}),/countdown/);
 f.at(round.startedAt);assert.throws(()=>f.send('fitness-input',{roundId:round.id,cueIndex:5,input:first.input,at:round.cues[5].at,score:999999}),/not current/);
 f.at(first.at);f.send('fitness-input',{roundId:round.id,cueIndex:0,input:'cross',score:999999,timestamp:first.at});assert.equal(round.score,0);assert.equal(round.hits,0);
 assert.throws(()=>f.send('fitness-input',{roundId:round.id,cueIndex:0,input:first.input}),/already been judged/);
 f.at(round.cues[1].at+250);f.send('fitness-input',{roundId:round.id,cueIndex:1,input:round.cues[1].input,score:999999,at:round.cues[1].at});assert.equal(round.score,70);
 assert.throws(()=>f.send('fitness-finish',{roundId:round.id}),/Complete the set/);
 f.at(round.endsAt);const result=f.send('fitness-finish',{roundId:round.id,score:1200,rewardMzk:9000});assert.equal(result.settlement.score,70);assert.equal(round.rewardMzk,0);assert.equal(round.misses,11);
 assert.equal(fitnessInputPoints(0,400),100);assert.equal(fitnessInputPoints(300,400),40);assert.equal(fitnessInputPoints(401,400),0);
});

test('missed cues break combos, and movement, relocation, disconnect, travel or death cancel unpaid sets',()=>{
 const f=fixture();f.send('fitness-start',{stationId:f.station.id});const round=f.player.fitness;
 for(const cueIndex of [0,2]){f.at(round.cues[cueIndex].at);f.send('fitness-input',{roundId:round.id,cueIndex,input:round.cues[cueIndex].input});}
 assert.equal(round.combo,1);assert.equal(round.bestCombo,1);
 const mutations=[player=>player.position.x+=2,player=>player.movementRevision=1,player=>player.health=0,player=>player.replacedByRoom='other',player=>player.vehicleId='vehicle',player=>player.lastSeen-=16000];
 for(const mutate of mutations){const gym=fixture();gym.send('fitness-start',{stationId:gym.station.id});mutate(gym.player);stepFitness(gym.sim,gym.environment,gym.now);assert.equal(gym.player.fitness.status,'cancelled');assert.equal(gym.player.fitness.rewardMzk,0);assert.throws(()=>gym.send('fitness-finish',{roundId:gym.player.fitness.id}),/Cancelled sets/);}
 const completed=fixture();completed.fullSet();completed.player.position.x+=2;stepFitness(completed.sim,completed.environment,completed.now);assert.equal(completed.player.fitness.status,'cancelled');assert.throws(()=>completed.send('fitness-finish',{roundId:completed.player.fitness.id}),/Cancelled sets/);
});

test('both trainers require proximity and offer their distinct station circuits',()=>{
 const f=fixture();for(const trainer of FITNESS_TRAINERS){assert.throws(()=>f.send('fitness-trainer',{trainerId:trainer.id}),/Walk closer/);f.player.position={...trainer.position};const result=f.send('fitness-trainer',{trainerId:trainer.id});assert.equal(result.fitnessCoach.name,trainer.name);assert.equal(result.fitnessCoach.stationIds.length,trainer.specialties.length);f.player.position={...f.station.position};}
});

test('fitness MZK settles atomically once, survives restart, and cannot be reclaimed by another wallet',async t=>{
 const {db,wallet}=await databaseFixture(t),result=resultFor(),input={...result,rewardMzk:900000,payoutMzk:900000};
 const [one,two]=await Promise.all([grantFitnessReward(db,wallet,input,{now:result.endsAt}),grantFitnessReward(db,wallet,input,{now:result.endsAt})]);assert.deepEqual(one,two);assert.equal(one.amountMzk,35);assert.equal(one.balanceAfterMzk,135);assert.equal((await db.read()).transactions.filter(row=>row.type==='FITNESS_REWARD').length,1);
 const restored=new UserJsonDatabase(db.file);assert.deepEqual(await grantFitnessReward(restored,wallet,input,{now:result.endsAt+30000}),one);
 await assert.rejects(grantFitnessReward(restored,'account:other',input,{now:result.endsAt+30000}),/already been settled/);
 await assert.rejects(grantFitnessReward(restored,wallet,{...input,score:1100},{now:result.endsAt+30000}),/already been settled/);
 const state=await fitnessAccountState(restored,wallet);assert.equal(state.balance,135);assert.equal(state.progress.completedSets,1);assert.equal(state.progress.bestScores[result.stationId],1200);assert.equal(state.history.length,1);
});

test('durable cooldown and daily ceiling limit awards across reconnects; UTC day reset permits rewards again',async t=>{
 const {db,wallet}=await databaseFixture(t);let now=Date.parse('2026-10-23T12:00:00Z'),first=resultFor(FITNESS_STATIONS[0],now);
 await grantFitnessReward(db,wallet,first,{now});const quick=resultFor(FITNESS_STATIONS[0],now+1000),cooldown=await grantFitnessReward(new UserJsonDatabase(db.file),wallet,quick,{now:now+1000});assert.equal(cooldown.amountMzk,0);assert.match(cooldown.message,/shortly/);
 for(let i=0;i<10;i++){now+=30000;await grantFitnessReward(db,wallet,resultFor(FITNESS_STATIONS[0],now),{now});}
 let state=await fitnessAccountState(db,wallet);assert.equal(state.balance,100+FITNESS_DAILY_REWARD_CAP);assert.equal(state.progress.dailyEarnedMzk,300);
 const capped=await grantFitnessReward(db,wallet,resultFor(FITNESS_STATIONS[0],now+30000),{now:now+30000});assert.equal(capped.amountMzk,0);assert.match(capped.message,/300 MZK/);
 now=Date.parse('2026-10-24T00:01:00Z');const next=await grantFitnessReward(db,wallet,resultFor(FITNESS_STATIONS[0],now),{now});assert.equal(next.amountMzk,35);assert.equal(next.progress.dailyEarnedMzk,35);state=await fitnessAccountState(db,wallet);assert.equal(state.progress.totalEarnedMzk,335);
});

test('trainer circuit badges use durable server results and malformed or low scores do not grant rewards',async t=>{
 const {db,wallet}=await databaseFixture(t);let now=1000000;
 for(let index=0;index<FITNESS_STATIONS.length;index++){now+=30000;const result=fixture(index).fullSet();await grantFitnessReward(db,wallet,result,{now});}
 const state=await fitnessAccountState(db,wallet);assert.equal(state.progress.badges.length,FITNESS_TRAINERS.length);assert.equal(state.progress.completedSets,FITNESS_STATIONS.length);
 const low=resultFor(FITNESS_STATIONS[0],now+30000,400),practice=await grantFitnessReward(db,wallet,low,{now:now+30000});assert.equal(practice.amountMzk,0);assert.equal(practice.medal,'Practice');assert.equal(fitnessRoundReward('boxing',479),0);
 const before=await db.read();for(const change of [{score:999999},{hits:0},{bestCombo:13},{startedAt:now},{kind:'fake'},{roundId:'invented'},{finishedAt:now+60000}])await assert.rejects(async()=>grantFitnessReward(db,wallet,{...resultFor(FITNESS_STATIONS[0],now+30000),...change},{now:now+30000}),/Invalid authoritative fitness result/);assert.deepEqual(await db.read(),before);
});
