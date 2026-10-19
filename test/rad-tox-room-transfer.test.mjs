import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {finishMatch} from '../rpg-match.mjs';
import {applyRadToxProgress,hasRadToxScorePhase} from '../rad-tox-local-score.mjs';
import {syncRadToxTournament} from '../rad-tox-room-transfer.mjs';
import {startRadTox,spawnRadToxWave,RAD_TOX_WAVE_MS} from '../rad-tox-campaign.mjs';
import {radToxRewardManifest} from '../rad-tox-local-rewards.mjs';

const main={id:'muzikaz-main',name:'Main floor',modelUrl:'/house.glb',spawn:{x:0,y:0,z:2}};
const upper={...main,id:'muzikaz-upper',name:'Upper floor'};
const alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}},erin={accountId:'erin',username:'Erin',stats:{health:100}};
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-map-transfer-'));let now=100000,request=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 runtime.collision.safeSpawn=(_,point)=>({...point});runtime.collision.resolve=(_,previous,next)=>({...next});
 const send=(world,user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'transfer-'+(++request),...fields});
 const progress=(world,user,state,stats,fields={})=>send(world,user,'rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:1,stats,...fields});
 try{await run({store,runtime,send,progress,get now(){return now;},advance(ms){now+=ms;}});}finally{await rm(dir,{recursive:true,force:true});}
}
const hit={shots:1,hits:1,enemyHits:1,enemyKills:1,score:11};

test('two players keep one wave clock and tournament through the boss, map transfer, lost receipt and restart',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const tournamentId=state.tournament.id;
 state=await f.progress(main,alice,state,hit);assert.equal(state.players['account:alice'].tournamentScore,11);
 for(let wave=1;wave<=4;wave++){
  const phase=state.radTox.phaseId;f.advance(state.radTox.endsAt-f.now);
  // Fast-forward the clock while representing both clients' normal heartbeats.
  await f.store.update(main.id,room=>{for(const player of Object.values(room.simulation.players))player.lastSeen=f.now;});
  state=await f.send(main,alice,'input',{input:{}});await f.send(main,bob,'input',{input:{}});
  assert.equal(state.radTox.state,'cleared');assert.equal(state.radTox.phaseId,phase);
  f.advance(10000);state=await f.send(main,alice,'input',{input:{}});await f.send(main,bob,'input',{input:{}});
 }
 assert.equal(state.radTox.phaseKind,'boss');assert.equal(state.radTox.bossKind,'bee');assert.deepEqual(state.actors,{});assert.deepEqual(state.projectiles,{});
 const boss=state;state=await f.progress(main,alice,boss,hit,{bossDefeated:true});assert.equal(state.match.state,'active','a connected teammate still needs to defeat their local boss');
 state=await f.progress(main,bob,boss,hit,{bossDefeated:true});assert.equal(state.match.outcome,'victory');
 f.advance(10000);state=await f.send(main,alice,'input',{input:{}});
 assert.equal(state.radTox.environmentId,upper.id);assert.equal(state.radTox.level,2);
 const transfer={radToxFrom:main.id,radToxTransfer:state.radTox.transferId};
 await assert.rejects(f.send(upper,erin,'join',transfer),{statusCode:409},'the transfer belongs to players from the source game');
 state=await f.send(upper,alice,'join',transfer);const arrivalPhase=state.radTox.phaseId,arrivalEnd=state.radTox.endsAt;
 assert.equal(state.radTox.level,2);assert.equal(state.radTox.wave,1);assert.equal(state.radTox.environmentId,upper.id);assert.equal(state.tournament.id,tournamentId);
 assert.equal(state.players['account:alice'].score,0);assert.equal(state.players['account:alice'].tournamentScore,22);
 f.advance(5000);const joined=await f.send(upper,bob,'join',transfer);assert.equal(joined.radTox.phaseId,arrivalPhase);assert.equal(joined.radTox.endsAt,arrivalEnd,'later arrivals do not restart the level timer');
 const late={matchId:boss.match.id,phaseId:boss.radTox.phaseId,sequence:2,stats:{...hit,shots:2,hits:2,enemyHits:2,score:13},health:0,lifeRevision:boss.players['account:alice'].lifeRevision,bossDefeated:true};
 state=await f.send(upper,alice,'rad-tox-progress',late);assert.equal(state.players['account:alice'].tournamentScore,24);assert.equal(state.players['account:alice'].score,0);assert.equal(state.players['account:alice'].health,100);assert.equal(state.result.localScoreAck.phaseId,boss.radTox.phaseId);
 state=await f.send(upper,alice,'rad-tox-progress',late);assert.equal(state.players['account:alice'].tournamentScore,24,'retrying a lost score receipt is idempotent');
 const source=await f.runtime.snapshot(main.id,main);assert.equal(source.tournament.results.find(row=>row.id==='account:alice').score,24,'all maps read the same tournament ledger');
 await f.store.flush();const restarted=new AuthoritativeRooms({store:new SharedRoomStore(f.store.file),now:()=>f.now});restarted.collision.safeSpawn=(_,point)=>point;
 const restored=await restarted.snapshot(upper.id,upper);assert.equal(restored.tournament.id,tournamentId);assert.equal(restored.tournament.results.find(row=>row.id==='account:alice').score,24);assert.equal(restored.radTox.phaseId,arrivalPhase);
}));

test('joining any authored map joins the same tournament and routes to its exact current phase',async()=>fixture(async f=>{
 let source=await f.send(main,alice,'join');source=await f.progress(main,alice,source,hit);
 const phase=source.radTox.phaseId,deadline=source.radTox.endsAt,tournament=source.tournament.id;
 f.advance(5000);const destination=await f.send(upper,erin,'join');
 assert.equal(destination.tournament.id,tournament);assert.equal(destination.radTox.phaseId,phase);assert.equal(destination.radTox.endsAt,deadline);
 assert.equal(destination.radTox.environmentId,main.id,'a join from another authored map follows the current tournament location');
 const transfer={radToxFrom:upper.id,radToxTransfer:destination.radTox.transferId};
 let state=await f.send(main,erin,'join',transfer);
 assert.equal(state.radTox.phaseId,phase);assert.equal(state.radTox.endsAt,deadline);assert.equal(state.tournament.results.reduce((sum,row)=>sum+row.score,0),11);
 state=await f.send(main,erin,'join',transfer);assert.equal(state.tournament.results.reduce((sum,row)=>sum+row.score,0),11,'reconnects cannot merge already recorded scores twice');
 f.advance(130000);state=await f.send(main,erin,'join',transfer);assert.equal(state.radTox.wave,2,'a slow map load may present a transfer from the previous wave');assert.equal(state.radTox.endsAt,deadline+130000);
 const old=await f.runtime.snapshot(upper.id,upper);assert.equal(old.tournament.id,tournament);assert.equal(old.radTox.phaseId,state.radTox.phaseId);
}));

test('an earned player entering another room in the same phase keeps personal results without moving room assets',async()=>fixture(async f=>{
 let grants=0;
 f.runtime.grantLocalRewards=async(_identity,input)=>{
  grants++;const manifest=radToxRewardManifest(input.phase,input.playerId);
  return {progress:input.progress,resume:input.resume,balanceAfterMzk:5,receipts:input.claimIds.map(claimId=>{const entry=manifest.find(item=>item.id===claimId);return {claimId,amountMzk:entry.amountMzk||0,...(entry.catalogId?{catalogId:entry.catalogId}:{})};})};
 };
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');
 const phase=state.radTox.phaseId,matchId=state.match.id,deadline=state.radTox.endsAt,lifeRevision=state.players['account:alice'].lifeRevision;
 const coin=state.radToxRewards.manifest.find(entry=>entry.amountMzk===5),care=state.radToxRewards.manifest.find(entry=>entry.catalogId);
 const report={matchId,phaseId:phase,sequence:1,stats:hit,health:65,ammo:91,fuel:42,spray:15,lifeRevision,claimIds:[coin.id,care.id]};
 state=await f.send(main,alice,'rad-tox-progress',report);
 const before=structuredClone(state.players['account:alice'].combat);
 await f.store.update(main.id,room=>{
  const player=room.simulation.players['account:alice'];player.position={x:39,y:0,z:41};player.inventory=['main-only'];player.heldId='main-held';
  room.simulation.actors['main-held']={id:'main-held',holderId:'account:alice',active:true,position:{x:39,y:0,z:41}};
 });
 state=await f.send(upper,alice,'join');
 const arrival=state.players['account:alice'];
 assert.equal(state.radTox.environmentId,main.id);assert.equal(state.radTox.phaseId,phase);assert.equal(state.radTox.endsAt,deadline);
 assert.equal(arrival.score,11);assert.equal(arrival.health,65);assert.equal(arrival.ammo,91);assert.equal(arrival.fuel,42);assert.equal(arrival.spray,15);assert.equal(arrival.lifeRevision,lifeRevision);
 assert.deepEqual(arrival.combat,before);assert.equal(arrival.localScoreAck.sequence,1);assert.equal(arrival.progress.defeat,1);
 assert.notDeepEqual(arrival.position,{x:39,y:0,z:41});assert.deepEqual(arrival.inventory,[]);assert.equal(arrival.heldId,undefined);assert.equal(state.actors['main-held'],undefined);
 assert.equal(state.match.results.find(row=>row.id==='account:alice').score,11);assert.equal(state.tournament.results.find(row=>row.id==='account:alice').earnedMzk,5);
 state=await f.send(upper,alice,'rad-tox-progress',report);assert.equal(grants,1,'a copied receipt never grants rewards again');
 state=await f.send(main,alice,'join',{radToxFrom:upper.id,radToxTransfer:state.radTox.transferId});
 assert.equal(state.players['account:alice'].score,11);assert.equal(state.players['account:alice'].health,65);assert.deepEqual(state.players['account:alice'].combat,before);
 const result=state.tournament.results.find(row=>row.id==='account:alice');assert.equal(result.score,11);assert.equal(result.earnedMzk,5);assert.equal(result.rewardCount,2);
 assert.equal(state.match.results.find(row=>row.id==='account:alice').score,11);
 const custom={...main,id:'personal-progress-isolation'};state=await f.send(custom,alice,'join');assert.equal(state.players['account:alice'].score,0);assert.equal(state.players['account:alice'].health,100);assert.deepEqual(state.players['account:alice'].combat.itemsCollected,[]);
}));

test('a delayed pre-respawn vital report cannot deplete a new life',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const revision=state.players['account:alice'].lifeRevision;
 state=await f.progress(main,alice,state,{hitsTaken:45,damageTaken:100,deaths:1},{health:0,ammo:0,fuel:0,lifeRevision:revision});
 assert.equal(state.players['account:alice'].health,0);state=await f.send(main,alice,'respawn');assert.equal(state.players['account:alice'].health,100);assert.ok(state.players['account:alice'].lifeRevision>revision);
 state=await f.send(main,alice,'rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:2,stats:{hitsTaken:45,damageTaken:100,deaths:1},health:0,ammo:0,fuel:0,lifeRevision:revision});
 assert.equal(state.players['account:alice'].health,100);assert.equal(state.players['account:alice'].ammo,120);assert.equal(state.players['account:alice'].fuel,100);
}));


test('late joins and reconnects follow scheduled time through empty rooms without restarting',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');const tournament=state.tournament.id,firstPhase=state.radTox.phaseId,firstStart=state.radTox.startedAt;
 state=await f.progress(main,alice,state,hit);f.advance(RAD_TOX_WAVE_MS+30000);
 state=await f.send(main,bob,'join');
 assert.equal(state.tournament.id,tournament);assert.equal(state.radTox.wave,2);assert.equal(state.radTox.startedAt,firstStart+130000);assert.equal(state.radTox.endsAt-f.now,100000);
 const phase=state.radTox.phaseId,deadline=state.radTox.endsAt;
 state=await f.send(main,alice,'join');assert.equal(state.radTox.phaseId,phase);assert.equal(state.radTox.endsAt,deadline);
 assert.equal(state.tournament.results.find(row=>row.id==='account:alice').score,11);
 assert.notEqual(state.radTox.phaseId,firstPhase);assert.equal(state.players['account:alice'].score,11,'wave changes keep the current level totals');
 f.advance(600000);state=await f.send(main,bob,'join');assert.equal(state.radTox.phaseKind,'boss');assert.equal(state.radTox.wave,5);
 const boss=state.radTox.phaseId;f.advance(20000);state=await f.send(main,bob,'join');assert.equal(state.radTox.phaseId,boss,'an untimed boss survives reconnects');
 await f.store.flush();const restarted=new AuthoritativeRooms({store:new SharedRoomStore(f.store.file),now:()=>f.now});restarted.collision.safeSpawn=(_,point)=>point;
 const restored=await restarted.command(main.id,main,bob,{action:'join',requestId:'server-restart-join'});
 assert.equal(restored.radTox.phaseId,boss);assert.equal(restored.tournament.id,tournament);assert.equal(restored.tournament.results.find(row=>row.id==='account:alice').score,11);
}));

test('a personal defeat never ends or resets another local game',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const phase=state.radTox.phaseId,deadline=state.radTox.endsAt;
 state=await f.progress(main,alice,state,{hitsTaken:45,damageTaken:100,deaths:1},{health:0,lifeRevision:state.players['account:alice'].lifeRevision});
 assert.equal(state.players['account:alice'].health,0);assert.equal(state.players['account:bob'].health,100);assert.equal(state.match.state,'active');
 const bobState=await f.send(main,bob,'input',{input:{}});
 state=await f.progress(main,bob,bobState,{hitsTaken:45,damageTaken:100,deaths:1},{health:0,lifeRevision:bobState.players['account:bob'].lifeRevision});
 assert.equal(state.match.state,'active','even simultaneous personal deaths do not restart the tournament');
 state=await f.send(main,alice,'respawn');assert.equal(state.players['account:alice'].health,100);assert.equal(state.radTox.phaseId,phase);assert.equal(state.radTox.endsAt,deadline);
}));

test('the third authored boss finishes one tournament with stable final results across maps and joins',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const tournament=state.tournament.id;
 let world=main;
 for(let level=1;level<=3;level++){
  await f.store.update(world.id,(room,rooms)=>{
   syncRadToxTournament(room.simulation,rooms,{environment:world,now:f.now});
   room.simulation.radTox.wave=5;spawnRadToxWave(room.simulation,f.now,world.spawn);
  });
  state=await f.send(world,alice,'input',{input:{}});const boss=state;
  await f.progress(world,alice,boss,hit,{bossDefeated:true});state=await f.progress(world,bob,boss,hit,{bossDefeated:true});
  assert.equal(state.match.outcome,'victory');
  if(level<3){
   f.advance(10000);state=await f.send(world,alice,'input',{input:{}});
   const destination=level===1?upper:{...main,id:'sheepbase',name:'Sheep base'};
   const transfer={radToxFrom:world.id,radToxTransfer:state.radTox.transferId};
   await f.send(destination,alice,'join',transfer);await f.send(destination,bob,'join',transfer);world=destination;
  }
 }
 assert.equal(state.tournament.id,tournament);assert.equal(state.tournament.status,'finished');assert.equal(state.tournament.currentLevel,3);
 assert.equal(state.radTox.transition.kind,'tournament');const endedAt=state.tournament.endedAt,phase=state.radTox.phaseId;
 assert.deepEqual(state.tournament.results.map(row=>row.score),[33,33]);
 f.advance(600000);state=await f.send(main,erin,'join');assert.equal(state.tournament.id,tournament);assert.equal(state.tournament.status,'finished');assert.equal(state.tournament.endedAt,endedAt);assert.equal(state.radTox.phaseId,phase);
 await f.send(world,alice,'join');const restarted=await f.send(world,alice,'start-rad-tox');assert.equal(restarted.radTox.phaseId,phase);assert.equal(restarted.tournament.status,'finished','joining or pressing start cannot reset an ended tournament');
 assert.deepEqual(restarted.tournament.results.map(row=>row.score),[33,33]);
}));

test('custom GLB campaigns stay independent from the authored tournament and each other',async()=>fixture(async f=>{
 const first={...main,id:'custom-one'},second={...main,id:'custom-two'};
 const authored=await f.send(main,alice,'join'),one=await f.send(first,bob,'join'),two=await f.send(second,erin,'join');
 assert.notEqual(one.tournament.id,authored.tournament.id);assert.notEqual(two.tournament.id,one.tournament.id);
 assert.equal(one.radTox.environmentId,first.id);assert.equal(two.radTox.environmentId,second.id);
 await f.store.update(first.id,(room,rooms)=>{
  syncRadToxTournament(room.simulation,rooms,{environment:first,now:f.now});finishMatch(room.simulation,'victory',f.now);
 });
 f.advance(10000);const next=await f.send(first,bob,'input',{input:{}});assert.equal(next.radTox.level,2);assert.equal(next.radTox.environmentId,first.id);
 const current=await f.runtime.snapshot(main.id,main);assert.equal(current.radTox.level,1);assert.equal(current.tournament.id,authored.tournament.id);
}));


test('legacy independent map ledgers merge once without losing delayed personal receipts',()=>{
 const now=100000,make=playerId=>({players:{[playerId]:{actorId:playerId,username:playerId,position:{x:0,y:0,z:2},lastSeen:now,health:100}},actors:{},events:[]});
 const one=make('account:alice'),two=make('account:bob');startRadTox(one,main,now);startRadTox(two,upper,now);
 const report=sim=>({matchId:sim.match.id,phaseId:sim.radTox.phaseId,sequence:1,stats:hit});
 const old=report(two);applyRadToxProgress(one,'account:alice',report(one),now);applyRadToxProgress(two,'account:bob',old,now);
 const rooms={[main.id]:{simulation:one},[upper.id]:{simulation:two}};
 syncRadToxTournament(one,rooms,{environment:main,now});syncRadToxTournament(two,rooms,{environment:upper,now});
 assert.equal(one.tournament.id,two.tournament.id);assert.equal(Object.values(one.tournament.participants).reduce((sum,row)=>sum+row.score,0),22);
 assert.equal(hasRadToxScorePhase(two,old,'account:bob'),true,'a pre-upgrade phase keeps its accepted receipt ledger');
 applyRadToxProgress(two,'account:bob',{...old,sequence:2,stats:{...hit,shots:2,hits:2,enemyHits:2,score:13}},now+1);
 const restarted=structuredClone(rooms);syncRadToxTournament(restarted[upper.id].simulation,restarted,{environment:upper,now:now+2});
 assert.equal(Object.values(restarted[upper.id].simulation.tournament.participants).reduce((sum,row)=>sum+row.score,0),24,'JSON reloads do not merge an aliased tournament again');
});


test('late custom-map progress cannot merge unrelated tournaments when delivered from an authored map',async()=>fixture(async f=>{
 const custom={...main,id:'isolated-custom'};
 let old=await f.send(custom,alice,'join');old=await f.progress(custom,alice,old,hit);const oldTournament=old.tournament.id;
 const current=await f.send(main,alice,'join');assert.notEqual(current.tournament.id,oldTournament);
 const state=await f.send(main,alice,'rad-tox-progress',{matchId:old.match.id,phaseId:old.radTox.phaseId,sequence:2,stats:{...hit,shots:2,hits:2,enemyHits:2,score:13}});
 assert.equal(state.tournament.id,current.tournament.id);assert.equal(state.tournament.results.find(row=>row.id==='account:alice').score,0);
 const historical=await f.runtime.snapshot(custom.id,custom);assert.equal(historical.tournament.id,oldTournament);assert.equal(historical.tournament.results.find(row=>row.id==='account:alice').score,13);
}));
