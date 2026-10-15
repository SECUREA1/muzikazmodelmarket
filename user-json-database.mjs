import { cleanCustomItem } from './custom-item-rules.mjs';
import { plotSpaceId, plotPlayUrl } from './member-plots.mjs';
import { economyItem, ownsEconomyItem, economyInventory } from './game-economy.mjs';
import { MEMBER_REWARDS } from './public/js/member-reward-rules.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cleanDesignerDraft } from './public/js/designer-draft-rules.js';
import { randomUUID } from 'node:crypto';
import { RPG_DEFAULT_STATS, applyRpgEffect } from './public/js/rpg-rules.js';
const RPG_CATALOG=JSON.parse(await readFile(new URL('./public/models/ioncore-rpg-items.json',import.meta.url),'utf8')).items;

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
  adminModify(walletId, input, actor) { return this.transaction(data => {
    const wallet = cleanWallet(walletId), user = data.users[wallet];
    const fail = message => { throw Object.assign(new Error(message), {statusCode:400}); };
    if (!user) fail('Member wallet not found.');
    const reason = String(input.reason || '').trim().slice(0, 300);
    if (!reason) fail('Enter a reason for the member change.');
    const delta = input.amountMzk === undefined ? 0 : Number(input.amountMzk);
    if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(Number(user.tokens.MZK) + delta) || Number(user.tokens.MZK) + delta < 0) fail('MZK adjustment must be a whole number and cannot make the balance negative.');
    let item = null;
    if (input.action === 'add-item') {
      const catalog = economyItem(input.sku);
      if (!catalog || catalog.basic) fail('Choose a purchasable catalog item.');
      if (ownsEconomyItem(user, catalog)) fail('This member already owns the upgrade.');
      item = {...catalog, id:'economy:'+catalog.sku, economySku:catalog.sku, type:'game-upgrade', source:'admin-grant', acquiredAt:new Date().toISOString(), listing:{active:false}};
      user.items.push(item);
    } else if (input.action === 'remove-item') {
      item = user.items.find(row => row.id === input.itemId);
      if (!item) fail('This item is no longer in the member Backpack.');
      user.items = user.items.filter(row => row.id !== item.id);
      const deed = item.worldId && data.landDeeds[item.worldId];
      if (deed && deed.ownerId === wallet) { deed.status = 'revoked'; deed.revokedAt = new Date().toISOString(); }
    } else if (input.action !== 'adjust') fail('Unknown member adjustment.');
    if (input.displayName !== undefined) user.memory.profile = {...user.memory.profile, displayName:String(input.displayName).trim().slice(0,80)};
    user.tokens.MZK = Number(user.tokens.MZK) + delta;
    user.revision = Number(user.revision || 0) + 1; user.updatedAt = new Date().toISOString();
    appendTransaction(data, {type:'ADMIN_MEMBER_CHANGE', walletId:wallet, actor, reason, action:input.action, amountMzk:delta, balanceAfterMzk:user.tokens.MZK, item: item && clone(item)});
    return user;
  }); }

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
      const items = (previous.items || []).map((item) => entitlementById.has(item.id) && item.type !== 'land-deed' ? { ...item, ...entitlementById.get(item.id) } : item);
      const knownIds = new Set(items.flatMap(item => [item.id, item.entitlementId].filter(Boolean)));
      const issued = new Set(previous.memory?.account?.issuedEntitlements || []);
      items.push(...entitlementItems.filter((item) => !knownIds.has(item.id) && !issued.has(item.id)));
      entitlementItems.forEach(item => issued.add(item.id));
      const memory = mergeMemory(previous.memory, {
        account: { issuedEntitlements: [...issued], accountId: account.accountId, backpackId: account.backpackId, accessCodeStatus: account.accessCodeStatus, gameAccess: Boolean(account.gameAccess), creatorVaultAccess: Boolean(account.creatorVaultAccess), selectedAvatarId: account.selectedAvatarId || 'starter-avatar', bottleClaims: clone(account.bottleClaims || []), bottlePurchases: clone(account.bottlePurchases || []), purchaseTierUsd: Number(account.purchaseTierUsd || 0), paymentMzkValue: Number(account.paymentMzkValue || 0) },
        backpack: { backpackId: account.backpackId, bottleClaims: clone(account.bottleClaims || []), bottlePurchases: clone(account.bottlePurchases || []), syncedAt: now },
        profile: account.username ? { username: account.username, displayName: previous.memory?.profile?.displayName || account.username } : {}
      });
      const tokens = { ...(previous.tokens || {}) };
      const previouslyGrantedMzk = previous.memory?.account?.accountId === account.accountId
        ? Number(previous.memory.account.mzkGranted || 0) : 0;
      const canonicalGrantMzk = Math.max(0, Number(account.mzkBalance || 0));
      if (tokens.MZK === undefined) tokens.MZK = 0;
      // Preserve market spending while adding only newly purchased tier value.
      // Repeated login/sync calls therefore cannot duplicate the balance.
      if (canonicalGrantMzk > previouslyGrantedMzk) {
        const amountMzk=canonicalGrantMzk-previouslyGrantedMzk;
        tokens.MZK = Number(tokens.MZK || 0) + amountMzk;
        appendTransaction(data,{type:'MEMBER_GRANT',walletId:wallet,amountMzk,balanceAfterMzk:tokens.MZK,requestId:`member-grant:${account.accountId}:${canonicalGrantMzk}`,reason:'Verified member entitlement or token purchase'});
      }
      memory.account.mzkGranted = Math.max(previouslyGrantedMzk, canonicalGrantMzk);
      const record = { walletId: wallet, tokens, items, memory, createdAt: previous.createdAt || account.createdAt || now, updatedAt: now, revision: Number(previous.revision || 0) + 1 };
      data.users[wallet] = record;
      if (wallet !== accountKey && data.users[accountKey]) {
        for(const deed of Object.values(data.landDeeds||{}))if(deed.ownerId===accountKey){deed.ownerId=wallet;deed.updatedAt=now;}
        const fields=['walletId','counterpartyId','buyerId','sellerId','from','to','owner_id','ownerId','seller_id','buyer_id','creator','user_id','creatorId'];
        const migrate=entry=>{for(const field of fields)if(entry[field]===accountKey)entry[field]=wallet;};
        for(const collection of ['transactions','trades','messages','builderAssets','builderOwnership','builderListings','builderPlacements','designerDrafts'])for(const entry of Object.values(data[collection]||{}))migrate(entry);
        for(const item of record.items)migrate(item);
        delete data.users[accountKey];
      }
      return record;
    });
  }

  async members() {
    await this.initialize();
    const data = await this.read();
    return Object.values(data.users).map(({ walletId, tokens = {}, items = [], memory = {}, updatedAt }) => ({
      walletId, displayName: String(memory.profile?.displayName || memory.profile?.username || walletId),
      mzk: Number(tokens.MZK || 0), itemCount: items.length,
      listedCount: items.filter((item) => item.listing?.active&&item.source!=='mzk-access-code').length, updatedAt
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
      return (user.items || []).filter((item) => item.listing?.active&&item.source!=='mzk-access-code').map((item) => ({
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
    const wallet = cleanWallet(walletId); const amount = Number(price);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) throw new Error('A listing price from 1 to 1,000,000 MZK is required.');
    return this.transaction((data) => {
      const user = data.users[wallet];
      if (!user) throw new Error('Member wallet not found.');
      const item = user.items.find((entry) => entry.id === itemId);
      if (!item) throw new Error('Pack not found in this Backpack.');
      if(item.source==='mzk-access-code')throw new Error('Included basic equipment cannot be resold.');
      item.listing = { active: Boolean(active), priceMzk: amount, updatedAt: new Date().toISOString() };
      user.updatedAt = item.listing.updatedAt;
      return item;
    });
  }

  trade({ buyerId, sellerId, itemId, requestId, expectedPriceMzk }) {
    const buyer = cleanWallet(buyerId); const seller = cleanWallet(sellerId); const id = String(requestId || '').trim();
    if (buyer === seller) throw new Error('Choose another member to trade with.');
    if (!id || id.length > 140) throw new Error('A trade request id is required.');
    return this.transaction((data) => {
      data.trades ||= [];
      const duplicate = data.trades.find((trade) => trade.requestId === id);
      if (duplicate) { if (duplicate.buyerId !== buyer || duplicate.sellerId !== seller || duplicate.itemId !== itemId) throw Object.assign(new Error('Trade request conflicts with an existing purchase.'),{statusCode:409}); return duplicate; }
      const buyerUser = data.users[buyer]; const sellerUser = data.users[seller];
      if (!buyerUser || !sellerUser) throw new Error('Both members must have a market profile.');
      const index = sellerUser.items.findIndex((item) => item.id === itemId);
      const item = sellerUser.items[index]; const price = Number(item?.listing?.priceMzk);
      if(item?.source==='mzk-access-code')throw new Error('Included basic equipment cannot be resold.');
      if (!item?.listing?.active || !Number.isSafeInteger(price) || price < 1) throw new Error('This pack is no longer listed.');
      if (expectedPriceMzk !== undefined && Number(expectedPriceMzk) !== price) throw new Error('The listing price changed. Refresh the market before buying.');
      if(item.economySku&&buyerUser.items.some(owned=>owned.economySku===item.economySku))throw new Error('You already own this upgrade.');
      const balance = Number(buyerUser.tokens?.MZK || 0);
      if (balance < price) throw new Error('The buyer does not have enough MZK.');
      buyerUser.tokens.MZK = balance - price;
      const sellerBalance = Number(sellerUser.tokens?.MZK || 0) + price;
      if (!Number.isSafeInteger(sellerBalance)) throw new Error('Seller balance exceeds the supported range.');
      sellerUser.tokens.MZK = sellerBalance;
      sellerUser.items.splice(index, 1); item.listing = { ...item.listing, active: false };
      buyerUser.items.push(item);
      const now = new Date().toISOString(); buyerUser.updatedAt = now; sellerUser.updatedAt = now;
      if(item.type==='land-deed'){const deed=data.landDeeds?.[item.worldId];if(!deed||deed.ownerId!==seller||deed.status!=='active')throw new Error('The seller does not hold this land deed.');deed.ownerId=buyer;deed.updatedAt=now;}
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

  async economy(walletId){const state=await this.get(walletId);return {balance:Number(state.tokens.MZK||0),items:economyInventory(state),ownedAssets:state.items.map(item=>item.type==='land-entitlement'?{...item,assetType:'lands',requiresReveal:true}:item.type==='land-deed'?{...item,memberPlot:true,assetType:'lands',environmentId:plotSpaceId(item),playUrl:plotPlayUrl(item)}:item)};}
  economyAction(walletId,action,sku,requestId){const wallet=cleanWallet(walletId),item=economyItem(sku);if(!item)throw Object.assign(new Error('Unknown game upgrade.'),{statusCode:400});if(!requestId||String(requestId).length>140)throw new Error('A purchase or use request id is required.');return this.transaction(data=>{const type=action==='buy'?'GAME_ITEM_PURCHASE':'GAME_ITEM_USE';const duplicate=data.transactions.find(row=>row.walletId===wallet&&row.type===type&&row.requestId===requestId);if(duplicate){if(duplicate.sku!==sku)throw new Error('This request was used for another item.');return duplicate;}const user=data.users[wallet];if(!user)throw new Error('Member wallet not found.');const owned=ownsEconomyItem(user,item);if(action==='buy'&&owned)throw Object.assign(new Error('This upgrade is already owned.'),{statusCode:409});if(action==='use'&&!owned)throw Object.assign(new Error('Purchase this upgrade before using it.'),{statusCode:403});const cost=action==='buy'?item.priceMzk:item.useCostMzk;if(Number(user.tokens.MZK||0)<cost)throw Object.assign(new Error('Not enough MZK. Play with the free basic kit or earn quest rewards.'),{statusCode:409});user.tokens.MZK-=cost;if(action==='buy')user.items.push({...item,id:'economy:'+sku,economySku:sku,type:'game-upgrade',source:'game-market',listing:{active:false},acquiredAt:new Date().toISOString()});user.updatedAt=new Date().toISOString();user.revision=Number(user.revision||0)+1;return appendTransaction(data,{type,walletId:wallet,amountMzk:-cost,balanceAfterMzk:user.tokens.MZK,requestId,sku,reason:item.name});});}

  purchaseStoreModels(walletId,items,amountMzk,requestId){
    const wallet=cleanWallet(walletId);if(!requestId||String(requestId).length>140)throw new Error('A checkout request id is required.');
    if(!Number.isSafeInteger(amountMzk)||amountMzk<0)throw new Error('Invalid checkout amount.');
    return this.transaction(data=>{
      const duplicate=data.transactions.find(item=>item.walletId===wallet&&item.type==='STORE_PURCHASE'&&item.requestId===requestId);if(duplicate)return duplicate;
      const user=data.users[wallet];if(!user||Number(user.tokens.MZK)<amountMzk)throw new Error('Not enough MZK for this purchase.');
      const acquiredAt=new Date().toISOString(),granted=[];
      for(const item of items)for(let index=0;index<item.quantity;index++)granted.push({...item,id:'owned-'+randomUUID(),catalogId:item.catalogId||item.id,quantity:1,source:'mzk-store',acquiredAt});
      user.tokens.MZK-=amountMzk;user.items.push(...granted);user.updatedAt=acquiredAt;user.revision=Number(user.revision||0)+1;
      return appendTransaction(data,{type:'STORE_PURCHASE',walletId:wallet,amountMzk:-amountMzk,balanceAfterMzk:user.tokens.MZK,requestId,items:granted});
    });
  }
  fulfillStoreOrder(walletId,order){
    const wallet=cleanWallet(walletId);
    if(order.purchaseType!=='MARKETPLACE'||!['PAID','FULFILLED'].includes(order.paymentStatus)||!order.memberAccountId)throw Object.assign(new Error('A verified member marketplace payment is required.'),{statusCode:409});
    const lines=order.metadata?.items||[];
    if(!lines.length||lines.some(item=>!item.deliverable?.modelUrl||!item.deliverable?.id))throw new Error('The verified order has no deliverable models.');
    const items=lines.map(line=>({...line.deliverable,assetType:line.deliverable.assetType||line.deliverable.type||'prop',type:line.deliverable.assetType||line.deliverable.type||'prop',quantity:line.quantity,priceUsd:line.price}));
    return this.transaction(data=>{
      const prior=data.transactions.find(item=>item.type==='VERIFIED_STORE_PURCHASE'&&item.requestId===order.orderId);if(prior){if(prior.accountId!==order.memberAccountId&&prior.walletId!==wallet)throw Object.assign(new Error('This order belongs to another member.'),{statusCode:403});return prior;}
      const user=data.users[wallet];if(!user||user.memory?.account?.accountId!==order.memberAccountId)throw Object.assign(new Error('The payment belongs to another member account.'),{statusCode:403});
      const now=new Date().toISOString(),granted=[];
      for(const item of items)for(let index=0;index<item.quantity;index++)granted.push({...item,id:'owned-'+randomUUID(),quantity:1,source:'verified-store',orderId:order.orderId,acquiredAt:now});
      user.items.push(...granted);user.updatedAt=now;user.revision=Number(user.revision||0)+1;
      return appendTransaction(data,{type:'VERIFIED_STORE_PURCHASE',accountId:order.memberAccountId,walletId:wallet,amountMzk:0,balanceAfterMzk:user.tokens.MZK,requestId:order.orderId,items:granted});
    });
  }


  async walletLedger(walletId){await this.initialize();const wallet=cleanWallet(walletId);return (await this.read()).transactions.filter(item=>item.walletId===wallet).slice(-200).map(item=>({...item,id:item.requestId||item.id,amount:item.amountMzk,kind:Number(item.amountMzk)<0?'spend':item.type==='AUDIO_REFUND'?'reverse':item.type==='MEMBER_GRANT'?'purchase':'earn'}));}
  refundAudioSpend(walletId,requestId){const wallet=cleanWallet(walletId);return this.transaction(data=>{const original=data.transactions.find(item=>item.walletId===wallet&&item.type==='GAMEPLAY_SPEND'&&item.gameId==='audio-mixer'&&item.requestId===requestId);if(!original)throw new Error('Mixer spend not found.');const duplicate=data.transactions.find(item=>item.walletId===wallet&&item.type==='AUDIO_REFUND'&&item.requestId===requestId+':reverse');if(duplicate)return duplicate;const user=data.users[wallet];user.tokens.MZK-=original.amountMzk;return appendTransaction(data,{type:'AUDIO_REFUND',walletId:wallet,amountMzk:-original.amountMzk,balanceAfterMzk:user.tokens.MZK,requestId:requestId+':reverse',reason:'Mixer insert undone'});});}

  memberReward(walletId, action, input={}) {
    const wallet=cleanWallet(walletId),day=new Date().toISOString().slice(0,10);
    return this.transaction(data=>{
      const user=data.users[wallet];if(!user)throw new Error('Member wallet not found.');
      user.memory ||= {}; user.memory.memberRewards ||= {};
      const rewards=user.memory.memberRewards;
      if(action==='progress'){
        const event=String(input.event||''),scope=String(input.scope||'');
        const rules=Object.entries(MEMBER_REWARDS).filter(([id,rule])=>id.startsWith(scope+':')&&rule.event===event);
        if(!rules.length)throw new Error('Unknown reward event.');
        const requestId=String(input.requestId||'').slice(0,140);if(!requestId)throw new Error('A reward event id is required.');
        const state=rewards[scope] ||= {day,events:{},seen:[]};
        if(state.day!==day){state.day=day;state.events={};state.seen=[];}
        if(!state.seen.includes(requestId)){state.seen.push(requestId);state.seen=state.seen.slice(-500);const cap=Math.max(...rules.map(([,rule])=>rule.goal));state.events[event]=Math.min(cap,(state.events[event]||0)+1);}
        return {progress:state.events};
      }
      const id=String(input.rewardId||''),rule=MEMBER_REWARDS[id];if(!rule)throw new Error('Unknown member reward.');
      const scope=id.split(':')[0],state=rewards[scope],key=id.startsWith('field:')?id:`${id}:${day}`;
      rewards.claims ||= {};
      if(rewards.claims[key])return rewards.claims[key];
      if(rule.goal&&(!state||state.day!==day||Number(state.events[rule.event]||0)<rule.goal))throw new Error('Complete this quest before claiming its reward.');
      user.tokens.MZK=Number(user.tokens.MZK||0)+rule.tokens;
      user.updatedAt=new Date().toISOString();user.revision=Number(user.revision||0)+1;
      const receipt=appendTransaction(data,{type:'MEMBER_REWARD',walletId:wallet,amountMzk:rule.tokens,balanceAfterMzk:user.tokens.MZK,requestId:key,reason:id});
      rewards.claims[key]=receipt;return receipt;
    });
  }

  spendGameplay(walletId, input) {
    const wallet = cleanWallet(walletId); const body = plainObject(input);
    const amount = Number(body.amountMzk);
    const requestId = String(body.requestId || '').trim();
    const gameId = String(body.gameId || 'muzikaz-gameplay').trim().slice(0, 140);
    const reason = String(body.reason || 'gameplay').trim().slice(0, 280);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) throw new Error('Gameplay spend must be from 1 to 1,000,000 MZK.');
    if (!requestId || requestId.length > 140) throw new Error('A gameplay spend request id is required.');
    if (!gameId) throw new Error('A game id is required.');
    return this.transaction((data) => {
      data.transactions ||= [];
      const duplicate = data.transactions.find((entry) => entry.type === 'GAMEPLAY_SPEND' && entry.walletId === wallet && entry.requestId === requestId);
      if (duplicate) return duplicate;
      const user = data.users[wallet];
      if (!user) throw new Error('Member wallet not found.');
      const balance = Number(user.tokens?.MZK || 0);
      if (balance < amount) throw new Error('The wallet does not have enough MZK.');
      user.tokens.MZK = balance - amount;
      user.updatedAt = new Date().toISOString();
      user.revision = Number(user.revision || 0) + 1;
      return appendTransaction(data, { type: 'GAMEPLAY_SPEND', walletId: wallet, amountMzk: -amount, balanceAfterMzk: user.tokens.MZK, requestId, gameId, reason });
    });
  }

  async gameplaySpending() {
    await this.initialize();
    const data = await this.read();
    const rows = new Map();
    for (const entry of data.transactions || []) {
      if (!['GAMEPLAY_SPEND','GAME_ITEM_PURCHASE','GAME_ITEM_USE'].includes(entry.type)) continue;
      const row = rows.get(entry.walletId) || { walletId: entry.walletId, spentMzk: 0, transactionCount: 0, lastSpentAt: null };
      row.spentMzk += Math.abs(Number(entry.amountMzk || 0));
      row.transactionCount += 1;
      if (!row.lastSpentAt || String(entry.createdAt) > row.lastSpentAt) row.lastSpentAt = entry.createdAt;
      rows.set(entry.walletId, row);
    }
    return { wallets: [...rows.values()].sort((a, b) => b.spentMzk - a.spentMzk), transactions: (data.transactions || []).filter((entry) => ['GAMEPLAY_SPEND','GAME_ITEM_PURCHASE','GAME_ITEM_USE'].includes(entry.type)).slice().reverse() };
  }

  async landDeeds(walletId) {
    const wallet = cleanWallet(walletId); await this.initialize(); const data = await this.read();
    return clone(Object.values(data.landDeeds || {}).filter((deed) => deed.ownerId === wallet && deed.status === 'active'));
  }

  async memberPlots(){await this.initialize();const data=await this.read();return Object.values(data.landDeeds||{}).filter(deed=>deed.status==='active').map(deed=>({...clone(deed),spaceId:plotSpaceId(deed),playUrl:plotPlayUrl(deed),ownerName:data.users[deed.ownerId]?.memory?.profile?.displayName||data.users[deed.ownerId]?.memory?.profile?.username||'MUZIKAZ member'}));}
  configurePlot(walletId,deedId,{environmentId,name}){const owner=cleanWallet(walletId);return this.transaction(data=>{const deed=Object.values(data.landDeeds||{}).find(item=>item.id===deedId&&item.status==='active');if(!deed)throw Object.assign(new Error('Plot deed not found.'),{statusCode:404});if(deed.ownerId!==owner)throw Object.assign(new Error('Only the current deed holder can configure this space.'),{statusCode:403});deed.hostedSpace={id:plotSpaceId(deed),environmentId:String(environmentId),name:String(name||deed.hostedSpace?.name||deed.name+' · Member plot').trim().slice(0,100)};deed.updatedAt=new Date().toISOString();const item=data.users[owner].items.find(item=>item.id===deed.id);if(item){item.spaceId=plotSpaceId(deed);item.playUrl=plotPlayUrl(deed);item.hostedSpace=clone(deed.hostedSpace);}return {...clone(deed),spaceId:plotSpaceId(deed),playUrl:plotPlayUrl(deed)};});}

  saveCustomItem(walletId, input) {
    const owner = cleanWallet(walletId);
    return this.transaction(data => {
      const user = data.users[owner]; if (!user) throw Object.assign(new Error('Sign in before saving a build.'), { statusCode: 401 });
      const prior = user.items.find(item => item.type === 'custom-item' && item.saveRequestId === input.requestId);
      if (prior) return prior;
      if (user.items.filter(item => item.type === 'custom-item').length >= 256) throw Object.assign(new Error('Your custom library is full (256 builds).'), { statusCode: 409 });
      const clean = cleanCustomItem(input, user.items);
      const item = { ...clean, id: 'custom-' + randomUUID(), saveRequestId: clean.requestId, type: 'custom-item', assetType: 'props', creatorId: owner, source: 'server-custom-library', createdAt: new Date().toISOString() };
      delete item.requestId;
      user.items.push(item); user.updatedAt = item.createdAt; user.revision = Number(user.revision || 0) + 1;
      return item;
    });
  }

  revealLand(walletId, itemId) {
    const owner = cleanWallet(walletId);
    return this.transaction(data => {
      const user = data.users[owner];
      const item = user?.items.find(item => (item.id === itemId || item.entitlementId === itemId) && ['land-deed', 'land-entitlement'].includes(item.type));
      if (!item) throw Object.assign(new Error('This land is not in your Backpack.'), { statusCode: 403 });
      data.landDeeds ||= {};
      if (item.type === 'land-deed') {
        const deed = data.landDeeds[item.worldId];
        if (!deed || deed.ownerId !== owner || deed.status !== 'active') throw Object.assign(new Error('This deed is not active.'), { statusCode: 409 });
        return { ...deed, spaceId: plotSpaceId(deed), playUrl: plotPlayUrl(deed) };
      }
      const worldId = `member-${randomUUID()}`, now = new Date().toISOString();
      const name = String(item.name || 'Member land').replace(/^unrevealed\s*/i, '').trim() || 'Member land';
      const entitlementId = item.id, deedId = 'deed-' + worldId;
      const deed = { id: deedId, worldId, name, ownerId: owner, priceMzk: 0, status: 'active', acquiredAt: now, updatedAt: now,
        hostedSpace: { id: 'plot-' + deedId, environmentId: 'public-commons', name: name + ' · Member plot' } };
      deed.spaceId = plotSpaceId(deed); deed.playUrl = plotPlayUrl(deed);
      data.landDeeds[worldId] = deed;
      Object.assign(item, { id: deedId, entitlementId, source: 'revealed-entitlement', type: 'land-deed', revealStatus: 'revealed', name, worldId, spaceId: deed.spaceId, playUrl: deed.playUrl, hostedSpace: deed.hostedSpace });
      user.updatedAt = now; user.revision = Number(user.revision || 0) + 1;
      return deed;
    });
  }

  claimLand({ walletId, worldId, name, priceMzk, requestId }) {
    const wallet = cleanWallet(walletId); const world = String(worldId || '').trim().toLowerCase(); const request = String(requestId || '').trim(); const price = Math.trunc(Number(priceMzk));
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(world)) throw new Error('A valid world id is required.');
    if (!request || request.length > 140) throw new Error('A land claim request id is required.');
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000) throw new Error('A valid MZK deed price is required.');
    return this.transaction((data) => {
      data.landDeeds ||= {}; data.transactions ||= [];
      const prior = Object.values(data.landDeeds).find((deed) => deed.requestId === request);
      if (prior) {if(prior.ownerId!==wallet)throw Object.assign(new Error('This land claim belongs to another member.'),{statusCode:409});return {...prior,spaceId:plotSpaceId(prior),playUrl:plotPlayUrl(prior)};}
      const user = data.users[wallet]; if (!user) throw new Error('Member wallet not found.');
      const existing = data.landDeeds[world]; if (existing?.status === 'active') throw new Error('This land deed has already been claimed.');
      const balance = Number(user.tokens?.MZK || 0); if (balance < price) throw new Error('The wallet does not have enough MZK.');
      user.tokens.MZK = balance - price;
      const now = new Date().toISOString();
      const deed = { id: `deed-${world}`, worldId: world, name: String(name || world).slice(0, 140), ownerId: wallet, priceMzk: price, requestId: request, status: 'active', hostedSpace:{id:`plot-deed-${world}`,environmentId:'muzikaz-main',name:String(name||world)+' · Member plot'}, acquiredAt: now, updatedAt: now };
      deed.spaceId=plotSpaceId(deed);deed.playUrl=plotPlayUrl(deed);
      data.landDeeds[world] = deed;
      if (!user.items.some((item) => item.id === deed.id)) user.items.push({ id: deed.id, type: 'land-deed', worldId: world, name: deed.name, spaceId:plotSpaceId(deed),playUrl:plotPlayUrl(deed),hostedSpace:clone(deed.hostedSpace), acquiredAt: now });
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

  async designerDrafts(walletId,id=''){
    const owner=cleanWallet(walletId);await this.initialize();const drafts=Object.values((await this.read()).designerDrafts||{}).filter(draft=>draft.owner_id===owner);
    if(id){const draft=drafts.find(draft=>draft.id===id);if(!draft)throw Object.assign(new Error('Design draft not found.'),{statusCode:404});return draft;}
    return drafts.map(({design,...draft})=>({...draft,product:design.product,character:design.character,artworkCount:design.uploads.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  saveDesignerDraft(walletId,input){const owner=cleanWallet(walletId),design=cleanDesignerDraft(input?.design);return this.transaction(data=>{data.designerDrafts||={};const id=String(input.id||'design-'+randomUUID()),previous=data.designerDrafts[id];if(input.id&&(!previous||previous.owner_id!==owner))throw Object.assign(new Error('Design draft not found.'),{statusCode:404});if(!previous&&Object.values(data.designerDrafts).filter(draft=>draft.owner_id===owner).length>=5)throw new Error('Your five design slots are full. Edit or delete an existing draft.');const now=new Date().toISOString();return data.designerDrafts[id]={id,owner_id:owner,name:String(input.name||design.character+' '+design.product).trim().slice(0,140)||'Untitled design',design,createdAt:previous?.createdAt||now,updatedAt:now};});}
  deleteDesignerDraft(walletId,id){const owner=cleanWallet(walletId);return this.transaction(data=>{const draft=data.designerDrafts?.[id];if(!draft||draft.owner_id!==owner)throw Object.assign(new Error('Design draft not found.'),{statusCode:404});delete data.designerDrafts[id];return {id};});}

  async rpgState(walletId) {
    const user=await this.get(walletId);const recentCare=(await this.read()).transactions.filter(entry=>entry.walletId===user.walletId&&entry.type==='RPG_USE').slice(-50);
    return {recentCare,owner_id:user.walletId,balance:Number(user.tokens.MZK||0),stats:{...RPG_DEFAULT_STATS,...user.memory?.ioncoreRpg?.stats},history:user.memory?.ioncoreRpg?.history||[],items:user.items.filter(item=>item.type==='rpg-consumable')};
  }

  recordRpgTelemetry(walletId,input){
    const wallet=cleanWallet(walletId),health=Number(input?.health);
    if(!Number.isFinite(health)||health<0||health>100)throw new Error('Health must be between 0 and 100.');
    return this.transaction(data=>{const user=data.users[wallet];if(!user)throw new Error('Member Backpack not found.');const previous=user.memory.ioncoreRpg||{};user.memory.ioncoreRpg={stats:{...RPG_DEFAULT_STATS,...previous.stats,health},history:[...(previous.history||[]),{health,stats:{...RPG_DEFAULT_STATS,...previous.stats,health},reason:'gameplay',world:String(input.world||'').slice(0,140),recordedAt:new Date().toISOString()}].slice(-100)};user.updatedAt=new Date().toISOString();user.revision++;return user.memory.ioncoreRpg;});
  }

  rpgAction(walletId, action, itemId, requestId) {
    const wallet=cleanWallet(walletId),request=String(requestId||'').trim();
    if(!request||request.length>140) throw new Error('A request ID is required.');
    return this.transaction(data=>{
      const user=data.users[wallet];if(!user)throw new Error('Member Backpack not found.');
      const duplicate=data.transactions.find(entry=>entry.walletId===wallet&&entry.requestId===request&&entry.type.startsWith('RPG_'));
      if(duplicate){if(duplicate.action!==action||duplicate.itemId!==itemId)throw new Error('Request ID already used for another item.');return duplicate;}
      let item;
      if(action==='buy'){
        item=RPG_CATALOG.find(entry=>entry.id===itemId);if(!item)throw new Error('Unknown RPG supply.');
        if(Number(user.tokens.MZK||0)<item.price)throw new Error('Insufficient MZK balance.');
        if(user.items.length>=10000)throw new Error('Backpack is full.');
        user.tokens.MZK-=item.price;
        user.items.push({id:'ioncore-'+randomUUID(),catalogId:item.id,name:item.name,type:'rpg-consumable',source:'ioncore-market'});
      }else if(action==='use'){
        const owned=user.items.find(entry=>entry.id===itemId&&entry.type==='rpg-consumable');
        item=RPG_CATALOG.find(entry=>entry.id===owned?.catalogId);if(!item)throw new Error('Owned RPG supply not found.');
        user.items=user.items.filter(entry=>entry.id!==itemId);
        const stats=applyRpgEffect(user.memory.ioncoreRpg?.stats,item.effect);user.memory.ioncoreRpg={...user.memory.ioncoreRpg,stats,history:[...(user.memory.ioncoreRpg?.history||[]),{health:stats.health,stats,reason:'care',itemName:item.name,recordedAt:new Date().toISOString()}].slice(-100)};
      }else throw new Error('Unknown RPG action.');
      user.revision++;user.updatedAt=new Date().toISOString();
      return appendTransaction(data,{type:action==='buy'?'RPG_PURCHASE':'RPG_USE',action,walletId:wallet,requestId:request,itemId,amountMzk:action==='buy'?-item.price:0,balanceAfterMzk:user.tokens.MZK,effect:action==='use'?item.effect:null});
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
    const seller = cleanWallet(walletId); const assetId = String(input?.asset_id || input?.assetId || '').trim(); const price = Number(input?.price_mzk ?? input?.priceMzk);
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
      if (prior) { if (prior.walletId !== buyer || prior.listingId !== id) throw Object.assign(new Error('Purchase request conflicts with an existing purchase.'),{statusCode:409}); return { transaction: prior, listing: data.builderListings[id], ownership: data.builderOwnership[data.builderListings[id]?.asset_id] }; }
      const listing = data.builderListings?.[id]; if (!listing || listing.listing_status !== 'active') throw new Error('This builder listing is no longer active.');
      if (listing.seller_id === buyer) throw new Error('Builders cannot purchase their own listing.');
      const ownership = data.builderOwnership?.[listing.asset_id]; if (!ownership || ownership.owner_id !== listing.seller_id) throw new Error('Seller ownership could not be verified.');
      const buyerUser = data.users[buyer]; const sellerUser = data.users[listing.seller_id]; if (!buyerUser || !sellerUser) throw new Error('Buyer and seller accounts are required.');
      const price = Number(listing.price_mzk); const balance = Number(buyerUser.tokens?.MZK || 0); if (balance < price) throw new Error('The buyer does not have enough MZK.');
      const sellerBalance = Number(sellerUser.tokens?.MZK || 0) + price;
      if (!Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(sellerBalance)) throw new Error('Invalid listing price or seller balance.');
      buyerUser.tokens.MZK = balance - price; sellerUser.tokens.MZK = sellerBalance;
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
        items: body.items === undefined ? (previous.items || []) : [...cleanItems(body.items).filter(item=>item.type!=='rpg-consumable'&&!String(item.id).startsWith('ioncore-')), ...(previous.items||[]).filter(item=>item.type==='rpg-consumable')],
        memory: body.memory === undefined ? (previous.memory || {}) : mergeMemory(previous.memory, body.memory),
        createdAt: previous.createdAt || now,
        updatedAt: now,
        revision: Number(previous.revision || 0) + 1
      };
      if(previous.memory?.ioncoreRpg) record.memory.ioncoreRpg=clone(previous.memory.ioncoreRpg);
      const before = Number(previous.tokens?.MZK || 0); const after = Number(record.tokens.MZK || 0);
      if (before !== after) appendTransaction(data, { type: 'WALLET_STATE_ADJUSTMENT', walletId: wallet, amountMzk: after - before, balanceAfterMzk: after, requestId: String(body.requestId || `state-${record.revision}`) });
      data.users[wallet] = record;
      return record;
    });
  }
}

export { cleanWallet };
