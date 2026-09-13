import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const gateSource = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');

async function launchWith({ loadout = null, history = [] } = {}) {
  let handler;
  let clicks = 0;
  const button = { disabled: false, click() { clicks += 1; } };
  const document = {
    addEventListener(type, callback) { if (type === 'click') handler = callback; },
    getElementById() { return null; }
  };
  const wallet = {
    walletId: () => 'player@example.com',
    starterLoadout: () => loadout,
    history: () => history
  };
  vm.runInContext(gateSource, vm.createContext({ window: { MZKWallet: wallet }, document, console, BigInt, Promise, setTimeout }));
  handler({ target: { closest: () => button }, preventDefault() {}, stopImmediatePropagation() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return clicks;
}

test('a purchased Genie Bottle preserves the original Single Player launch path', async () => {
  assert.equal(await launchWith({ loadout: { bottleClaims: ['Violet Wish Bottle'] } }), 1);
  assert.equal(await launchWith({ loadout: { assets: ['Black Genie Bottle · SVG collectible'] } }), 1);
});

test('the land route requires both the 4,000 MZK tier sale and completed land purchase', async () => {
  const tokenSale = { kind: 'purchase', purchaseType: 'LAND_TIER', amount: 4000 };
  const landPurchase = { kind: 'spend', type: 'starter-land', amount: -4000 };
  assert.equal(await launchWith({ history: [tokenSale, landPurchase] }), 1);
  assert.match(gateSource, /return boughtLandTokens && purchasedLand \? '4,000 MZK land purchase' : null/);
});

test('Single Player no longer creates or resets a free demo balance', async () => {
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.doesNotMatch(wallet, /claimSinglePlayerTokens|SINGLE_PLAYER_STARTING_MZK|game-reset/);
  assert.doesNotMatch(engine, /claimSinglePlayerTokens|DEMO BALANCE/);
  assert.match(engine, /window\.MZKWallet\?\.balance\?\.\(\)/);
});
