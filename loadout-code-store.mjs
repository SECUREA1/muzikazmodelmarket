import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ACCESS_CODE_PATTERN = /^MZK(?:-[A-Z2-9]{4}){4}$/;
const WALLET_PATTERN = /^0x[a-f0-9]{40}$/;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const normalizeWallet = (value) => String(value || '').trim().toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))];

function generateCode() {
  const bytes = randomBytes(16);
  const groups = Array.from({ length: 4 }, (_, group) => Array.from({ length: 4 }, (_, index) => alphabet[bytes[group * 4 + index] % alphabet.length]).join(''));
  return `MZK-${groups.join('-')}`;
}
function hashCode(code, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: pbkdf2Sync(normalizeCode(code), salt, 210_000, 32, 'sha256').toString('hex') };
}
function verifies(code, credential) {
  const candidate = Buffer.from(hashCode(code, credential.salt).hash, 'hex');
  const expected = Buffer.from(credential.hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function mask(code) { return `${code.slice(0, 8)}-••••-••••-${code.slice(-4)}`; }
function publicAccount(account) {
  const safe = clone(account); delete safe.accessCodeHash; delete safe.accessCodeSalt; return safe;
}
function publicCredential(record) {
  return { id: record.id, maskedCode: record.maskedCode, label: record.label, campaign: record.campaign, status: record.status, createdAt: record.createdAt, activatedAt: record.activatedAt || null, expiresAt: record.expiresAt || null, boundWallet: record.boundWallet || null, accountId: record.accountId || null, accountUsername: record.accountUsername || null, loadoutRedeemed: Boolean(record.loadoutRedeemed), entitlements: clone(record.entitlements) };
}
function accountRecord(id, wallet = '', username = '') {
  const now = new Date().toISOString();
  return { accountId: id || `usr_${randomUUID()}`, username, accessCodeStatus: null, accessCodeCreatedAt: null, accessCodeActivatedAt: null, accessCodeLastUsedAt: null, primaryEthereumWallet: wallet || null, connectedWallets: wallet ? [{ chain: 'ETH', address: wallet, boundAt: now }] : [], loadoutStatus: 'none', loadoutPaymentId: null, loadoutRedeemed: false, backpackId: `pack_${randomUUID()}`, mzkBalance: 0, landAssets: [], gameAssets: [], purchasedAssets: [], bottleClaims: [], bottleNFTs: [], creatorVaultAccess: false, marketplaceAccess: true, gameAccess: false, createdAt: now, updatedAt: now };
}

export class MzkAccountStore {
  constructor(file, { legacyCodesFile = '', legacyUsersFile = '' } = {}) { this.file = file; this.legacyCodesFile = legacyCodesFile; this.legacyUsersFile = legacyUsersFile; this.queue = Promise.resolve(); }
  async records() { try { return JSON.parse(await readFile(this.file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 2, accounts: [], credentials: [], migrations: {} }; throw error; } }
  async save(data) { await mkdir(dirname(this.file), { recursive: true }); const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, this.file); }
  serialized(work) { const operation = this.queue.then(async () => { const data = await this.records(); const result = await work(data); await this.save(data); return result; }, async () => { const data = await this.records(); const result = await work(data); await this.save(data); return result; }); this.queue = operation.catch(() => {}); return operation; }
  async migrate() {
    return this.serialized(async (data) => {
      if (data.migrations?.canonicalAccountsV2) return { migrated: false };
      data.migrations ||= {};
      try {
        const legacy = JSON.parse(await readFile(this.legacyUsersFile, 'utf8'));
        for (const [walletId, user] of Object.entries(legacy.users || {})) {
          const wallet = normalizeWallet(walletId); if (!WALLET_PATTERN.test(wallet) || data.accounts.some((a) => a.connectedWallets.some((w) => w.address === wallet))) continue;
          const account = accountRecord('', wallet, user.memory?.profile?.username || user.memory?.profile?.displayName || '');
          account.mzkBalance = Number(user.tokens?.MZK || 0); account.gameAssets = clone(user.items || []); data.accounts.push(account);
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      // Old one-time hashes cannot safely become login credentials because their raw secrets are unavailable.
      // Redeemed wallet grants are merged into their canonical wallet account without duplicating benefits.
      try {
        const legacyCodes = JSON.parse(await readFile(this.legacyCodesFile, 'utf8'));
        for (const old of legacyCodes) if (old.redeemedBy) {
          const wallet = normalizeWallet(old.redeemedBy); let account = data.accounts.find((a) => a.connectedWallets.some((w) => w.address === wallet));
          if (!account) { account = accountRecord('', wallet); data.accounts.push(account); }
          account.loadoutStatus = 'waived'; account.loadoutRedeemed = true; account.creatorVaultAccess = true; account.gameAccess = true;
          account.landAssets = unique([...account.landAssets, 'Unrevealed MUZIKAZ Land']); account.bottleClaims = unique([...account.bottleClaims, 'Violet Wish Bottle']);
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      data.migrations.canonicalAccountsV2 = new Date().toISOString(); return { migrated: true, accounts: data.accounts.length };
    });
  }
  create(options = {}) {
    return this.serialized(async (data) => {
      const code = generateCode(); const secret = hashCode(code); const now = new Date(); const days = Math.min(365, Math.max(1, Math.trunc(Number(options.expiresInDays) || 7)));
      const expiresAt = options.maximumActivationDate ? new Date(options.maximumActivationDate) : new Date(now.getTime() + days * 86400000); if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw Object.assign(new Error('Choose a future activation expiration.'), { statusCode: 400 });
      const record = { id: randomUUID(), codeHash: secret.hash, codeSalt: secret.salt, maskedCode: mask(code), label: String(options.label || 'Admin access').trim().slice(0, 80), campaign: String(options.campaign || '').trim().slice(0, 80), status: 'issued', createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), activatedAt: null, lastUsedAt: null, boundWallet: null, accountId: null, accountUsername: null, loadoutRedeemed: false, entitlements: { waiveLoadout: options.waiveLoadout !== false && options.waiveLoadout !== 'false', violetBottle: options.violetBottle !== false && options.violetBottle !== 'false', starterLand: options.starterLand !== false && options.starterLand !== 'false', promotionalMzk: Math.max(0, Math.min(1_000_000, Math.trunc(Number(options.promotionalMzk) || 0))), creatorVault: options.creatorVault !== false && options.creatorVault !== 'false' } };
      data.credentials.unshift(record); return { ...publicCredential(record), code };
    });
  }
  activate(code, wallet, username = '') { return this.serialized(async (data) => {
    const normalized = normalizeCode(code); const address = normalizeWallet(wallet); if (!ACCESS_CODE_PATTERN.test(normalized)) throw Object.assign(new Error('Enter a valid MZK Access Code.'), { statusCode: 400 }); if (!WALLET_PATTERN.test(address)) throw Object.assign(new Error('Connect a valid Ethereum wallet before activation.'), { statusCode: 400 });
    const credential = data.credentials.find((item) => verifies(normalized, { hash: item.codeHash, salt: item.codeSalt })); if (!credential) throw Object.assign(new Error('This MZK Access Code is invalid.'), { statusCode: 404 });
    if (credential.status === 'revoked') throw Object.assign(new Error('This MZK Access Code has been revoked.'), { statusCode: 403 });
    if (credential.status === 'issued' && Date.parse(credential.expiresAt) <= Date.now()) { credential.status = 'expired'; throw Object.assign(new Error('This MZK Access Code expired before activation.'), { statusCode: 410 }); }
    if (credential.status === 'activated') throw Object.assign(new Error('This code is already activated. Use Open My Account instead.'), { statusCode: 409 });
    let account = data.accounts.find((a) => a.connectedWallets.some((w) => w.address === address)); if (credential.accountId) account ||= data.accounts.find((a) => a.accountId === credential.accountId); if (!account) { account = accountRecord('', address, String(username).slice(0, 40)); data.accounts.push(account); }
    const now = new Date().toISOString(); if (!account.connectedWallets.some((w) => w.chain === 'ETH' && w.address === address)) account.connectedWallets.push({ chain: 'ETH', address, boundAt: now }); account.primaryEthereumWallet ||= address;
    if (!credential.loadoutRedeemed) { const e = credential.entitlements; if (e.waiveLoadout) account.loadoutStatus = 'waived'; account.creatorVaultAccess ||= e.creatorVault; account.gameAccess ||= e.creatorVault; if (e.starterLand) account.landAssets = unique([...account.landAssets, 'Unrevealed MUZIKAZ Land']); if (e.violetBottle) account.bottleClaims = unique([...account.bottleClaims, 'Violet Wish Bottle']); account.mzkBalance += e.promotionalMzk; account.loadoutRedeemed = true; credential.loadoutRedeemed = true; }
    Object.assign(credential, { status: 'activated', activatedAt: now, lastUsedAt: now, boundWallet: address, accountId: account.accountId, accountUsername: account.username }); Object.assign(account, { accessCodeStatus: 'activated', accessCodeCreatedAt: credential.createdAt, accessCodeActivatedAt: now, accessCodeLastUsedAt: now, updatedAt: now });
    return { account: publicAccount(account), credential: publicCredential(credential) };
  }); }
  authenticate(code) { return this.serialized(async (data) => { const normalized = normalizeCode(code); if (!ACCESS_CODE_PATTERN.test(normalized)) throw Object.assign(new Error('Enter a valid MZK Access Code.'), { statusCode: 400 }); const credential = data.credentials.find((item) => verifies(normalized, { hash: item.codeHash, salt: item.codeSalt })); if (!credential || credential.status !== 'activated') throw Object.assign(new Error('The MZK Access Code is not active.'), { statusCode: 401 }); const account = data.accounts.find((a) => a.accountId === credential.accountId); if (!account) throw Object.assign(new Error('The account connected to this code was not found.'), { statusCode: 404 }); const now = new Date().toISOString(); credential.lastUsedAt = now; account.accessCodeLastUsedAt = now; account.updatedAt = now; return publicAccount(account); }); }
  findByWallet(wallet) { return this.serialized(async (data) => { const address = normalizeWallet(wallet); if (!WALLET_PATTERN.test(address)) throw Object.assign(new Error('A valid Ethereum wallet is required.'), { statusCode: 400 }); let account = data.accounts.find((a) => a.connectedWallets.some((w) => w.address === address)); if (!account) { account = accountRecord('', address); data.accounts.push(account); } return publicAccount(account); }); }
  grantPaidLoadout(wallet, paymentId) { return this.serialized(async (data) => { const address = normalizeWallet(wallet); if (!WALLET_PATTERN.test(address) || !String(paymentId || '').trim()) throw Object.assign(new Error('A verified payment and wallet are required.'), { statusCode: 400 }); let account = data.accounts.find((a) => a.connectedWallets.some((w) => w.address === address)); if (!account) { account = accountRecord('', address); data.accounts.push(account); } if (account.loadoutPaymentId && account.loadoutPaymentId !== paymentId) return publicAccount(account); const now = new Date().toISOString(); account.loadoutStatus = 'paid'; account.loadoutPaymentId = String(paymentId).slice(0, 140); account.loadoutRedeemed = true; account.creatorVaultAccess = true; account.gameAccess = true; account.landAssets = unique([...account.landAssets, 'Unrevealed MUZIKAZ Land']); account.bottleClaims = unique([...account.bottleClaims, 'Violet Wish Bottle']); account.updatedAt = now; return publicAccount(account); }); }
  async getAccount(accountId) { const account = (await this.records()).accounts.find((a) => a.accountId === accountId); return account ? publicAccount(account) : null; }
  ensureAccountCode(accountId) { return this.serialized(async (data) => { const account = data.accounts.find((a) => a.accountId === accountId); if (!account) throw Object.assign(new Error('Account not found.'), { statusCode: 404 }); const active = data.credentials.find((c) => c.accountId === accountId && c.status === 'activated'); if (active) return { created: false, credential: publicCredential(active) }; const code = generateCode(); const secret = hashCode(code); const now = new Date().toISOString(); const record = { id: randomUUID(), codeHash: secret.hash, codeSalt: secret.salt, maskedCode: mask(code), label: 'Account credential', campaign: '', status: 'activated', createdAt: now, expiresAt: null, activatedAt: now, lastUsedAt: null, boundWallet: account.primaryEthereumWallet, accountId, accountUsername: account.username, loadoutRedeemed: account.loadoutRedeemed, entitlements: {} }; data.credentials.unshift(record); Object.assign(account, { accessCodeStatus: 'activated', accessCodeCreatedAt: now, accessCodeActivatedAt: now, updatedAt: now }); return { created: true, code, credential: publicCredential(record) }; }); }
  rotate(accountId) { return this.serialized(async (data) => { const account = data.accounts.find((a) => a.accountId === accountId); if (!account) throw Object.assign(new Error('Account not found.'), { statusCode: 404 }); for (const c of data.credentials) if (c.accountId === accountId && c.status === 'activated') c.status = 'revoked'; const code = generateCode(); const secret = hashCode(code); const now = new Date().toISOString(); const record = { id: randomUUID(), codeHash: secret.hash, codeSalt: secret.salt, maskedCode: mask(code), label: 'Rotated account credential', campaign: '', status: 'activated', createdAt: now, expiresAt: null, activatedAt: now, lastUsedAt: null, boundWallet: account.primaryEthereumWallet, accountId, accountUsername: account.username, loadoutRedeemed: account.loadoutRedeemed, entitlements: {} }; data.credentials.unshift(record); account.accessCodeCreatedAt = now; account.accessCodeActivatedAt = now; account.accessCodeStatus = 'activated'; account.updatedAt = now; return { code, credential: publicCredential(record), account: publicAccount(account) }; }); }
  revoke(accountId) { return this.serialized(async (data) => { let found = false; for (const c of data.credentials) if (c.accountId === accountId && c.status === 'activated') { c.status = 'revoked'; found = true; } const account = data.accounts.find((a) => a.accountId === accountId); if (account) { account.accessCodeStatus = 'revoked'; account.updatedAt = new Date().toISOString(); } return { revoked: found, account: account && publicAccount(account) }; }); }
  adminRevoke(id) { return this.serialized(async (data) => { const record = data.credentials.find((c) => c.id === id); if (!record) throw Object.assign(new Error('Credential not found.'), { statusCode: 404 }); record.status = 'revoked'; const account = data.accounts.find((a) => a.accountId === record.accountId); if (account) account.accessCodeStatus = 'revoked'; return publicCredential(record); }); }
  async list() { const data = await this.records(); return data.credentials.map(publicCredential); }
}

// Compatibility export for older imports while all behavior now uses canonical accounts.
export const LoadoutCodeStore = MzkAccountStore;
