import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vibe Crib and the other House launchers explain their current access modes', async () => {
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  const [home, market, crib] = await Promise.all(['../index.html', '../model-market.html', '../model-explorer.html'].map((url) => readFile(new URL(url, import.meta.url), 'utf8')));
  assert.match(wallet, /mzkDemoAccess = 'public'/);
  assert.doesNotMatch(wallet, /location\.href = `buy-mzk\.html\?amount=40/);
  for (const page of [home, market]) {
    assert.match(page, /Free public demo · single player \+ multiplayer/);
    assert.match(page, /MZK purchases are optional/);
  }
  assert.match(crib, /join multiplayer worlds after the simple members-area login/);
  assert.match(crib, /data-multiplayer-control/);
  assert.match(await readFile(new URL('../buy-mzk.html', import.meta.url), 'utf8'), /MZK/);
});

test('gameplay does not mint or reset MZK after the entry gate', async () => {
  const engine = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  const fallback = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /claimSinglePlayerTokens/);
  assert.doesNotMatch(fallback, /claimSinglePlayerTokens/);
  assert.match(engine, /window\.MZKWallet\?\.balance\?\.\(\)/);
  assert.match(engine, /WALLET BALANCE/);
});
