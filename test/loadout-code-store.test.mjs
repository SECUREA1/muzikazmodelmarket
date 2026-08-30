import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LoadoutCodeStore } from '../loadout-code-store.mjs';

test('creates a server-stored secret and burns it on first wallet redemption', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-loadout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'codes.json');
  const store = new LoadoutCodeStore(file);
  const grant = await store.create({ label: 'Launch guest', expiresInDays: 7 });
  assert.match(grant.code, /^MZK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(grant.discountUsd, 30);
  assert.equal((await readFile(file, 'utf8')).includes(grant.code), false, 'plaintext secret must not be persisted');

  const wallet = '0x1111111111111111111111111111111111111111';
  const redeemed = await store.redeem(grant.code.toLowerCase(), wallet);
  assert.equal(redeemed.redeemedBy, wallet);
  await assert.rejects(store.redeem(grant.code, wallet), /already been burned/);
});

test('rejects malformed codes and wallets without consuming a grant', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-loadout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new LoadoutCodeStore(join(directory, 'codes.json'));
  const grant = await store.create();
  await assert.rejects(store.redeem('not-a-code', '0x1111111111111111111111111111111111111111'), /valid MUZIKAZ/);
  await assert.rejects(store.redeem(grant.code, 'not-a-wallet'), /valid Ethereum wallet/);
  assert.equal((await store.list())[0].redeemedAt, null);
});
