import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const HANDOFF_STATUSES = Object.freeze(['created', 'waiting_for_mobile', 'mobile_opened', 'wallet_connecting', 'awaiting_wallet_approval', 'submitted', 'confirming', 'approved', 'rejected', 'expired', 'failed']);
export const HANDOFF_SCOPES = Object.freeze(['wallet_connect', 'wallet_verify', 'auth', 'payment', 'wallet_link']);
const TERMINAL = new Set(['approved', 'rejected', 'expired', 'failed']);
const CHAINS = Object.freeze({ metamask: ['ethereum', 'polygon'], phantom: ['solana'], lace: ['cardano'] });
const TTL = Object.freeze({ wallet_connect: 10 * 60_000, wallet_verify: 5 * 60_000, auth: 5 * 60_000, payment: 5 * 60_000, wallet_link: 5 * 60_000 });
const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
const safeEqual = (a, b) => { const left = Buffer.from(String(a)); const right = Buffer.from(String(b)); return left.length === right.length && timingSafeEqual(left, right); };

export class MobileWalletHandoffStore {
  constructor(file, options = {}) { this.file = file; this.now = options.now || (() => Date.now()); this.records = null; this.queue = Promise.resolve(); }
  async load() { if (this.records) return this.records; try { this.records = JSON.parse(await readFile(this.file, 'utf8')); } catch { this.records = []; } return this.records; }
  async save() { await mkdir(dirname(this.file), { recursive: true }); const temporary = `${this.file}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify(this.records, null, 2)); await rename(temporary, this.file); }
  serialize(record) { const { tokenHash, desktopSecretHash, nonceHash, desktopSessionId, userId, ...safe } = record; return safe; }
  async create(input = {}) {
    return this.lock(async () => {
      const walletType = String(input.walletType || '').toLowerCase(); const chain = String(input.chain || '').toLowerCase(); const scope = String(input.scope || 'wallet_connect');
      if (!CHAINS[walletType]?.includes(chain)) throw new Error('Wallet and network do not match.');
      if (!HANDOFF_SCOPES.includes(scope)) throw new Error('Unsupported mobile wallet operation.');
      if (!input.userId || !input.desktopSessionId) throw new Error('An authenticated account and desktop session are required.');
      if (scope === 'payment' && !input.operationReference) throw new Error('A server-stored payment intent is required.');
      const token = randomBytes(32).toString('base64url'); const desktopSecret = randomBytes(32).toString('base64url'); const now = this.now();
      const record = { id: randomUUID(), tokenHash: digest(token), desktopSecretHash: digest(desktopSecret), nonceHash: digest(randomBytes(24).toString('base64url')), userId: String(input.userId), desktopSessionId: String(input.desktopSessionId), walletType, chain, scope, operationReference: String(input.operationReference || ''), status: 'waiting_for_mobile', pairingCode: randomBytes(3).toString('hex').slice(0, 4).toUpperCase(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL[scope]).toISOString(), approvedAt: null, result: null };
      (await this.load()).push(record); await this.save(); return { ...this.serialize(record), token, desktopSecret };
    });
  }
  async byToken(token) { const record = (await this.load()).find((item) => safeEqual(item.tokenHash, digest(token))); return this.expire(record); }
  async byDesktop(id, secret, sessionId) { const record = (await this.load()).find((item) => item.id === id); if (!record || !safeEqual(record.desktopSecretHash, digest(secret)) || record.desktopSessionId !== sessionId) return null; return this.expire(record); }
  async open(token) { return this.transitionToken(token, 'mobile_opened'); }
  async transitionToken(token, status, result = null) { return this.lock(async () => { const record = await this.byToken(token); if (!record) throw Object.assign(new Error('Mobile wallet request not found.'), { statusCode: 404 }); if (TERMINAL.has(record.status)) throw Object.assign(new Error('This mobile wallet request can no longer be used.'), { statusCode: 409 }); const allowed = { waiting_for_mobile: ['mobile_opened', 'rejected'], mobile_opened: ['wallet_connecting', 'rejected'], wallet_connecting: ['awaiting_wallet_approval', 'rejected', 'failed'], awaiting_wallet_approval: ['submitted', 'rejected', 'failed'], submitted: ['confirming', 'failed'], confirming: ['approved', 'failed'] }; if (!allowed[record.status]?.includes(status)) throw Object.assign(new Error(`Invalid handoff transition: ${record.status} to ${status}.`), { statusCode: 409 }); record.status = status; if (result) record.result = result; if (status === 'approved') record.approvedAt = new Date(this.now()).toISOString(); await this.save(); return this.serialize(record, true); }); }
  async expire(record) { if (record && !TERMINAL.has(record.status) && Date.parse(record.expiresAt) <= this.now()) { record.status = 'expired'; await this.save(); } return record; }
  lock(action) { const pending = this.queue.then(action, action); this.queue = pending.catch(() => {}); return pending; }
}
