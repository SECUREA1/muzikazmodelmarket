import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MzkAccountStore } from '../loadout-code-store.mjs';

async function fixture(t) { const directory = await mkdtemp(join(tmpdir(), 'mzk-access-')); t.after(() => rm(directory, { recursive: true, force: true })); return { file: join(directory, 'accounts.json'), store: new MzkAccountStore(join(directory, 'accounts.json')) }; }

test('activates one hashed MZK Access Code and keeps it usable as account login', async (t) => {
  const { file, store } = await fixture(t); const grant = await store.create({ label: 'Launch', promotionalMzk: 250 });
  assert.match(grant.code, /^MZK(?:-[A-Z2-9]{4}){4}$/); assert.equal((await readFile(file, 'utf8')).includes(grant.code), false);
  const wallet = '0x1111111111111111111111111111111111111111'; const activated = await store.activate(grant.code.toLowerCase(), wallet);
  assert.equal(activated.credential.status, 'activated'); assert.equal(activated.credential.loadoutRedeemed, true); assert.equal(activated.account.mzkBalance, 250);
  const login = await store.authenticate(grant.code); assert.equal(login.accountId, activated.account.accountId); assert.equal(login.primaryEthereumWallet, wallet);
  await assert.rejects(store.activate(grant.code, wallet), /already activated/);
  assert.equal((await store.authenticate(grant.code)).mzkBalance, 250, 'one-time grant is never duplicated');
});

test('rotation preserves the canonical account and revokes the prior credential', async (t) => {
  const { store } = await fixture(t); const issued = await store.create(); const activated = await store.activate(issued.code, '0x2222222222222222222222222222222222222222');
  const rotated = await store.rotate(activated.account.accountId); assert.equal(rotated.account.accountId, activated.account.accountId); assert.deepEqual(rotated.account.landAssets, activated.account.landAssets);
  await assert.rejects(store.authenticate(issued.code), /not active/); assert.equal((await store.authenticate(rotated.code)).accountId, activated.account.accountId);
});

test('recognized wallets always resolve to the same canonical account', async (t) => {
  const { store } = await fixture(t); const wallet = '0x3333333333333333333333333333333333333333'; const first = await store.findByWallet(wallet); const second = await store.findByWallet(wallet.toUpperCase().replace('0X', '0x')); assert.equal(first.accountId, second.accountId);
});

test('default MZK Loadout Pass creates and fully grants a brand-new user account', async (t) => {
  const { store } = await fixture(t); const issued = await store.create();
  assert.equal(issued.label, 'MZK Loadout Pass');
  const activated = await store.activate(issued.code, '0x4444444444444444444444444444444444444444', 'New User');
  assert.equal(activated.account.username, 'New User');
  assert.equal(activated.account.loadoutStatus, 'waived');
  assert.equal(activated.account.creatorVaultAccess, true);
  assert.equal(activated.account.gameAccess, true);
  assert.deepEqual(activated.account.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(activated.account.bottleClaims, ['Violet Wish Bottle']);
});

test('generated passes expose a shareable activation path and honor form boolean values', async (t) => {
  const { store } = await fixture(t);
  const issued = await store.create({ label: '  ', waiveLoadout: 'false', violetBottle: '0', starterLand: 'off', creatorVault: 'no' });
  assert.equal(issued.label, 'MZK Loadout Pass');
  assert.equal(issued.activationPath, `/members.html#access-code=${issued.code}`);
  const activated = await store.activate(issued.code, '0x6666666666666666666666666666666666666666');
  assert.equal(activated.account.loadoutStatus, 'none');
  assert.deepEqual(activated.account.landAssets, []);
  assert.deepEqual(activated.account.bottleClaims, []);
  assert.equal(activated.account.creatorVaultAccess, false);
});
