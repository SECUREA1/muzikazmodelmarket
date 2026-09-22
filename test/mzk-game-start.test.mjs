import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const walletSource = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');

function loadWallet() {
  const values = new Map([['voice3.wallet', 'player@example.com']]);
  const listeners = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const document = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    querySelector: () => null
  };
  const window = { addEventListener() {}, dispatchEvent() {} };
  const context = vm.createContext({ window, document, localStorage, CustomEvent: class {}, crypto, Uint32Array, Date, Math, JSON, String, Number, Object, Array, Set });
  vm.runInContext(walletSource, context);
  return { wallet: window.MZKWallet, listeners };
}

test('starting RAD-TOX grants 500 MZK only when the player balance is zero', () => {
  const { wallet, listeners } = loadWallet();
  const button = { dataset: {} };
  const click = { target: { closest: (selector) => selector === '[data-house-start]' ? button : null } };

  assert.equal(wallet.balance(), 0);
  listeners.get('click')(click);
  assert.equal(wallet.balance(), 500);
  assert.equal(button.dataset.mzkStartGrant, '500');

  listeners.get('click')(click);
  assert.equal(wallet.balance(), 500, 'an existing balance is not topped up');
  assert.equal(button.dataset.mzkStartGrant, '0');
  assert.equal(wallet.history().filter((entry) => entry.kind === 'game-start').length, 1);
});

test('the game-start grant can replenish a player after their balance reaches zero', () => {
  const { wallet } = loadWallet();
  assert.equal(wallet.grantGameStartMzk().balance, 500);
  assert.equal(wallet.spend(500, 'gameplay').balance, 0);
  assert.equal(wallet.grantGameStartMzk().balance, 500);
  assert.equal(wallet.history().filter((entry) => entry.kind === 'game-start').length, 2);
});
