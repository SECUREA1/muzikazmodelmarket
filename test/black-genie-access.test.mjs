import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Single Player prepares and announces demo MZK without requiring payment or a Genie Bottle', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  assert.match(source, /claimSinglePlayerTokens/);
  assert.match(source, /500 MZK added for in-game display and play/);
  assert.match(source, /Demo balance reset to 500 MZK/);
  assert.match(wallet, /const SINGLE_PLAYER_STARTING_MZK = 500/);
  assert.match(wallet, /SINGLE_PLAYER_STARTING_MZK - previousBalance/);
  assert.match(wallet, /kind: 'game-reset'/);
  assert.doesNotMatch(source, /claimStarterLoadout/);
  assert.doesNotMatch(source, /Buy MZK|costs 500 MZK|Payment accepted/);
  assert.doesNotMatch(source, /eth_getTransactionReceipt|eth_sendTransaction|CONTRACT/);
});

test('every Single Player start and reset restores the spendable balance to exactly 500 MZK', async () => {
  const walletSource = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const window = { dispatchEvent() {}, addEventListener() {} };
  const context = vm.createContext({ window, globalThis: window, localStorage, document: { querySelector() { return null; } }, CustomEvent: class {}, crypto: { getRandomValues(target) { target[0] = 1; } }, Date, Math, Uint32Array });
  vm.runInContext(walletSource, context);

  assert.equal(window.MZKWallet.claimSinglePlayerTokens().balance, 500);
  assert.equal(window.MZKWallet.spend(125, 'demo spend').balance, 375);
  assert.equal(window.MZKWallet.claimSinglePlayerTokens().balance, 500);
  window.MZKWallet.record({ amount: 300, kind: 'test-credit' });
  assert.equal(window.MZKWallet.claimSinglePlayerTokens().balance, 500);
});

test('RAD-TOX engine independently prepares and displays its spendable demo balance', async () => {
  const source = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(source, /const demoGrant = window\.MZKWallet\?\.claimSinglePlayerTokens\?\.\(\)/);
  assert.match(source, /Number\(demoGrant\.balance \|\| 0\)\.toLocaleString\(\)/);
  assert.match(source, /resetRun\(\)\{window\.MZKWallet\?\.claimSinglePlayerTokens\?\.\(\)/);
});
