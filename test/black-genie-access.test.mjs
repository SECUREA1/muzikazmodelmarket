import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Single Player silently prepares demo MZK and does not require payment or a Genie Bottle', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  assert.match(source, /claimSinglePlayerTokens/);
  assert.match(source, /Your gameplay demo is ready/);
  assert.doesNotMatch(source, /500 MZK/);
  assert.match(wallet, /const SINGLE_PLAYER_STARTING_MZK = 500/);
  assert.match(wallet, /mzk:single-player-starter:/);
  assert.doesNotMatch(source, /claimStarterLoadout/);
  assert.doesNotMatch(source, /Buy MZK|costs 500 MZK|Payment accepted/);
  assert.doesNotMatch(source, /eth_getTransactionReceipt|eth_sendTransaction|CONTRACT/);
});
