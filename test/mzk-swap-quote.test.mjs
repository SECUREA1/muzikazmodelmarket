import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCKED_LIQUIDITY_RATE, MINIMUM_SWAP_BACK_MZK, SWAP_BACK_RATE, swapBackQuote, swapBackUsd } from '../mzk-swap-quote.mjs';

test('swap back pays 50% and locks 50% of the MZK USD store value', () => {
  assert.equal(SWAP_BACK_RATE, 0.5);
  assert.equal(LOCKED_LIQUIDITY_RATE, 0.5);
  assert.equal(swapBackUsd(10_000), 50);
  assert.equal(swapBackUsd(1_001), 5.01);
  assert.deepEqual(swapBackQuote(10_000), { mzk: 10_000, storeUsd: 100, payoutUsd: 50, lockedLiquidityUsd: 50, payoutRate: 0.5, lockedLiquidityRate: 0.5 });
});

test('swap back rejects amounts below the minimum and invalid values', () => {
  assert.equal(MINIMUM_SWAP_BACK_MZK, 1_000);
  assert.throws(() => swapBackUsd(999), /Minimum swap back/);
  assert.throws(() => swapBackUsd('not-a-number'), /Minimum swap back/);
});
