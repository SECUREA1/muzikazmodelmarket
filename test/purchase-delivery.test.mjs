import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const walletSource = await readFile('mzk-wallet.js', 'utf8');
const headerSource = await readFile('global-header.js', 'utf8');
const checkoutSource = await readFile('script.js', 'utf8');

function loadMzkWallet() {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const window = { dispatchEvent() {}, addEventListener() {} };
  const context = vm.createContext({ window, globalThis: window, localStorage, document: { addEventListener() {}, querySelector() { return null; } }, CustomEvent: class {}, crypto: { getRandomValues(values) { values[0] = 1; } }, Date, Math, Uint32Array, console });
  vm.runInContext(walletSource, context);
  return { wallet: window.MZKWallet, localStorage };
}

test('verified MZK purchases credit the explicitly recorded member instead of the active browser identity', () => {
  const { wallet, localStorage } = loadMzkWallet();
  localStorage.setItem('voice3.wallet', '0x1111111111111111111111111111111111111111');
  const owner = '0x2222222222222222222222222222222222222222';
  wallet.creditPurchase(40, { owner, transactionHash: 'verified-payment', currency: 'ETH' });
  assert.equal(wallet.balance(owner), 4000);
  assert.equal(wallet.balance('0x1111111111111111111111111111111111111111'), 0);
});

test('MZK purchases cannot be credited to an anonymous guest identity', () => {
  const { wallet } = loadMzkWallet();
  assert.throws(() => wallet.creditPurchase(40, { owner: 'guest-123', transactionHash: 'payment' }), /Connect a member wallet/);
});

test('shared header exposes checkout and member access and checkout uses the verified item snapshot', () => {
  assert.match(headerSource, /href="checkout\.html"/);
  assert.match(headerSource, /href="members\.html" aria-label="Member access"/);
  assert.match(headerSource, /header-cart-count/);
  assert.match(checkoutSource, /event\.detail\.fulfillment\?\.items \|\| event\.detail\.metadata\?\.items/);
  assert.doesNotMatch(checkoutSource, /claimOwnedAsset\(title, 'Designer save'\)/);
});

test('cart navigation carries items across origins and checkout refreshes from storage', () => {
  assert.match(checkoutSource, /checkout\.html\?cart=\$\{encodeURIComponent\(cart\)\}/);
  assert.match(checkoutSource, /params\.get\('cart'\)/);
  assert.match(checkoutSource, /location\.hash\.startsWith\('#cart='\)/);
  assert.match(checkoutSource, /params\.delete\('cart'\)/);
  assert.match(checkoutSource, /addEventListener\('storage', renderCheckoutPage\)/);
  assert.match(checkoutSource, /addEventListener\('mzk:cart-changed', renderCheckoutPage\)/);
});
