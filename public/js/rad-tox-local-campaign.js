export const isLocalRadToxCampaign = campaign => campaign?.combatMode === 'local' && Boolean(campaign.phaseId);

export function radToxWaveSeconds(campaign, serverNow) {
  if (!isLocalRadToxCampaign(campaign) || campaign.phaseKind === 'boss' || !Number.isFinite(campaign.endsAt)) return null;
  return Math.max(0, Math.ceil((campaign.endsAt - serverNow) / 1000));
}

/** The server owns the clock and phase; the browser owns every enemy and attack. */
export class RadToxLocalCampaign {
  constructor({ now = () => performance.now(), prepare = async () => {}, start = async () => {}, stop = () => {} } = {}) {
    this.now = now;
    this.prepare = prepare;
    this.start = start;
    this.stop = stop;
    this.generation = 0;
    this.key = null;
    this.campaign = null;
    this.ready = Promise.resolve(false);
    this.expired = false;
  }

  get serverNow() { return this.serverTime + Math.max(0, this.now() - this.receivedAt); }
  get seconds() { return radToxWaveSeconds(this.campaign, this.serverNow); }
  get active() { return this.campaign?.state === 'active' && !this.expired; }

  sync(snapshot) {
    const campaign = snapshot?.radTox;
    if (!isLocalRadToxCampaign(campaign)) return this.ready;
    this.campaign = campaign;
    this.serverTime = Number(snapshot.serverTime) || Date.now();
    this.receivedAt = this.now();
    const key = `${snapshot.match?.id || ''}:${campaign.phaseId}:${campaign.state}`;
    if (key === this.key) return this.ready;
    this.key = key;
    this.expired = false;
    const generation = ++this.generation;
    this.stop(campaign);
    if (campaign.state !== 'active') return this.ready = Promise.resolve(false);
    this.ready = (async () => {
      await this.prepare(campaign, snapshot);
      if (generation !== this.generation || !this.active) return false;
      if (this.seconds === 0) { this.tick(); return false; }
      await this.start(campaign, snapshot, {isCurrent: () => generation === this.generation && this.active});
      return generation === this.generation;
    })();
    return this.ready;
  }

  tick() {
    if (this.active && this.seconds === 0) {
      this.expired = true;
      ++this.generation;
      this.stop(this.campaign);
    }
    return this.active;
  }

  reset() {
    ++this.generation;
    this.stop(this.campaign);
    this.key = null;
    this.campaign = null;
    this.expired = false;
  }
}
