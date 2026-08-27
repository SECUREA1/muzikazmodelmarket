import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EMPTY_DATABASE = { schemaVersion: 1, users: {} };

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function cleanWallet(value) {
  const wallet = String(value || '').trim().toLowerCase();
  if (!/^(?:0x[a-f0-9]{40}|[a-z0-9][a-z0-9._:@-]{2,127})$/.test(wallet)) throw new Error('A valid wallet identifier is required.');
  return wallet;
}
function cleanItems(value) {
  if (!Array.isArray(value)) throw new Error('items must be an array.');
  if (value.length > 10_000) throw new Error('A wallet cannot contain more than 10,000 items.');
  return value.map((item) => {
    const record = plainObject(item);
    const id = String(record.id || '').trim();
    if (!id || id.length > 140) throw new Error('Every item requires an id of 140 characters or fewer.');
    return { ...clone(record), id };
  });
}
function cleanMemory(value) {
  const memory = plainObject(value);
  const encoded = JSON.stringify(memory);
  if (Buffer.byteLength(encoded) > 1_000_000) throw new Error('memory cannot exceed 1 MB.');
  return clone(memory);
}

export class UserJsonDatabase {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }

  async initialize() {
    await mkdir(dirname(this.file), { recursive: true });
    try { await this.read(); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.write(EMPTY_DATABASE);
    }
  }

  async read() {
    const data = JSON.parse(await readFile(this.file, 'utf8'));
    if (!data || data.schemaVersion !== 1 || !plainObject(data.users)) throw new Error('Unsupported user database schema.');
    return data;
  }

  async write(data) {
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }

  transaction(operation) {
    const run = this.queue.then(async () => {
      await this.initialize();
      const data = await this.read();
      const result = await operation(data);
      await this.write(data);
      return clone(result);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async get(walletId) {
    const wallet = cleanWallet(walletId);
    await this.initialize();
    const record = (await this.read()).users[wallet];
    return clone(record || { walletId: wallet, tokens: { MZK: 0 }, items: [], memory: {}, createdAt: null, updatedAt: null });
  }

  put(walletId, input) {
    const wallet = cleanWallet(walletId);
    const body = plainObject(input);
    return this.transaction((data) => {
      const previous = data.users[wallet] || {};
      const now = new Date().toISOString();
      const tokens = body.tokens === undefined ? plainObject(previous.tokens) : plainObject(body.tokens);
      const normalizedTokens = {};
      for (const [symbol, amount] of Object.entries(tokens)) {
        if (!/^[A-Z0-9_-]{2,16}$/.test(symbol) || !Number.isFinite(Number(amount))) throw new Error('tokens must contain finite numeric balances keyed by currency symbol.');
        normalizedTokens[symbol] = Number(amount);
      }
      const record = {
        walletId: wallet,
        tokens: normalizedTokens,
        items: body.items === undefined ? (previous.items || []) : cleanItems(body.items),
        memory: body.memory === undefined ? (previous.memory || {}) : cleanMemory(body.memory),
        createdAt: previous.createdAt || now,
        updatedAt: now
      };
      data.users[wallet] = record;
      return record;
    });
  }
}

export { cleanWallet };
