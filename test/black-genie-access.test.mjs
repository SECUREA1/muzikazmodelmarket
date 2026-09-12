import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Single Player prepares and announces demo MZK without requiring payment or a Genie Bottle', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  assert.match(source, /claimSinglePlayerTokens/);
  assert.match(source, /500 MZK added for in-game display and play/);
  assert.match(source, /grant\.balance/);
  assert.match(wallet, /const SINGLE_PLAYER_STARTING_MZK = 500/);
  assert.match(wallet, /mzk:single-player-starter:/);
  assert.match(wallet, /demo-v2/);
  assert.doesNotMatch(source, /claimStarterLoadout/);
  assert.doesNotMatch(source, /Buy MZK|costs 500 MZK|Payment accepted/);
  assert.doesNotMatch(source, /eth_getTransactionReceipt|eth_sendTransaction|CONTRACT/);
});

test('RAD-TOX engine independently prepares and displays its spendable demo balance', async () => {
  const source = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(source, /const demoGrant = window\.MZKWallet\?\.claimSinglePlayerTokens\?\.\(\)/);
  assert.match(source, /Number\(demoGrant\.balance \|\| 0\)\.toLocaleString\(\)/);
  assert.match(source, /distributeSinglePlayerTokens/, 'clearing a single-player level distributes an MZK reward');
  assert.match(source, /\+\$\{reward\.amount\} MZK distributed/, 'the level-clear message announces the distribution');
});
