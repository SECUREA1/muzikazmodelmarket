import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PaymentOrderStore, MUZIKAZ_PAYMENT_NETWORKS, PAYMENT_STATUSES } from '../payment-order-store.mjs';

test('central payment config exposes seven official network destinations', () => {
  assert.deepEqual(Object.keys(MUZIKAZ_PAYMENT_NETWORKS), ['ETH', 'POL', 'BNB', 'SOL', 'ADA', 'BTC', 'DOGE']);
  assert.equal(MUZIKAZ_PAYMENT_NETWORKS.POL.address, MUZIKAZ_PAYMENT_NETWORKS.ETH.address);
  assert.equal(MUZIKAZ_PAYMENT_NETWORKS.BNB.address, MUZIKAZ_PAYMENT_NETWORKS.ETH.address);
  assert.equal(new Set(PAYMENT_STATUSES).size, 8);
});

test('every browser-switchable EVM network has complete RPC metadata', () => {
  const evmNetworks = Object.values(MUZIKAZ_PAYMENT_NETWORKS).filter(({ type }) => type === 'evm');
  for (const network of evmNetworks) {
    assert.match(network.chainId, /^0x[0-9a-f]+$/);
    assert.equal(network.nativeCurrency.decimals, 18);
    assert.match(network.rpcUrls[0], /^https:\/\//);
    assert.match(network.blockExplorerUrls[0], /^https:\/\//);
  }
});

test('orders separate payment and asset networks and only fulfill after verification', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-payment-'));
  const store = new PaymentOrderStore(join(dir, 'orders.json'), { verifyTransaction: async () => ({ verified: true, amountReceived: 1.5, confirmations: 6 }) });
  const order = await store.create({ userId: 'player', purchaseType: 'NFT', itemId: 'bottle', basePrice: 100, paymentAsset: 'SOL', assetNetwork: 'Polygon', expectedAmount: 1.5 });
  assert.equal(order.paymentNetwork, 'Solana Mainnet'); assert.equal(order.assetNetwork, 'Polygon'); assert.equal(order.paymentStatus, 'AWAITING_PAYMENT');
  await assert.rejects(store.fulfill(order.orderId), /Only an independently verified PAID/);
  const paid = await store.submit(order.orderId, 'solana-transaction-1'); assert.equal(paid.paymentStatus, 'PAID');
  const fulfilled = await store.fulfill(order.orderId, { creditedMzk: 10000 }); assert.equal(fulfilled.paymentStatus, 'FULFILLED');
  assert.deepEqual((await store.fulfill(order.orderId)).fulfillment, { creditedMzk: 10000 });
});

test('a transaction ID cannot be reused across orders', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-payment-'));
  const store = new PaymentOrderStore(join(dir, 'orders.json'));
  const input = { basePrice: 10, paymentAsset: 'BTC', expectedAmount: .0001 };
  const first = await store.create({ ...input, itemId: 'one' }); const second = await store.create({ ...input, itemId: 'two' });
  await store.submit(first.orderId, 'btc-tx');
  await assert.rejects(store.submit(second.orderId, 'btc-tx'), /already been assigned/);
});

test('verified cart orders persist the buyer wallet and exact fulfilled items for sales reporting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-orders-'));
  const store = new PaymentOrderStore(join(dir, 'orders.json'), { verifyTransaction: async () => ({ verified: true, amountReceived: 2, confirmations: 12 }) });
  const created = await store.create({ userId: 'member', purchaseType: 'MARKETPLACE', itemId: 'marketplace-cart', basePrice: 50, paymentAsset: 'ETH', expectedAmount: 2, metadata: { receiptEmail: 'buyer@example.com', items: [{ id: 'model-1', name: 'Neon Model', quantity: 2, price: 25, deliverable: { id: 'model-1', name: 'Neon Model GLB', format: 'glb', modelUrl: '/models/neon.glb' } }] } });
  const fulfilled = await store.submit(created.orderId, 'eth-cart-transaction', '0x1111111111111111111111111111111111111111');
  assert.equal(fulfilled.paymentStatus, 'FULFILLED');
  assert.equal(fulfilled.wallet, '0x1111111111111111111111111111111111111111');
  assert.deepEqual(fulfilled.fulfillment.items, fulfilled.metadata.items);
  assert.equal((await store.list())[0].metadata.receiptEmail, 'buyer@example.com');
});

test('order recovery uses a secret claim token that is stored only as a hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-payment-'));
  const store = new PaymentOrderStore(join(dir, 'orders.json'));
  const created = await store.create({ purchaseType: 'LOADOUT', itemId: 'standard-loadout', basePrice: 30, paymentAsset: 'ETH', expectedAmount: .01 });
  assert.ok(created.claimToken);
  const persisted = await store.get(created.orderId);
  assert.equal(persisted.claimToken, undefined);
  assert.equal(store.authorize(persisted, created.claimToken), true);
  assert.equal(store.authorize(persisted, 'wrong-token'), false);
});
