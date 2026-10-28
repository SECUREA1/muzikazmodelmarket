import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
import {createHmac, randomBytes} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {DurableSessionStore} from '../session-store.mjs';
import {recoverRoomSession} from '../room-session.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {createSessionSecret, LEGACY_SESSION_HASH, OPAQUE_SESSION_HASH} from '../opaque-session-secrets.mjs';

const account = {accountId: 'alice'};
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-opaque-sessions-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const file = join(directory, 'sessions.json');
  const store = new DurableSessionStore(file, {ttlSeconds: 600, ...options});
  return {directory, file, store};
}

test('new account/game sessions issue opaque v2 proofs without PBKDF and never persist raw secrets', async t => {
  const {directory, file, store} = await fixture(t);
  let requests = 0;
  const hook = createHook({init(_id, type) {if (type === 'PBKDF2REQUEST') requests++;}});
  hook.enable();
  try {
    const proof = await store.createSession(account);
    assert.match(proof.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(proof.csrfToken, createHmac('sha256', proof.token).update('muzikaz/account/csrf/v1').digest('base64url'));
    assert.equal(proof.session.tokenHashAlgorithm, OPAQUE_SESSION_HASH);
    assert.equal(proof.session.csrfTokenHashAlgorithm, OPAQUE_SESSION_HASH);
    const encoded = await readFile(file, 'utf8');
    assert.equal(encoded.includes(proof.token), false);
    assert.equal(encoded.includes(proof.csrfToken), false);
    const restarted = new DurableSessionStore(file, {ttlSeconds: 600});
    const session = await restarted.authenticateSession(proof.token);
    assert.ok(await restarted.validCsrf(session, proof.csrfToken));
    assert.equal(await restarted.validCsrf(session, proof.token), false);
    assert.equal(await restarted.authenticateSession(proof.csrfToken), null);
    const games = new DurableSessionStore(join(directory, 'games.json'), {kind: 'game'});
    const game = await games.createSession(account, {accountSessionId: session.id});
    assert.equal(game.session.tokenHashAlgorithm, OPAQUE_SESSION_HASH);
    assert.equal(game.session.csrfTokenHashAlgorithm, null);
    assert.ok(await games.authenticateSession(game.token));
    assert.equal(requests, 0, 'only newly generated opaque secrets use this policy; no password derivation is invoked');
  } finally {hook.disable();}
});

test('mixed legacy/v2 records survive restart and legacy issuance does not disable the v2 reader', async t => {
  const {file, store} = await fixture(t);
  const current = await store.createSession(account);
  const legacyIssuer = new DurableSessionStore(file, {ttlSeconds: 600, issuanceAlgorithm: LEGACY_SESSION_HASH});
  const legacy = await legacyIssuer.createSession({accountId: 'bob'});
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  const prior = snapshot.sessions.find(record => record.id === legacy.session.id);
  delete prior.tokenHashAlgorithm; delete prior.csrfTokenHashAlgorithm;
  await writeFile(file, JSON.stringify(snapshot));
  const restarted = new DurableSessionStore(file, {ttlSeconds: 600, issuanceAlgorithm: LEGACY_SESSION_HASH});
  for (const proof of [current, legacy]) {
    const session = await restarted.authenticateSession(proof.token);
    assert.equal(session.accountId, proof.session.accountId);
    assert.ok(await restarted.validCsrf(session, proof.csrfToken));
  }
  assert.equal((await restarted.createSession({accountId: 'carol'})).session.tokenHashAlgorithm, LEGACY_SESSION_HASH);
  await restarted.revokeSession(current.token);
  assert.equal(await store.authenticateSession(current.token), null);
  await store.revokeSession(legacy.token);
  assert.equal(await restarted.authenticateSession(legacy.token), null);
});

test('algorithm-only changes cannot reuse warmed bearer or CSRF proof caches', async t => {
  const {file, store} = await fixture(t), proof = await store.createSession(account);
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const algorithm of [null, '', 'sha256', 'sha256-opaque-v3', LEGACY_SESSION_HASH, undefined]) {
    await writeFile(file, JSON.stringify(original));
    const session = await store.authenticateSession(proof.token);
    assert.ok(await store.validCsrf(session, proof.csrfToken));
    const changed = structuredClone(original);
    changed.sessions[0].tokenHashAlgorithm = algorithm;
    await writeFile(file, JSON.stringify(changed));
    assert.equal(await store.authenticateSession(proof.token), null, 'metadata must be checked before the token index');
    if (algorithm !== LEGACY_SESSION_HASH && algorithm !== undefined) assert.equal(await store.authenticateById(proof.session.id), null);
    assert.equal(await store.validCsrf({...session, csrfTokenHashAlgorithm: algorithm}, proof.csrfToken), false, 'metadata must be checked before the verified-secret cache');
  }
});

test('v2 salts/hashes require canonical encodings and changing store kind cannot reuse a cached proof', async t => {
  const {file, store} = await fixture(t), proof = await store.createSession(account);
  const original = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(await store.authenticateSession(proof.token));
  for (const field of ['tokenHash', 'tokenSalt']) {
    const changed = structuredClone(original); changed.sessions[0][field] += '=';
    await writeFile(file, JSON.stringify(changed));
    assert.equal(await store.authenticateSession(proof.token), null);
    assert.equal(await store.authenticateById(proof.session.id), null);
  }
  await writeFile(file, JSON.stringify(original));
  assert.ok(await store.authenticateSession(proof.token));
  store.kind = 'game';
  assert.equal(await store.authenticateSession(proof.token), null, 'the account hash cannot authenticate in game context');
  store.kind = 'account';
  assert.ok(await store.authenticateSession(proof.token));
});

test('copying a valid CSRF verifier into a bearer record cannot turn the CSRF proof into a bearer', async t => {
  const {file, store} = await fixture(t), proof = await store.createSession(account);
  const original = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(await store.validCsrf(proof.session, proof.csrfToken));
  const changed = structuredClone(original), record = changed.sessions[0];
  record.tokenHash = record.csrfTokenHash; record.tokenSalt = record.csrfTokenSalt;
  delete record.tokenFingerprint;
  await writeFile(file, JSON.stringify(changed));
  assert.equal(await store.authenticateSession(proof.csrfToken), null);
  assert.equal(await store.authenticateSession(proof.token), null);
});

test('legacy CSRF migration preserves each previous proof algorithm and does not silently upgrade old proofs', async t => {
  const {file, store} = await fixture(t), proof = await store.createSession(account);
  const old = randomBytes(24).toString('base64url'), previousLegacy = randomBytes(24).toString('base64url'), previousFast = randomBytes(32).toString('base64url');
  const descriptor = (token, algorithm) => createSessionSecret(token, {algorithm, kind: 'account', purpose: 'csrf'});
  const first = await descriptor(old, LEGACY_SESSION_HASH), second = await descriptor(previousLegacy, LEGACY_SESSION_HASH), third = await descriptor(previousFast, OPAQUE_SESSION_HASH);
  const snapshot = JSON.parse(await readFile(file, 'utf8')), record = snapshot.sessions[0];
  record.csrfTokenHash = first.hash; record.csrfTokenSalt = first.salt; record.csrfTokenHashAlgorithm = LEGACY_SESSION_HASH;
  record.previousCsrfSecrets = [{hash: third.hash, salt: third.salt, algorithm: third.algorithm}, {hash: second.hash, salt: second.salt}];
  await writeFile(file, JSON.stringify(snapshot));
  let writes = 0; const write = store.write.bind(store); store.write = async data => {writes++; return write(data);};
  const currentProof = await store.issueCsrf(proof.token);
  const session = await store.authenticateSession(proof.token);
  assert.equal(session.tokenHashAlgorithm, OPAQUE_SESSION_HASH);
  assert.equal(session.csrfTokenHashAlgorithm, LEGACY_SESSION_HASH);
  for (const token of [currentProof, old, previousLegacy, previousFast]) assert.ok(await store.validCsrf(session, token));
  for (let index = 0; index < 8; index++) assert.equal(await store.issueCsrf(proof.token), currentProof);
  assert.equal(writes, 1);
  const altered = structuredClone(session);
  altered.previousCsrfSecrets.find(value => value.algorithm === OPAQUE_SESSION_HASH).algorithm = null;
  assert.equal(await store.validCsrf(altered, previousFast), false);
  const invalid = structuredClone(snapshot); invalid.sessions[0].csrfTokenHashAlgorithm = null;
  await writeFile(file, JSON.stringify(invalid));
  assert.equal(await store.issueCsrf(proof.token), '', 'unsupported current algorithms are not repaired through a default scheme');
});

test('mixed parent/game formats still enforce current parent revocation and do not reissue account grants', async t => {
  const {directory, file} = await fixture(t);
  const accounts = new DurableSessionStore(file, {ttlSeconds: 600, issuanceAlgorithm: LEGACY_SESSION_HASH});
  const parent = await accounts.createSession(account);
  const games = new DurableSessionStore(join(directory, 'games.json'), {kind: 'game'});
  const child = await games.createSession(account, {accountSessionId: parent.session.id});
  assert.equal((await recoverRoomSession(accounts, games, child.token)).accountId, account.accountId);
  const users = new UserJsonDatabase(join(directory, 'users.json'));
  const member = {...account, mzkBalance: 100, gameAssets: ['Starter Avatar'], landAssets: [], bottleClaims: []};
  await users.ensureAccount(member);
  await users.spendGameplay('account:alice', {amountMzk: 25, requestId: 'once', gameId: 'test'});
  const modern = new DurableSessionStore(file, {ttlSeconds: 600});
  const current = await modern.createSession(account);
  for (const token of [parent.token, current.token]) {
    assert.equal((await modern.authenticateSession(token)).accountId, account.accountId);
    assert.equal((await users.ensureAccount(member)).tokens.MZK, 75);
  }
  const durable = await users.read();
  assert.equal(durable.transactions.filter(row => row.type === 'MEMBER_GRANT').length, 1);
  assert.equal(durable.users['account:alice'].items.length, 1);
  await modern.revokeSession(parent.token);
  assert.equal(await recoverRoomSession(accounts, games, child.token), null);
  assert.ok(await modern.authenticateSession(current.token));
});

test('failed v2 writes leave both proof caches and durable sessions unchanged', async t => {
  const {file, store} = await fixture(t), proof = await store.createSession(account);
  const before = await readFile(file, 'utf8'), verified = store.verifiedSecrets.size, indexed = store.tokenIndex.size;
  const write = store.write.bind(store);
  store.write = async () => {throw Object.assign(Error('injected full disk'), {code: 'ENOSPC'});};
  await assert.rejects(store.createSession({accountId: 'bob'}), {code: 'ENOSPC'});
  assert.equal(store.verifiedSecrets.size, verified);
  assert.equal(store.tokenIndex.size, indexed);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.ok(await store.authenticateSession(proof.token));
  store.write = write;
  assert.equal((await store.createSession({accountId: 'bob'})).session.tokenHashAlgorithm, OPAQUE_SESSION_HASH);
});

test('server issuance configuration selects writers only and rejects unknown values', async t => {
  const previous = process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM;
  try {
    process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM = LEGACY_SESSION_HASH;
    const {file, store} = await fixture(t);
    assert.equal((await store.createSession(account)).session.tokenHashAlgorithm, LEGACY_SESSION_HASH);
    const override = new DurableSessionStore(file, {issuanceAlgorithm: OPAQUE_SESSION_HASH});
    const proof = await override.createSession({accountId: 'bob'});
    assert.equal(proof.session.tokenHashAlgorithm, OPAQUE_SESSION_HASH);
    assert.ok(await store.authenticateSession(proof.token));
    for (const value of ['', 'sha256', 'sha256-opaque-v3']) {
      process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM = value;
      assert.throws(() => new DurableSessionStore(file), /Invalid session/);
    }
    assert.throws(() => new DurableSessionStore(file, {issuanceAlgorithm: null}), /Invalid session/);
  } finally {
    if (previous === undefined) delete process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM;
    else process.env.MUZIKAZ_SESSION_ISSUANCE_ALGORITHM = previous;
  }
});
