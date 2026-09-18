import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('all House Explorer versions use the original 4,000 MZK first-entry gate', async () => {
  const wallet = await readFile(new URL('../mzk-wallet.js', import.meta.url), 'utf8');
  assert.match(wallet, /const GAME_ENTRY_MZK = 4000/);
  assert.match(wallet, /claimStarterLoadout\(\)/);
  assert.match(wallet, /buy-mzk\.html\?amount=40/);
  assert.match(wallet, /start\.dataset\.mzkEntryPaid = 'true'/);
  assert.doesNotMatch(wallet, /claimSinglePlayerTokens|SINGLE_PLAYER_STARTING_MZK/);
});

test('gameplay does not mint or reset MZK after the entry gate', async () => {
  const engine = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  const fallback = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /claimSinglePlayerTokens/);
  assert.doesNotMatch(fallback, /claimSinglePlayerTokens/);
  assert.match(engine, /window\.MZKWallet\?\.balance\?\.\(\)/);
  assert.match(engine, /WALLET BALANCE/);
});
