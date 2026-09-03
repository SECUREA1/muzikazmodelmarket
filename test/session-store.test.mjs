import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DurableSessionStore } from '../session-store.mjs';

const account = { accountId: 'account-1', primaryEthereumWallet: '0x1111111111111111111111111111111111111111' };

test('account sessions are hashed, durable across store instances, independently revoked, and expire', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-sessions-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'account-sessions.json'); let now = Date.now();
  const firstStore = new DurableSessionStore(file, { ttlSeconds: 60, clock: () => now, maxActivePerAccount: 3 });
  const first = await firstStore.createSession(account); const second = await firstStore.createSession(account);
  const disk = await readFile(file, 'utf8');
  assert.ok(!disk.includes(first.token)); assert.ok(!disk.includes(first.csrfToken), 'no bearer or CSRF plaintext is persisted');
  const restarted = new DurableSessionStore(file, { ttlSeconds: 60, clock: () => now, maxActivePerAccount: 3 });
  assert.equal((await restarted.authenticateSession(first.token)).accountId, account.accountId, 'bearer survives restart');
  assert.equal((await restarted.authenticateSession(second.token)).accountId, account.accountId, 'new devices do not revoke existing sessions');
  assert.equal(await restarted.validCsrf((await restarted.authenticateSession(first.token)), first.csrfToken), true);
  await restarted.revokeSession(second.token);
  assert.equal(await restarted.authenticateSession(second.token), null); assert.ok(await restarted.authenticateSession(first.token));
  now += 61_000; assert.equal(await restarted.authenticateSession(first.token), null, 'expired sessions are rejected');
});

test('game sessions retain parent account-session binding across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-games-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'game-sessions.json');
  const store = new DurableSessionStore(file, { ttlSeconds: 300, kind: 'game' });
  const created = await store.createSession(account, { accountSessionId: 'parent-1', avatarId: 'starter-avatar' });
  const restarted = new DurableSessionStore(file, { ttlSeconds: 300, kind: 'game' });
  assert.equal((await restarted.authenticateSession(created.token)).accountSessionId, 'parent-1');
  await restarted.revokeByParent('parent-1'); assert.equal(await restarted.authenticateSession(created.token), null);
});
