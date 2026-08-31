import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoPayoutService } from '../crypto-payout-service.mjs';

test('payout service returns independently confirmed provider proof', async () => {
  let providerRequest;
  const service = new CryptoPayoutService({ url: 'https://payout.test/send', token: 'secret', fetchImpl: async (url, options) => {
    providerRequest = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ amount: 0.02, payoutUsd: 50, liquidityLocked: true, transactionHash: 'confirmed-chain-hash' }) };
  } });
  const payout = await service.request({ mzk: 10_000, currency: 'ETH', expectedAmount: 999, destinationAddress: '0xreceiver', walletId: 'player' });
  assert.equal(providerRequest.options.headers.Authorization, 'Bearer secret');
  assert.equal(providerRequest.body.payoutUsd, 50);
  assert.equal(providerRequest.body.lockedLiquidityUsd, 50);
  assert.equal(providerRequest.body.liquidityLockRequired, true);
  assert.equal(providerRequest.body.expectedAmount, undefined);
  assert.equal(payout.transactionHash, 'confirmed-chain-hash');
  assert.equal(payout.paidAmount, 0.02);
  assert.equal(payout.liquidityLocked, true);
});

test('payout service rejects incomplete or insufficient provider proof', async () => {
  const service = new CryptoPayoutService({ url: 'https://payout.test/send', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ amount: 0.01, payoutUsd: 49 }) }) });
  await assert.rejects(service.request({ mzk: 10_000, currency: 'ETH', destinationAddress: '0xreceiver' }), /valid payment proof/);
});

test('payout service fails safely when provider configuration is absent', async () => {
  const service = new CryptoPayoutService({ url: '', token: '' });
  await assert.rejects(service.request({}), (error) => error.statusCode === 503 && /No MZK was deducted/.test(error.message));
});
