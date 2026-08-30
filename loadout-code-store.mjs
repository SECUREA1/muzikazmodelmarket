import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CODE_PATTERN = /^MZK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function digest(code) {
  return createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

function publicGrant(record) {
  return {
    id: record.id,
    label: record.label,
    discountUsd: record.discountUsd,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    redeemedAt: record.redeemedAt || null,
    redeemedBy: record.redeemedBy || null,
    benefits: record.benefits
  };
}

export class LoadoutCodeStore {
  constructor(file) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async records() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }

  async save(records) {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(records, null, 2));
    await rename(temporary, this.file);
  }

  serialized(work) {
    const operation = this.queue.then(work, work);
    this.queue = operation.catch(() => {});
    return operation;
  }

  create({ label = 'Admin guest loadout', expiresInDays = 7 } = {}) {
    return this.serialized(async () => {
      const days = Math.min(30, Math.max(1, Math.trunc(Number(expiresInDays) || 7)));
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = randomBytes(12);
      const groups = Array.from({ length: 3 }, (_, group) => Array.from({ length: 4 }, (_, index) => alphabet[bytes[group * 4 + index] % alphabet.length]).join(''));
      const code = `MZK-${groups.join('-')}`;
      const createdAt = new Date();
      const record = {
        id: randomUUID(), codeHash: digest(code), label: String(label).trim().slice(0, 80) || 'Admin guest loadout',
        discountUsd: 30, createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + days * 86400000).toISOString(),
        benefits: ['Full creator vault access', 'Builder asset-generation tools', 'Unrevealed MUZIKAZ Land', 'Violet Wish Bottle complimentary mint claim']
      };
      const records = await this.records(); records.unshift(record); await this.save(records);
      return { ...publicGrant(record), code };
    });
  }

  redeem(code, wallet) {
    return this.serialized(async () => {
      const normalizedCode = String(code || '').trim().toUpperCase();
      const normalizedWallet = String(wallet || '').trim().toLowerCase();
      if (!CODE_PATTERN.test(normalizedCode)) throw Object.assign(new Error('Enter a valid MUZIKAZ one-time loadout code.'), { statusCode: 400 });
      if (!WALLET_PATTERN.test(normalizedWallet)) throw Object.assign(new Error('Connect a valid Ethereum wallet before applying the code.'), { statusCode: 400 });
      const records = await this.records();
      const record = records.find((item) => item.codeHash === digest(normalizedCode));
      if (!record) throw Object.assign(new Error('This loadout code is invalid.'), { statusCode: 404 });
      if (record.redeemedAt) throw Object.assign(new Error('This loadout code has already been burned.'), { statusCode: 409 });
      if (Date.parse(record.expiresAt) <= Date.now()) throw Object.assign(new Error('This loadout code has expired.'), { statusCode: 410 });
      record.redeemedAt = new Date().toISOString(); record.redeemedBy = normalizedWallet;
      await this.save(records);
      return publicGrant(record);
    });
  }

  async list() { return (await this.records()).map(publicGrant); }
}
