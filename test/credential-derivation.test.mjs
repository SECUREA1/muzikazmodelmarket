import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import { deriveCredential } from '../credential-derivation.mjs';

test('credential derivation matches the retained PBKDF2 parameters', async () => {
  const password = 'test-password', salt = Buffer.from('independent-test-salt');
  const expected = pbkdf2Sync(password, salt, 210_000, 32, 'sha256');
  assert.deepEqual(await deriveCredential(password, salt), expected);
});

test('credential bursts reserve worker-pool capacity and release failed operations', { timeout: 10_000 }, async () => {
  const capacity = Math.max(1, Math.min(2, (Number(process.env.UV_THREADPOOL_SIZE) || 4) - 1));
  const pending = new Set();
  let maximum = 0, requests = 0;
  const hook = createHook({
    init(id, type) {
      if (type !== 'PBKDF2REQUEST') return;
      pending.add(id); requests++; maximum = Math.max(maximum, pending.size);
    },
    before(id) { pending.delete(id); }
  });
  hook.enable();
  try {
    const operations = Array.from({ length: 12 }, (_, index) =>
      deriveCredential('password-' + index, Buffer.from('test-salt'), index < 3 ? 0 : 1000));
    const results = await Promise.allSettled(operations);
    assert.equal(results.filter(result => result.status === 'rejected').length, 3);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 9);
    assert.equal(requests, 9);
    assert.ok(maximum <= capacity, `at most ${capacity} asynchronous crypto operations may enter the shared pool`);
  } finally { hook.disable(); }
});
