import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ensureFiringRange,joinFiringRange,watchFiringRange,configureFiringRange,startFiringRange,stopFiringRange,stepFiringRange,fireFiringRange} from '../server-firing-range.mjs';
import {FIRING_RANGE_TARGETS,firingRangeTargetPosition,rangeWorldToLocal,firingRangeTeamScores} from '../public/js/firing-range.js';

const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const embeddedWorld=()=>({id:'two-range-world',builderScene:{layout:'grand-floor',mapSize:256,objects:[
 {id:'east',modelId:'scene-firing-range',position:{x:60,y:1,z:0},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:1.2,y:1.2,z:1.2}},
 {id:'west',modelId:'scene-firing-range',position:{x:-60,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}
]}});
function fixture(environment){
 let now=100000;const sim={players:{},actors:{}};ensureFiringRange(sim,environment,now);
 const add=(id,fields={})=>{const player=sim.players[id]={actorId:id,username:id,position:{x:0,y:0,z:16.2},lastSeen:now,health:100,input:{}};joinFiringRange(sim,player,now,fields);return player;};
 const advance=ms=>{now+=ms;for(const player of Object.values(sim.players))player.lastSeen=now;stepFiringRange(sim,now);};
 const shoot=(player,offset=0)=>{
  const range=sim.firingRange,own=range.participants[player.actorId],location=range.locations.find(item=>item.id===own.locationId),target=FIRING_RANGE_TARGETS.find(item=>item.id==='paper-'+own.lane),center=firingRangeTargetPosition(location,target,now,range.settings);
  return fireFiringRange(sim,player,{tool:range.settings.weapon,direction:[center.x+offset-player.position.x,center.y-player.position.y-1.65,center.z-player.position.z],eyeHeight:1.65},now);
 };
 return {sim,add,advance,shoot,now:()=>now};
}

for(const id of ['firing-range','force-training-range'])test(id+' completes three scored rounds, retains final standings, and starts a clean replay',()=>{
 const {sim,add,advance,shoot,now}=fixture(maps.find(map=>map.id===id)),alice=add('Alice',{team:'red'}),bob=add('Bob',{team:'blue'});
 configureFiringRange(sim,alice,{rounds:3,shotLimit:1,countdownSeconds:0,teamMode:true},now());startFiringRange(sim,alice,now());
 shoot(alice);shoot(bob,.4);assert.equal(sim.firingRange.state,'intermission');
 assert.deepEqual(sim.firingRange.roundResults[0].leaderboard.map(p=>[p.name,p.score,p.hits,p.shots,p.bullseyes]),[['Alice',100,1,1,1],['Bob',40,1,1,0]]);
 advance(5000);fireFiringRange(sim,alice,{tool:'marksman',direction:[0,1,0]},now());shoot(bob);
 assert.deepEqual(sim.firingRange.roundResults[1].leaderboard.map(p=>[p.name,p.score,p.totalScore]),[['Bob',100,140],['Alice',0,100]]);
 advance(5000);shoot(alice);shoot(bob);const range=sim.firingRange,results=range.results,matchId=range.matchId;
 assert.equal(range.state,'finished');assert.equal(results.rounds.length,3);assert.deepEqual(results.winnerIds,['Bob']);assert.equal(results.winningTeam,'blue');assert.deepEqual(results.teams,{red:200,blue:240});
 assert.equal(results.settings.rounds,3);assert.equal(results.matchId,matchId);
 joinFiringRange(sim,alice,now(),{lane:2});assert.equal(range.participants.Alice.score,200);assert.equal(range.leaderboard.find(p=>p.id==='Alice').score,200);
 startFiringRange(sim,alice,now());assert.notEqual(range.matchId,matchId);assert.equal(range.results,null);assert.deepEqual(range.roundResults,[]);
 assert.ok(Object.values(range.participants).every(p=>p.score===0&&p.roundScore===0&&p.shots===0));assert.equal(results.leaderboard[0].score,240);
});

test('a delayed server tick advances every scheduled round without stretching the event',()=>{
 const {sim,add,advance,now}=fixture(maps.find(map=>map.id==='firing-range')),alice=add('Alice');
 configureFiringRange(sim,alice,{rounds:3,durationSeconds:10,countdownSeconds:2},now());startFiringRange(sim,alice,now());advance(60000);
 assert.equal(sim.firingRange.state,'finished');assert.equal(sim.firingRange.finishedAt,146000);
 assert.deepEqual(sim.firingRange.results.rounds.map(round=>round.finishedAt),[112000,129000,146000]);
 advance(1000);assert.equal(sim.firingRange.results.rounds.length,3);
});

test('withdrawing preserves cumulative team points but cannot win a later round with stale points',()=>{
 const {sim,add,advance,shoot,now}=fixture(maps.find(map=>map.id==='firing-range')),alice=add('Alice',{team:'red'}),bob=add('Bob',{team:'blue'});
 configureFiringRange(sim,alice,{rounds:2,shotLimit:1,countdownSeconds:0,teamMode:true},now());startFiringRange(sim,alice,now());shoot(alice);shoot(bob,.4);
 watchFiringRange(sim,alice,now());assert.equal(sim.firingRange.hostId,'Bob');advance(5000);
 assert.equal(sim.firingRange.participants.Alice.roundScore,0);assert.equal(sim.firingRange.participants.Alice.roundEnrolled,false);
 shoot(bob,.4);const results=sim.firingRange.results;
 assert.deepEqual(results.rounds[1].winnerIds,['Bob']);assert.deepEqual(results.rounds[1].leaderboard.map(p=>p.id),['Bob']);
 assert.deepEqual(results.teams,{red:100,blue:80});assert.deepEqual(firingRangeTeamScores(sim.firingRange.participants),results.teams);assert.equal(results.winningTeam,'red');assert.deepEqual(results.winnerIds,['Alice']);
});

test('ending a live event includes its partial round exactly once in immutable final results',()=>{
 const {sim,add,shoot,now}=fixture(maps.find(map=>map.id==='firing-range')),alice=add('Alice');
 configureFiringRange(sim,alice,{rounds:3,countdownSeconds:0},now());startFiringRange(sim,alice,now());shoot(alice);stopFiringRange(sim,alice,now());
 const results=sim.firingRange.results;assert.equal(results.reason,'stopped');assert.equal(results.rounds.length,1);assert.equal(results.rounds[0].reason,'stopped');assert.equal(results.rounds[0].leaderboard[0].score,100);
 assert.throws(()=>stopFiringRange(sim,alice,now()),/not running/);startFiringRange(sim,alice,now());assert.equal(results.rounds[0].leaderboard[0].score,100);assert.equal(sim.firingRange.roundResults.length,0);
});

test('watch consoles select and validate their transformed embedded range before changing state',()=>{
 const environment=embeddedWorld();
 const {sim,add,now}=fixture(environment),alice=add('Alice',{locationId:'west'});
 watchFiringRange(sim,alice,now(),{locationId:'east'});const range=sim.firingRange,east=range.locations.find(location=>location.id==='east'),position=rangeWorldToLocal(east,alice.position);
 assert.equal(range.participants.Alice.locationId,'east');assert.ok(Math.abs(position.x)<1e-9&&Math.abs(position.z-16.2)<1e-9);
 const before=JSON.stringify({participant:range.participants.Alice,position:alice.position});
 assert.throws(()=>watchFiringRange(sim,alice,now(),{locationId:'missing'}),{statusCode:422});assert.equal(JSON.stringify({participant:range.participants.Alice,position:alice.position}),before);
});

test('the room command forwards an embedded watch location and rejects forged locations',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'range-watch-location-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const environment=embeddedWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>100000}),identity={accountId:'alice',username:'Alice'};let sequence=0;
 const send=(action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'watch-location-'+ ++sequence,...fields});
 await send('join');await send('range-join',{locationId:'west'});const snapshot=await send('range-watch',{locationId:'east'}),range=snapshot.firingRange;
 const position=rangeWorldToLocal(range.locations.find(location=>location.id==='east'),snapshot.players['account:alice'].position);
 assert.equal(range.participants['account:alice'].locationId,'east');assert.ok(Math.abs(position.x)<1e-9&&Math.abs(position.z-16.2)<1e-9);
 await assert.rejects(send('range-watch',{locationId:'missing'}),{statusCode:422});
 assert.equal((await runtime.snapshot(environment.id,environment)).firingRange.participants['account:alice'].locationId,'east');
});
