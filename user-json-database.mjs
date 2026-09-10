import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SCHEMA_VERSION = 3;
const EMPTY_DATABASE = { schemaVersion: SCHEMA_VERSION, users: {}, trades: [], messages: [], transactions: [], landDeeds: {}, builderAssets: {}, builderOwnership: {}, builderListings: {}, builderPlacements: {} };
const BUILDER_CATEGORIES = new Set(['WORLD', 'BUILDINGS', 'PROPS', 'TERRAIN', 'NPC', 'AI', 'VEHICLES', 'GAME SYSTEMS', 'FUNCTIONS', 'AUDIO', 'EFFECTS', 'SCRIPTS', 'INTERACTIVE', 'UTILITIES']);

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
    if (value === undefined) continue;
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
    if (!data || ![1, 2, SCHEMA_VERSION].includes(data.schemaVersion) || !plainObject(data.users)) throw new Error('Unsupported user database schema.');
    if (data.schemaVersion < SCHEMA_VERSION) Object.assign(data, { schemaVersion: SCHEMA_VERSION, transactions: data.transactions || [], landDeeds: data.landDeeds || {}, builderAssets: data.builderAssets || {}, builderOwnership: data.builderOwnership || {}, builderListings: data.builderListings || {}, builderPlacements: data.builderPlacements || {} });
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

  /**
   * Materialize an access-code account in the durable game/market database.
   * This is intentionally additive: logging in must never replace saves,
   * listings, uploaded-asset references, or other application memory.
   */
  ensureAccount(account) {
    const accountKey = cleanWallet(`account:${account?.accountId}`);
    const wallet = cleanWallet(account?.primaryEthereumWallet || accountKey);
    const entitlementItems = [
      ...(account.gameAssets || []).map((name) => ({ id: `access-game-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, name, type: 'game-asset', source: 'mzk-access-code', revealStatus: /unrevealed/i.test(String(name)) ? 'unrevealed' : 'revealed' })),
      ...(account.landAssets || []).map((name) => ({ id: `access-land-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, name, type: 'land-entitlement', source: 'mzk-access-code', revealStatus: /unrevealed/i.test(String(name)) ? 'unrevealed' : 'revealed' })),
      ...(account.bottleClaims || []).map((name) => {
        const sales = (account.bottlePurchases || []).filter((purchase) => (purchase.bottles || []).includes(name));
        return { id: `access-claim-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, name, type: 'collectible-claim', source: sales.length ? 'verified-sale' : 'mzk-access-code', saleOrderIds: sales.map((purchase) => purchase.orderId) };
      })
    ];
    return this.transaction((data) => {
      // Code-only signup begins under a stable account key. Move that exact
      // game record to the Ethereum address on first connection so balances,
      // inventory, and memory remain one Backpack rather than being copied.
      const previous = data.users[wallet] || data.users[accountKey] || {};
      const now = new Date().toISOString();
      const entitlementById = new Map(entitlementItems.map((item) => [item.id, item]));
      const items = (previous.items || []).map((item) => entitlementById.has(item.id) ? { ...item, ...entitlementById.get(item.id) } : item);
      const knownIds = new Set(items.map((item) => item.id));
      items.push(...entitlementItems.filter((item) => !knownIds.has(item.id)));
      const memory = mergeMemory(previous.memory, {
        account: { accountId: account.accountId, backpackId: account.backpackId, accessCodeStatus: account.accessCodeStatus, gameAccess: Boolean(account.gameAccess), creatorVaultAccess: Boolean(account.creatorVaultAccess), selectedAvatarId: account.selectedAvatarId || 'starter-avatar', bottleClaims: clone(account.bottleClaims || []), bottlePurchases: clone(account.bottlePurchases || []), purchaseTierUsd: Number(account.purchaseTierUsd || 0), paymentMzkValue: Number(account.paymentMzkValue || 0) },
        backpack: { backpackId: account.backpackId, bottleClaims: clone(account.bottleClaims || []), bottlePurchases: clone(account.bottlePurchases || []), syncedAt: now },
        profile: account.username ? { username: account.username, displayName: account.username } : {}
      });
      const tokens = { ...(previous.tokens || {}) };
      const previouslyGrantedMzk = previous.memory?.account?.accountId === account.accountId
        ? Number(previous.memory.account.mzkGranted || 0) : 0;
      const canonicalGrantMzk = Math.max(0, Number(account.mzkBalance || 0));
      if (tokens.MZK === undefined) tokens.MZK = 0;
      // Preserve market spending while adding only newly purchased tier value.
      // Repeated login/sync calls therefore cannot duplicate the balance.
      if (canonicalGrantMzk > previouslyGrantedMzk) tokens.MZK = Number(tokens.MZK || 0) + canonicalGrantMzk - previouslyGrantedMzk;
      memory.account.mzkGranted = Math.max(previouslyGrantedMzk, canonicalGrantMzk);
      const record = { walletId: wallet, tokens, items, memory, createdAt: previous.createdAt || account.createdAt || now, updatedAt: now, revision: Number(previous.revision || 0) + 1 };
      data.users[wallet] = record;
      if (wallet !== accountKey) delete data.users[accountKey];
      return record;
    });
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

  createBuilderAsset(walletId, input) {
    const owner = cleanWallet(walletId); const source = plainObject(input);
    const name = String(source.name || '').trim();
    if (!name || name.length > 140) throw new Error('Builder asset name must contain 1 to 140 characters.');
    const category = String(source.builder_category || source.builderCategory || 'UTILITIES').trim().toUpperCase();
    if (!BUILDER_CATEGORIES.has(category)) throw new Error('Unsupported builder category.');
    const assetType = String(source.asset_type || source.assetType || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(assetType)) throw new Error('A valid asset_type is required.');
    return this.transaction((data) => {
      const user = data.users[owner]; if (!user) throw new Error('Builder account not found.');
      data.builderAssets ||= {}; data.builderOwnership ||= {};
      const now = new Date().toISOString(); const id = `builder-${Date.now()}-${Object.keys(data.builderAssets).length + 1}`;
      const optionalObject = (key) => source[key] === undefined ? undefined : cleanMemory(source[key]);
      const asset = {
        id, name, description: String(source.description || '').slice(0, 2000), creator: owner,
        asset_usage: 'game_builder', asset_type: assetType, builder_category: category,
        price_mzk: source.price_mzk === undefined ? undefined : Math.max(0, Math.trunc(Number(source.price_mzk) || 0)),
        glb_url: String(source.glb_url || '').slice(0, 1000), thumbnail_url: String(source.thumbnail_url || '').slice(0, 1000),
        game_function: String(source.game_function || '').slice(0, 100), script_reference: String(source.script_reference || '').slice(0, 1000),
        animation_data: optionalObject('animation_data'), collider_data: optionalObject('collider_data'), physics_data: optionalObject('physics_data'), spawn_data: optionalObject('spawn_data'), interaction_data: optionalObject('interaction_data'), function_data: optionalObject('function_data') || optionalObject('function'), ai_profile: optionalObject('ai_profile'),
        permissions: cleanMemory(source.permissions || {}), version: String(source.version || '1.0.0').slice(0, 40), created_at: now, updated_at: now
      };
      data.builderAssets[id] = asset;
      data.builderOwnership[id] = { asset_id: id, owner_id: owner, acquired_from: 'created', acquired_at: now, updated_at: now };
      return { asset, ownership: data.builderOwnership[id] };
    });
  }

  async builderBackpack(walletId) {
    const owner = cleanWallet(walletId); await this.initialize(); const data = await this.read();
    const assets = Object.values(data.builderOwnership || {}).filter((record) => record.owner_id === owner).map((record) => ({ ...data.builderAssets[record.asset_id], owner: record.owner_id, ownership: record, listing: Object.values(data.builderListings || {}).find((listing) => listing.asset_id === record.asset_id && listing.listing_status === 'active') || null })).filter((asset) => asset.id);
    return { owner_id: owner, assets, placements: Object.values(data.builderPlacements || {}).filter((placement) => placement.owner_id === owner && placement.status === 'placed') };
  }

  async builderMarket(category = '') {
    await this.initialize(); const data = await this.read(); const wanted = String(category || '').toUpperCase();
    return Object.values(data.builderListings || {}).filter((listing) => listing.listing_status === 'active').map((listing) => ({ ...listing, asset: data.builderAssets[listing.asset_id] ? { ...data.builderAssets[listing.asset_id], owner: data.builderOwnership?.[listing.asset_id]?.owner_id } : null })).filter((listing) => listing.asset?.asset_usage === 'game_builder' && (!wanted || listing.asset.builder_category === wanted)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  listBuilderAsset(walletId, input) {
    const seller = cleanWallet(walletId); const assetId = String(input?.asset_id || input?.assetId || '').trim(); const price = Math.trunc(Number(input?.price_mzk ?? input?.priceMzk));
    if (!Number.isSafeInteger(price) || price < 1 || price > 1_000_000) throw new Error('A listing price from 1 to 1,000,000 MZK is required.');
    return this.transaction((data) => {
      const ownership = data.builderOwnership?.[assetId]; if (!ownership || ownership.owner_id !== seller) throw new Error('Only the authoritative asset owner can create this listing.');
      const asset = data.builderAssets?.[assetId]; if (!asset || asset.asset_usage !== 'game_builder') throw new Error('Builder asset not found.');
      const current = Object.values(data.builderListings || {}).find((entry) => entry.asset_id === assetId && entry.listing_status === 'active');
      if (current) throw new Error('This builder asset already has an active listing.');
      const now = new Date().toISOString(); const listingId = `builder-listing-${Date.now()}-${Object.keys(data.builderListings || {}).length + 1}`;
      const listing = { listing_id: listingId, asset_id: assetId, seller_id: seller, buyer_id: null, price_mzk: price, description: String(input.description ?? asset.description).slice(0, 2000), preview: String(input.preview || asset.thumbnail_url || '').slice(0, 1000), category: asset.builder_category, version: asset.version, function_information: asset.function_data || asset.interaction_data || null, creator_information: asset.creator, permissions: asset.permissions, listing_status: 'active', transaction_id: null, created_at: now, sold_at: null };
      data.builderListings ||= {}; data.builderListings[listingId] = listing; return listing;
    });
  }

  cancelBuilderListing(walletId, listingId) {
    const seller = cleanWallet(walletId); const id = String(listingId || '').trim();
    return this.transaction((data) => { const listing = data.builderListings?.[id]; if (!listing || listing.seller_id !== seller || listing.listing_status !== 'active') throw new Error('Active seller listing not found.'); listing.listing_status = 'cancelled'; listing.updated_at = new Date().toISOString(); return listing; });
  }

  purchaseBuilderAsset(walletId, listingId, requestId) {
    const buyer = cleanWallet(walletId); const id = String(listingId || '').trim(); const request = String(requestId || '').trim();
    if (!request || request.length > 140) throw new Error('A purchase request id is required.');
    return this.transaction((data) => {
      data.transactions ||= []; const prior = data.transactions.find((entry) => entry.type === 'BUILDER_MARKET_PURCHASE' && entry.requestId === request);
      if (prior) return { transaction: prior, listing: data.builderListings[id], ownership: data.builderOwnership[data.builderListings[id]?.asset_id] };
      const listing = data.builderListings?.[id]; if (!listing || listing.listing_status !== 'active') throw new Error('This builder listing is no longer active.');
      if (listing.seller_id === buyer) throw new Error('Builders cannot purchase their own listing.');
      const ownership = data.builderOwnership?.[listing.asset_id]; if (!ownership || ownership.owner_id !== listing.seller_id) throw new Error('Seller ownership could not be verified.');
      const buyerUser = data.users[buyer]; const sellerUser = data.users[listing.seller_id]; if (!buyerUser || !sellerUser) throw new Error('Buyer and seller accounts are required.');
      const price = Number(listing.price_mzk); const balance = Number(buyerUser.tokens?.MZK || 0); if (balance < price) throw new Error('The buyer does not have enough MZK.');
      buyerUser.tokens.MZK = balance - price; sellerUser.tokens.MZK = Number(sellerUser.tokens?.MZK || 0) + price;
      const now = new Date().toISOString(); ownership.owner_id = buyer; ownership.acquired_from = id; ownership.acquired_at = now; ownership.updated_at = now;
      listing.buyer_id = buyer; listing.listing_status = 'sold'; listing.sold_at = now;
      const transaction = appendTransaction(data, { type: 'BUILDER_MARKET_PURCHASE', walletId: buyer, counterpartyId: listing.seller_id, amountMzk: -price, balanceAfterMzk: buyerUser.tokens.MZK, requestId: request, listingId: id, assetId: listing.asset_id });
      appendTransaction(data, { type: 'BUILDER_MARKET_SALE', walletId: listing.seller_id, counterpartyId: buyer, amountMzk: price, balanceAfterMzk: sellerUser.tokens.MZK, requestId: request, listingId: id, assetId: listing.asset_id, transactionId: transaction.id });
      listing.transaction_id = transaction.id; buyerUser.updatedAt = now; sellerUser.updatedAt = now; buyerUser.revision++; sellerUser.revision++;
      return { transaction, listing, ownership };
    });
  }

  placeBuilderAsset(walletId, input) {
    const owner = cleanWallet(walletId); const assetId = String(input?.asset_id || input?.assetId || '').trim(); const worldId = String(input?.world_id || input?.worldId || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(worldId)) throw new Error('A valid world_id is required.');
    return this.transaction((data) => {
      if (data.builderOwnership?.[assetId]?.owner_id !== owner) throw new Error('Builder asset ownership is required for placement.');
      const ownsLand = data.landDeeds?.[worldId]?.ownerId === owner && data.landDeeds[worldId].status === 'active'; if (!ownsLand) throw new Error('The selected world must be owned by this builder.');
      const values = input.transform || {}; const vector = (value, fallback) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? value.map(Number) : fallback;
      const now = new Date().toISOString(); const placementId = `placement-${Date.now()}-${Object.keys(data.builderPlacements || {}).length + 1}`;
      const placement = { placement_id: placementId, user_id: owner, owner_id: owner, world_id: worldId, land_id: data.landDeeds[worldId].id, asset_id: assetId, asset_version: data.builderAssets[assetId].version, transform: { position: vector(values.position, [0, 0, 0]), rotation: vector(values.rotation, [0, 0, 0]), scale: vector(values.scale, [1, 1, 1]) }, configuration: cleanMemory(input.configuration || {}), functional_settings: cleanMemory(input.functional_settings || {}), status: 'placed', created_at: now, updated_at: now };
      data.builderPlacements ||= {}; data.builderPlacements[placementId] = placement; return placement;
    });
  }

  updateBuilderPlacement(walletId, placementId, input, remove = false) {
    const owner = cleanWallet(walletId); const id = String(placementId || '').trim();
    return this.transaction((data) => { const placement = data.builderPlacements?.[id]; if (!placement || placement.owner_id !== owner) throw new Error('Owned world placement not found.'); if (remove) placement.status = 'removed'; else { if (input.configuration !== undefined) placement.configuration = cleanMemory(input.configuration); if (input.functional_settings !== undefined) placement.functional_settings = cleanMemory(input.functional_settings); } placement.updated_at = new Date().toISOString(); return placement; });
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
