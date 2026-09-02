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
  assert.equal((await store.activate(grant.code)).account.accountId, activated.account.accountId, 'submitting an active code reopens its account');
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

test('default MZK Loadout Pass creates and fully grants a wallet-connected user account', async (t) => {
  const { store } = await fixture(t); const issued = await store.create();
  assert.equal(issued.label, 'MZK Loadout Pass');
  await assert.rejects(store.activate(issued.code, '', 'New User'), /Connect an Ethereum wallet/);
  const activated = await store.activate(issued.code, '0x4444444444444444444444444444444444444444', 'New User');
  assert.equal(activated.account.username, 'New User');
  assert.equal(activated.account.primaryEthereumWallet, '0x4444444444444444444444444444444444444444');
  assert.equal(activated.account.loadoutStatus, 'waived');
  assert.equal(activated.account.creatorVaultAccess, true);
  assert.equal(activated.account.gameAccess, true);
  assert.deepEqual(activated.account.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(activated.account.bottleClaims, ['Violet Wish Bottle']);
  assert.deepEqual(activated.account.gameAssets, ['Starter Avatar', 'Explorer Tool Kit', 'RAD-TOX Starter Gear']);
  assert.equal((await store.authenticate(issued.code)).accountId, activated.account.accountId, 'the access code reopens the wallet-connected account');
});

test('an activated code cannot be rebound to a different Ethereum account', async (t) => {
  const { store } = await fixture(t); const issued = await store.create();
  const activated = await store.activate(issued.code, '0x8888888888888888888888888888888888888888');
  await assert.rejects(store.activate(issued.code, '0x9999999999999999999999999999999999999999'), /different Ethereum account/);
  assert.equal((await store.activate(issued.code)).account.accountId, activated.account.accountId);
});

test('generated passes expose a shareable activation path and always build the game-standard loadout', async (t) => {
  const { store } = await fixture(t);
  const issued = await store.create({ label: '  ', waiveLoadout: 'false', violetBottle: '0', starterLand: 'off', creatorVault: 'no' });
  assert.equal(issued.label, 'MZK Loadout Pass');
  assert.equal(issued.activationPath, `/members.html#access-code=${issued.code}`);
  const activated = await store.activate(issued.code, '0x6666666666666666666666666666666666666666');
  assert.equal(activated.account.loadoutStatus, 'waived');
  assert.deepEqual(activated.account.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(activated.account.bottleClaims, ['Violet Wish Bottle']);
  assert.equal(activated.account.creatorVaultAccess, true);
});

test('a wallet cannot be validated against two access-code accounts', async (t) => {
  const { store } = await fixture(t); const wallet = '0x7777777777777777777777777777777777777777';
  const first = await store.activate((await store.create()).code, wallet); const second = await store.activate((await store.create()).code, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await assert.rejects(store.connectWallet(second.account.accountId, wallet), /already connected/);
});
