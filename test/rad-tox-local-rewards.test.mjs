import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {openMatch,finishMatch} from '../rpg-match.mjs';
import {applyRadToxProgress,captureRadToxScorePhase} from '../rad-tox-local-score.mjs';
import {emptyRadToxScore} from '../public/js/rad-tox-score-reporter.js';
import {radToxRewardManifest,validateRadToxRewardClaims,claimRadToxRewards,radToxLocalRewardView} from '../rad-tox-local-rewards.mjs';

function fixture(kind='wave',targetCount=12){
  const now=100000,sim={players:{},actors:{}};
  for(const name of ['alice','bob'])sim.players['account:'+name]={username:name,lastSeen:now,health:100,score:0};
  sim.radTox={combatMode:'local',level:1,wave:kind==='boss'?5:1,phaseId:'phase-1',phaseKind:kind,targetCount,startedAt:now,endsAt:kind==='boss'?null:now+120000};
  openMatch(sim,1,now);const phase=captureRadToxScorePhase(sim,now);
  return {sim,phase,now};
}
const report=(sim,claimIds=[],stats={},extra={})=>({matchId:sim.match.id,phaseId:sim.radTox.phaseId,sequence:1,stats:{...emptyRadToxScore(),...stats},claimIds,...extra});
const find=(phase,id,slot)=>radToxRewardManifest(phase,id).find(entry=>entry.slot===slot);
async function database(t){
  const dir=await mkdtemp(join(tmpdir(),'rad-local-rewards-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const db=new UserJsonDatabase(join(dir,'users.json'));
  for(const name of ['alice','bob'])await db.put('wallet-'+name,{tokens:{MZK:0},items:[],memory:{account:{accountId:name}}});
  return db;
}

test('compact deterministic slots isolate accounts and phases while fixing every reward amount',()=>{
  const {phase}=fixture('wave',138),alice=radToxRewardManifest(phase,'account:alice'),bob=radToxRewardManifest(phase,'account:bob');
  assert.equal(alice.length,30);
  assert.deepEqual(radToxRewardManifest(phase,'account:alice'),alice);
  assert.equal(new Set([...alice,...bob].map(entry=>entry.id)).size,60);
  assert.equal(alice.filter(entry=>entry.kind==='mzk').reduce((sum,entry)=>sum+entry.amountMzk,0),54);
  assert.equal(new Set(alice.filter(entry=>entry.requiresKills).map(entry=>entry.requiresKills)).size,12);
  assert.equal(alice.find(entry=>entry.slot==='kill-coin-11').requiresKills,138);
  assert.notEqual(radToxRewardManifest({...phase,phaseId:'another-phase'},'account:alice')[0].id,alice[0].id);
  const boss=radToxRewardManifest({...phase,phaseKind:'boss',targetCount:1},'account:alice');
  assert.equal(boss.length,14);assert.equal(boss.find(entry=>entry.slot==='boss-coin').amountMzk,25);
  assert.equal(boss.find(entry=>entry.slot==='boss-care').catalogId,'ioncore-survival-pack');
});

test('prevalidation rejects foreign, invented, excessive and locked pickup IDs before combat mutation',()=>{
  const {sim,phase,now}=fixture(),alice='account:alice',coin=find(phase,alice,'field-coin-0'),kill=find(phase,alice,'kill-coin-0');
  for(const ids of [[find(phase,'account:bob','field-coin-0').id],['invented'],Array(65).fill(coin.id)]){
    assert.throws(()=>validateRadToxRewardClaims(sim,alice,report(sim,ids),now),{statusCode:422});
  }
  assert.throws(()=>validateRadToxRewardClaims(sim,alice,report(sim,[kill.id]),now),{statusCode:409});
  assert.equal(validateRadToxRewardClaims(sim,alice,report(sim,[coin.id,coin.id]),now).claims.length,1);
  assert.equal(sim.players[alice].score,0);
  assert.equal(sim.radToxScoreLedger.phases[phase.key].rewardClaims,undefined);
});

test('two players collect their own coins and care items once without spawning server actors',async t=>{
  const db=await database(t),{sim,phase,now}=fixture();
  for(const name of ['alice','bob']){
    const id='account:'+name,ids=['field-coin-0','field-care-0','field-supply-0'].map(slot=>find(phase,id,slot).id),packet=report(sim,ids);
    applyRadToxProgress(sim,id,packet,now);
    const grant=input=>db.grantRadToxRewards('wallet-'+name,input);
    const accepted=await claimRadToxRewards(sim,id,packet,now,grant);
    assert.equal(accepted.amountMzk,5);assert.equal(accepted.balanceAfterMzk,5);assert.equal(accepted.items.length,1);
    await claimRadToxRewards(sim,id,packet,now+1,grant);
    const user=await db.get('wallet-'+name);assert.equal(user.tokens.MZK,5);assert.equal(user.items.length,1);assert.equal(user.memory.radToxRewards.supplies.health,25);
    assert.equal(sim.players[id].health,100,'confirmed supply receipts do not heal the already-updated local player twice');
    assert.deepEqual(sim.players[id].combat.itemsCollected,['ion-health-vial']);
    assert.deepEqual(radToxLocalRewardView(sim,id).claimedIds.sort(),ids.sort());
  }
  assert.deepEqual(sim.actors,{});
});

test('late catalog pickups amend their completed level without adding items to the next level',async t=>{
  const db=await database(t),{sim,phase,now}=fixture(),id='account:alice';
  const care=find(phase,id,'field-care-0'),packet=report(sim,[care.id]);
  applyRadToxProgress(sim,id,packet,now);
  finishMatch(sim,'victory',now+1000);
  openMatch(sim,2,now+2000);
  sim.radTox={...sim.radTox,level:2,phaseId:'next-level',startedAt:now+2000,endsAt:now+122000};
  captureRadToxScorePhase(sim,now+2000);
  const grant=input=>db.grantRadToxRewards('wallet-alice',input);
  await claimRadToxRewards(sim,id,packet,now+2100,grant);
  await claimRadToxRewards(sim,id,packet,now+2200,grant);
  assert.deepEqual(sim.players[id].combat.itemsCollected,[]);
  const row=sim.matchHistory[0].results.find(entry=>entry.id===id);
  assert.deepEqual(row.items,['ion-health-vial']);assert.deepEqual(row.itemsCollected,['ion-health-vial']);
  assert.equal((await db.get('wallet-alice')).items.length,1);
});

test('database commitment survives a lost room acknowledgement, restart, and consumption of the granted item',async t=>{
  const db=await database(t),{sim,phase,now}=fixture(),id='account:alice';
  const ids=['field-coin-0','field-care-0'].map(slot=>find(phase,id,slot).id),packet=report(sim,ids);
  applyRadToxProgress(sim,id,packet,now);
  let durable;
  await assert.rejects(claimRadToxRewards(sim,id,packet,now,async input=>{durable=await db.grantRadToxRewards('wallet-alice',input);throw Error('reply lost');}),/reply lost/);
  assert.deepEqual(phase.rewardClaims[id],{},'room never confirms an unacknowledged durable grant');
  const item=durable.items[0];await db.rpgAction('wallet-alice','use',item.id,'use-earned-vial');
  const reopened=new UserJsonDatabase(db.file);
  await claimRadToxRewards(sim,id,packet,now+1,input=>reopened.grantRadToxRewards('wallet-alice',input));
  assert.equal((await reopened.get('wallet-alice')).tokens.MZK,5);
  assert.equal((await reopened.get('wallet-alice')).items.length,0,'retry cannot recreate an already-used care item');
  assert.equal((await reopened.read()).transactions.filter(entry=>entry.type==='RAD_TOX_LOCAL_REWARD').length,2);
});

test('atomic accepted progress restores field quests without per-hit grants or replayed progress',async t=>{
  const db=await database(t),{sim,phase,now}=fixture(),id='account:alice';let calls=0;
  const grant=input=>{calls++;return db.grantRadToxRewards('wallet-alice',input);};
  let packet=report(sim,[],{enemyKills:2,hits:3,shots:3,score:26});
  applyRadToxProgress(sim,id,packet,now);
  await claimRadToxRewards(sim,id,packet,now,grant);
  await claimRadToxRewards(sim,id,packet,now,grant);assert.equal(calls,1,'unchanged accepted combat avoids another database write');
  let user=await db.get('wallet-alice');assert.equal(user.tokens.MZK,0);assert.equal(user.memory.memberRewards.field.events.defeat,2);
  assert.equal(user.memory.memberRewards.field.events['laser-hit'],3);
  packet=report(sim,[],{enemyKills:3,hits:5,shots:5,score:45},{sequence:2});applyRadToxProgress(sim,id,packet,now+1000);
  await claimRadToxRewards(sim,id,packet,now+1000,grant);
  const account=await db.memberReward('wallet-alice','claim',{rewardId:'field:first-contact'});
  assert.equal(account.amountMzk,30);
  await db.memberReward('wallet-alice','claim',{rewardId:'field:trigger-happy'});
  await db.memberReward('wallet-alice','claim',{rewardId:'field:first-contact'});
  user=await new UserJsonDatabase(db.file).get('wallet-alice');assert.equal(user.tokens.MZK,55);
  assert.deepEqual(phase.rewardProgress[id],{enemyKills:3,hits:5,sprayActions:0,taserHits:0,blastHits:0,shots:5,bossDefeated:false});
});

test('batched spray, taser and blast progress restores the remaining field quests once',async t=>{
  const db=await database(t),{phase}=fixture(),input={playerId:'account:alice',phase,claimIds:[],progress:{shots:2,sprayActions:4,taserHits:1,blastHits:1}};
  await db.grantRadToxRewards('wallet-alice',input);
  await db.grantRadToxRewards('wallet-alice',input);
  let user=await db.get('wallet-alice');
  assert.equal(user.tokens.MZK,0,'progress itself never mints quest tokens');
  assert.equal(user.memory.memberRewards.field.events.spray,4);
  assert.equal(user.memory.memberRewards.field.events['taser-hit'],1);
  assert.equal(user.memory.memberRewards.field.events['blast-hit'],1);
  for(const rewardId of ['field:leave-a-mark','field:shock-wave','field:big-bang']){
    await db.memberReward('wallet-alice','claim',{rewardId});
    await db.memberReward('wallet-alice','claim',{rewardId});
  }
  user=await new UserJsonDatabase(db.file).get('wallet-alice');assert.equal(user.tokens.MZK,105);
  assert.throws(()=>db.grantRadToxRewards('wallet-alice',{...input,progress:{shots:1,taserHits:2}}),{statusCode:422});
});

test('accepted kills and boss completion gate the fixed drop slots',async t=>{
  const db=await database(t),id='account:alice';
  const normal=fixture(),kill=find(normal.phase,id,'kill-coin-0');
  let packet=report(normal.sim,[kill.id],{enemyKills:1,score:10});
  applyRadToxProgress(normal.sim,id,packet,normal.now);
  await claimRadToxRewards(normal.sim,id,packet,normal.now,input=>db.grantRadToxRewards('wallet-alice',input));
  assert.equal((await db.get('wallet-alice')).tokens.MZK,2);
  const boss=fixture('boss',1),bossIds=['boss-coin','boss-care'].map(slot=>find(boss.phase,id,slot).id);
  packet=report(boss.sim,bossIds,{enemyKills:1,score:10});
  assert.throws(()=>validateRadToxRewardClaims(boss.sim,id,packet,boss.now),{statusCode:409});
  packet.bossDefeated=true;applyRadToxProgress(boss.sim,id,packet,boss.now);
  await claimRadToxRewards(boss.sim,id,packet,boss.now,input=>db.grantRadToxRewards('wallet-alice',input));
  const user=await db.get('wallet-alice');assert.equal(user.tokens.MZK,27);assert.equal(user.items[0].catalogId,'ioncore-survival-pack');
});

test('database grants ignore fabricated amounts, enforce account ownership and fail atomically for a full Backpack',async t=>{
  const db=await database(t),{phase}=fixture(),id='account:alice',coin=find(phase,id,'field-coin-0'),care=find(phase,id,'field-care-0');
  const input={playerId:id,phase,claimIds:[coin.id],amountMzk:999999,claims:[{...coin,amountMzk:999999}]};
  await assert.rejects(db.grantRadToxRewards('wallet-bob',input),{statusCode:403});
  await db.grantRadToxRewards('wallet-alice',input);assert.equal((await db.get('wallet-alice')).tokens.MZK,5);
  const kill=find(phase,id,'kill-coin-0');
  assert.throws(()=>db.grantRadToxRewards('wallet-alice',{playerId:id,phase,claimIds:[kill.id]}),{statusCode:409});
  const boss=fixture('boss',1),bossCoin=find(boss.phase,id,'boss-coin');
  assert.throws(()=>db.grantRadToxRewards('wallet-alice',{playerId:id,phase:boss.phase,claimIds:[bossCoin.id],progress:{enemyKills:1,hits:1}}),{statusCode:409});
  const other=find(phase,id,'field-coin-1');
  await db.put('wallet-alice',{items:Array.from({length:10000},(_,i)=>({id:'item-'+i}))});
  await assert.rejects(db.grantRadToxRewards('wallet-alice',{playerId:id,phase,claimIds:[other.id,care.id]}),/Backpack is full/);
  assert.equal((await db.get('wallet-alice')).tokens.MZK,5,'failed catalog capacity cannot partially credit the same batch coins');
});

test('temporary persistence failures leave both pickup and quest progress pending for retry',async()=>{
  const {sim,phase,now}=fixture(),id='account:alice',coin=find(phase,id,'field-coin-0'),packet=report(sim,[coin.id],{enemyKills:1,score:10});
  applyRadToxProgress(sim,id,packet,now);
  await assert.rejects(claimRadToxRewards(sim,id,packet,now,async()=>{throw Error('disk busy');}),/disk busy/);
  assert.deepEqual(phase.rewardClaims[id],{});assert.equal(phase.rewardProgress[id],undefined);
  assert.equal(sim.players[id].score,10,'wallet persistence is independent of accepted tournament points');
});
