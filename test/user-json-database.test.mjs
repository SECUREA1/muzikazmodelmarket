import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { UserJsonDatabase } from '../user-json-database.mjs';

test('persists items, token balances, and memory for each wallet', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'users.json');
  const database = new UserJsonDatabase(file);
  const wallet = '0x1111111111111111111111111111111111111111';

  await database.put(wallet, { tokens: { MZK: 725 }, items: [{ id: 'land-1', type: 'land' }], memory: { world: { level: 4 } } });
  const reopened = new UserJsonDatabase(file);
  assert.deepEqual(await reopened.get(wallet), {
    walletId: wallet, tokens: { MZK: 725 }, items: [{ id: 'land-1', type: 'land' }], memory: { world: { level: 4 } },
    createdAt: (await reopened.get(wallet)).createdAt, updatedAt: (await reopened.get(wallet)).updatedAt
  });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schemaVersion, 1);
});

test('serializes concurrent wallet updates without losing users', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new UserJsonDatabase(join(directory, 'users.json'));
  await Promise.all([
    database.put('player-one', { tokens: { MZK: 10 }, items: [], memory: {} }),
    database.put('player-two', { tokens: { MZK: 20 }, items: [], memory: {} })
  ]);
  assert.equal((await database.get('player-one')).tokens.MZK, 10);
  assert.equal((await database.get('player-two')).tokens.MZK, 20);
});

test('rejects malformed records', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new UserJsonDatabase(join(directory, 'users.json'));
  assert.throws(() => database.put('x', { items: [] }), /valid wallet/);
  await assert.rejects(database.put('player-one', { tokens: { MZK: 'not-a-number' } }), /finite numeric/);
  await assert.rejects(database.put('player-one', { items: [{}] }), /requires an id/);
});

test('lists every member and atomically trades a listed pack with MZK', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new UserJsonDatabase(join(directory, 'users.json'));
  await database.put('buyer', { tokens: { MZK: 100 }, items: [], memory: { profile: { displayName: 'Buyer' } } });
  await database.put('seller', { tokens: { MZK: 5 }, items: [{ id: 'pack-1', name: 'Legends Pack' }], memory: { profile: { displayName: 'Seller' } } });
  await database.listItem('seller', 'pack-1', 40);

  assert.deepEqual((await database.members()).map((member) => member.displayName), ['Buyer', 'Seller']);
  const trade = await database.trade({ buyerId: 'buyer', sellerId: 'seller', itemId: 'pack-1', requestId: 'checkout-1' });
  assert.equal(trade.priceMzk, 40);
  assert.equal((await database.get('buyer')).tokens.MZK, 60);
  assert.equal((await database.get('seller')).tokens.MZK, 45);
  assert.equal((await database.marketProfile('buyer')).items[0].id, 'pack-1');
  assert.equal((await database.trade({ buyerId: 'buyer', sellerId: 'seller', itemId: 'pack-1', requestId: 'checkout-1' })).id, trade.id);
});

test('stores private member messages and filters activity by conversation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new UserJsonDatabase(join(directory, 'users.json'));
  for (const wallet of ['one', 'two', 'three']) await database.put(wallet, { tokens: { MZK: 0 }, items: [], memory: {} });
  await database.message({ from: 'one', to: 'two', text: 'Would you trade that pack?' });
  await database.message({ from: 'one', to: 'three', text: 'Separate conversation' });
  const conversation = await database.activity('two', 'one');
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].text, 'Would you trade that pack?');
});
