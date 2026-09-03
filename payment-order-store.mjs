import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import paymentConfig from './payment-config.js';

const { MUZIKAZ_PAYMENT_NETWORKS, PAYMENT_STATUSES } = paymentConfig;
const terminal = new Set(['FULFILLED', 'EXPIRED', 'FAILED']);

function cleanItems(metadata) {
  if (!Array.isArray(metadata?.items)) return [];
  return metadata.items.slice(0, 100).map((item) => ({
    id: String(item?.id || '').slice(0, 140),
    name: String(item?.name || 'Store item').slice(0, 180),
    quantity: Math.max(1, Math.min(100, Math.trunc(Number(item?.quantity) || 1))),
    price: Math.max(0, Number(item?.price) || 0),
    deliverable: item?.deliverable && typeof item.deliverable === 'object' ? {
      id: String(item.deliverable.id || '').slice(0, 140),
      name: String(item.deliverable.name || item?.name || 'Digital item').slice(0, 180),
      format: String(item.deliverable.format || '').slice(0, 30),
      modelUrl: String(item.deliverable.modelUrl || '').slice(0, 500)
    } : null
  }));
}

export class PaymentOrderStore {
  constructor(file, { verifyTransaction = async () => ({ verified: false, confirmations: 0 }) } = {}) { this.file = file; this.verifyTransaction = verifyTransaction; this.queue = Promise.resolve(); }
  async records() { try { return JSON.parse(await readFile(this.file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
  async save(records) { await mkdir(dirname(this.file), { recursive: true }); await writeFile(this.file, JSON.stringify(records, null, 2)); }
  locked(task) { const next = this.queue.then(task, task); this.queue = next.catch(() => {}); return next; }
  async create(input) { return this.locked(async () => {
    const network = MUZIKAZ_PAYMENT_NETWORKS[String(input.paymentAsset || '').toUpperCase()];
    const basePrice = Number(input.basePrice); const expectedAmount = Number(input.expectedAmount);
    if (!network || !(basePrice > 0) || !(expectedAmount > 0)) throw new Error('A supported asset, positive base price, and expected amount are required.');
    const now = new Date().toISOString();
    const claimToken = randomBytes(24).toString('base64url');
    const metadata = input.metadata && typeof input.metadata === 'object' ? { items: cleanItems(input.metadata), receiptEmail: String(input.metadata.receiptEmail || '').slice(0, 254) } : { items: [] };
    const order = { orderId: randomUUID(), claimTokenHash: createHash('sha256').update(claimToken).digest('hex'), userId: String(input.userId || input.wallet || 'guest').slice(0, 140), wallet: String(input.wallet || '').slice(0, 140), purchaseType: String(input.purchaseType || 'GENERIC').slice(0, 60), itemId: String(input.itemId || '').slice(0, 140), quantity: Math.max(1, Number(input.quantity) || 1), metadata, fiatCurrency: 'USD', basePrice, paymentAsset: network.symbol, paymentNetwork: network.network, chainId: network.chainId || null, assetNetwork: String(input.assetNetwork || '').slice(0, 80) || null, destinationAddress: network.address, expectedAmount, transactionHash: null, amountReceived: 0, confirmations: 0, paymentStatus: 'AWAITING_PAYMENT', createdAt: now, confirmedAt: null, fulfilledAt: null };
    const records = await this.records(); records.push(order); await this.save(records); return { ...order, claimToken, claimTokenHash: undefined };
  }); }
  async get(id) { return (await this.records()).find((order) => order.orderId === id) || null; }
  authorize(order, token) { const supplied = createHash('sha256').update(String(token || '')).digest(); const expected = Buffer.from(String(order?.claimTokenHash || ''), 'hex'); return expected.length === supplied.length && timingSafeEqual(expected, supplied); }
  async list() { return (await this.records()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
  async submit(id, transactionHash, wallet = '') { return this.locked(async () => {
    const hash = String(transactionHash || '').trim(); if (!hash) throw new Error('A transaction hash or transaction ID is required.');
    const records = await this.records(); const order = records.find((item) => item.orderId === id); if (!order) throw new Error('Payment order not found.');
    const reused = records.find((item) => item.transactionHash === hash && item.orderId !== id); if (reused) { const error = new Error('This transaction has already been assigned to another order.'); error.statusCode = 409; throw error; }
    if (terminal.has(order.paymentStatus) || order.paymentStatus === 'PAID') return order;
    order.transactionHash = hash; order.wallet = String(wallet || order.wallet || '').slice(0, 140); order.paymentStatus = 'TRANSACTION_SUBMITTED'; await this.save(records); return this.verify(id);
  }); }
  async verify(id) {
    const records = await this.records(); const order = records.find((item) => item.orderId === id); if (!order) throw new Error('Payment order not found.');
    if (terminal.has(order.paymentStatus) || order.paymentStatus === 'PAID') return order;
    const result = await this.verifyTransaction({ ...order });
    order.amountReceived = Number(result.amountReceived || 0); order.confirmations = Number(result.confirmations || 0);
    if (result.failed) order.paymentStatus = 'FAILED';
    else if (result.verified && order.amountReceived >= order.expectedAmount) {
      order.paymentStatus = 'PAID'; order.confirmedAt = new Date().toISOString();
      const items = cleanItems(order.metadata);
      if (items.length) { order.paymentStatus = 'FULFILLED'; order.fulfillment = { wallet: order.wallet, items }; order.fulfilledAt = new Date().toISOString(); }
    }
    else order.paymentStatus = 'CONFIRMING';
    await this.save(records); return order;
  }
  async fulfill(id, fulfillment) { return this.locked(async () => {
    const records = await this.records(); const order = records.find((item) => item.orderId === id); if (!order) throw new Error('Payment order not found.');
    if (order.paymentStatus === 'FULFILLED') return order;
    if (order.paymentStatus !== 'PAID') { const error = new Error('Only an independently verified PAID order can be fulfilled.'); error.statusCode = 409; throw error; }
    order.paymentStatus = 'FULFILLED'; order.fulfillment = fulfillment || {}; order.fulfilledAt = new Date().toISOString(); await this.save(records); return order;
  }); }
}

export { MUZIKAZ_PAYMENT_NETWORKS, PAYMENT_STATUSES };
