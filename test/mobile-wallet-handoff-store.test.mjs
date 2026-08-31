import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MobileWalletHandoffStore } from '../mobile-wallet-handoff-store.mjs';

test('creates opaque, hashed, operation-scoped handoffs and authenticates both devices', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-handoff-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new MobileWalletHandoffStore(join(dir, 'handoffs.json'));
  const created = await store.create({ userId: 'member', desktopSessionId: 'desktop-1', walletType: 'metamask', chain: 'polygon', scope: 'wallet_connect' });
  assert.match(created.token, /^[A-Za-z0-9_-]{40,}$/); assert.equal(created.tokenHash, undefined); assert.equal(created.chain, 'polygon');
  assert.equal((await store.byToken(created.token)).id, created.id); assert.equal(await store.byToken('wrong-token'), undefined);
  assert.equal((await store.byDesktop(created.id, created.desktopSecret, 'desktop-1')).id, created.id);
  assert.equal(await store.byDesktop(created.id, created.desktopSecret, 'another-browser'), null);
});

test('locks wallet/chain pairs, payment intents, transitions, and terminal replay', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-handoff-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new MobileWalletHandoffStore(join(dir, 'handoffs.json'));
  await assert.rejects(store.create({ userId: 'member', desktopSessionId: 'd', walletType: 'phantom', chain: 'polygon' }), /do not match/);
  await assert.rejects(store.create({ userId: 'member', desktopSessionId: 'd', walletType: 'lace', chain: 'cardano', scope: 'payment' }), /payment intent/);
  const item = await store.create({ userId: 'member', desktopSessionId: 'd', walletType: 'phantom', chain: 'solana', scope: 'wallet_link' });
  await store.open(item.token); await store.transitionToken(item.token, 'wallet_connecting'); await store.transitionToken(item.token, 'awaiting_wallet_approval'); await store.transitionToken(item.token, 'rejected');
  await assert.rejects(store.transitionToken(item.token, 'wallet_connecting'), /can no longer be used/);
});

test('expires requests and does not allow them to be reused', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'muzikaz-handoff-')); t.after(() => rm(dir, { recursive: true, force: true })); let now = Date.now();
  const store = new MobileWalletHandoffStore(join(dir, 'handoffs.json'), { now: () => now });
  const item = await store.create({ userId: 'member', desktopSessionId: 'd', walletType: 'lace', chain: 'cardano', scope: 'auth' }); now += 6 * 60_000;
  assert.equal((await store.byToken(item.token)).status, 'expired'); await assert.rejects(store.open(item.token), /can no longer be used/);
});
