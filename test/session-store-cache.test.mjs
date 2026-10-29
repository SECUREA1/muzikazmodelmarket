import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { mkdtemp, readFile, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DurableSessionStore } from '../session-store.mjs';
import {LEGACY_SESSION_HASH} from '../opaque-session-secrets.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-session-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'sessions.json');
  const store = new DurableSessionStore(file, { ttlSeconds: 600, ...options });
  const proof = await store.createSession({ accountId: 'alice' });
  return { file, store, proof };
}

test('cached proofs observe same-size in-place changes even when mtime is restored', async t => {
  const { file, store, proof } = await fixture(t);
  assert.ok(await store.authenticateSession(proof.token));
  const original = await readFile(file, 'utf8'), before = await stat(file);
  const revoked = original.replace('"status":"active"', '"status":"closed"');
  assert.equal(Buffer.byteLength(revoked), Buffer.byteLength(original));
  assert.notEqual(revoked, original);
  await writeFile(file, revoked);
  await utimes(file, before.atime, before.mtime);
  assert.equal(await store.authenticateSession(proof.token), null);
  assert.equal(await store.authenticateById(proof.session.id), null);
});

test('cached proofs observe atomically replaced session files with matching length and mtime', async t => {
  const { file, store, proof } = await fixture(t);
  assert.ok(await store.authenticateSession(proof.token));
  const original = await readFile(file, 'utf8'), before = await stat(file);
  const temporary = file + '.restore';
  await writeFile(temporary, original.replace('"status":"active"', '"status":"closed"'));
  await utimes(temporary, before.atime, before.mtime);
  await rename(temporary, file);
  assert.equal(await store.authenticateSession(proof.token), null);
  assert.equal(await store.issueCsrf(proof.token), '');
});

test('snapshot callers cannot alter cached identity or revocation state', async t => {
  const { store, proof } = await fixture(t);
  const snapshot = await store.read();
  snapshot.sessions[0].accountId = 'mallory';
  snapshot.sessions[0].status = 'revoked';
  snapshot.sessions.length = 0;
  const authenticated = await store.authenticateSession(proof.token);
  assert.equal(authenticated.accountId, 'alice');
  authenticated.accountId = 'mallory';
  assert.equal((await store.authenticateSession(proof.token)).accountId, 'alice');
});

test('missing, corrupt and invalid-shape session files fail closed and the queue recovers', async t => {
  const { file, store, proof } = await fixture(t);
  const original = await readFile(file, 'utf8');
  assert.ok(await store.authenticateSession(proof.token));
  for (const broken of ['{bad-json', '{"version":1,"sessions":{}}', '{"version":1,"sessions":[null]}']) {
    await writeFile(file, broken);
    await assert.rejects(store.authenticateSession(proof.token), error => error.code === 'SESSION_STORE_FAILED' && error.statusCode === 500);
    await writeFile(file, original);
    assert.ok(await store.authenticateSession(proof.token));
  }
  await unlink(file);
  assert.equal(await store.authenticateSession(proof.token), null);
  assert.equal(await store.authenticateById(proof.session.id), null);
});

test('failed durable revocation does not mutate the cached active session', async t => {
  const { file, store, proof } = await fixture(t);
  assert.ok(await store.authenticateSession(proof.token));
  const original = await readFile(file, 'utf8'), write = store.write.bind(store);
  store.write = async () => { throw Object.assign(new Error('simulated full disk'), { code: 'ENOSPC' }); };
  await assert.rejects(store.revokeSession(proof.token), { code: 'ENOSPC' });
  assert.equal(await readFile(file, 'utf8'), original);
  store.write = write;
  assert.ok(await store.authenticateSession(proof.token));
  await store.revokeSession(proof.token);
  assert.equal(await store.authenticateSession(proof.token), null);
});

test('failed game-session extension cannot extend the cached expiry', async t => {
  let now = Date.now();
  const { store, proof } = await fixture(t, { kind: 'game', ttlSeconds: 60, clock: () => now });
  assert.ok(await store.authenticateSession(proof.token));
  now += 40_000;
  const write = store.write.bind(store);
  store.write = async () => { throw new Error('simulated write failure'); };
  await assert.rejects(store.authenticateSession(proof.token, { extend: true }));
  store.write = write;
  now += 30_000;
  assert.equal(await store.authenticateSession(proof.token), null, 'the original durable expiry still applies');
});

test('invalid or missing game-session expirations cannot become permanent credentials', async t => {
  const { file, store, proof } = await fixture(t, { kind: 'game' });
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const expiresAt of [null, undefined, 'not-a-date']) {
    const snapshot = structuredClone(original);
    snapshot.sessions[0].expiresAt = expiresAt;
    await writeFile(file, JSON.stringify(snapshot));
    assert.equal(await store.authenticateSession(proof.token), null);
    assert.equal(await store.authenticateById(proof.session.id), null);
  }
});

test('independent store objects preserve concurrent creations and share revocations', async t => {
  const { file, store } = await fixture(t);
  const other = new DurableSessionStore(file, { ttlSeconds: 600 });
  const proofs = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    (index % 2 ? store : other).createSession({ accountId: 'member-' + index })));
  const disk = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(disk.sessions.length, 9);
  for (let index = 0; index < proofs.length; index++) {
    assert.equal((await store.authenticateSession(proofs[index].token)).accountId, 'member-' + index);
  }
  await other.revokeSession(proofs[0].token);
  assert.equal(await store.authenticateSession(proofs[0].token), null);
});

test('legacy bearer records gain a fingerprint only after successful verification', async t => {
  const { file, proof } = await fixture(t, {issuanceAlgorithm: LEGACY_SESSION_HASH});
  const data = JSON.parse(await readFile(file, 'utf8'));
  delete data.sessions[0].tokenFingerprint;
  delete data.sessions[0].tokenHashAlgorithm;
  delete data.sessions[0].csrfTokenHashAlgorithm;
  await writeFile(file, JSON.stringify(data));
  const restarted = new DurableSessionStore(file, { ttlSeconds: 600 });
  assert.equal(await restarted.authenticateSession('wrong-token'), null);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).sessions[0].tokenFingerprint, undefined);
  assert.ok(await restarted.authenticateSession(proof.token));
  assert.match(JSON.parse(await readFile(file, 'utf8')).sessions[0].tokenFingerprint, /^[a-f0-9]{64}$/);
});

test('simultaneous session timestamps retain the latest session at the active limit', async t => {
  const now = Date.now();
  const { file, store, proof: first } = await fixture(t, { maxActivePerAccount: 1, clock: () => now });
  const latest = await store.createSession({ accountId: 'alice' });
  assert.equal(await store.authenticateSession(first.token), null);
  assert.ok(await store.authenticateSession(latest.token));
  assert.equal(JSON.parse(await readFile(file, 'utf8')).sessions.filter(record => record.status === 'active').length, 1);
});

test('legacy session issuance retains asynchronous password-strength derivation and warms its proofs', async t => {
  let requests = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PBKDF2REQUEST') requests++; } });
  hook.enable();
  try {
    const { store, proof } = await fixture(t, {issuanceAlgorithm: LEGACY_SESSION_HASH});
    assert.equal(requests, 2, 'bearer and CSRF derivation execute as asynchronous crypto requests');
    const session = await store.authenticateSession(proof.token);
    assert.ok(await store.validCsrf(session, proof.csrfToken));
    assert.equal(requests, 2, 'proofs created by this process need no additional derivation');
  } finally { hook.disable(); }
});
