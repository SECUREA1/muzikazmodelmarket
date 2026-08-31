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
