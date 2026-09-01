import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SCHEMA_VERSION = 2;
const EMPTY_DATABASE = { schemaVersion: SCHEMA_VERSION, users: {}, trades: [], messages: [], transactions: [], landDeeds: {} };

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
function mergeMemory(previous, incoming) {
  const output = clone(plainObject(previous));
  for (const [key, value] of Object.entries(plainObject(incoming))) {
    output[key] = plainObject(value) && plainObject(output[key]) === output[key]
      ? mergeMemory(output[key], value) : clone(value);
  }
  return cleanMemory(output);
}
function appendTransaction(data, transaction) {
  data.transactions ||= [];
  const record = { id: `mzk-${Date.now()}-${data.transactions.length + 1}`, ...transaction, createdAt: new Date().toISOString() };
  data.transactions.push(record);
  return record;
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
    if (!data || ![1, SCHEMA_VERSION].includes(data.schemaVersion) || !plainObject(data.users)) throw new Error('Unsupported user database schema.');
    if (data.schemaVersion === 1) Object.assign(data, { schemaVersion: SCHEMA_VERSION, transactions: data.transactions || [], landDeeds: data.landDeeds || {} });
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
    return clone(record || { walletId: wallet, tokens: { MZK: 0 }, items: [], memory: {}, createdAt: null, updatedAt: null, revision: 0 });
  }

  async members() {
    await this.initialize();
    const data = await this.read();
    return Object.values(data.users).map(({ walletId, tokens = {}, items = [], memory = {}, updatedAt }) => ({
      walletId, displayName: String(memory.profile?.displayName || memory.profile?.username || walletId),
      mzk: Number(tokens.MZK || 0), itemCount: items.length,
      listedCount: items.filter((item) => item.listing?.active).length, updatedAt
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async marketProfile(walletId) {
    const wallet = cleanWallet(walletId);
    await this.initialize();
    const data = await this.read();
    const user = data.users[wallet];
    if (!user) return null;
    return { walletId: wallet, displayName: String(user.memory?.profile?.displayName || user.memory?.profile?.username || wallet), items: user.items || [], updatedAt: user.updatedAt };
  }

  async marketListings() {
    await this.initialize();
    const data = await this.read();
    return Object.values(data.users).flatMap((user) => {
      const sellerId = user.walletId;
      const sellerName = String(user.memory?.profile?.displayName || user.memory?.profile?.username || sellerId);
      return (user.items || []).filter((item) => item.listing?.active).map((item) => ({
        sellerId, sellerName, itemId: item.id,
        itemName: String(item.name || item.title || item.id),
        itemType: String(item.type || 'Backpack item'),
        priceMzk: Number(item.listing.priceMzk),
        listedAt: item.listing.updatedAt || user.updatedAt,
        thumbnailUrl: String(item.thumbnailUrl || item.previewUrl || '')
      }));
    }).sort((a, b) => String(b.listedAt || '').localeCompare(String(a.listedAt || '')) || a.itemName.localeCompare(b.itemName));
  }

  listItem(walletId, itemId, price, active = true) {
    const wallet = cleanWallet(walletId); const amount = Math.trunc(Number(price));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) throw new Error('A listing price from 1 to 1,000,000 MZK is required.');
    return this.transaction((data) => {
      const user = data.users[wallet];
      if (!user) throw new Error('Member wallet not found.');
      const item = user.items.find((entry) => entry.id === itemId);
      if (!item) throw new Error('Pack not found in this Backpack.');
      item.listing = { active: Boolean(active), priceMzk: amount, updatedAt: new Date().toISOString() };
      user.updatedAt = item.listing.updatedAt;
      return item;
    });
  }

  trade({ buyerId, sellerId, itemId, requestId }) {
    const buyer = cleanWallet(buyerId); const seller = cleanWallet(sellerId); const id = String(requestId || '').trim();
    if (buyer === seller) throw new Error('Choose another member to trade with.');
    if (!id || id.length > 140) throw new Error('A trade request id is required.');
    return this.transaction((data) => {
      data.trades ||= [];
      const duplicate = data.trades.find((trade) => trade.requestId === id);
      if (duplicate) return duplicate;
      const buyerUser = data.users[buyer]; const sellerUser = data.users[seller];
      if (!buyerUser || !sellerUser) throw new Error('Both members must have a market profile.');
      const index = sellerUser.items.findIndex((item) => item.id === itemId);
      const item = sellerUser.items[index]; const price = Number(item?.listing?.priceMzk);
      if (!item?.listing?.active || !Number.isSafeInteger(price) || price < 1) throw new Error('This pack is no longer listed.');
      const balance = Number(buyerUser.tokens?.MZK || 0);
      if (balance < price) throw new Error('The buyer does not have enough MZK.');
      buyerUser.tokens.MZK = balance - price;
      sellerUser.tokens.MZK = Number(sellerUser.tokens?.MZK || 0) + price;
      sellerUser.items.splice(index, 1); item.listing = { ...item.listing, active: false };
      buyerUser.items.push(item);
      const now = new Date().toISOString(); buyerUser.updatedAt = now; sellerUser.updatedAt = now;
      buyerUser.revision = Number(buyerUser.revision || 0) + 1; sellerUser.revision = Number(sellerUser.revision || 0) + 1;
      const trade = { id: `trade-${data.trades.length + 1}`, requestId: id, buyerId: buyer, sellerId: seller, itemId, itemName: String(item.name || item.title || item.id), priceMzk: price, createdAt: now };
      data.trades.push(trade); if (data.trades.length > 1000) data.trades.splice(0, data.trades.length - 1000);
      appendTransaction(data, { type: 'MARKET_PURCHASE', walletId: buyer, counterpartyId: seller, amountMzk: -price, balanceAfterMzk: buyerUser.tokens.MZK, requestId: id, tradeId: trade.id });
      appendTransaction(data, { type: 'MARKET_SALE', walletId: seller, counterpartyId: buyer, amountMzk: price, balanceAfterMzk: sellerUser.tokens.MZK, requestId: id, tradeId: trade.id });
      return trade;
    });
  }

  message({ from, to, text }) {
    const sender = cleanWallet(from); const recipient = cleanWallet(to); const message = String(text || '').trim();
    if (sender === recipient) throw new Error('Choose another member to message.');
    if (!message || message.length > 500) throw new Error('Messages must contain 1 to 500 characters.');
    return this.transaction((data) => {
      if (!data.users[sender] || !data.users[recipient]) throw new Error('Both members must have a market profile.');
      data.messages ||= []; const record = { id: `message-${Date.now()}-${data.messages.length}`, from: sender, to: recipient, text: message, createdAt: new Date().toISOString() };
      data.messages.push(record); if (data.messages.length > 2000) data.messages.splice(0, data.messages.length - 2000); return record;
    });
  }

  async activity(walletId, peerId = '') {
    const wallet = cleanWallet(walletId); const peer = peerId ? cleanWallet(peerId) : '';
    await this.initialize(); const data = await this.read();
    const touches = (a, b) => (a === wallet || b === wallet) && (!peer || a === peer || b === peer);
    return { trades: (data.trades || []).filter((entry) => touches(entry.buyerId, entry.sellerId)).slice(-100), messages: (data.messages || []).filter((entry) => touches(entry.from, entry.to)).slice(-100), transactions: (data.transactions || []).filter((entry) => entry.walletId === wallet || entry.counterpartyId === wallet).slice(-100) };
  }

  async landDeeds(walletId) {
    const wallet = cleanWallet(walletId); await this.initialize(); const data = await this.read();
    return clone(Object.values(data.landDeeds || {}).filter((deed) => deed.ownerId === wallet && deed.status === 'active'));
  }

  claimLand({ walletId, worldId, name, priceMzk, requestId }) {
    const wallet = cleanWallet(walletId); const world = String(worldId || '').trim().toLowerCase(); const request = String(requestId || '').trim(); const price = Math.trunc(Number(priceMzk));
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(world)) throw new Error('A valid world id is required.');
    if (!request || request.length > 140) throw new Error('A land claim request id is required.');
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000) throw new Error('A valid MZK deed price is required.');
    return this.transaction((data) => {
      data.landDeeds ||= {}; data.transactions ||= [];
      const prior = Object.values(data.landDeeds).find((deed) => deed.requestId === request);
      if (prior) return prior;
      const user = data.users[wallet]; if (!user) throw new Error('Member wallet not found.');
      const existing = data.landDeeds[world]; if (existing?.status === 'active') throw new Error('This land deed has already been claimed.');
      const balance = Number(user.tokens?.MZK || 0); if (balance < price) throw new Error('The wallet does not have enough MZK.');
      user.tokens.MZK = balance - price;
      const now = new Date().toISOString();
      const deed = { id: `deed-${world}`, worldId: world, name: String(name || world).slice(0, 140), ownerId: wallet, priceMzk: price, requestId: request, status: 'active', acquiredAt: now, updatedAt: now };
      data.landDeeds[world] = deed;
      if (!user.items.some((item) => item.id === deed.id)) user.items.push({ id: deed.id, type: 'land-deed', worldId: world, name: deed.name, acquiredAt: now });
      user.revision = Number(user.revision || 0) + 1; user.updatedAt = now;
      appendTransaction(data, { type: 'LAND_DEED_PURCHASE', walletId: wallet, amountMzk: -price, balanceAfterMzk: user.tokens.MZK, requestId: request, deedId: deed.id, worldId: world });
      return deed;
    });
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
        memory: body.memory === undefined ? (previous.memory || {}) : mergeMemory(previous.memory, body.memory),
        createdAt: previous.createdAt || now,
        updatedAt: now,
        revision: Number(previous.revision || 0) + 1
      };
      const before = Number(previous.tokens?.MZK || 0); const after = Number(record.tokens.MZK || 0);
      if (before !== after) appendTransaction(data, { type: 'WALLET_STATE_ADJUSTMENT', walletId: wallet, amountMzk: after - before, balanceAfterMzk: after, requestId: String(body.requestId || `state-${record.revision}`) });
      data.users[wallet] = record;
      return record;
    });
  }
}

export { cleanWallet };
