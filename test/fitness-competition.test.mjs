import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FITNESS_ID,FITNESS_STATIONS,fitnessOpponents} from '../public/js/fitness-config.js';
import {FITNESS_GAMES,FITNESS_DAILY_REWARD_CAP} from '../public/js/fitness-rules.js';
import {fitnessCommand,stepFitness,fitnessCompetitionResult,grantFitnessReward,fitnessAccountState} from '../server-fitness.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';

const kinds=['boxing-sparring','basketball','table-tennis','sprint'];
function fixture(kind='boxing-sparring',{startAt=1000000}={}){
 let now=startAt;const station=FITNESS_STATIONS.find(item=>item.kind===kind),environment={id:FITNESS_ID,game:'fitness'},player={actorId:'account:athlete',username:'Athlete',position:{...station.position},health:100,grounded:true,lastSeen:now,input:{}},sim={actors:{},players:{'account:athlete':player}};
 const at=value=>{now=value;player.lastSeen=now;stepFitness(sim,environment,now);};
 const send=(action,fields={})=>fitnessCommand(sim,player,environment,{action,...fields},now,{integer:()=>0});
 function play(qualities=Array(12).fill(100),opponentId){
  send('fitness-start',{stationId:station.id,...(opponentId?{opponentId}:{})});const round=player.fitness;
  for(const [cueIndex,cue]of round.cues.entries()){const quality=qualities[cueIndex],offset=quality===40?Math.floor(round.windowMs*.85):quality===70?200:0;at(cue.at+offset);if(quality)send('fitness-input',{roundId:round.id,cueIndex,input:cue.input,score:999999,competition:{winner:'player',opponentPoints:0}});}
  const live=structuredClone(round.competition);at(round.endsAt);const result=send('fitness-finish',{roundId:round.id});return {round,settlement:result.settlement,live};
 }
 return {station,environment,player,sim,at,send,play,get now(){return now;}};
}
async function databaseFixture(t){const directory=await mkdtemp(join(tmpdir(),'fitness-competition-'));t.after(()=>rm(directory,{recursive:true,force:true}));const db=new UserJsonDatabase(join(directory,'users.json')),wallet='account:competition-tester';await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:100},items:[],memory:{},revision:0};return {};});return {db,wallet};}

test('competition selection is limited to the sport roster and copies server profiles',()=>{
 for(const kind of kinds){const f=fixture(kind),roster=fitnessOpponents(kind);assert.ok(roster.length>=2);assert.throws(()=>f.send('fitness-start',{stationId:f.station.id,opponentId:'invented-champion'}),{statusCode:422});assert.throws(()=>f.send('fitness-start',{stationId:f.station.id,opponentId:fitnessOpponents(kind==='sprint'?'basketball':'sprint')[0].id}),{statusCode:422});
  const chosen=roster.at(-1);f.send('fitness-start',{stationId:f.station.id,opponentId:chosen.id,accuracy:0,rating:0,competition:{opponent:{accuracy:0},winner:'player'}});const round=f.player.fitness;assert.deepEqual(round.competition.opponent,chosen);assert.notEqual(round.competition.opponent,chosen);assert.equal(round.competition.outcome,null);assert.equal(round.cues.length,12);assert.equal(round.competition.totalRounds,FITNESS_GAMES[kind].rounds);assert.equal(round.competition.exchangesPerRound,FITNESS_GAMES[kind].exchangesPerRound);
 }
 const defaultMatch=fixture();defaultMatch.send('fitness-start',{stationId:defaultMatch.station.id});assert.equal(defaultMatch.player.fitness.competition.opponent.id,fitnessOpponents('boxing-sparring')[0].id);
 const legacy=fixture('boxing');assert.throws(()=>legacy.send('fitness-start',{stationId:legacy.station.id,opponentId:fitnessOpponents('boxing-sparring')[0].id}),/no AI opponent/);legacy.send('fitness-start',{stationId:legacy.station.id});assert.equal(legacy.player.fitness.competition,undefined);
});

test('boxing has three judged rounds, and clean defences deny counters rather than just adding generic score',()=>{
 const f=fixture(),{round,settlement,live}=f.play(Array(12).fill(100),fitnessOpponents('boxing-sparring').at(-1).id),competition=round.competition;
 assert.deepEqual(round.cues.slice(0,4).map(cue=>cue.input),['jab','guard','cross','slip']);assert.deepEqual(round.cues.map(cue=>cue.roundNo),[1,1,1,1,2,2,2,2,3,3,3,3]);assert.equal(live.outcome,null,'judges wait for the scheduled end');assert.equal(competition.outcome,'win');assert.equal(competition.rounds.length,3);assert.deepEqual(competition.judges,{player:30,opponent:27});assert.equal(competition.playerPoints,30);assert.ok(competition.playerHealth<100);assert.ok(competition.opponentHealth<100);
 const openGuard=Array.from({length:12},(_,index)=>index%2===0?100:0),exposed=fitnessCompetitionResult('boxing-sparring',openGuard,competition.opponent.id);assert.ok(exposed.opponentPoints>competition.opponentPoints);assert.ok(exposed.playerHealth<competition.playerHealth);assert.ok(exposed.playerPoints<competition.playerPoints);
 assert.equal(settlement.score,1200);assert.equal(settlement.competition.qualities.length,12);assert.equal(round.rewardMzk,FITNESS_GAMES['boxing-sparring'].rewardMzk);
});

test('basketball requires two successful aim stages and a release for each of four scored shots',()=>{
 const f=fixture('basketball'),{round}=f.play(),competition=round.competition;assert.deepEqual(round.cues.slice(0,6).map(cue=>cue.input),['aim-left','aim-right','shoot','aim-right','aim-left','shoot']);assert.deepEqual(round.cues.slice(0,3).map(cue=>cue.stage),['aim','set','release']);assert.equal(competition.rounds.length,4);assert.equal(competition.totalShots,4);assert.equal(competition.playerPoints,10);assert.deepEqual(competition.shotResults.map(shot=>shot.points),[2,3,2,3]);
 const badAim=fixture('basketball').play(Array.from({length:12},(_,index)=>index%3===2?100:0)).round.competition;assert.equal(badAim.playerPoints,0);assert.ok(badAim.shotResults.every(shot=>!shot.made&&shot.releaseQuality===100));
 const profiles=fitnessOpponents('basketball'),rookie=fitnessCompetitionResult('basketball',Array(12).fill(100),profiles[0].id),elite=fitnessCompetitionResult('basketball',Array(12).fill(100),profiles.at(-1).id);assert.ok(elite.opponentPoints>rookie.opponentPoints,'the stronger profile makes more shots under the same inspected execution rules');
});

test('table tennis keeps rallies alive on controlled returns and resolves winners on faults or precise smashes',()=>{
 const opponent=fitnessOpponents('table-tennis').at(-1),qualities=Array.from({length:12},(_,index)=>index%3===2?100:70),firstTwo=fitnessCompetitionResult('table-tennis',qualities,opponent.id,{resolvedCount:2,complete:false});assert.equal(firstTwo.playerPoints,0);assert.equal(firstTwo.opponentPoints,0);assert.equal(firstTwo.rallyLength,2);assert.equal(firstTwo.lastExchange.label,'Rally continues');
 const smash=fitnessCompetitionResult('table-tennis',qualities,opponent.id,{resolvedCount:3,complete:false});assert.equal(smash.playerPoints,1);assert.equal(smash.ralliesPlayed,1);assert.equal(smash.rallyLength,0);assert.equal(smash.longestRally,3);assert.equal(smash.lastExchange.label,'Smash winner');
 const netFaults=fixture('table-tennis').play(Array(12).fill(40),opponent.id);assert.equal(netFaults.round.score,480);assert.equal(netFaults.round.hits,12);assert.equal(netFaults.round.competition.opponentPoints,12);assert.equal(netFaults.round.competition.outcome,'loss');assert.equal(netFaults.round.competition.lastExchange.label,'Return clipped the net');
});

test('sprint cadence advances a sixty metre race and clipped or missed hurdles add inspectable time penalties',()=>{
 const f=fixture('sprint'),perfect=f.play().round.competition;assert.equal(perfect.distanceTarget,60);assert.equal(perfect.playerDistance,60);assert.equal(perfect.playerPenaltyMs,0);assert.equal(perfect.playerTimeMs,FITNESS_GAMES.sprint.intervalMs*12);assert.equal(perfect.outcome,'win');
 const missed=fixture('sprint').play(Array.from({length:12},(_,index)=>index%4===3?0:100)).round.competition;assert.equal(missed.playerDistance,45);assert.equal(missed.playerPenaltyMs,5400);assert.equal(missed.playerTimeMs-perfect.playerTimeMs,5400);assert.equal(missed.lastExchange.label,'Hurdle hit · +1.8 sec');
 const clipped=fixture('sprint').play(Array.from({length:12},(_,index)=>index%4===3?40:100)).round.competition;assert.equal(clipped.playerDistance,51);assert.equal(clipped.playerPenaltyMs,2100);assert.ok(clipped.playerPoints>missed.playerPoints);assert.ok(clipped.playerPoints<perfect.playerPoints);
});

test('server time judges missed exchanges and cancelled matches cannot produce victory claims',()=>{
 for(const kind of kinds){const f=fixture(kind),{round}=f.play(Array(12).fill(0));assert.equal(round.score,0);assert.equal(round.rewardMzk,0);assert.equal(round.competition.resolvedExchanges,12);assert.equal(round.competition.outcome,'loss');assert.ok(round.competition.opponentPoints>0);}
 const active=fixture();active.send('fitness-start',{stationId:active.station.id});const round=active.player.fitness;active.player.position.x+=2;active.at(active.now+100);assert.equal(round.status,'cancelled');assert.equal(round.competition.outcome,null);assert.equal(round.competition.winner,null);assert.equal(round.competition.cancelled,true);assert.throws(()=>active.send('fitness-finish',{roundId:round.id,competition:{winner:'player'}}),/Cancelled sets/);
});

test('competitive settlement recomputes the scoreboard, persists its record once, and rejects altered outcomes',async t=>{
 const {db,wallet}=await databaseFixture(t),f=fixture(),{settlement}=f.play(),before=await db.read();
 const mutations=[proof=>proof.outcome='loss',proof=>proof.winner='opponent',proof=>proof.playerPoints=9999,proof=>proof.opponent.accuracy=0,proof=>proof.qualities[0]=70,proof=>proof.rounds[0].playerJudge=99];
 for(const change of mutations){const tampered=structuredClone(settlement);change(tampered.competition);await assert.rejects(async()=>grantFitnessReward(db,wallet,tampered,{now:f.now}),/Invalid authoritative competition result/);assert.deepEqual(await db.read(),before);}
 await assert.rejects(async()=>grantFitnessReward(db,wallet,{...settlement,competition:undefined},{now:f.now}),/Invalid authoritative competition result/);
 const [one,two]=await Promise.all([grantFitnessReward(db,wallet,settlement,{now:f.now}),grantFitnessReward(db,wallet,settlement,{now:f.now})]);assert.deepEqual(one,two);assert.equal(one.amountMzk,FITNESS_GAMES['boxing-sparring'].rewardMzk);assert.equal(one.competition.outcome,'win');assert.equal(one.progress.competitions.played,1);assert.equal(one.progress.competitions.wins,1);assert.equal(one.progress.competitions.byKind['boxing-sparring'].wins,1);
 const reloaded=new UserJsonDatabase(db.file),replay=await grantFitnessReward(reloaded,wallet,structuredClone(settlement),{now:f.now+1000});assert.deepEqual(replay,one);const state=await fitnessAccountState(reloaded,wallet);assert.equal(state.history.length,1);assert.equal(state.balance,100+one.amountMzk);assert.equal(state.progress.competitions.history[0].roundId,settlement.roundId);assert.equal(state.progress.competitions.history.length,1);
});

test('competition victories share the existing cooldown and daily cap, without outcome bonuses',async t=>{
 const {db,wallet}=await databaseFixture(t),base=Date.parse('2026-10-27T12:00:00Z');let final;
 for(let index=0;index<11;index++){const f=fixture(kinds[index%kinds.length],{startAt:base+index*60000}),{settlement}=f.play();final=await grantFitnessReward(db,wallet,settlement,{now:f.now});assert.equal(final.competition.outcome,'win');assert.ok(final.amountMzk<=FITNESS_GAMES[f.station.kind].rewardMzk);}
 assert.equal(final.amountMzk,0);let state=await fitnessAccountState(db,wallet);assert.equal(state.balance,100+FITNESS_DAILY_REWARD_CAP);assert.equal(state.progress.competitions.played,11);assert.equal(state.progress.competitions.wins,11);
 const tomorrow=fixture('boxing-sparring',{startAt:Date.parse('2026-10-28T00:01:00Z')}),{settlement}=tomorrow.play(),newDay=await grantFitnessReward(db,wallet,settlement,{now:tomorrow.now});assert.equal(newDay.amountMzk,40);assert.equal(newDay.progress.dailyEarnedMzk,40);state=await fitnessAccountState(db,wallet);assert.equal(state.progress.competitions.played,12);
 const simultaneous=fixture('basketball',{startAt:tomorrow.now-FITNESS_GAMES.basketball.intervalMs*12-2200+1000}),quick=simultaneous.play(),cooldown=await grantFitnessReward(db,wallet,quick.settlement,{now:simultaneous.now});assert.equal(cooldown.amountMzk,0);assert.equal(cooldown.competition.outcome,'win');assert.equal(cooldown.progress.competitions.played,13);
});
