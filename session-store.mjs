import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const clone = (value) => JSON.parse(JSON.stringify(value));

function derive(token, salt) {
  return pbkdf2Sync(String(token), Buffer.from(salt, 'base64url'), 210_000, 32, 'sha256');
}

function secret(token) {
  const salt = randomBytes(16).toString('base64url');
  return { hash: derive(token, salt).toString('base64url'), salt };
}

function verifies(token, hash, salt) {
  if (!token || !hash || !salt) return false;
  const actual = derive(token, salt);
  const expected = Buffer.from(hash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Atomic, serialized JSON storage for opaque account and game sessions. */
export class DurableSessionStore {
  constructor(file, { ttlSeconds, maxActivePerAccount = 8, kind = 'account', clock = Date.now } = {}) {
    this.file = file;
    this.ttlMs = Math.max(1, Number(ttlSeconds || (kind === 'game' ? 300 : 28_800))) * 1000;
    this.maxActivePerAccount = Math.max(1, Number(maxActivePerAccount || 8));
    this.kind = kind;
    this.clock = clock;
    this.queue = Promise.resolve();
  }

  serialized(operation) {
    const guarded = async () => {
      try { return await operation(); }
      catch (error) {
        error.code ||= 'SESSION_STORE_FAILED'; error.statusCode ||= 500; error.stage ||= 'session-store'; throw error;
      }
    };
    const run = this.queue.then(guarded, guarded);
    this.queue = run.catch(() => {});
    return run;
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      return Array.isArray(parsed.sessions) ? parsed : { version: 1, sessions: [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, sessions: [] };
      throw error;
    }
  }

  async write(data) {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }

  expired(record, now = this.clock()) {
    return record.status !== 'active' || Boolean(record.revokedAt) || Date.parse(record.expiresAt) <= now;
  }

  async createSession(account, extra = {}) {
    return this.serialized(async () => {
      const data = await this.read();
      const nowMs = this.clock(); const now = new Date(nowMs).toISOString();
      for (const record of data.sessions) if (record.status === 'active' && Date.parse(record.expiresAt) <= nowMs) record.status = 'expired';
      const token = randomBytes(32).toString('base64url'); const tokenSecret = secret(token);
      const csrfToken = this.kind === 'account' ? randomBytes(24).toString('base64url') : '';
      const csrfSecret = csrfToken ? secret(csrfToken) : { hash: null, salt: null };
      const record = {
        id: randomUUID(), tokenHash: tokenSecret.hash, tokenSalt: tokenSecret.salt,
        accountId: account.accountId, wallet: account.primaryEthereumWallet || null,
        csrfTokenHash: csrfSecret.hash, csrfTokenSalt: csrfSecret.salt,
        accountSessionId: extra.accountSessionId || null, avatarId: extra.avatarId || null,
        createdAt: now, expiresAt: new Date(nowMs + this.ttlMs).toISOString(), lastUsedAt: now,
        revokedAt: null, status: 'active'
      };
      data.sessions.push(record);
      const active = data.sessions.filter((item) => item.accountId === record.accountId && item.status === 'active').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      for (const old of active.slice(this.maxActivePerAccount)) { old.status = 'revoked'; old.revokedAt = now; }
      await this.write(data);
      return { token, csrfToken, session: clone(record) };
    });
  }

  async authenticateSession(token, { touch = true } = {}) {
    return this.serialized(async () => {
      const data = await this.read(); const nowMs = this.clock(); let changed = false;
      const record = data.sessions.find((item) => verifies(token, item.tokenHash, item.tokenSalt));
      if (!record) return null;
      if (this.expired(record, nowMs)) {
        if (!record.revokedAt && record.status === 'active') { record.status = 'expired'; changed = true; }
        if (changed) await this.write(data);
        return null;
      }
      if (touch) { record.lastUsedAt = new Date(nowMs).toISOString(); await this.write(data); }
      return clone(record);
    });
  }

  touchSession(token) { return this.authenticateSession(token, { touch: true }); }

  async validCsrf(session, token) {
    return Boolean(session && (verifies(token, session.csrfTokenHash, session.csrfTokenSalt)
      || (session.previousCsrfSecrets || []).some((value) => verifies(token, value.hash, value.salt))));
  }

  async issueCsrf(token) {
    return this.serialized(async () => {
      const data = await this.read(); const record = data.sessions.find((item) => verifies(token, item.tokenHash, item.tokenSalt));
      if (!record || this.expired(record)) return '';
      const csrfToken = randomBytes(24).toString('base64url'); const value = secret(csrfToken);
      record.previousCsrfSecrets = [{ hash: record.csrfTokenHash, salt: record.csrfTokenSalt }, ...(record.previousCsrfSecrets || [])].filter((item) => item.hash).slice(0, 2);
      record.csrfTokenHash = value.hash; record.csrfTokenSalt = value.salt; await this.write(data); return csrfToken;
    });
  }

  async revokeSession(token) {
    return this.serialized(async () => {
      const data = await this.read(); const record = data.sessions.find((item) => verifies(token, item.tokenHash, item.tokenSalt));
      if (!record) return null;
      record.status = 'revoked'; record.revokedAt ||= new Date(this.clock()).toISOString(); await this.write(data); return clone(record);
    });
  }

  async revokeByParent(accountSessionId) { return this.revokeWhere((item) => item.accountSessionId === accountSessionId); }
  async revokeAccountSessions(accountId) { return this.revokeWhere((item) => item.accountId === accountId); }
  async revokeWhere(predicate) {
    return this.serialized(async () => {
      const data = await this.read(); const now = new Date(this.clock()).toISOString(); let count = 0;
      for (const record of data.sessions) if (record.status === 'active' && predicate(record)) { record.status = 'revoked'; record.revokedAt = now; count += 1; }
      if (count) await this.write(data); return count;
    });
  }

  async removeExpiredSessions() {
    return this.serialized(async () => {
      const data = await this.read(); const now = this.clock(); const before = data.sessions.length;
      data.sessions = data.sessions.filter((item) => !(this.expired(item, now) && Date.parse(item.expiresAt) < now - this.ttlMs));
      if (before !== data.sessions.length) await this.write(data); return before - data.sessions.length;
    });
  }
}
