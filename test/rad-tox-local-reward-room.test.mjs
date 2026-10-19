import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {RadToxScoreReporter} from '../public/js/rad-tox-score-reporter.js';

const map={id:'local-reward-room',name:'Local rewards',modelUrl:'/test-house.glb',spawn:{x:0,y:0,z:2}};
const alice={accountId:'alice',walletId:'wallet-alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',walletId:'wallet-bob',username:'Bob',stats:{health:100}};
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'rad-local-reward-room-')),db=new UserJsonDatabase(join(dir,'users.json'));let now=100000,request=0,unavailable=false,lostGrant=false;
 for(const user of [alice,bob])await db.put(user.walletId,{tokens:{MZK:0},items:[],memory:{account:{accountId:user.accountId}}});
 const store=new SharedRoomStore(join(dir,'rooms.json'));
 const createRuntime=current=>{
  const runtime=new AuthoritativeRooms({store:current,now:()=>now,grantLocalRewards:async(identity,grant)=>{
   if(unavailable)throw Error('Temporary account storage outage');
   const receipt=await db.grantRadToxRewards(identity.walletId,grant);
   if(lostGrant){lostGrant=false;throw Error('Lost wallet response after commit');}return receipt;
  }});
  runtime.collision.safeSpawn=(_,point)=>({...point});runtime.collision.resolve=(_,before,next)=>({...next});return runtime;
 };
 let runtime=createRuntime(store);
 const send=(user,action,fields={})=>runtime.command(map.id,map,user,{action,requestId:'reward-room-'+(++request),...fields});
 const report=(user,state,stats={},extra={})=>send(user,'rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:1,stats,lifeRevision:state.players['account:'+user.accountId].lifeRevision,...extra});
 try{await run({db,store,send,report,get runtime(){return runtime;},set unavailable(value){unavailable=value;},set lostGrant(value){lostGrant=value;},async restart(){await store.flush();runtime=createRuntime(new SharedRoomStore(store.file));},advance(ms){now+=ms;}});}finally{await rm(dir,{recursive:true,force:true});}
}
const kill={shots:1,hits:1,enemyHits:1,enemyKills:1,score:11};

test('each player collects their own local coins and durable care rewards while sharing only clocks and scores',async()=>fixture(async f=>{
 let state=await f.send(alice,'join');const other=await f.send(bob,'join');
 assert.equal(state.radTox.phaseId,other.radTox.phaseId);assert.equal(state.radTox.targetCount,36);
 assert.deepEqual(state.actors,{});assert.equal(state.radToxRewards.manifest.length,30);
 const coin=state.radToxRewards.manifest.find(entry=>entry.slot==='field-coin-0'),care=state.radToxRewards.manifest.find(entry=>entry.slot==='field-care-0');
 const bobCoin=other.radToxRewards.manifest.find(entry=>entry.slot===coin.slot);assert.notEqual(coin.id,bobCoin.id,'one player cannot consume another player’s local coin');
 state=await f.report(alice,state,kill,{claimIds:[coin.id,care.id],health:75,ammo:119,fuel:80,spray:36});
 assert.equal(state.players['account:alice'].health,75,'locally applied supplies are not applied a second time by the server');assert.equal(state.players['account:alice'].spray,36);
 assert.deepEqual(new Set(state.result.localScoreAck.claimedIds),new Set([coin.id,care.id]));assert.equal(state.players['account:alice'].score,11);
 let account=await f.db.get(alice.walletId);assert.equal(account.tokens.MZK,5);assert.equal(account.items.length,1);assert.equal(account.items[0].catalogId,'ion-health-vial');
 assert.equal((await f.db.get(bob.walletId)).tokens.MZK,0);
 await f.report(bob,other,{}, {claimIds:[bobCoin.id]});assert.equal((await f.db.get(bob.walletId)).tokens.MZK,5);
 await assert.rejects(f.report(alice,state,{shots:2,hits:2,enemyKills:2,score:23},{sequence:2,claimIds:[bobCoin.id]}),{statusCode:422});
 state=await f.report(alice,state,kill,{sequence:2,claimIds:[coin.id,care.id]});account=await f.db.get(alice.walletId);
 assert.equal(account.tokens.MZK,5);assert.equal(account.items.length,1);assert.equal(state.players['account:alice'].score,11,'reward retries never replay score deltas');
 assert.ok(state.players['account:alice'].combat.itemsCollected.includes('ion-health-vial'));
 await f.restart();state=await f.send(alice,'join');assert.ok(state.radToxRewards.claimedIds.includes(coin.id));assert.ok(state.radToxRewards.claimedIds.includes(care.id));
 assert.equal((await f.db.get(alice.walletId)).tokens.MZK,5);
}));

test('kill-gated drops and existing MZK quests follow accepted batched combat progress',async()=>fixture(async f=>{
 let state=await f.send(alice,'join');const gated=state.radToxRewards.manifest.find(entry=>entry.slot==='kill-coin-0');assert.equal(gated.requiresKills,3);
 await assert.rejects(f.report(alice,state,kill,{claimIds:[gated.id]}),{statusCode:409});assert.equal((await f.db.get(alice.walletId)).tokens.MZK,0);
 state=await f.report(alice,state,{shots:3,hits:3,enemyHits:3,enemyKills:3,score:36},{claimIds:[gated.id]});
 assert.equal((await f.db.get(alice.walletId)).tokens.MZK,2);
 state=await f.report(alice,state,{shots:5,hits:5,enemyHits:5,enemyKills:3,score:45,sprayActions:4,taserHits:1,blastHits:1},{sequence:2});
 const account=await f.db.get(alice.walletId);assert.equal(account.memory.memberRewards.field.events.defeat,3);assert.equal(account.memory.memberRewards.field.events['laser-hit'],5);
 await f.db.memberReward(alice.walletId,'claim',{rewardId:'field:first-contact'});await f.db.memberReward(alice.walletId,'claim',{rewardId:'field:trigger-happy'});
 assert.equal((await f.db.get(alice.walletId)).tokens.MZK,57,'the existing quest buttons can claim their earned account rewards');
 for(const rewardId of ['field:leave-a-mark','field:shock-wave','field:big-bang'])await f.db.memberReward(alice.walletId,'claim',{rewardId});
 assert.equal((await f.db.get(alice.walletId)).tokens.MZK,162,'spray, taser and blast quests remain available through batched progress');
}));

test('storage outages and a lost grant response preserve scores and retry wallet claims without reminting',async()=>fixture(async f=>{
 let state=await f.send(alice,'join');const coin=state.radToxRewards.manifest.find(entry=>entry.slot==='field-coin-0');
 const reporter=new RadToxScoreReporter();reporter.begin({matchId:state.match.id,phaseId:state.radTox.phaseId});reporter.record(kill,{claimIds:[coin.id]});
 f.unavailable=true;const first=reporter.report(0);state=await f.send(alice,'rad-tox-progress',first);reporter.acknowledge(state.result.localScoreAck);
 assert.equal(state.players['account:alice'].score,11);assert.equal(state.result.localScoreAck.rewardsPending,true);assert.equal(reporter.pending,true);assert.equal((await f.db.get(alice.walletId)).tokens.MZK,0);
 f.unavailable=false;f.lostGrant=true;const next=reporter.report(1000);state=await f.send(alice,'rad-tox-progress',next);reporter.acknowledge(state.result.localScoreAck);
 assert.equal(state.result.localScoreAck.rewardsPending,true);assert.equal((await f.db.get(alice.walletId)).tokens.MZK,5,'the wallet committed even though its acknowledgement was lost');
 const retry=reporter.report(2000);state=await f.send(alice,'rad-tox-progress',retry);reporter.acknowledge(state.result.localScoreAck);
 assert.equal(state.result.localScoreAck.rewardsPending,false);assert.equal(reporter.pending,false);assert.equal((await f.db.get(alice.walletId)).tokens.MZK,5);assert.equal(state.players['account:alice'].score,11);
}));
