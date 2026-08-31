import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoPayoutService } from '../crypto-payout-service.mjs';

test('payout service enforces the sixty-percent quote and returns provider proof', async () => {
  const service = new CryptoPayoutService({ endpoint: 'https://payout.test', token: 'secret', fetchImpl: async (_url, request) => {
    assert.equal(request.headers.Authorization, 'Bearer secret');
    assert.equal(JSON.parse(request.body).usd, 24);
    return { ok: true, json: async () => ({ amount: .01, transactionHash: '0xpaid' }) };
  } });
  assert.equal((await service.send({ currency: 'ETH', usd: 24, mzk: 4000, wallet: '0xwallet' })).transactionHash, '0xpaid');
  await assert.rejects(service.send({ currency: 'ETH', usd: 40, mzk: 4000, wallet: '0xwallet' }), /60%/);
});

test('unconfigured payouts fail without claiming MZK', async () => {
  await assert.rejects(new CryptoPayoutService({ endpoint: '', token: '' }).send({ currency: 'SOL', usd: .6, mzk: 100, wallet: 'wallet' }), /not configured/);
});
