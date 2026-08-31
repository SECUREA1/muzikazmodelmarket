import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cleanWallet } from './user-json-database.mjs';

const EMPTY_STORE = { schemaVersion: 1, codes: {} };
const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const displayCode = (raw) => `MZK-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;

export class AccessCodeStore {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }

  async initialize() {
    await mkdir(dirname(this.file), { recursive: true });
    try { await this.read(); } catch (error) { if (error.code !== 'ENOENT') throw error; await this.write(EMPTY_STORE); }
  }

  async read() {
    const data = JSON.parse(await readFile(this.file, 'utf8'));
    if (data?.schemaVersion !== 1 || !data.codes || Array.isArray(data.codes)) throw new Error('Unsupported access-code store schema.');
    return data;
  }

  async write(data) {
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }

  transaction(operation) {
    const run = this.queue.then(async () => { await this.initialize(); const data = await this.read(); const result = await operation(data); await this.write(data); return result; });
    this.queue = run.catch(() => {});
    return run;
  }

  issue(walletId) {
    const wallet = cleanWallet(walletId);
    return this.transaction((data) => {
      if (data.codes[wallet]) return { walletId: wallet, alreadyIssued: true, createdAt: data.codes[wallet].createdAt };
      const raw = randomBytes(10).toString('hex').toUpperCase().slice(0, 16);
      const salt = randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();
      data.codes[wallet] = { walletId: wallet, salt, hash: scryptSync(raw, salt, 32).toString('hex'), createdAt, lastUsedAt: null };
      return { walletId: wallet, code: displayCode(raw), alreadyIssued: false, createdAt };
    });
  }

  async authenticate(code) {
    const normalized = normalizeCode(code);
    if (!/^MZK[A-F0-9]{16}$/.test(normalized)) throw Object.assign(new Error('Enter a valid MUZIKAZ access code.'), { statusCode: 401 });
    const raw = normalized.slice(3);
    return this.transaction((data) => {
      for (const record of Object.values(data.codes)) {
        const candidate = scryptSync(raw, record.salt, 32);
        const expected = Buffer.from(record.hash, 'hex');
        if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
          record.lastUsedAt = new Date().toISOString();
          return { walletId: record.walletId, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt };
        }
      }
      throw Object.assign(new Error('That access code was not recognized.'), { statusCode: 401 });
    });
  }
}
