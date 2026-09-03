import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MzkAccountStore } from '../loadout-code-store.mjs';

async function fixture(t) { const directory = await mkdtemp(join(tmpdir(), 'mzk-access-')); t.after(() => rm(directory, { recursive: true, force: true })); return { file: join(directory, 'accounts.json'), store: new MzkAccountStore(join(directory, 'accounts.json')) }; }

test('activates one hashed MZK Access Code and keeps it usable as account login', async (t) => {
  const { file, store } = await fixture(t); const grant = await store.create({ label: 'Launch', promotionalMzk: 250 });
  assert.match(grant.code, /^MZK(?:-[A-Z2-9]{4}){4}$/); assert.equal((await readFile(file, 'utf8')).includes(grant.code), false);
  const wallet = '0x1111111111111111111111111111111111111111'; const activated = await store.activate(grant.code.toLowerCase(), wallet);
  assert.equal(activated.credential.status, 'activated'); assert.equal(activated.credential.loadoutRedeemed, true); assert.equal(activated.account.mzkBalance, 750);
  const login = await store.authenticate(grant.code); assert.equal(login.accountId, activated.account.accountId); assert.equal(login.primaryEthereumWallet, wallet);
  assert.equal((await store.activate(grant.code)).account.accountId, activated.account.accountId, 'submitting an active code reopens its account');
  assert.equal((await store.authenticate(grant.code)).mzkBalance, 750, 'starter and promotional grants are never duplicated');
});

test('rotation preserves the canonical account and revokes the prior credential', async (t) => {
  const { store } = await fixture(t); const issued = await store.create(); const activated = await store.activate(issued.code, '0x2222222222222222222222222222222222222222');
  const rotated = await store.rotate(activated.account.accountId); assert.equal(rotated.account.accountId, activated.account.accountId); assert.deepEqual(rotated.account.landAssets, activated.account.landAssets);
  await assert.rejects(store.authenticate(issued.code), /not active/); assert.equal((await store.authenticate(rotated.code)).accountId, activated.account.accountId);
});

test('recognized wallets always resolve to the same canonical account', async (t) => {
  const { store } = await fixture(t); const wallet = '0x3333333333333333333333333333333333333333'; const first = await store.findByWallet(wallet); const second = await store.findByWallet(wallet.toUpperCase().replace('0X', '0x')); assert.equal(first.accountId, second.accountId);
  assert.equal(first.loadoutStatus, 'none', 'an unverified wallet receives no Loadout');
  assert.equal(first.loadoutRedeemed, false);
  assert.equal(first.mzkBalance, 0);
  assert.deepEqual(first.landAssets, []);
  assert.deepEqual(first.bottleClaims, []);
  assert.deepEqual(first.gameAssets, []);
});

test('default MZK Loadout Pass creates and fully grants a wallet-connected user account', async (t) => {
  const { store } = await fixture(t); const issued = await store.create();
  assert.equal(issued.label, 'MZK Loadout Pass');
  const walletless = await store.activate(issued.code, '', 'New User');
  assert.equal(walletless.account.primaryEthereumWallet, null);
  const activated = { ...walletless, account: await store.connectWallet(walletless.account.accountId, '0x4444444444444444444444444444444444444444') };
  assert.equal(activated.account.username, 'New User');
  assert.equal(activated.account.primaryEthereumWallet, '0x4444444444444444444444444444444444444444');
  assert.equal(activated.account.loadoutStatus, 'included');
  assert.equal(activated.account.creatorVaultAccess, true);
  assert.equal(activated.account.gameAccess, true);
  assert.equal(activated.account.mzkBalance, 500);
  assert.deepEqual(activated.account.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(activated.account.bottleClaims, ['Violet Wish Bottle']);
  assert.deepEqual(activated.account.gameAssets, ['Starter Avatar', 'Unrevealed Loadout Avatar', 'Community Spot', 'Starter Room Shell', 'Builder Tool Kit', 'Creator Market Station', 'RAD-TOX Starter Gear']);
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
  assert.equal(activated.account.loadoutStatus, 'included');
  assert.deepEqual(activated.account.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(activated.account.bottleClaims, ['Violet Wish Bottle']);
  assert.equal(activated.account.creatorVaultAccess, true);
});

test('wallet and code login return the same fully provisioned account', async (t) => {
  const { store } = await fixture(t); const wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const walletAccount = await store.findByWallet(wallet);
  const credential = await store.ensureAccountCode(walletAccount.accountId);
  const codeAccount = await store.authenticate(credential.code);
  const reopenedWithWallet = await store.findByWallet(wallet);
  assert.equal(codeAccount.accountId, reopenedWithWallet.accountId);
  assert.equal(codeAccount.backpackId, reopenedWithWallet.backpackId);
  assert.deepEqual(codeAccount.gameAssets, reopenedWithWallet.gameAssets);
  assert.deepEqual(codeAccount.landAssets, reopenedWithWallet.landAssets);
  assert.deepEqual(codeAccount.bottleClaims, reopenedWithWallet.bottleClaims);
  assert.equal(codeAccount.creatorVaultAccess, true);
  assert.equal(codeAccount.gameAccess, true);
  assert.equal(codeAccount.mzkBalance, 500);
});

test('a wallet cannot be validated against two access-code accounts', async (t) => {
  const { store } = await fixture(t); const wallet = '0x7777777777777777777777777777777777777777';
  const first = await store.activate((await store.create()).code, wallet); const second = await store.activate((await store.create()).code, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await assert.rejects(store.connectWallet(second.account.accountId, wallet), /already connected/);
});

test('imports legacy Rust Loadout Pass secrets and keeps them as reusable member logins', async (t) => {
  const { file } = await fixture(t);
  const legacyFile = join(file, '..', 'loadout-codes-rust.json');
  const code = 'MZK-12345678-ABCD9E99';
  await writeFile(legacyFile, JSON.stringify([{
    id: 'legacy-pass', code, label: 'MZK Loadout Pass', status: 'active',
    createdAt: Date.now(), expiresAt: Date.now() + 86400000
  }]));
  const store = new MzkAccountStore(file, { legacyCodesFile: legacyFile });
  await store.migrate();
  assert.equal((await readFile(file, 'utf8')).includes(code), false, 'the imported database stores only a salted hash');
  const activated = await store.activate(code, '0x9999999999999999999999999999999999999999');
  assert.equal(activated.account.gameAccess, true);
  assert.equal((await store.authenticate(code)).accountId, activated.account.accountId);
  await store.migrate();
  assert.equal((await store.list()).filter((item) => item.id === 'legacy-pass').length, 1, 'migration is idempotent');
});

test('verified paid order provisions once and preserves the Backpack through wallet attachment', async (t) => {
  const { store } = await fixture(t);
  const order = { orderId: 'order-loadout-1', paymentStatus: 'PAID', purchaseType: 'LOADOUT', itemId: 'standard-loadout', basePrice: 30, wallet: '' };
  const first = await store.fulfillPaidLoadout(order);
  const replay = await store.fulfillPaidLoadout(order);
  assert.equal(replay.accountId, first.accountId);
  assert.equal(replay.backpackId, first.backpackId);
  assert.equal(replay.mzkBalance, 500);
  assert.equal(replay.gameAssets.filter((item) => item === 'Starter Avatar').length, 1);
  assert.deepEqual(replay.landAssets, ['Unrevealed MUZIKAZ Land']);
  assert.deepEqual(replay.bottleClaims, ['Violet Wish Bottle']);
  assert.equal(replay.creatorVaultAccess, true);
  const selected = await store.selectAvatar(first.accountId, 'starter-avatar');
  const connected = await store.connectWallet(first.accountId, '0x4545454545454545454545454545454545454545');
  assert.equal(connected.selectedAvatarId, selected.selectedAvatarId);
  assert.equal(connected.backpackId, first.backpackId);
  assert.equal(connected.mzkBalance, 500);
  await assert.rejects(store.selectAvatar(first.accountId, 'unrevealed-loadout-avatar'), /Unrevealed/);
});

test('unverified, failed, underpriced, and wrong-product orders grant nothing', async (t) => {
  const { file, store } = await fixture(t);
  const base = { orderId: 'bad', paymentStatus: 'PAID', purchaseType: 'LOADOUT', itemId: 'standard-loadout', basePrice: 30 };
  await assert.rejects(store.fulfillPaidLoadout({ ...base, paymentStatus: 'CONFIRMING' }), /server-verified/);
  await assert.rejects(store.fulfillPaidLoadout({ ...base, paymentStatus: 'FAILED' }), /server-verified/);
  await assert.rejects(store.fulfillPaidLoadout({ ...base, basePrice: 29 }), /server-verified/);
  await assert.rejects(store.fulfillPaidLoadout({ ...base, purchaseType: 'GENERIC' }), /server-verified/);
  await assert.rejects(readFile(file, 'utf8'), { code: 'ENOENT' });
});
