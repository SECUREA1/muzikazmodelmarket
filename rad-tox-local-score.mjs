import {combatStats, matchRows, recordTournamentScore} from './rpg-match.mjs';
import {RAD_TOX_SCORE_FIELDS, emptyRadToxScore} from './public/js/rad-tox-score-reporter.js';

// Mobile GLB transitions can outlast a short request timeout. Old receipts only
// add bounded score deltas; they cannot restore stale health in the new phase.
export const RAD_TOX_REPORT_GRACE_MS = 300000;
const MAX_PHASES = 24;
const FRACTIONAL = new Set(['damageDealt', 'damageTaken']);
const fail = (message, statusCode = 422, code) => {throw Object.assign(new Error(message), {statusCode, code});};
const phaseKey = (matchId, phaseId) => `${matchId}:${phaseId}`;

export function hasRadToxScorePhase(sim, report, playerId) {
  if (!report?.matchId || !report?.phaseId) return false;
  const phase = sim.radToxScoreLedger?.phases?.[phaseKey(report.matchId, report.phaseId)];
  return Boolean(phase && (!playerId || phase.participants.includes(playerId)));
}

// The ledger is separate from the campaign so a final report can arrive after
// the shared clock advances, or after openMatch resets the next level's stats.
export function captureRadToxScorePhase(sim, now) {
  const campaign = sim.radTox, match = sim.match;
  if (!campaign?.phaseId || !match?.id) return null;
  const ledger = sim.radToxScoreLedger ||= {phases: {}, order: []};
  const key = phaseKey(match.id, campaign.phaseId);
  const previous = ledger.phases[ledger.order.at(-1)];
  if (previous && previous.key !== key && previous.closedAt === null) previous.closedAt = now;
  let phase = ledger.phases[key];
  if (!phase) {
    phase = ledger.phases[key] = {key, matchId: match.id, phaseId: campaign.phaseId,
      level: campaign.level, wave: campaign.wave, phaseKind: campaign.phaseKind,
      targetCount: Math.max(1, Math.floor(campaign.targetCount || 1)),
      population: campaign.population ? structuredClone(campaign.population) : null,
      startedAt: Number.isFinite(campaign.startedAt) ? campaign.startedAt : now,
      endsAt: Number.isFinite(campaign.endsAt) ? campaign.endsAt : null,
      closedAt: null, players: {}, participants: []};
    ledger.order.push(key);
    while (ledger.order.length > MAX_PHASES) delete ledger.phases[ledger.order.shift()];
  }
  if(match.state==='finished'&&phase.closedAt===null)phase.closedAt=Number.isFinite(match.endedAt)?match.endedAt:now;
  for (const [id, player] of Object.entries(sim.players || {})) {
    if (player.matchId === phase.matchId && !player.replacedByRoom && now - player.lastSeen < 15000 && !phase.participants.includes(id)) {
      phase.participants.push(id);
    }
  }
  return phase;
}

function readStats(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('RAD-TOX progress needs cumulative combat stats.');
  const stats = emptyRadToxScore();
  for (const field of RAD_TOX_SCORE_FIELDS) {
    const value = input[field] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > 10000000 || (!FRACTIONAL.has(field) && !Number.isSafeInteger(value))) fail(`Invalid RAD-TOX ${field}.`);
    stats[field] = FRACTIONAL.has(field) ? Math.round(value * 1e6) / 1e6 : value;
  }
  return stats;
}

function addStats(target, delta) {
  for (const field of RAD_TOX_SCORE_FIELDS) target[field] = (Number(target[field]) || 0) + delta[field];
}

function updateHistoricalResults(sim, phase, playerId, delta) {
  const matches = new Set([sim.match, ...(sim.matchHistory || [])]);
  for (const match of matches) {
    if (match?.id !== phase.matchId || !match.results) continue;
    const row = match.results.find(entry => entry.id === playerId);
    if (!row) continue;
    addStats(row, delta);
    row.kills = (row.enemyKills || 0) + (row.playerKills || 0);
    row.accuracy = row.shots ? Number((100 * row.hits / row.shots).toFixed(1)) : 0;
    match.results.sort((a, b) => b.score - a.score || b.kills - a.kills || a.id.localeCompare(b.id));
  }
}

export function applyRadToxProgress(sim, playerId, report, now, {trustedReplay=false}={}) {
  const player = sim.players?.[playerId];
  if (!player || !sim.radTox || sim.radTox.combatMode !== 'local') fail('There is no local RAD-TOX encounter in this room.', 409);
  captureRadToxScorePhase(sim, now);
  if (!report || typeof report.matchId !== 'string' || typeof report.phaseId !== 'string' || !Number.isSafeInteger(report.sequence) || report.sequence < 1) fail('Invalid RAD-TOX progress identity.');
  const phase = sim.radToxScoreLedger.phases[phaseKey(report.matchId, report.phaseId)];
  if (!phase || !phase.participants.includes(playerId)) fail('This RAD-TOX phase does not belong to this player.', 409);
  const previous = phase.players[playerId];
  const acknowledgement = sequence => ({matchId: phase.matchId, phaseId: phase.phaseId, sequence});
  if (previous && report.sequence <= previous.sequence) {
    const ack = acknowledgement(previous.sequence);
    player.localScoreAck = ack;
    return {accepted: true, duplicate: true, ack, delta: emptyRadToxScore()};
  }
  const deadline = phase.closedAt === null ? phase.endsAt : Math.min(phase.closedAt, phase.endsAt ?? Infinity);
  if (!trustedReplay && deadline !== null && now > deadline + RAD_TOX_REPORT_GRACE_MS) fail('The final RAD-TOX report window has ended.', 409, 'RAD_TOX_PHASE_EXPIRED');
  const stats = readStats(report.stats), oldStats = previous?.stats || emptyRadToxScore();
  for (const field of RAD_TOX_SCORE_FIELDS) if (stats[field] + 1e-6 < oldStats[field]) fail(`RAD-TOX ${field} cannot go backwards.`);
  const elapsedMs = Math.max(0, Math.min(now, phase.endsAt ?? now, phase.closedAt ?? now) - phase.startedAt);
  const maxShots = Math.min(100000, Math.ceil(elapsedMs / 1000) * 20 + 40);
  if (stats.shots > maxShots || stats.hits > stats.shots || stats.misses + stats.hits > stats.shots || stats.enemyHits > maxShots * 64) fail('RAD-TOX shots exceed the phase limits.');
  if (stats.sprayActions > maxShots || stats.taserHits > stats.shots || stats.blastHits > stats.shots) fail('RAD-TOX tool actions exceed the phase limits.');
  if (stats.enemyKills > phase.targetCount || stats.bossKills > (phase.phaseKind === 'boss' ? 1 : 0) || stats.bossKills > stats.enemyKills) fail('RAD-TOX kills exceed the phase enemy count.');
  if (stats.score > stats.enemyKills * 10 + stats.hits * (stats.hits + 1) / 2) fail('RAD-TOX points exceed the reported combat.');
  if (stats.damageDealt > phase.targetCount * 2000 || stats.hitsTaken > maxShots * 3 || stats.damageTaken > stats.hitsTaken * 100 || stats.deaths > stats.hitsTaken) fail('RAD-TOX damage exceeds the phase limits.');
  if (report.bossDefeated && (phase.phaseKind !== 'boss' || stats.enemyKills < 1)) fail('Only a defeated end boss can complete the boss phase.');
  for (const [field, maximum] of [['health', 100], ['ammo', 10000], ['fuel', 100], ['spray', 80]]) {
    if (report[field] !== undefined && (!Number.isFinite(report[field]) || report[field] < 0 || report[field] > maximum)) fail(`Invalid local RAD-TOX ${field}.`);
  }
  if (report.lifeRevision !== undefined && (!Number.isSafeInteger(report.lifeRevision) || report.lifeRevision < 0)) fail('Invalid local RAD-TOX life revision.');
  const delta = Object.fromEntries(RAD_TOX_SCORE_FIELDS.map(field => [field, Math.max(0, stats[field] - oldStats[field])]));
  const sameMatch = player.matchId === phase.matchId;
  if (sameMatch) {
    addStats(combatStats(player), delta);
    player.score = (player.score || 0) + delta.score;
    player.progress ||= {};
    player.progress.defeat = (player.progress.defeat || 0) + delta.enemyKills;
    player.progress['laser-hit'] = (player.progress['laser-hit'] || 0) + delta.hits;
    player.progress.spray = (player.progress.spray || 0) + delta.sprayActions;
    player.progress['taser-hit'] = (player.progress['taser-hit'] || 0) + delta.taserHits;
    player.progress['blast-hit'] = (player.progress['blast-hit'] || 0) + delta.blastHits;
    if (sim.match?.id === phase.matchId && sim.match.state === 'finished') {
      sim.match.results = matchRows(sim, now);
      // The archived copy was made when the clock finished; amend it too.
      updateHistoricalResults({...sim, match: null}, phase, playerId, delta);
    }
  } else updateHistoricalResults(sim, phase, playerId, delta);
  recordTournamentScore(sim, playerId, delta, now);
  const bossDefeated = Boolean(previous?.bossDefeated || report.bossDefeated);
  phase.players[playerId] = {sequence: report.sequence, stats, bossDefeated,
    status:{...previous?.status,...Object.fromEntries(['health','ammo','fuel','spray','lifeRevision'].flatMap(field=>Number.isFinite(report[field])?[[field,report[field]]]:[]))}};
  const current = sim.match?.id === phase.matchId && sim.radTox.phaseId === phase.phaseId;
  if (current) {
    sim.radTox.localProgress ||= {};
    sim.radTox.localProgress[playerId] = {phaseId: phase.phaseId, sequence: report.sequence, ...stats, bossDefeated, updatedAt: now};
    // Late reports never revive/deplete the player in the next wave or map.
    if (!player.replacedByRoom && (report.lifeRevision ?? 0) === (player.lifeRevision ?? 0)) {
      for (const field of ['health', 'ammo', 'fuel', 'spray']) if (report[field] !== undefined) player[field] = report[field];
    }
    if (sim.radTox.transition?.kind === 'wave') sim.radTox.transition.results = matchRows(sim, now);
    if (sim.match.state === 'finished') {
      sim.match.results = matchRows(sim, now);
      for (const archived of sim.matchHistory || []) {
        const row = archived.id === phase.matchId && archived.results?.find(entry => entry.id === playerId);
        if (row) row.health = player.health;
      }
    }
  }
  const ack = acknowledgement(report.sequence);
  player.localScoreAck = ack;
  return {accepted: true, duplicate: false, ack, delta};
}
