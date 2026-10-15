import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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
  constructor(file, { ttlSeconds, maxActivePerAccount = 8, kind = 'account', persistent = false, clock = Date.now } = {}) {
    this.file = file;
    this.persistent = kind === 'account' && persistent;
    this.ttlMs = Math.max(1, Number(ttlSeconds || (kind === 'game' ? 300 : 28_800))) * 1000;
    this.maxActivePerAccount = Math.max(1, Number(maxActivePerAccount || 8));
    this.kind = kind;
    this.clock = clock;
    this.queue = Promise.resolve();
    this.verifiedSecrets = new Map();
    this.tokenIndex=new Map();
  }

  verifies(token, hash, salt) {
    if(!token||!hash||!salt)return false;
    const key=createHash('sha256').update(String(token)).update(hash).update(salt).digest('hex');
    if(this.verifiedSecrets.has(key))return true;
    if(!verifies(token,hash,salt))return false;
    this.verifiedSecrets.set(key,true);
    if(this.verifiedSecrets.size>2048)this.verifiedSecrets.delete(this.verifiedSecrets.keys().next().value);
    return true;
  }

  findToken(data,token){
    if(!token)return null;
    const fingerprint=createHash('sha256').update(String(token)).digest('hex'),cached=this.tokenIndex.get(fingerprint);
    if(cached){const record=data.sessions.find(item=>item.id===cached.id);if(record&&record.tokenHash===cached.hash&&record.tokenSalt===cached.salt)return record;}
    const record=data.sessions.find(item=>(!item.tokenFingerprint||item.tokenFingerprint===fingerprint)&&this.verifies(token,item.tokenHash,item.tokenSalt));
    if(record){this.tokenIndex.set(fingerprint,{id:record.id,hash:record.tokenHash,salt:record.tokenSalt});if(this.tokenIndex.size>2048)this.tokenIndex.delete(this.tokenIndex.keys().next().value);}
    return record;
  }

  async authenticateById(id) {
    return this.serialized(async()=>{const data=await this.read();const record=data.sessions.find(item=>item.id===id);return record&&!this.expired(record)?clone(record):null;});
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
        id: randomUUID(), tokenFingerprint:createHash('sha256').update(token).digest('hex'), tokenHash: tokenSecret.hash, tokenSalt: tokenSecret.salt,
        accountId: account.accountId, wallet: account.primaryEthereumWallet || null,
        csrfTokenHash: csrfSecret.hash, csrfTokenSalt: csrfSecret.salt,
        accountSessionId: extra.accountSessionId || null, avatarId: extra.avatarId || null,
        createdAt: now, expiresAt: this.persistent ? null : new Date(nowMs + this.ttlMs).toISOString(), lastUsedAt: now,
        revokedAt: null, status: 'active'
      };
      data.sessions.push(record);
      const active = data.sessions.filter((item) => item.accountId === record.accountId && item.status === 'active').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      for (const old of active.slice(this.persistent ? Infinity : this.maxActivePerAccount)) { old.status = 'revoked'; old.revokedAt = now; }
      await this.write(data);
      return { token, csrfToken, session: clone(record) };
    });
  }

  async authenticateSession(token, { touch = true, extend = false } = {}) {
    return this.serialized(async () => {
      const data = await this.read(); const nowMs = this.clock(); let changed = false;
      const record = this.findToken(data,token);
      if (!record) return null;
      if (this.expired(record, nowMs)) {
        if (!record.revokedAt && record.status === 'active') { record.status = 'expired'; changed = true; }
        if (changed) await this.write(data);
        return null;
      }
      if (this.persistent && record.expiresAt) { record.expiresAt = null; changed = true; }
      if(extend&&this.kind==='game'&&Date.parse(record.expiresAt)-nowMs<this.ttlMs/2){record.expiresAt=new Date(nowMs+this.ttlMs).toISOString();changed=true;}
      if (touch&&(changed||nowMs-Date.parse(record.lastUsedAt)>=30000)) { record.lastUsedAt = new Date(nowMs).toISOString(); await this.write(data); } else if(changed)await this.write(data);
      return clone(record);
    });
  }

  touchSession(token) { return this.authenticateSession(token, { touch: true }); }

  async validCsrf(session, token) {
    return Boolean(session && (this.verifies(token, session.csrfTokenHash, session.csrfTokenSalt)
      || (session.previousCsrfSecrets || []).some((value) => this.verifies(token, value.hash, value.salt))));
  }

  async issueCsrf(token) {
    return this.serialized(async () => {
      const data = await this.read(); const record = this.findToken(data,token);
      if (!record || this.expired(record)) return '';
      const csrfToken = randomBytes(24).toString('base64url'); const value = secret(csrfToken);
      record.previousCsrfSecrets = [{ hash: record.csrfTokenHash, salt: record.csrfTokenSalt }, ...(record.previousCsrfSecrets || [])].filter((item) => item.hash).slice(0, 2);
      record.csrfTokenHash = value.hash; record.csrfTokenSalt = value.salt; await this.write(data); return csrfToken;
    });
  }

  async revokeSession(token) {
    return this.serialized(async () => {
      const data = await this.read(); const record = this.findToken(data,token);
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
