import test from 'node:test';
import assert from 'node:assert/strict';
import { MZK_SWAP_BACK_RATE, swapBackQuote } from '../mzk-swap-quote.mjs';

test('swap back returns sixty percent of the MZK store value', () => {
  assert.equal(MZK_SWAP_BACK_RATE, 0.6);
  assert.deepEqual(swapBackQuote(4_000), { amountMzk: 4_000, usd: 24 });
  assert.deepEqual(swapBackQuote(100), { amountMzk: 100, usd: 0.6 });
});

test('swap back rejects amounts below the minimum', () => {
  assert.throws(() => swapBackQuote(99), /at least 100 MZK/);
  assert.throws(() => swapBackQuote('nope'), /at least 100 MZK/);
});
