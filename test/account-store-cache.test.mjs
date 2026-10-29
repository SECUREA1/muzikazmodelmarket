import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MzkAccountStore } from '../loadout-code-store.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-account-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'accounts.json');
  return { file, store: new MzkAccountStore(file) };
}

test('cached lookups and exported records remain detached from committed credentials and grants', async t => {
  const { file, store } = await fixture(t);
  const created = await store.freePlayLogin('CacheUser', 'Keep-This-Password-Secret');
  const account = await store.getAccount(created.accountId);
  account.gameAssets.length = 0; account.username = 'Tampered'; account.mzkBalance = 0;
  const records = await store.records();
  records.accounts[0].passwordHash = 'invalid'; records.accounts[0].username = 'Changed';
  const restored = await store.getAccount(created.accountId);
  assert.equal(restored.username, 'CacheUser'); assert.equal(restored.mzkBalance, 2000);
  assert.ok(restored.gameAssets.includes('RAD-TOX Starter Gear'));
  assert.equal(restored.passwordHash, undefined); assert.equal(restored.passwordSalt, undefined);
  assert.equal((await store.freePlayLogin('cacheuser', 'Keep-This-Password-Secret')).accountId, created.accountId);
  const disk = await readFile(file, 'utf8'), saved = JSON.parse(disk).accounts[0];
  assert.ok(!disk.includes('Keep-This-Password-Secret'));
  assert.equal(saved.passwordHash, pbkdf2Sync('Keep-This-Password-Secret', saved.passwordSalt, 210_000, 32, 'sha256').toString('hex'));
});

test('independent stores serialize account creation and preserve one welcome grant per username', async t => {
  const { file, store } = await fixture(t), other = new MzkAccountStore(file);
  const accounts = await Promise.all([
    store.freePlayLogin('OnePlayer', 'password-one'), other.freePlayLogin('oneplayer', 'password-one'),
    store.freePlayLogin('OtherPlayer', 'password-two'), other.freePlayLogin('ThirdPlayer', 'password-three')
  ]);
  assert.equal(accounts[0].accountId, accounts[1].accountId);
  const reopened = await new MzkAccountStore(file).records();
  assert.equal(reopened.accounts.length, 3);
  assert.ok(reopened.accounts.every(account => account.mzkBalance === 2000 && account.starterMzkGranted));
  assert.equal(new Set(reopened.accounts.map(account => account.backpackId)).size, 3);
});

test('competing different passwords cannot both create the same case-insensitive username', async t => {
  const { file, store } = await fixture(t), other = new MzkAccountStore(file);
  const results = await Promise.allSettled([
    store.freePlayLogin('OnlyPlayer', 'first-password'), other.freePlayLogin('onlyplayer', 'second-password')
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 401);
  assert.equal((await store.records()).accounts.length, 1);
});

test('hot account lookups observe same-size edits, file replacement, deletion and malformed state', async t => {
  const { file, store } = await fixture(t), account = await store.freePlayLogin('AlphaName', 'first-password');
  await store.getAccount(account.accountId);
  const before = await stat(file), original = await readFile(file, 'utf8');
  const changed = original.replace('AlphaName', 'OmegaName');
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
  await writeFile(file, changed); await utimes(file, before.atime, before.mtime);
  assert.equal((await store.getAccount(account.accountId)).username, 'OmegaName');
  const replacement = file + '.replacement';
  await writeFile(replacement, original); await rename(replacement, file);
  assert.equal((await store.getAccount(account.accountId)).username, 'AlphaName');
  await writeFile(file, '{incomplete');
  await assert.rejects(store.getAccount(account.accountId), SyntaxError);
  await assert.rejects(store.freePlayLogin('AlphaName', 'first-password'), SyntaxError);
  await rm(file);
  assert.equal(await store.getAccount(account.accountId), null);
  await writeFile(file, original);
  assert.equal((await store.getAccount(account.accountId)).username, 'AlphaName');
});

test('rejected mutation and failed persistence cannot poison cached accounts or the following queue', async t => {
  const { file } = await fixture(t);
  class FailingStore extends MzkAccountStore {
    async save(data) { if (this.failWrite) throw new Error('Injected persistence failure'); return super.save(data); }
  }
  const store = new FailingStore(file), account = await store.freePlayLogin('SafePlayer', 'initial-password');
  await store.getAccount(account.accountId);
  store.failWrite = true;
  await assert.rejects(store.adminUpdate(account.accountId, { username: 'BrokenPlayer' }), /persistence failure/);
  assert.equal((await store.getAccount(account.accountId)).username, 'SafePlayer');
  store.failWrite = false;
  await assert.rejects(store.serialized(data => { data.accounts[0].mzkBalance = 0; throw new Error('Rejected operation'); }), /Rejected operation/);
  assert.equal((await store.getAccount(account.accountId)).mzkBalance, 2000);
  await store.adminUpdate(account.accountId, { username: 'GoodPlayer' });
  assert.equal((await new MzkAccountStore(file).getAccount(account.accountId)).username, 'GoodPlayer');
});

test('a password changed after preliminary verification invalidates an in-flight login proof', async t => {
  const { file } = await fixture(t);
  let entered, release;
  const paused = new Promise(resolve => { entered = resolve; }), resume = new Promise(resolve => { release = resolve; });
  class PausingStore extends MzkAccountStore {
    async serialized(work, options) { if (this.pause) { entered(); await resume; } return super.serialized(work, options); }
  }
  const store = new PausingStore(file), account = await store.freePlayLogin('ProofPlayer', 'original-password');
  store.pause = true;
  const pendingLogin = store.freePlayLogin('ProofPlayer', 'original-password');
  await paused;
  await new MzkAccountStore(file).adminUpdate(account.accountId, { password: 'replacement-password' });
  release();
  await assert.rejects(pendingLogin, { statusCode: 401 });
  store.pause = false;
  assert.equal((await store.freePlayLogin('ProofPlayer', 'replacement-password')).accountId, account.accountId);
});

test('duplicate display names retain the existing first matching password-account behavior', async t => {
  const { store } = await fixture(t), account = await store.freePlayLogin('NamedPlayer', 'player-password');
  const pass = await store.create();
  await store.activate(pass.code, '', 'NamedPlayer');
  assert.equal((await store.freePlayLogin('NamedPlayer', 'player-password')).accountId, account.accountId);
});

test('session-only guests have normal distinct Backpacks without reusable password credentials', async t => {
  const { file, store } = await fixture(t), other = new MzkAccountStore(file);
  const guests = await Promise.all([store.createGuestAccount(), other.createGuestAccount(), store.createGuestAccount()]);
  assert.equal(new Set(guests.map(account => account.accountId)).size, 3);
  for (const guest of guests) {
    assert.match(guest.username, /^Guest-[a-f0-9]{16}$/); assert.equal(guest.guest, true);
    assert.equal(guest.mzkBalance, 2000); assert.equal(guest.loadoutAccess, true);
    await assert.rejects(store.freePlayLogin(guest.username, 'any-unknown-password'), { statusCode: 409 });
  }
  const raw = await store.records();
  assert.ok(raw.accounts.every(account => !account.passwordHash && !account.passwordSalt));
  // An explicit administrator password reset converts the existing Backpack,
  // preserving its identity and one-time welcome grant.
  await store.adminUpdate(guests[0].accountId, { username: 'ConvertedGuest', password: 'explicit-admin-password' });
  const converted = await store.freePlayLogin('ConvertedGuest', 'explicit-admin-password');
  assert.equal(converted.accountId, guests[0].accountId); assert.equal(converted.backpackId, guests[0].backpackId);
  assert.equal(converted.mzkBalance, 2000); assert.equal(converted.guest, undefined);
});
