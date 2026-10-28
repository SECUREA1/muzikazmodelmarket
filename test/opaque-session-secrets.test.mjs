import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes} from 'node:crypto';
import test from 'node:test';
import {createSessionSecret, verifySessionSecret, sessionSecretCacheKey, sessionSecretMetadataSupported,
  sessionHashAlgorithm, LEGACY_SESSION_HASH, OPAQUE_SESSION_HASH} from '../opaque-session-secrets.mjs';

const context = {algorithm: OPAQUE_SESSION_HASH, kind: 'account', purpose: 'bearer'};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const noncanonical = value => value.slice(0, -1) + alphabet[alphabet.indexOf(value.at(-1)) + 1];

test('opaque verifiers use the versioned kind/purpose domain, independent salt and complete SHA256 output', async () => {
  const secret = randomBytes(32).toString('base64url');
  const first = await createSessionSecret(secret, context), second = await createSessionSecret(secret, context);
  const expected = createHash('sha256').update('muzikaz/session-secret/sha256-opaque-v2\0account\0bearer\0')
    .update(Buffer.from(first.salt, 'base64url')).update(Buffer.from(secret, 'base64url')).digest('base64url');
  assert.equal(first.algorithm, OPAQUE_SESSION_HASH);
  assert.equal(first.hash, expected);
  assert.equal(Buffer.from(first.hash, 'base64url').length, 32);
  assert.equal(Buffer.from(first.salt, 'base64url').length, 16);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifySessionSecret(secret, first.hash, first.salt, context), true);
  assert.equal(await verifySessionSecret(randomBytes(32).toString('base64url'), first.hash, first.salt, context), false);
});

test('opaque proof verification and cache entries are separated by kind, purpose and algorithm', async () => {
  const secret = randomBytes(32).toString('base64url'), proof = await createSessionSecret(secret, context);
  const originalKey = sessionSecretCacheKey(secret, proof.hash, proof.salt, context);
  for (const changed of [{...context, kind: 'game'}, {...context, purpose: 'csrf'}, {...context, algorithm: LEGACY_SESSION_HASH}]) {
    assert.notEqual(sessionSecretCacheKey(secret, proof.hash, proof.salt, changed), originalKey);
    assert.equal(await verifySessionSecret(secret, proof.hash, proof.salt, changed), false);
  }
});

test('malformed and noncanonical v2 representations are rejected before cache lookup', async () => {
  const secret = randomBytes(32).toString('base64url'), proof = await createSessionSecret(secret, context);
  for (const changed of [
    {secret: secret + '='}, {secret: ' ' + secret}, {secret: noncanonical(secret)}, {secret: 'A'.repeat(42)},
    {hash: proof.hash + '='}, {hash: noncanonical(proof.hash)}, {hash: 'A'.repeat(42)},
    {salt: proof.salt + '='}, {salt: noncanonical(proof.salt)}, {salt: 'A'.repeat(21)}
  ]) {
    const values = {secret, ...proof, ...changed};
    assert.equal(sessionSecretCacheKey(values.secret, values.hash, values.salt, context), null);
    assert.equal(await verifySessionSecret(values.secret, values.hash, values.salt, context), false);
  }
  for (const algorithm of [null, '', 'sha256', 'pbkdf2', 'sha256-opaque-v3', 2]) {
    assert.equal(sessionHashAlgorithm(algorithm), null);
    assert.equal(sessionSecretMetadataSupported(proof.hash, proof.salt, algorithm), false);
    assert.equal(sessionSecretCacheKey(secret, proof.hash, proof.salt, {...context, algorithm}), null);
    assert.equal(await verifySessionSecret(secret, proof.hash, proof.salt, {...context, algorithm}), false);
  }
});

test('missing legacy algorithm metadata preserves the exact historical PBKDF parameters and representations', async () => {
  const secret = randomBytes(24).toString('base64url'), salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(secret, Buffer.from(salt, 'base64url'), 210_000, 32, 'sha256').toString('base64url');
  assert.equal(sessionHashAlgorithm(undefined), LEGACY_SESSION_HASH);
  assert.equal(await verifySessionSecret(secret, hash, salt, {kind: 'account', purpose: 'csrf'}), true);
  assert.equal(await verifySessionSecret(secret, hash, salt, {...context, algorithm: LEGACY_SESSION_HASH}), true);
  assert.equal(await verifySessionSecret(secret, hash, salt, context), false, 'legacy secrets are never inferred to be v2');
  await assert.rejects(createSessionSecret(secret, context), /Invalid opaque/);
});
