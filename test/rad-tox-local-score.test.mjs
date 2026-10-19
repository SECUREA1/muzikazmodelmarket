import test from 'node:test';
import assert from 'node:assert/strict';
import {openMatch, finishMatch, tournamentView} from '../rpg-match.mjs';
import {applyRadToxProgress, captureRadToxScorePhase, hasRadToxScorePhase, RAD_TOX_REPORT_GRACE_MS} from '../rad-tox-local-score.mjs';
import {emptyRadToxScore, RadToxScoreReporter} from '../public/js/rad-tox-score-reporter.js';

function encounter() {
  const now = 100000;
  const sim = {players: {alice: {username: 'Alice', lastSeen: now, health: 100, score: 0}, bob: {username: 'Bob', lastSeen: now, health: 100, score: 0}}, actors: {}};
  sim.radTox = {combatMode: 'local', level: 1, wave: 1, phaseId: 'wave-1', phaseKind: 'wave', startedAt: now, endsAt: now + 120000, targetCount: 12};
  openMatch(sim, 1, now);
  captureRadToxScorePhase(sim, now);
  return {sim, now};
}
const progress = (sim, stats = {}, extra = {}) => ({matchId: sim.match.id, phaseId: sim.radTox.phaseId, sequence: 1, lifeRevision: sim.players.alice.lifeRevision, stats: {...emptyRadToxScore(), ...stats}, ...extra});
const playerRow = (sim, id = 'alice') => tournamentView(sim, 100000).results.find(row => row.id === id);

test('local combat reports add cumulative deltas once and keep each tournament user separate', () => {
  const {sim, now} = encounter();
  const report = progress(sim, {shots: 4, hits: 3, misses: 1, enemyHits: 5, enemyKills: 2, score: 26, damageDealt: 60, hitsTaken: 1, damageTaken: 100 / 45}, {health: 100 - 100 / 45, ammo: 116, fuel: 95});
  const first = applyRadToxProgress(sim, 'alice', report, now + 1000);
  assert.equal(first.delta.score, 26);
  assert.equal(sim.players.alice.score, 26);
  assert.equal(sim.players.alice.health, report.health);
  assert.equal(sim.players.alice.combat.enemyHits, 5, 'damage ticks can exceed aimed shots');
  assert.deepEqual(applyRadToxProgress(sim, 'alice', report, now + 1100).delta, emptyRadToxScore());
  assert.equal(sim.players.alice.score, 26);
  assert.equal(playerRow(sim).score, 26);
  assert.equal(playerRow(sim).enemyKills, 2);
  assert.equal(playerRow(sim, 'bob').score, 0);
  const next = structuredClone(report);
  next.sequence = 2; next.stats.shots++; next.stats.hits++; next.stats.enemyKills++; next.stats.score += 14;
  assert.equal(applyRadToxProgress(sim, 'alice', next, now + 2000).delta.score, 14);
  assert.equal(playerRow(sim).score, 40);
  assert.equal(sim.players.alice.combat.shots, 5);
  assert.deepEqual(sim.players.alice.localScoreAck, {matchId: sim.match.id, phaseId: 'wave-1', sequence: 2});
});

test('a final report across wave and level transitions keeps earned scores without overwriting new supplies', () => {
  const {sim, now} = encounter();
  const old = progress(sim, {enemyKills: 1, score: 10}, {health: 20, ammo: 3});
  sim.radTox = {...sim.radTox, wave: 2, phaseId: 'wave-2', startedAt: now + 130000, endsAt: now + 250000};
  for (const player of Object.values(sim.players)) player.lastSeen = now + 130000;
  captureRadToxScorePhase(sim, now + 130000);
  applyRadToxProgress(sim, 'alice', old, now + 130100);
  assert.equal(sim.players.alice.score, 10);
  assert.equal(sim.players.alice.health, 100, 'an old wave cannot deplete current health');
  assert.equal(sim.players.alice.ammo, 120);
  assert.equal(sim.radTox.localProgress, undefined);
  const late = progress(sim, {shots: 2, hits: 2, enemyKills: 2, score: 23}, {health: 0});
  finishMatch(sim, 'victory', now + 250000);
  for (const player of Object.values(sim.players)) player.lastSeen = now + 260000;
  openMatch(sim, 2, now + 260000);
  sim.radTox = {...sim.radTox, level: 2, wave: 1, phaseId: 'level-2-wave-1', startedAt: now + 260000, endsAt: now + 380000};
  for (const player of Object.values(sim.players)) player.lastSeen = now + 260000;
  captureRadToxScorePhase(sim, now + 260000);
  applyRadToxProgress(sim, 'alice', late, now + 260100);
  assert.equal(sim.players.alice.score, 0, 'the next level starts at zero');
  assert.equal(sim.players.alice.health, 100);
  assert.equal(sim.matchHistory[0].results.find(row => row.id === 'alice').score, 33);
  assert.equal(playerRow(sim).score, 33, 'tournament keeps all levels and late final reports');
  assert.equal(hasRadToxScorePhase(sim, late, 'alice'), true);
  assert.equal(hasRadToxScorePhase(sim, late, 'unknown'), false);
});

test('boss completion is phase-specific, idempotent, and contributes its earned points', () => {
  const {sim, now} = encounter();
  sim.radTox = {...sim.radTox, phaseKind: 'boss', phaseId: 'boss-1', wave: 5, targetCount: 1, endsAt: null};
  captureRadToxScorePhase(sim, now);
  const boss = progress(sim, {shots: 20, hits: 20, enemyHits: 20, enemyKills: 1, bossKills: 1, score: 220}, {bossDefeated: true});
  applyRadToxProgress(sim, 'alice', boss, now + 5000);
  applyRadToxProgress(sim, 'alice', boss, now + 5001);
  assert.equal(sim.radTox.localProgress.alice.bossDefeated, true);
  assert.equal(sim.radTox.localProgress.alice.sequence, 1);
  assert.equal(sim.radTox.localProgress.bob, undefined, 'one user cannot complete another user’s boss');
  assert.equal(playerRow(sim).score, 220);
  assert.equal(playerRow(sim).bossKills, 1);
});

test('batched tool actions preserve field quest progress and reject impossible counts', () => {
  const {sim, now} = encounter();
  for (const stats of [{sprayActions: 41}, {taserHits: 1}, {blastHits: 1}]) {
    assert.throws(() => applyRadToxProgress(sim, 'alice', progress(sim, stats), now), {statusCode: 422});
  }
  const report = progress(sim, {shots: 2, hits: 2, sprayActions: 4, taserHits: 1, blastHits: 1});
  applyRadToxProgress(sim, 'alice', report, now);
  applyRadToxProgress(sim, 'alice', report, now + 1);
  assert.deepEqual(sim.players.alice.progress, {defeat: 0, 'laser-hit': 2, spray: 4, 'taser-hit': 1, 'blast-hit': 1});
  assert.equal(playerRow(sim).score, 0, 'tool quests do not invent tournament points');
});

test('the results countdown refreshes when the last buffered combat report arrives', () => {
  const {sim, now} = encounter();
  sim.radTox.state = 'cleared';
  sim.radTox.transition = {kind: 'wave', at: now + 130000, results: []};
  applyRadToxProgress(sim, 'alice', progress(sim, {enemyKills: 2, score: 20}), now + 120050);
  assert.equal(sim.radTox.transition.results.find(row => row.id === 'alice').score, 20);
});

test('finished-level and archived results include the last accepted score and health', () => {
  const {sim, now} = encounter();
  finishMatch(sim, 'victory', now + 120000);
  applyRadToxProgress(sim, 'alice', progress(sim, {enemyKills: 1, score: 10}, {health: 20}), now + 120100);
  for (const result of [sim.match, sim.matchHistory[0]]) {
    const row = result.results.find(entry => entry.id === 'alice');
    assert.equal(row.score, 10);
    assert.equal(row.health, 20);
  }
});

test('mobile map loading retains final reports at ninety seconds and gives an explicit expiry after five minutes', () => {
  const {sim, now} = encounter();
  const old = progress(sim, {enemyKills: 1, score: 10});
  sim.radTox = {...sim.radTox, phaseId: 'next-wave', wave: 2, startedAt: now + 130000, endsAt: now + 250000};
  captureRadToxScorePhase(sim, now + 130000);
  applyRadToxProgress(sim, 'alice', old, now + 120000 + 90000);
  assert.equal(playerRow(sim).score, 10);
  assert.throws(() => applyRadToxProgress(sim, 'bob', old, now + 120000 + 300001), {statusCode: 409, code: 'RAD_TOX_PHASE_EXPIRED'});
  assert.equal(playerRow(sim, 'bob').score, 0);
});

test('invalid, backwards, excessive, unrelated and expired reports do not create score', () => {
  const {sim, now} = encounter();
  for (const fields of [{enemyKills: 13, score: 130}, {score: 1}, {shots: Infinity}, {shots: -1}, {enemyKills: 0.5}, {shots: 1, hits: 2}, {shots: 1, hits: 1, misses: 1}, {shots: 400}]) {
    assert.throws(() => applyRadToxProgress(sim, 'alice', progress(sim, fields), now), {statusCode: 422});
  }
  assert.throws(() => applyRadToxProgress(sim, 'alice', progress(sim, {enemyKills: 1, score: 10}, {bossDefeated: true}), now), {statusCode: 422});
  assert.throws(() => applyRadToxProgress(sim, 'alice', progress(sim, {}, {phaseId: 'other'}), now), {statusCode: 409});
  applyRadToxProgress(sim, 'alice', progress(sim, {shots: 2, hits: 1, score: 1}), now);
  assert.throws(() => applyRadToxProgress(sim, 'alice', progress(sim, {}, {sequence: 2}), now + 1000), {statusCode: 422});
  const late = progress(sim, {enemyKills: 1, score: 10}, {sequence: 2});
  assert.throws(() => applyRadToxProgress(sim, 'bob', late, now + 120000 + RAD_TOX_REPORT_GRACE_MS + 1), {statusCode: 409});
  assert.equal(sim.players.alice.score, 1);
  assert.equal(sim.players.bob.score, 0);
});

test('a report queued before respawn credits combat but cannot overwrite restored health or ammunition', () => {
  const {sim, now} = encounter();
  const beforeRespawn = progress(sim, {enemyKills: 1, score: 10}, {health: 0, ammo: 0, lifeRevision: 1});
  sim.players.alice.lifeRevision = 2;
  sim.players.alice.health = 100;
  sim.players.alice.ammo = 120;
  applyRadToxProgress(sim, 'alice', beforeRespawn, now + 1000);
  assert.equal(sim.players.alice.score, 10);
  assert.equal(sim.players.alice.health, 100);
  assert.equal(sim.players.alice.ammo, 120);
  applyRadToxProgress(sim, 'alice', {...beforeRespawn, sequence: 2, health: 90, ammo: 110, lifeRevision: 2}, now + 1500);
  assert.equal(sim.players.alice.health, 90);
  assert.equal(sim.players.alice.ammo, 110);
});

test('browser retries and late wave flushing round-trip through the authoritative acknowledgement without double points', () => {
  const {sim, now} = encounter();
  const reporter = new RadToxScoreReporter();
  reporter.begin({matchId: sim.match.id, phaseId: sim.radTox.phaseId}, {health: 100, lifeRevision: sim.players.alice.lifeRevision});
  reporter.record({enemyKills: 1, score: 10});
  const lostReply = reporter.report(0);
  applyRadToxProgress(sim, 'alice', lostReply, now);
  reporter.record({enemyKills: 1, score: 10}, {health: 10});
  sim.radTox = {...sim.radTox, wave: 2, phaseId: 'next-wave', startedAt: now + 2000, endsAt: now + 122000};
  captureRadToxScorePhase(sim, now + 2000);
  reporter.begin({matchId: sim.match.id, phaseId: sim.radTox.phaseId}, {health: 100, lifeRevision: sim.players.alice.lifeRevision});
  const nextWave = reporter.report(100);
  reporter.acknowledge(applyRadToxProgress(sim, 'alice', nextWave, now + 2100).ack);
  const retry = reporter.report(1500);
  assert.deepEqual(retry, lostReply);
  reporter.acknowledge(applyRadToxProgress(sim, 'alice', retry, now + 2200).ack);
  const oldFinal = reporter.flush(1600);
  assert.equal(oldFinal.phaseId, 'wave-1');
  reporter.acknowledge(applyRadToxProgress(sim, 'alice', oldFinal, now + 2300).ack);
  assert.equal(playerRow(sim).score, 20);
  assert.equal(sim.players.alice.health, 100);
  assert.equal(reporter.pending, false);
});


test('the tournament ending closes an untimed boss report window without renewing it on reconnect',()=>{
 const {sim,now}=encounter();sim.radTox={...sim.radTox,phaseKind:'boss',phaseId:'final-boss',wave:5,targetCount:1,endsAt:null};captureRadToxScorePhase(sim,now);
 const packet=progress(sim,{enemyKills:1,bossKills:1,score:10},{bossDefeated:true});finishMatch(sim,'victory',now+1000);
 applyRadToxProgress(sim,'alice',packet,now+2000);
 const key=packet.matchId+':'+packet.phaseId;assert.equal(sim.radToxScoreLedger.phases[key].closedAt,now+1000);
 assert.throws(()=>applyRadToxProgress(sim,'bob',packet,now+1000+RAD_TOX_REPORT_GRACE_MS+1),{statusCode:409,code:'RAD_TOX_PHASE_EXPIRED'});
 assert.equal(sim.radToxScoreLedger.phases[key].closedAt,now+1000,'reconnecting does not reopen the final report window');
});
