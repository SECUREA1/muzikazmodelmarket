export const RAD_TOX_SCORE_FIELDS = Object.freeze([
  'shots', 'hits', 'misses', 'enemyHits', 'enemyKills', 'bossKills',
  'hitsTaken', 'deaths', 'damageDealt', 'damageTaken', 'score',
  'sprayActions', 'taserHits', 'blastHits'
]);
const FRACTIONAL = new Set(['damageDealt', 'damageTaken']);
export const emptyRadToxScore = () => Object.fromEntries(RAD_TOX_SCORE_FIELDS.map(field => [field, 0]));
const phaseKey = ({matchId, phaseId}) => `${matchId}:${phaseId}`;
const cloneReport = report => ({...report, stats: {...report.stats}, ...(report.claimIds ? {claimIds: [...report.claimIds]} : {})});
const MAX_SAVED_PHASES = 24;
const validStats = input => Object.fromEntries(RAD_TOX_SCORE_FIELDS.map(field => {
  const value = input?.[field];
  return [field, Number.isFinite(value) && value >= 0 && value <= 10000000 ? (FRACTIONAL.has(field) ? value : Math.floor(value)) : 0];
}));
const validClaims = ids => Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id && id.length <= 160))].slice(0, 64) : [];
const STATUS_LIMITS={health:100,ammo:10000,fuel:100,spray:80,lifeRevision:Number.MAX_SAFE_INTEGER};
const validStatus = input => Object.fromEntries([...Object.keys(STATUS_LIMITS),'bossDefeated'].flatMap(field => {
  const value=input?.[field];
  return (field==='bossDefeated' ? value===true : Number.isFinite(value)&&value>=0&&value<=STATUS_LIMITS[field]&&(field!=='lifeRevision'||Number.isSafeInteger(value))) ? [[field,value]] : [];
}));

// Combat calls record synchronously. Networking only consumes the occasional
// report; a lost response never discards local hits or counts the same kill twice.
export class RadToxScoreReporter {
  constructor({intervalMs = 1000, retryMs = 1500, persistence = null} = {}) {
    this.intervalMs = Math.max(100, intervalMs);
    this.retryMs = Math.max(this.intervalMs, retryMs);
    this.phases = new Map();
    this.expired = new Set();
    this.current = null;
    this.persistence = null;
    this.ownerScope = null;
    this.saveTimer = null;
    this.persistenceDirty = false;
    if(persistence)this.setPersistence(persistence);
  }

  // Storage is optional so guests, private browsing, and a full storage quota
  // never prevent combat. The scope prevents a different account or tournament
  // from replaying another player's saved pickups.
  setPersistence({storage, accountId, tournamentId, key} = {}) {
    if(!accountId||!tournamentId)return false;
    const scope=JSON.stringify([String(accountId),String(tournamentId)]);
    if(this.ownerScope!==scope){
      this.checkpoint();this.phases.clear();this.expired.clear();this.current=null;this.persistence=null;this.persistenceDirty=false;
    }
    this.ownerScope=scope;
    try {storage ||= globalThis.localStorage;} catch {this.checkpoint();this.persistence=null;return false;}
    if(!storage?.getItem||!storage?.setItem){this.persistence=null;return false;}
    const storageKey=key||'muzikaz-rad-tox-outbox-v1:'+encodeURIComponent(accountId)+':'+encodeURIComponent(tournamentId);
    if(this.persistence?.scope===scope&&this.persistence.storage===storage&&this.persistence.key===storageKey)return true;
    if(this.persistence)this.checkpoint();
    this.persistence={storage,scope,key:storageKey};this.persistenceDirty=false;
    if(this.phases.size){this.scheduleSave();return true;}
    try {
      const saved=JSON.parse(storage.getItem(this.persistence.key)||'null');
      if(saved?.version!==1||saved.scope!==scope||!Array.isArray(saved.phases))return true;
      for(const item of saved.phases.slice(-MAX_SAVED_PHASES)){
        if(typeof item?.matchId!=='string'||typeof item?.phaseId!=='string'||!item.matchId||!item.phaseId)continue;
        const phase={...item,key:phaseKey(item),stats:validStats(item.stats),status:validStatus(item.status),
          sequence:Number.isSafeInteger(item.sequence)&&item.sequence>=0?item.sequence:0,
          revision:Number.isSafeInteger(item.revision)&&item.revision>=0?item.revision:0,
          acknowledged:Number.isSafeInteger(item.acknowledged)?item.acknowledged:-1,
          claimIds:new Set(validClaims(item.claimIds)),confirmedClaims:new Set(validClaims(item.confirmedClaims)),
          pending:null,lastSentAt:-Infinity,closed:true,restored:true};
        const pending=item.pending;
        if(pending?.report?.matchId===item.matchId&&pending.report.phaseId===item.phaseId&&Number.isSafeInteger(pending.report.sequence)&&pending.report.sequence>0){
          phase.pending={revision:Number.isSafeInteger(pending.revision)?pending.revision:phase.revision,
            report:{...validStatus(pending.report),matchId:item.matchId,phaseId:item.phaseId,sequence:pending.report.sequence,stats:validStats(pending.report.stats),
              ...(validClaims(pending.report.claimIds).length?{claimIds:validClaims(pending.report.claimIds)}:{})}};
          phase.sequence=Math.max(phase.sequence,phase.pending.report.sequence);
        }
        this.phases.set(phase.key,phase);
      }
      for(const key of (Array.isArray(saved.expired)?saved.expired:[]).slice(-MAX_SAVED_PHASES))if(typeof key==='string')this.expired.add(key);
    }catch{/* Unavailable or damaged browser storage must not stop a game. */}
    return true;
  }

  checkpoint() {
    if(this.saveTimer!==null){clearTimeout(this.saveTimer);this.saveTimer=null;}
    if(!this.persistence)return false;
    if(!this.persistenceDirty)return true;
    try {
      const phases=[...this.phases.values()].slice(-MAX_SAVED_PHASES).map(phase=>({
        ...phase,claimIds:[...phase.claimIds],confirmedClaims:[...phase.confirmedClaims],lastSentAt:undefined,key:undefined
      }));
      this.persistence.storage.setItem(this.persistence.key,JSON.stringify({version:1,scope:this.persistence.scope,phases,expired:[...this.expired]}));
      this.persistenceDirty=false;
      return true;
    }catch{return false;}
  }

  scheduleSave() {
    if(!this.persistence)return;
    this.persistenceDirty=true;
    if(this.saveTimer!==null)return;
    this.saveTimer=setTimeout(()=>{this.saveTimer=null;this.checkpoint();},250);
    this.saveTimer?.unref?.();
  }

  saveLocalState(state) {
    if(!this.current)return false;
    this.current.localState=state;
    this.scheduleSave();
    return true;
  }

  dispose() {this.checkpoint();}

  begin(identity, status = {}, resume = {}) {
    if (!identity?.matchId || !identity?.phaseId) return false;
    const key = phaseKey(identity);
    if (this.expired.has(key)) return false;
    if (this.current && this.current.key !== key) this.current.closed = true;
    let phase = this.phases.get(key);
    if (!phase) {
      const stats = validStats(resume.stats);
      phase = {key, matchId: identity.matchId, phaseId: identity.phaseId,
        stats, status: {}, revision: 0, acknowledged: -1,
        sequence: Number.isSafeInteger(resume.sequence) && resume.sequence > 0 ? resume.sequence : 0,
        pending: null, lastSentAt: -Infinity, closed: false, claimIds: new Set(), confirmedClaims: new Set()};
      this.phases.set(key, phase);
    }
    // A response may have reached the server before the browser closed. Merge
    // its cumulative receipt, retaining newer local hits rather than adding it.
    const accepted=validStats(resume.stats),serverSequence=Number.isSafeInteger(resume.sequence)&&resume.sequence>=0?resume.sequence:0;
    for(const field of RAD_TOX_SCORE_FIELDS)if(accepted[field]>phase.stats[field]){phase.stats[field]=accepted[field];phase.revision++;}
    phase.sequence=Math.max(phase.sequence,serverSequence);
    const confirmed=validClaims(resume.claimedIds);
    for(const id of confirmed){phase.claimIds.add(id);phase.confirmedClaims.add(id);}
    if(phase.pending&&serverSequence>=phase.pending.report.sequence){
      phase.acknowledged=Math.max(phase.acknowledged,phase.pending.revision);
      phase.pending=null;
      if(RAD_TOX_SCORE_FIELDS.some(field=>phase.stats[field]>accepted[field])||[...phase.claimIds].some(id=>!phase.confirmedClaims.has(id)))phase.revision++;
    }
    const localStatus=phase.status,inputStatus=validStatus(status),acceptedStatus=validStatus(resume.status);
    const receivedStatus=(acceptedStatus.lifeRevision??0)>=(inputStatus.lifeRevision??0)?{...inputStatus,...acceptedStatus}:inputStatus;
    if(resume.bossDefeated)receivedStatus.bossDefeated=true;
    const pendingLocal=phase.revision>phase.acknowledged;
    const newerLife=(receivedStatus.lifeRevision??0)>(localStatus.lifeRevision??0);
    phase.closed = false;
    this.current = phase;
    this.record({}, pendingLocal&&phase.restored&&!newerLife ? {...receivedStatus,...localStatus} : receivedStatus);
    delete phase.restored;
    this.scheduleSave();
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
    for (const field of ['health', 'ammo', 'fuel', 'spray', 'lifeRevision']) {
      const value = status[field];
      if (!Number.isFinite(value)) continue;
      if (phase.status[field] !== value) {phase.status[field] = value; changed = true;}
    }
    if (status.bossDefeated && !phase.status.bossDefeated) {
      phase.status.bossDefeated = true;
      changed = true;
    }
    if (status.claimIds !== undefined) {
      if (!Array.isArray(status.claimIds) || status.claimIds.length > 64 || status.claimIds.some(id => typeof id !== 'string' || !id || id.length > 160)) throw new TypeError('Invalid local RAD-TOX reward claims.');
      if (new Set([...phase.claimIds, ...status.claimIds]).size > 64) throw new TypeError('Too many local RAD-TOX reward claims.');
      for (const id of status.claimIds) {
        if (!phase.claimIds.has(id)) {phase.claimIds.add(id); changed = true;}
      }
    }
    if (changed) {phase.revision++;this.scheduleSave();}
    return changed;
  }

  report(now = performance.now(), {force = false} = {}) {
    for (const phase of this.phases.values()) {
      if (phase.pending) {
        if (now - phase.lastSentAt < this.retryMs) continue;
        phase.lastSentAt = now;
        this.phases.delete(phase.key);this.phases.set(phase.key, phase);
        this.checkpoint();
        return cloneReport(phase.pending.report);
      }
      if (phase.revision <= phase.acknowledged) continue;
      if (phase.rewardRetry && now - phase.lastSentAt < this.intervalMs) continue;
      if (!force && !phase.closed && now - phase.lastSentAt < this.intervalMs) continue;
      const report = {matchId: phase.matchId, phaseId: phase.phaseId,
        sequence: ++phase.sequence, stats: {...phase.stats}, ...phase.status,
        ...(phase.claimIds.size ? {claimIds: [...phase.claimIds]} : {})};
      phase.pending = {report, revision: phase.revision};
      phase.lastSentAt = now;
      // A wallet retry from a closed wave must not starve current combat.
      this.phases.delete(phase.key);this.phases.set(phase.key, phase);
      this.scheduleSave();
      this.checkpoint();
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
    for (const id of ack.claimedIds || []) if (phase.claimIds.has(id)) phase.confirmedClaims.add(id);
    phase.pending = null;
    // A score receipt is not a wallet receipt. Keep collected pickups queued
    // when account storage is temporarily unavailable, including after a wave
    // ends or a map changes, without replaying score deltas.
    phase.rewardRetry = Boolean(ack.rewardsPending || [...phase.claimIds].some(id => !phase.confirmedClaims.has(id)));
    if (phase.rewardRetry) phase.revision++;
    if (phase.closed && phase.revision <= phase.acknowledged) this.phases.delete(phase.key);
    this.scheduleSave();
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
    this.scheduleSave();
    return true;
  }

  get pending() {
    return [...this.phases.values()].some(phase => phase.pending || phase.revision > phase.acknowledged);
  }
}
