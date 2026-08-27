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
