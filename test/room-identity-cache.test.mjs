import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomIdentityCache} from '../room-identity-cache.mjs';

test('concurrent panels refresh one identity and expiry/forced joins refresh it again', async () => {
  let now = 100, builds = 0;
  const cache = new RoomIdentityCache({ttlMs: 50, now: () => now});
  const build = async () => ({revision: ++builds});
  const batch = await Promise.all(Array.from({length: 24}, () => cache.resolve('alice', build)));
  assert.equal(builds, 1);
  assert.ok(batch.every(identity => identity.revision === 1));
  assert.equal((await cache.resolve('alice', build)).revision, 1);
  now += 50;
  assert.equal((await cache.resolve('alice', build)).revision, 2);
  assert.equal((await cache.resolve('alice', build, {refresh: true})).revision, 3);
});

test('invalidating an in-flight identity cannot repopulate stale avatar or restored account state', async () => {
  const cache = new RoomIdentityCache();
  let finishOld;
  const old = cache.resolve('alice', () => new Promise(resolve => {finishOld = resolve;}));
  await Promise.resolve();
  cache.delete('alice');
  const fresh = await cache.resolve('alice', async () => ({avatar: 'new'}));
  finishOld({avatar: 'old'});
  await old;
  assert.equal(await cache.resolve('alice', () => assert.fail('Fresh identity should be cached')), fresh);
  cache.clear();
  assert.equal((await cache.resolve('alice', async () => ({avatar: 'restored'}))).avatar, 'restored');
});

test('failed or missing identities are retried and completed entries have an LRU bound', async () => {
  const cache = new RoomIdentityCache({maxEntries: 2});
  await assert.rejects(cache.resolve('alice', async () => {throw Error('Storage unavailable');}), /Storage unavailable/);
  assert.equal(cache.pending.size, 0);
  assert.equal(await cache.resolve('alice', async () => null), null);
  await cache.resolve('alice', async () => ({id: 'alice'}));
  await cache.resolve('bob', async () => ({id: 'bob'}));
  await cache.resolve('alice', () => assert.fail('Alice should still be cached'));
  await cache.resolve('charlie', async () => ({id: 'charlie'}));
  assert.deepEqual([...cache.entries.keys()], ['alice', 'charlie']);
});
