import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {createSessionSecret, verifySessionSecret, sessionHashAlgorithm, sessionSecretCacheKey,
  sessionSecretMetadataSupported, LEGACY_SESSION_HASH, OPAQUE_SESSION_HASH} from './opaque-session-secrets.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const fileQueues = new Map();
const signature = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
const emptyStore = () => ({ version: 1, sessions: [] });
const fingerprint = token => createHash('sha256').update(String(token)).digest('hex');

// Every panel shares the account session. Reading a proof must not invalidate
// gameplay requests already in flight. Bind a reproducible, separate proof to
// the opaque session token without persisting either value in plaintext.
const csrfProof = token => createHmac('sha256', String(token)).update('muzikaz/account/csrf/v1').digest('base64url');

/** Atomic, serialized JSON storage for opaque account and game sessions. */
export class DurableSessionStore {
  constructor(file, { ttlSeconds, maxActivePerAccount = 8, kind = 'account', persistent = false, clock = Date.now, proofCacheSize = 32_768,
    issuanceAlgorithm = process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM ?? OPAQUE_SESSION_HASH } = {}) {
    if (!['account', 'game'].includes(kind) || ![LEGACY_SESSION_HASH, OPAQUE_SESSION_HASH].includes(issuanceAlgorithm)) {
      throw new TypeError('Invalid session kind or MUZIKAZ_SESSION_ISSUANCE_ALGORITHM.');
    }
    this.file = file;
    this.queueKey = resolve(file);
    this.persistent = kind === 'account' && persistent;
    this.ttlMs = Math.max(1, Number(ttlSeconds || (kind === 'game' ? 300 : 28_800))) * 1000;
    this.maxActivePerAccount = Math.max(1, Number(maxActivePerAccount || 8));
    this.kind = kind;
    // This controls issuance only. Both formats remain readable for rollback.
    this.issuanceAlgorithm = issuanceAlgorithm;
    this.clock = clock;
    this.queue = Promise.resolve();
    this.verifiedSecrets = new Map();
    this.tokenIndex = new Map();
    this.proofCacheSize = Math.max(128, Math.min(65_536, Number(proofCacheSize) || 32_768));
    this.cached = null;
  }

  remember(cache, key, value) {
    cache.set(key, value);
    if (cache.size > this.proofCacheSize) cache.delete(cache.keys().next().value);
  }

  proofContext(algorithm, purpose) { return {algorithm, kind: this.kind, purpose}; }
  indexKey(value, algorithm) { return JSON.stringify([algorithm, this.kind, 'bearer', value]); }

  async verifies(token, hash, salt, algorithm, purpose = 'bearer') {
    const context = this.proofContext(algorithm, purpose);
    const key = sessionSecretCacheKey(token, hash, salt, context);
    if (!key) return false;
    if (this.verifiedSecrets.has(key)) return true;
    if (!await verifySessionSecret(token, hash, salt, context)) return false;
    this.remember(this.verifiedSecrets, key, true);
    return true;
  }

  async findToken(data, token) {
    if (!token) return null;
    const key = fingerprint(token);
    const indexed = this.cached?.data === data ? this.cached : null;
    const candidate = indexed ? indexed.byFingerprint.get(key) : data.sessions.find(item => item.tokenFingerprint === key);
    const accepts = async record => {
      const algorithm = sessionHashAlgorithm(record.tokenHashAlgorithm);
      // Validate metadata and the presented representation before either cache.
      if (!algorithm || !sessionSecretCacheKey(token, record.tokenHash, record.tokenSalt, this.proofContext(algorithm, 'bearer'))) return false;
      const cached = this.tokenIndex.get(this.indexKey(key, algorithm));
      if (cached?.id === record.id && cached.hash === record.tokenHash && cached.salt === record.tokenSalt) return true;
      return this.verifies(token, record.tokenHash, record.tokenSalt, algorithm);
    };
    let record = candidate && await accepts(candidate) ? candidate : null;
    if (!record && !candidate) {
      // Old sessions without fingerprints remain usable after a real hash check.
      for (const legacy of indexed ? indexed.legacy : data.sessions.filter(item => !item.tokenFingerprint)) {
        if (await accepts(legacy)) { record = legacy; break; }
      }
    }
    if (record) this.remember(this.tokenIndex, this.indexKey(key, sessionHashAlgorithm(record.tokenHashAlgorithm)), { id: record.id, hash: record.tokenHash, salt: record.tokenSalt });
    return record || null;
  }

  async authenticateById(id) {
    return this.serialized(async () => {
      const data = await this.load();
      const record = this.cached?.data === data ? this.cached.byId.get(id) : data.sessions.find(item => item.id === id);
      return record && sessionSecretMetadataSupported(record.tokenHash, record.tokenSalt, record.tokenHashAlgorithm) && !this.expired(record) ? clone(record) : null;
    });
  }

  serialized(operation) {
    const guarded = async () => {
      try { return await operation(); }
      catch (error) {
        error.code ||= 'SESSION_STORE_FAILED'; error.statusCode ||= 500; error.stage ||= 'session-store'; throw error;
      }
    };
    // All store objects for the same path share the write/read ordering. The
    // file format still has a single writer process; this is not a fleet lock.
    const prior = fileQueues.get(this.queueKey) || Promise.resolve();
    const run = prior.then(guarded, guarded);
    this.queue = run.catch(() => {});
    fileQueues.set(this.queueKey, this.queue);
    const tail = this.queue;
    tail.then(() => { if (fileQueues.get(this.queueKey) === tail) fileQueues.delete(this.queueKey); });
    return run;
  }

  async load() {
    try {
      // Check the file on every operation so another store, an administrator,
      // or a restored/replaced file can revoke a previously cached session.
      const current = signature(await stat(this.file, { bigint: true }));
      if (this.cached?.signature === current) return this.cached.data;
      this.cached = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const handle = await open(this.file, 'r');
        try {
          const before = signature(await handle.stat({ bigint: true }));
          const text = await handle.readFile('utf8');
          const after = signature(await handle.stat({ bigint: true }));
          const visible = signature(await stat(this.file, { bigint: true }));
          if (before !== after || after !== visible) continue;
          const data = JSON.parse(text);
          if (!data || !Array.isArray(data.sessions)) throw new Error('Invalid session store.');
          const byId = new Map(), byFingerprint = new Map(), legacy = [];
          for (const record of data.sessions) {
            if (!record || typeof record !== 'object' || typeof record.id !== 'string') throw new Error('Invalid session record.');
            byId.set(record.id, record);
            if (record.tokenFingerprint) { if (!byFingerprint.has(record.tokenFingerprint)) byFingerprint.set(record.tokenFingerprint, record); }
            else legacy.push(record);
          }
          this.cached = { signature: visible, data, byId, byFingerprint, legacy };
          return data;
        } finally { await handle.close(); }
      }
      throw new Error('Session store changed during read.');
    } catch (error) {
      this.cached = null;
      if (error.code === 'ENOENT') return emptyStore();
      throw error;
    }
  }

  // Callers can inspect the public JSON snapshot without mutating cached proof
  // records. Internal operations only copy records that they actually change.
  async read() { return clone(await this.load()); }

  async write(data) {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    this.cached = null;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      // A path could be replaced immediately after rename. Reopen and verify
      // it on the next read instead of assigning our snapshot a newer identity.
      this.cached = null;
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  replace(data, record) { return { ...data, sessions: data.sessions.map(item => item.id === record.id ? record : item) }; }

  expired(record, now = this.clock()) {
    if (record.status !== 'active' || record.revokedAt) return true;
    if (this.kind === 'account' && record.expiresAt === null) return false;
    const expiration = Date.parse(record.expiresAt);
    return !Number.isFinite(expiration) || expiration <= now;
  }

  async createSession(account, extra = {}) {
    // Only server-generated 256-bit tokens use the fast verifier. Human
    // passwords/access codes retain their separate PBKDF credential policy.
    const token = randomBytes(32).toString('base64url');
    const csrfToken = this.kind === 'account' ? csrfProof(token) : '';
    const [tokenSecret, csrfSecret] = await Promise.all([
      createSessionSecret(token, this.proofContext(this.issuanceAlgorithm, 'bearer')),
      csrfToken ? createSessionSecret(csrfToken, this.proofContext(this.issuanceAlgorithm, 'csrf')) : { algorithm: null, hash: null, salt: null }
    ]);
    return this.serialized(async () => {
      const current = await this.load();
      const nowMs = this.clock(); const now = new Date(nowMs).toISOString();
      const data = { ...current, sessions: current.sessions.map(record => record.status === 'active' && Date.parse(record.expiresAt) <= nowMs ? { ...record, status: 'expired' } : record) };
      const record = {
        id: randomUUID(), tokenFingerprint: fingerprint(token), tokenHash: tokenSecret.hash, tokenSalt: tokenSecret.salt, tokenHashAlgorithm: tokenSecret.algorithm,
        accountId: account.accountId, wallet: account.primaryEthereumWallet || null,
        csrfTokenHash: csrfSecret.hash, csrfTokenSalt: csrfSecret.salt, csrfTokenHashAlgorithm: csrfSecret.algorithm,
        accountSessionId: extra.accountSessionId || null, avatarId: extra.avatarId || null,
        createdAt: now, expiresAt: this.persistent ? null : new Date(nowMs + this.ttlMs).toISOString(), lastUsedAt: now,
        revokedAt: null, status: 'active'
      };
      data.sessions.push(record);
      const active = data.sessions.filter(item => item.accountId === record.accountId && item.status === 'active').reverse().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const revoked = new Set(active.slice(this.persistent ? Infinity : this.maxActivePerAccount).map(item => item.id));
      data.sessions = data.sessions.map(item => revoked.has(item.id) ? { ...item, status: 'revoked', revokedAt: now } : item);
      await this.write(data);
      this.remember(this.verifiedSecrets, sessionSecretCacheKey(token, tokenSecret.hash, tokenSecret.salt, this.proofContext(tokenSecret.algorithm, 'bearer')), true);
      if (csrfToken) this.remember(this.verifiedSecrets, sessionSecretCacheKey(csrfToken, csrfSecret.hash, csrfSecret.salt, this.proofContext(csrfSecret.algorithm, 'csrf')), true);
      this.remember(this.tokenIndex, this.indexKey(record.tokenFingerprint, tokenSecret.algorithm), { id: record.id, hash: record.tokenHash, salt: record.tokenSalt });
      return { token, csrfToken, session: clone(record) };
    });
  }

  async authenticateSession(token, { touch = true, extend = false } = {}) {
    return this.serialized(async () => {
      const data = await this.load(); const nowMs = this.clock(); let changed = false;
      const found = await this.findToken(data, token);
      const record = found && { ...found };
      if (!record) return null;
      if (this.expired(record, nowMs)) {
        if (!record.revokedAt && record.status === 'active') { record.status = 'expired'; changed = true; }
        if (changed) await this.write(this.replace(data, record));
        return null;
      }
      if (this.persistent && record.expiresAt) { record.expiresAt = null; changed = true; }
      if (!record.tokenFingerprint) { record.tokenFingerprint = fingerprint(token); changed = true; }
      if(extend&&this.kind==='game'&&Date.parse(record.expiresAt)-nowMs<this.ttlMs/2){record.expiresAt=new Date(nowMs+this.ttlMs).toISOString();changed=true;}
      if (touch&&(changed||nowMs-Date.parse(record.lastUsedAt)>=30000)) { record.lastUsedAt = new Date(nowMs).toISOString(); await this.write(this.replace(data, record)); } else if(changed)await this.write(this.replace(data, record));
      return clone(record);
    });
  }

  touchSession(token) { return this.authenticateSession(token, { touch: true }); }

  async validCsrf(session, token) {
    if (!session || !sessionHashAlgorithm(session.csrfTokenHashAlgorithm)) return false;
    if (await this.verifies(token, session.csrfTokenHash, session.csrfTokenSalt, session.csrfTokenHashAlgorithm, 'csrf')) return true;
    for (const value of session.previousCsrfSecrets || []) if (await this.verifies(token, value.hash, value.salt, value.algorithm, 'csrf')) return true;
    return false;
  }

  async issueCsrf(token) {
    if (this.kind !== 'account') return '';
    return this.serialized(async () => {
      const data = await this.load(); const found = await this.findToken(data, token);
      if (!found || this.expired(found)) return '';
      const record = { ...found };
      const algorithm = sessionHashAlgorithm(record.csrfTokenHashAlgorithm);
      if (!algorithm) return '';
      const csrfToken = csrfProof(token);
      if (await this.verifies(csrfToken, record.csrfTokenHash, record.csrfTokenSalt, algorithm, 'csrf')) return csrfToken;
      // Migrate legacy random proofs once, preserving all three proofs that
      // were already valid so existing tabs and delayed requests can finish.
      const value = await createSessionSecret(csrfToken, this.proofContext(algorithm, 'csrf'));
      record.previousCsrfSecrets = [{ hash: record.csrfTokenHash, salt: record.csrfTokenSalt, algorithm }, ...(record.previousCsrfSecrets || [])].filter((item) => item.hash).slice(0, 3);
      record.csrfTokenHash = value.hash; record.csrfTokenSalt = value.salt; record.csrfTokenHashAlgorithm = value.algorithm;
      await this.write(this.replace(data, record)); return csrfToken;
    });
  }

  async revokeSession(token) {
    return this.serialized(async () => {
      const data = await this.load(); const found = await this.findToken(data, token);
      if (!found) return null;
      const record = { ...found, status: 'revoked', revokedAt: found.revokedAt || new Date(this.clock()).toISOString() };
      await this.write(this.replace(data, record)); return clone(record);
    });
  }

  async revokeByParent(accountSessionId) { return this.revokeWhere((item) => item.accountSessionId === accountSessionId); }
  async revokeAccountSessions(accountId) { return this.revokeWhere((item) => item.accountId === accountId); }
  async revokeWhere(predicate) {
    return this.serialized(async () => {
      const current = await this.load(); const now = new Date(this.clock()).toISOString(); let count = 0;
      const data = { ...current, sessions: current.sessions.map(record => {
        if (record.status !== 'active' || !predicate(record)) return record;
        count++; return { ...record, status: 'revoked', revokedAt: now };
      }) };
      if (count) await this.write(data); return count;
    });
  }

  async removeExpiredSessions() {
    return this.serialized(async () => {
      const current = await this.load(); const now = this.clock(); const before = current.sessions.length;
      const data = { ...current, sessions: current.sessions.filter(item => !(this.expired(item, now) && Date.parse(item.expiresAt) < now - this.ttlMs)) };
      if (before !== data.sessions.length) await this.write(data); return before - data.sessions.length;
    });
  }
}
