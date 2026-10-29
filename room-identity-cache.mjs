/** Bounded, expiring identities with one server-side refresh per account. */
export class RoomIdentityCache {
  constructor({ttlMs = 5000, maxEntries = 10000, now = Date.now} = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError('Invalid room identity cache limits.');
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
    this.pending = new Map();
  }

  resolve(key, build, {refresh = false} = {}) {
    const cached = this.entries.get(key);
    if (!refresh && cached && this.now() - cached.at < this.ttlMs) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.identity);
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const operation = Promise.resolve().then(build).then(identity => {
      // A restore/avatar change may invalidate this account while the build
      // is in flight. Its old result must not repopulate the current cache.
      if (identity && this.pending.get(key) === operation) {
        this.entries.delete(key);
        this.entries.set(key, {at: this.now(), identity});
        while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      }
      return identity;
    }).finally(() => {
      if (this.pending.get(key) === operation) this.pending.delete(key);
    });
    this.pending.set(key, operation);
    return operation;
  }

  delete(key) {
    this.entries.delete(key);
    this.pending.delete(key);
  }

  clear() {
    this.entries.clear();
    this.pending.clear();
  }
}
