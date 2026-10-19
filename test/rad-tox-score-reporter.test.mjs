import test from 'node:test';
import assert from 'node:assert/strict';
import {RadToxScoreReporter} from '../public/js/rad-tox-score-reporter.js';

const identity = {matchId: 'level-1', phaseId: 'wave-1'};

test('local hit recording is synchronous and reports batch with acknowledged cumulative sequences', () => {
  const reporter = new RadToxScoreReporter();
  reporter.begin(identity, {health: 100});
  reporter.record({shots: 1, hits: 1, enemyKills: 1, score: 11});
  const first = reporter.report(0);
  assert.equal(first.stats.score, 11);
  assert.equal(reporter.report(100), null);
  reporter.record({shots: 1, misses: 1});
  assert.equal(reporter.acknowledge({...identity, sequence: 1}), true);
  assert.equal(reporter.report(999), null);
  const next = reporter.report(1000);
  assert.equal(next.sequence, 2);
  assert.equal(next.stats.shots, 2);
  assert.equal(next.stats.score, 11);
  reporter.acknowledge(next);
  assert.equal(reporter.pending, false);
});

test('lost replies retry the same report without erasing hits recorded while it was in flight', () => {
  const reporter = new RadToxScoreReporter();
  reporter.begin(identity);
  reporter.record({enemyKills: 1, score: 10});
  const first = reporter.report(0);
  reporter.record({enemyKills: 1, score: 10});
  assert.equal(reporter.report(1499), null);
  const retry = reporter.report(1500);
  assert.deepEqual(retry, first);
  retry.stats.score = 999;
  assert.equal(reporter.report(3000).stats.score, 10, 'consumer mutations cannot alter a pending report');
  assert.equal(reporter.acknowledge({...identity, sequence: 2}), false);
  reporter.acknowledge(first);
  const final = reporter.report(4000);
  assert.equal(final.sequence, 2);
  assert.equal(final.stats.score, 20);
  assert.equal(final.stats.enemyKills, 2);
});

test('phase changes preserve old final reports and send the next wave independently', () => {
  const reporter = new RadToxScoreReporter();
  reporter.begin(identity);
  reporter.record({enemyKills: 1, score: 10});
  const old = reporter.report(0);
  reporter.record({enemyKills: 1, score: 10});
  reporter.begin({...identity, phaseId: 'boss'}, {health: 100});
  reporter.record({enemyKills: 1, score: 10}, {bossDefeated: true});
  const boss = reporter.report(100);
  assert.equal(boss.phaseId, 'boss');
  assert.equal(boss.bossDefeated, true);
  reporter.acknowledge(old);
  const oldFinal = reporter.flush(200);
  assert.equal(oldFinal.phaseId, 'wave-1');
  assert.equal(oldFinal.stats.score, 20);
  reporter.acknowledge(oldFinal);
  reporter.acknowledge(boss);
  assert.equal(reporter.pending, false);
  assert.equal(reporter.phases.size, 1, 'completed phases do not accumulate indefinitely');
});

test('same-phase snapshots do not reset local progress and reload can resume accepted counters', () => {
  const reporter = new RadToxScoreReporter();
  reporter.begin(identity, {health: 80}, {sequence: 7, stats: {shots: 10, hits: 8, enemyKills: 2, score: 56}});
  reporter.record({shots: 1, hits: 1, score: 9});
  reporter.begin(identity, {health: 77}, {sequence: 1, stats: {score: 0}});
  const report = reporter.flush(0);
  assert.equal(report.sequence, 8);
  assert.equal(report.stats.score, 65);
  assert.equal(report.stats.shots, 11);
  assert.equal(report.health, 77);
  assert.throws(() => reporter.record({score: -1}), TypeError);
  assert.throws(() => reporter.record({shots: 0.5}), TypeError);
});

test('only an explicit expiry removes that exact queued phase while current progress keeps reporting', () => {
  const reporter = new RadToxScoreReporter();
  reporter.begin(identity);
  reporter.record({enemyKills: 1, score: 10});
  const old = reporter.report(0);
  reporter.begin({...identity, phaseId: 'next'});
  reporter.record({enemyKills: 1, score: 10});
  assert.equal(reporter.reject(old, 'API_REQUEST_FAILED'), false);
  assert.equal(reporter.reject({...old, sequence: old.sequence + 1}, 'RAD_TOX_PHASE_EXPIRED'), false);
  assert.equal(reporter.reject(old, 'RAD_TOX_PHASE_EXPIRED'), true);
  assert.equal(reporter.begin(identity), false, 'a stale snapshot cannot requeue an expired phase');
  const next = reporter.report(100);
  assert.equal(next.phaseId, 'next');
  assert.equal(next.stats.score, 10);
  reporter.acknowledge(next);
  assert.equal(reporter.pending, false);
});

test('collected rewards retry after a score acknowledgement until the account grant is confirmed',()=>{
 const reporter=new RadToxScoreReporter();reporter.begin(identity,{health:80,spray:12});
 reporter.record({enemyKills:1,score:10},{claimIds:['coin-a','supply-b']});
 const first=reporter.report(0);first.claimIds.push('not-collected');
 assert.deepEqual(reporter.report(1500).claimIds,['coin-a','supply-b'],'transport consumers cannot mutate pending pickup IDs');
 reporter.acknowledge({...identity,sequence:1,claimedIds:['coin-a'],rewardsPending:true});
 assert.equal(reporter.pending,true);reporter.begin({...identity,phaseId:'next'});
 const retry=reporter.report(2500);assert.equal(retry.phaseId,identity.phaseId);assert.equal(retry.stats.score,10);assert.deepEqual(retry.claimIds,['coin-a','supply-b']);
 reporter.acknowledge({...retry,claimedIds:['coin-a','supply-b']});
 assert.equal(reporter.phases.has('level-1:wave-1'),false,'a completed old wave retires only after its final reward receipt');
});

test('a deferred quest update with no pickups is retried without requiring another shot',()=>{
 const reporter=new RadToxScoreReporter();reporter.begin(identity);reporter.record({shots:5,hits:5,score:15});
 const first=reporter.report(0);reporter.acknowledge({...first,rewardsPending:true,claimedIds:[]});
 assert.equal(reporter.pending,true);const retry=reporter.report(1000);assert.equal(retry.stats.hits,5);assert.equal(retry.sequence,2);
 reporter.acknowledge({...retry,rewardsPending:false,claimedIds:[]});assert.equal(reporter.pending,false);
});

test('a deferred wallet from an old wave cannot starve current multiplayer scores',()=>{
 const reporter=new RadToxScoreReporter();reporter.begin(identity);reporter.record({enemyKills:1,score:10},{claimIds:['coin']});
 let report=reporter.report(0);reporter.acknowledge({...report,rewardsPending:true});
 reporter.begin({...identity,phaseId:'next'});reporter.record({enemyKills:1,score:10});
 const phases=[];
 for(let now=1000;now<=6000;now+=1000){
  report=reporter.report(now);phases.push(report.phaseId);reporter.acknowledge({...report,rewardsPending:true});
 }
 assert.deepEqual(phases,['wave-1','next','wave-1','next','wave-1','next']);
 assert.equal(reporter.flush(6001)?.phaseId,'wave-1');
 reporter.acknowledge({...reporter.phases.get('level-1:wave-1').pending.report,rewardsPending:true});
 assert.equal(reporter.flush(6002),null,'closed-wave account retries retain the batched interval');
});
