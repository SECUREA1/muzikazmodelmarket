const SPECIES = ['toxic', 'ghost', 'snake', 'brain'];
const count = value => Math.max(0, Math.min(180, Math.trunc(Number(value) || 0)));

/** A finite, per-player enemy budget with a separate live-mesh limit. */
export class LocalEnemyPopulation {
  constructor({spawn, dispose = root => root?.removeFromParent?.(), yieldFrame = () => new Promise(resolve => requestAnimationFrame(resolve)), now = () => performance.now()} = {}) {
    this.spawn = spawn;
    this.dispose = dispose;
    this.yieldFrame = yieldFrame;
    this.now = now;
    this.generation = 0;
    this.slots = [];
    this.concurrent = {};
    this.pending = null;
    this.retryAt = 0;
  }

  begin(phaseId, population, defeated = 0) {
    this.clear();
    const left = Object.fromEntries(SPECIES.map(kind => [kind, count(population?.budget?.[kind])]));
    this.concurrent = Object.fromEntries(SPECIES.map(kind => [kind, Math.min(left[kind], count(population?.concurrent?.[kind]))]));
    let index = 0;
    while (SPECIES.some(kind => left[kind] > 0)) {
      for (const kind of SPECIES) if (left[kind]-- > 0) {
        this.slots.push({id:`${phaseId}:${index}`,index:index++,kind,state:'pending',attempts:0,root:null});
      }
    }
    for (const slot of this.slots.slice(0, count(defeated))) slot.state = 'defeated';
  }

  clear() {
    ++this.generation;
    this.slots = [];
    this.pending = null;
    this.retryAt = 0;
  }

  get alive() { return this.slots.filter(slot => slot.state === 'active').length; }
  get defeated() { return this.slots.filter(slot => slot.state === 'defeated').length; }
  get remaining() { return this.slots.length - this.defeated; }

  defeat(root) {
    const slot = this.slots.find(item => item.root === root && item.state === 'active');
    if (!slot) return false;
    slot.state = 'defeated';slot.root = null;
    return true;
  }

  fill(isCurrent = () => true) {
    if (this.pending) return this.pending;
    if (this.now() < this.retryAt || !isCurrent()) return Promise.resolve(this.alive);
    const generation = this.generation;
    const current = () => generation === this.generation && isCurrent();
    const work = (async () => {
      const attempted = new Set();
      const limit = Math.max(8, Object.values(this.concurrent).reduce((sum, value) => sum + value, 0) * 2);
      for (let attempt = 0; attempt < limit && current(); attempt++) {
        const active = Object.fromEntries(SPECIES.map(kind => [kind, this.slots.filter(slot => slot.kind === kind && slot.state === 'active').length]));
        const slot = this.slots.find(item => item.state === 'pending' && !attempted.has(item.id) && active[item.kind] < this.concurrent[item.kind]);
        if (!slot) break;
        attempted.add(slot.id);slot.attempts++;slot.state = 'spawning';
        let root;
        try { root = await this.spawn(slot.kind, slot); }
        catch (error) { if (current()) slot.state = 'pending';throw error; }
        if (!current()) { if (root) this.dispose(root);return this.alive; }
        slot.root = root || null;slot.state = root ? 'active' : 'pending';
        if (root?.userData) root.userData.localPopulationId = slot.id;
        await this.yieldFrame();
      }
      if (current()) this.retryAt = this.now() + 1000;
      return this.alive;
    })();
    this.pending = work;
    void work.finally(() => { if (this.pending === work) this.pending = null; }).catch(() => {});
    return work;
  }
}

/** Only server-issued entries become collectible; rendering and proximity stay local. */
export class LocalRewardField {
  constructor({THREE, group, floorAt, createVisual, collect, maxVisible = 36, maxFloorChecksPerFrame = 2, scheduleFrame = callback => requestAnimationFrame(callback), cancelFrame = handle => cancelAnimationFrame(handle)}) {
    Object.assign(this,{THREE,group,floorAt,createVisual,collect,maxVisible,maxFloorChecksPerFrame,scheduleFrame,cancelFrame});
    this.entries = new Map();this.claimed = new Set();this.pending = new Set();this.phaseId = null;
    this.generation=0;this.frame=null;this.requestVersion=0;this.placementRequest=null;this.cursor=0;
  }

  begin(phaseId, rewards = [], claimed = []) {
    if(this.phaseId!==phaseId){this.clear();this.phaseId=phaseId;}
    for(const id of claimed)this.claimed.add(id);
    for (const entry of rewards) if (entry?.id && !this.entries.has(entry.id)) this.entries.set(entry.id,{...entry,root:null});
    this.acknowledge(claimed);
  }

  acknowledge(claimed = []) {
    for (const id of claimed) {this.claimed.add(id);this.pending.delete(id);this.remove(id);}
  }

  get pendingMzk() {
    let value=0;for (const id of this.pending) value += Number(this.entries.get(id)?.amountMzk) || 0;
    return value;
  }

  remove(id) {
    const entry = this.entries.get(id);if(!entry?.root)return;
    entry.root.traverse?.(object=>{object.geometry?.dispose?.();for(const material of [].concat(object.material||[]))material.dispose?.();});
    entry.root.removeFromParent();entry.root=null;
  }

  populate({position,kills=0,bossDefeated=false,dropPosition=null,heading=0}) {
    this.placementRequest={position:position.clone(),kills,bossDefeated,dropPosition:dropPosition?.clone()||null,heading};
    ++this.requestVersion;
    if(this.frame===null)this.placeRewardBatch();
  }

  placeRewardBatch() {
    const request=this.placementRequest;if(!request)return;
    const {position,kills,bossDefeated,dropPosition,heading}=request,entries=[...this.entries.values()];
    let visible=entries.filter(entry=>entry.root).length,checks=0;
    const eligible=entry=>!entry.root&&!this.claimed.has(entry.id)&&!this.pending.has(entry.id)&&(entry.requiresKills||0)<=kills&&(!entry.requiresBoss||bossDefeated)&&entry.deferredVersion!==this.requestVersion;
    for(let visited=0;visited<entries.length&&checks<this.maxFloorChecksPerFrame&&visible<this.maxVisible;visited++){
      const entry=entries[this.cursor++%entries.length];if(!eligible(entry))continue;
      const index=Number(entry.slot)||visible,gated=Boolean(entry.requiresKills||entry.requiresBoss),angle=!gated&&index<4?heading-Math.PI/2+(index-1.5)*.38:index*2.399963229728653,radius=gated?.55+(index%3)*.3:index<4?1.8+(index%2)*.5:2.4+(index%4)*.8,origin=dropPosition&&gated?dropPosition:position,attempt=entry.placementAttempt||0;
      checks++;const floor=this.floorAt(origin.x+Math.cos(angle+attempt)*radius,origin.z+Math.sin(angle+attempt)*radius);
      if(!floor){entry.placementAttempt=attempt+1;if(entry.placementAttempt>=5){entry.deferredVersion=this.requestVersion;entry.placementAttempt=0;}continue;}
      const root=this.createVisual(entry);if(!root){entry.deferredVersion=this.requestVersion;continue;}
      root.position.copy(floor.point).add(new this.THREE.Vector3(0,.48,0));root.userData.localReward=entry.id;root.userData.rewardFloorY=floor.point.y+.48;this.group.add(root);entry.root=root;entry.placementAttempt=0;visible++;
    }
    if(visible>=this.maxVisible||!entries.some(eligible))return;
    const generation=this.generation;
    this.frame=this.scheduleFrame(()=>{if(generation!==this.generation)return;this.frame=null;this.placeRewardBatch();});
  }

  update(delta,elapsed,position,{collectible=true}={}) {
    for (const entry of this.entries.values()) {
      const root=entry.root;if(!root)continue;
      root.position.y=root.userData.rewardFloorY+Math.sin(elapsed*2.8+(Number(entry.slot)||0))*.09;root.rotation.y+=delta*1.3;
      if(!collectible||root.position.distanceTo(position)>1.35)continue;
      this.claim(entry.id);
    }
  }

  claim(id) {
    const entry=this.entries.get(id);
    if(!entry||this.claimed.has(id)||this.pending.has(id))return false;
    this.pending.add(id);this.remove(id);this.collect(entry);return true;
  }

  clear() {
    ++this.generation;
    if(this.frame!==null)this.cancelFrame(this.frame);
    this.frame=null;this.placementRequest=null;this.cursor=0;
    for(const id of this.entries.keys())this.remove(id);
    this.entries.clear();this.pending.clear();this.claimed.clear();this.phaseId=null;
  }
}
