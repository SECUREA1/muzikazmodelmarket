export const RAD_TOX_SCORE_FIELDS = Object.freeze([
  'shots', 'hits', 'misses', 'enemyHits', 'enemyKills', 'bossKills',
  'hitsTaken', 'deaths', 'damageDealt', 'damageTaken', 'score'
]);
const FRACTIONAL = new Set(['damageDealt', 'damageTaken']);
export const emptyRadToxScore = () => Object.fromEntries(RAD_TOX_SCORE_FIELDS.map(field => [field, 0]));
const phaseKey = ({matchId, phaseId}) => `${matchId}:${phaseId}`;
const cloneReport = report => ({...report, stats: {...report.stats}});

// Combat calls record synchronously. Networking only consumes the occasional
// report; a lost response never discards local hits or counts the same kill twice.
export class RadToxScoreReporter {
  constructor({intervalMs = 1000, retryMs = 1500} = {}) {
    this.intervalMs = Math.max(100, intervalMs);
    this.retryMs = Math.max(this.intervalMs, retryMs);
    this.phases = new Map();
    this.expired = new Set();
    this.current = null;
  }

  begin(identity, status = {}, resume = {}) {
    if (!identity?.matchId || !identity?.phaseId) return false;
    const key = phaseKey(identity);
    if (this.expired.has(key)) return false;
    if (this.current && this.current.key !== key) this.current.closed = true;
    let phase = this.phases.get(key);
    if (!phase) {
      const stats = emptyRadToxScore();
      for (const field of RAD_TOX_SCORE_FIELDS) {
        const value = resume.stats?.[field];
        if (Number.isFinite(value) && value >= 0) stats[field] = FRACTIONAL.has(field) ? value : Math.floor(value);
      }
      phase = {key, matchId: identity.matchId, phaseId: identity.phaseId,
        stats, status: {}, revision: 0, acknowledged: -1,
        sequence: Number.isSafeInteger(resume.sequence) && resume.sequence > 0 ? resume.sequence : 0,
        pending: null, lastSentAt: -Infinity, closed: false};
      this.phases.set(key, phase);
    }
    phase.closed = false;
    this.current = phase;
    this.record({}, status);
    return true;
  }

  record(delta = {}, status = {}) {
    const phase = this.current;
    if (!phase) return false;
    let changed = false;
    for (const field of RAD_TOX_SCORE_FIELDS) {
      if (delta[field] === undefined) continue;
      const value = delta[field];
      if (!Number.isFinite(value) || value < 0 || (!FRACTIONAL.has(field) && !Number.isInteger(value))) {
        throw new TypeError(`Invalid local RAD-TOX ${field}.`);
      }
      if (value) {phase.stats[field] += value; changed = true;}
    }
    for (const field of ['health', 'ammo', 'fuel', 'lifeRevision']) {
      const value = status[field];
      if (!Number.isFinite(value)) continue;
      if (phase.status[field] !== value) {phase.status[field] = value; changed = true;}
    }
    if (status.bossDefeated && !phase.status.bossDefeated) {
      phase.status.bossDefeated = true;
      changed = true;
    }
    if (changed) phase.revision++;
    return changed;
  }

  report(now = performance.now(), {force = false} = {}) {
    for (const phase of this.phases.values()) {
      if (phase.pending) {
        if (now - phase.lastSentAt < this.retryMs) continue;
        phase.lastSentAt = now;
        return cloneReport(phase.pending.report);
      }
      if (phase.revision <= phase.acknowledged) continue;
      if (!force && !phase.closed && now - phase.lastSentAt < this.intervalMs) continue;
      const report = {matchId: phase.matchId, phaseId: phase.phaseId,
        sequence: ++phase.sequence, stats: {...phase.stats}, ...phase.status};
      phase.pending = {report, revision: phase.revision};
      phase.lastSentAt = now;
      return cloneReport(report);
    }
    return null;
  }

  flush(now = performance.now()) {return this.report(now, {force: true});}

  acknowledge(ack) {
    if (!ack?.matchId || !ack?.phaseId || !Number.isSafeInteger(ack.sequence)) return false;
    const phase = this.phases.get(phaseKey(ack));
    if (!phase?.pending || ack.sequence < phase.pending.report.sequence) return false;
    // An acknowledgement for a future/unrelated sequence must not erase unsent hits.
    if (ack.sequence !== phase.pending.report.sequence) return false;
    phase.acknowledged = phase.pending.revision;
    phase.pending = null;
    if (phase.closed && phase.revision <= phase.acknowledged) this.phases.delete(phase.key);
    return true;
  }

  reject(report, code) {
    if (code !== 'RAD_TOX_PHASE_EXPIRED' || !report?.matchId || !report?.phaseId) return false;
    const key = phaseKey(report), phase = this.phases.get(key);
    if (!phase?.pending || phase.pending.report.sequence !== report.sequence) return false;
    this.phases.delete(key);
    if (this.current === phase) this.current = null;
    this.expired.add(key);
    if (this.expired.size > 24) this.expired.delete(this.expired.values().next().value);
    return true;
  }

  get pending() {
    return [...this.phases.values()].some(phase => phase.pending || phase.revision > phase.acknowledged);
  }
}
