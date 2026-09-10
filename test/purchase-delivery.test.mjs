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
  assert.equal(wallet.balance(owner), 5000);
  assert.equal(wallet.balance('0x1111111111111111111111111111111111111111'), 0);
});

test('MZK purchases cannot be credited to an anonymous guest identity', () => {
  const { wallet } = loadMzkWallet();
  assert.throws(() => wallet.creditPurchase(40, { owner: 'guest-123', transactionHash: 'payment' }), /Connect a member wallet/);
});

test('$40 land tier credits exactly one deed price without unrelated Loadout rewards', () => {
  const { wallet, localStorage } = loadMzkWallet();
  const owner = '0x4040404040404040404040404040404040404040';
  const entry = wallet.creditPurchase(40, { owner, transactionHash: 'land-tier', currency: 'ETH', purchaseType: 'LAND_TIER' });
  assert.equal(entry.amount, 4000);
  assert.equal(entry.purchaseType, 'LAND_TIER');
  assert.equal(localStorage.getItem('muzikazStarterLoadoutsV1'), null);
});

test('first-buy MZK values follow the $20, $50, and $130 offer tiers', () => {
  for (const [usd, expected] of [[5, 2000], [30, 5000], [100, 13000], [200, 26000]]) {
    const { wallet } = loadMzkWallet();
    const owner = `0x${String(usd).padStart(40, '0')}`;
    assert.equal(wallet.creditPurchase(usd, { owner, transactionHash: `tier-${usd}` }).amount, expected);
    assert.equal(wallet.creditPurchase(usd, { owner, transactionHash: `repeat-${usd}` }).amount, usd * 100);
  }
});

test('first-buy allocations above the promotional tiers keep their full market value', () => {
  for (const [usd, expected] of [[299, 29900], [599, 59900], [999, 99900], [1499, 149900]]) {
    const { wallet } = loadMzkWallet();
    assert.equal(wallet.purchaseTokens(usd, `0x${String(usd).padStart(40, '0')}`), expected);
  }
});

test('verified purchases put tier bottles and custom rewards in the local Backpack', () => {
  const { wallet, localStorage } = loadMzkWallet();
  const owner = '0x3333333333333333333333333333333333333333';
  wallet.creditPurchase(200, { owner, transactionHash: 'gold-tier' });
  const loadout = JSON.parse(localStorage.getItem('muzikazStarterLoadoutsV1'))[owner];
  assert.ok(loadout.assets.includes('Black Genie Bottle · SVG collectible'));
  assert.ok(loadout.assets.includes('Violet Wish Bottle'));
  assert.ok(loadout.assets.includes('Golden Genie Bottle · SVG collectible'));
  assert.ok(loadout.assets.includes('Custom In-Game Asset Order'));
});

test('returning account sync merges newly purchased sale Bottles into the existing wallet Backpack', () => {
  const { wallet, localStorage } = loadMzkWallet();
  const owner = '0x4444444444444444444444444444444444444444';
  const base = { accountId: 'returning', primaryEthereumWallet: owner, gameAccess: true, loadoutStatus: 'paid', mzkBalance: 2000, gameAssets: ['Starter Avatar'], landAssets: [], bottleClaims: ['Black Genie Bottle'], purchaseTierUsd: 5, updatedAt: '2026-09-08T00:00:00.000Z' };
  wallet.provisionStandardLoadout(base);
  wallet.provisionStandardLoadout({ ...base, mzkBalance: 26000, bottleClaims: ['Black Genie Bottle', 'Violet Wish Bottle', 'Golden Genie Bottle'], bottlePurchases: [{ orderId: 'upgrade-sale' }], purchaseTierUsd: 200, updatedAt: '2026-09-09T00:00:00.000Z' });
  const backpack = JSON.parse(localStorage.getItem('muzikazStarterLoadoutsV1'))[owner];
  assert.ok(backpack.assets.includes('Golden Genie Bottle'));
  assert.deepEqual(backpack.bottleClaims, ['Black Genie Bottle', 'Violet Wish Bottle', 'Golden Genie Bottle']);
  assert.equal(backpack.bottlePurchases[0].orderId, 'upgrade-sale');
});

test('shared header exposes checkout and member access and checkout uses the verified item snapshot', () => {
  assert.match(headerSource, /href="checkout\.html"/);
  assert.match(headerSource, /href="members\.html" aria-label="Member access"/);
  assert.match(headerSource, /header-cart-count/);
  assert.match(checkoutSource, /event\.detail\.fulfillment\?\.items \|\| event\.detail\.metadata\?\.items/);
  assert.doesNotMatch(checkoutSource, /claimOwnedAsset\(title, 'Designer save'\)/);
});

test('cart keeps the proven same-origin mobile checkout flow', () => {
  assert.match(checkoutSource, /localStorage\.getItem\(CART_KEY\)/);
  assert.match(checkoutSource, /localStorage\.setItem\(CART_KEY, JSON\.stringify\(items\)\)/);
  assert.match(checkoutSource, /window\.location\.href = 'checkout\.html'/);
  assert.doesNotMatch(checkoutSource, /portableCartParameter|restorePortableCart|checkoutUrl/);
  assert.doesNotMatch(headerSource, /cartCheckoutUrl|[?&]cart=/);
});
