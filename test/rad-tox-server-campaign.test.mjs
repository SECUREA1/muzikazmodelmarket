import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {startRadTox,advanceRadTox,spawnRadToxWave,nextRadToxLevel,radToxWaveTargetCount,RAD_TOX_WAVE_MS,ROUND_COUNTDOWN_MS} from '../rad-tox-campaign.mjs';
import {finishMatch,recordTournamentScore,tournamentView} from '../rpg-match.mjs';
import {radToxWavePopulation} from '../public/js/rad-tox-wave-rules.js';

const environment={id:'muzikaz-main',name:'House',modelUrl:'/house.glb',playable:true,spawn:{x:0,y:0,z:2}};
function fixture(now=100000){
 const player=id=>({actorId:id,username:id,position:{x:0,y:0,z:2},lastSeen:now,health:100,score:0});
 return {actors:{},players:{alice:player('alice'),bob:player('bob')},events:[],projectiles:{}};
}
function online(sim,now){for(const player of Object.values(sim.players))if(!player.replacedByRoom)player.lastSeen=now;}
function reachBoss(sim,now){
 for(let wave=1;wave<=4;wave++){
  assert.equal(sim.radTox.wave,wave);const phase=sim.radTox.phaseId;
  now=sim.radTox.endsAt-1;online(sim,now);advanceRadTox(sim,now,environment);assert.equal(sim.radTox.state,'active');
  now++;online(sim,now);advanceRadTox(sim,now,environment);assert.equal(sim.radTox.state,'cleared');assert.equal(sim.radTox.transition.at,now+ROUND_COUNTDOWN_MS);
  now+=ROUND_COUNTDOWN_MS-1;online(sim,now);advanceRadTox(sim,now,environment);assert.equal(sim.radTox.phaseId,phase);
  now++;online(sim,now);advanceRadTox(sim,now,environment);assert.notEqual(sim.radTox.phaseId,phase);
 }
 assert.equal(sim.radTox.wave,5);assert.equal(sim.radTox.phaseKind,'boss');assert.equal(sim.radTox.endsAt,null);return now;
}

test('four synchronized two-minute waves run locally before the required end boss',()=>{
 let now=100000;const sim=fixture(now);startRadTox(sim,environment,now,environment.spawn);
 assert.equal(sim.radTox.combatMode,'local');assert.equal(sim.radTox.phaseKind,'wave');assert.equal(sim.radTox.normalWaveCount,4);
 assert.equal(sim.radTox.endsAt-now,RAD_TOX_WAVE_MS);assert.equal(sim.radTox.targetCount,36);assert.equal(sim.radTox.population.concurrent.total,36);
 assert.deepEqual(sim.radTox.participants,['alice','bob']);assert.deepEqual(sim.actors,{});assert.deepEqual(sim.projectiles,{});
 const phase=sim.radTox.phaseId;now+=1000;online(sim,now);sim.radTox.remaining=0;advanceRadTox(sim,now,environment);
 assert.equal(sim.radTox.phaseId,phase,'local kills cannot skip the shared wave clock');assert.equal(sim.radTox.state,'active');
 now=reachBoss(sim,now);assert.equal(sim.radTox.bossKind,'bee');assert.deepEqual(sim.actors,{});
 const completed=sim.match.id;sim.radTox.localProgress.alice={phaseId:sim.radTox.phaseId,bossDefeated:true};advanceRadTox(sim,now,environment);
 assert.equal(sim.match.state,'active','one player cannot finish a connected teammate’s boss');
 sim.radTox.localProgress.bob={phaseId:'stale-phase',bossDefeated:true};advanceRadTox(sim,now,environment);assert.equal(sim.match.state,'active');
 recordTournamentScore(sim,'alice',{score:120,enemyKills:12,shots:20,hits:15,misses:5},now);
 sim.radTox.localProgress.bob={phaseId:sim.radTox.phaseId,bossDefeated:true};advanceRadTox(sim,now,environment);
 assert.equal(sim.match.outcome,'victory');assert.deepEqual(sim.radTox.transition,{kind:'level',at:now+10000,nextLevel:2,environmentId:'muzikaz-upper'});
 assert.equal(nextRadToxLevel(sim,environment,now,completed),false);
 now+=10000;online(sim,now);assert.equal(nextRadToxLevel(sim,environment,now,completed),true);assert.equal(sim.radTox.level,2);assert.equal(sim.radTox.wave,1);assert.equal(sim.radTox.environmentId,'muzikaz-upper');
 const transfer=sim.radTox.transferId;assert.equal(transfer,sim.radTox.phaseId);
 now+=RAD_TOX_WAVE_MS+1000;online(sim,now);advanceRadTox(sim,now,environment);assert.equal(sim.radTox.transferId,transfer);assert.equal(sim.radTox.state,'cleared','the tournament clock continues while clients load the destination');
 assert.equal(sim.players.alice.score,0,'each level receives a fresh score');assert.equal(tournamentView(sim,now).results[0].score,120,'the tournament survives level resets');
 assert.equal(nextRadToxLevel(sim,environment,now,completed),false,'replayed next-level commands cannot skip a level');
});

test('boss completion includes connected late arrivals and excludes disconnected players',()=>{
 let now=100000;const sim=fixture(now);startRadTox(sim,environment,now,environment.spawn);now=reachBoss(sim,now);
 sim.players.charlie={actorId:'charlie',username:'charlie',position:{x:0,y:0,z:2},lastSeen:now,health:100};
 sim.radTox.localProgress.alice={phaseId:sim.radTox.phaseId,bossDefeated:true};sim.players.bob.lastSeen=now-15001;
 advanceRadTox(sim,now,environment);assert.equal(sim.match.state,'active','a connected late arrival still owns a playable boss');
 sim.radTox.localProgress.charlie={phaseId:sim.radTox.phaseId,bossDefeated:true};advanceRadTox(sim,now,environment);assert.equal(sim.match.outcome,'victory','disconnected players cannot hold up completion');
});

test('a late arrival can complete a boss after every original participant leaves',()=>{
 let now=100000;const sim=fixture(now);startRadTox(sim,environment,now,environment.spawn);now=reachBoss(sim,now);
 for(const player of Object.values(sim.players))player.lastSeen=now-15001;
 sim.players.charlie={actorId:'charlie',username:'charlie',position:{x:0,y:0,z:2},lastSeen:now,health:100};
 advanceRadTox(sim,now,environment);assert.equal(sim.match.state,'active');
 sim.radTox.localProgress.charlie={phaseId:sim.radTox.phaseId,bossDefeated:true};advanceRadTox(sim,now,environment);assert.equal(sim.match.outcome,'victory');
});

test('persisted authoritative encounters migrate without leaving server enemies or projectiles',()=>{
 const now=100000,sim=fixture(now);sim.actors={'old-enemy':{id:'old-enemy',radTox:true},table:{id:'table',active:true}};sim.projectiles={old:{actorId:'old-enemy'}};
 sim.radTox={level:2,wave:4,state:'active',remaining:1};startRadTox(sim,environment,now,environment.spawn);
 assert.equal(sim.radTox.wave,5);assert.equal(sim.radTox.phaseKind,'boss');assert.equal(sim.radTox.bossKind,'aape');assert.deepEqual(Object.keys(sim.actors),['table']);assert.deepEqual(sim.projectiles,{});
 const restored=structuredClone(sim),phase=restored.radTox.phaseId;startRadTox(restored,environment,now+50,environment.spawn);assert.equal(restored.radTox.phaseId,phase,'reconnects preserve the running stage');
});

test('empty rooms catch up scheduled waves without changing the tournament clock',()=>{
 let now=100000;const sim=fixture(now);startRadTox(sim,environment,now,environment.spawn);
 const startedAt=sim.radTox.startedAt;now+=RAD_TOX_WAVE_MS+30000;advanceRadTox(sim,now,environment);
 assert.equal(sim.radTox.wave,2);assert.equal(sim.radTox.state,'active');assert.equal(sim.radTox.startedAt,startedAt+RAD_TOX_WAVE_MS+10000);
 assert.equal(sim.radTox.endsAt-now,100000,'late joins use the remaining time, rather than starting a new wave');
 now=startedAt+(RAD_TOX_WAVE_MS+10000)*4+500000;advanceRadTox(sim,now,environment);
 assert.equal(sim.radTox.wave,5);assert.equal(sim.radTox.phaseKind,'boss');assert.equal(sim.radTox.startedAt,startedAt+(RAD_TOX_WAVE_MS+10000)*4);
 assert.equal(sim.radTox.endsAt,null,'the authored boss remains untimed and playable');
});

test('authored enemy populations contain every configured enemy and one boss',()=>{
 assert.deepEqual([1,2,3,4,5].map(wave=>radToxWaveTargetCount(1,wave)),[36,66,66,66,1]);
 assert.deepEqual([radToxWaveTargetCount(2,1),radToxWaveTargetCount(2,2),radToxWaveTargetCount(3,1),radToxWaveTargetCount(3,2)],[51,96,54,102]);
 assert.deepEqual([1,2,3,4].map(wave=>radToxWavePopulation(1,wave).concurrent.total),[36,66,66,66]);
 assert.deepEqual(radToxWavePopulation(1,1).budget,{toxic:12,ghost:12,snake:6,brain:6,boss:0,total:36});
 const boss=radToxWavePopulation(3,5);assert.equal(boss.batches,1);assert.equal(boss.concurrent.total,1);assert.equal(boss.budget.boss,1);
});

test('mobile quality preserves every required enemy and the same score budget',()=>{
 for(const level of [1,2,3,8])for(const wave of [1,2,3,4,5]){
  const desktop=radToxWavePopulation(level,wave),mobile=radToxWavePopulation(level,wave,{mobile:true});
  assert.deepEqual(mobile,desktop);assert.deepEqual(desktop.concurrent,desktop.budget);
  if(wave<5)for(const kind of ['toxic','ghost','snake','brain'])assert.ok(mobile.concurrent[kind]>0);
 }
 assert.equal(radToxWavePopulation(3,2).concurrent.total,102);
});

test('reconnecting to an existing wave keeps its original enemy budget until the next shared phase',()=>{
 const now=100000,sim=fixture(now);startRadTox(sim,environment,now,environment.spawn);
 const phase=sim.radTox.phaseId;delete sim.radTox.population;sim.radTox.targetCount=12;
 startRadTox(sim,environment,now+1000,environment.spawn);
 assert.equal(sim.radTox.phaseId,phase);assert.equal(sim.radTox.targetCount,12);assert.equal(sim.radTox.population,undefined,'deploying refill rules cannot rewrite score receipts for an active wave');
 online(sim,now+120000);advanceRadTox(sim,now+120000,environment);online(sim,now+130000);advanceRadTox(sim,now+130000,environment);
 assert.equal(sim.radTox.wave,2);assert.equal(sim.radTox.targetCount,66);assert.equal(sim.radTox.population.concurrent.total,66);
});

test('joining a shared GLB room starts clocks without server enemy simulation or damage',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-local-room-'));let now=100000;
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now});runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const identity={accountId:'alice',username:'Alice',stats:{health:100}};
  let state=await runtime.command(environment.id,environment,identity,{action:'join',requestId:'join'});const phase=state.radTox.phaseId;
  assert.equal(state.radTox.combatMode,'local');assert.equal(Object.values(state.actors).filter(actor=>actor.radTox).length,0);
  await assert.rejects(runtime.command(environment.id,environment,identity,{action:'fire',tool:'laser',direction:[0,0,-1],requestId:'legacy-shot'}),error=>error.statusCode===409&&error.code==='RAD_TOX_CLIENT_UPDATE_REQUIRED'&&/Reload this page/.test(error.message),'an old cached engine receives a clear recovery instruction');
  now+=5000;state=await runtime.command(environment.id,environment,identity,{action:'input',requestId:'keep-alive',input:{}});
  assert.equal(state.radTox.phaseId,phase);assert.equal(state.players['account:alice'].health,100);assert.deepEqual(state.projectiles,{});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Builder rooms keep their authored gameplay instead of receiving a house campaign',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-builder-'));
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
  const map={id:'builder',builderScene:{objects:[]}},identity={accountId:'alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  const state=await runtime.command(map.id,map,identity,{action:'start-rad-tox',requestId:'start'});assert.equal(state.radTox,null);assert.deepEqual(state.actors,{});
 }finally{await rm(dir,{recursive:true,force:true});}
});
