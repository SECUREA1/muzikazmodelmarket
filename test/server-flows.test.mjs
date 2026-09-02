import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function freePort() { return new Promise((resolve) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); }); }
async function waitFor(url, process) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode != null) throw new Error(`Server stopped with ${process.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready.');
}
async function json(url, options = {}) { const response = await fetch(url, options); return { response, body: await response.json() }; }

test('admin, new-user Loadout Pass, and aggregate marketplace work through the live server', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-server-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUZIKAZ_DATA_DIR: directory, MUZIKAZ_USER_DATABASE_FILE: join(directory, 'users.json'), MUZIKAZ_ACCOUNTS_FILE: join(directory, 'accounts.json'), MUZIKAZ_PAYMENT_ORDERS_FILE: join(directory, 'payments.json'), MUZIKAZ_ADMIN_USERNAME: 'test-admin', MUZIKAZ_ADMIN_PASSWORD: 'test-password', MUZIKAZ_ADMIN_SESSION_SECRET: 'test-session-secret' }, stdio: 'ignore' });
  t.after(() => { if (child.exitCode == null) child.kill('SIGTERM'); }); await waitFor(`${base}/api/health`, child);

  const health = await json(`${base}/api/health`);
  assert.equal(health.body.storage, 'ready');
  assert.equal(health.body.persistentStorageConfigured, false);

  const login = await json(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-admin', password: 'test-password' }) });
  assert.equal(login.response.status, 200); assert.equal(login.body.data.persistent, true); assert.ok(login.body.data.token);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await json(`${base}/api/admin/session`, { headers: { Cookie: cookie } })).body.data.authenticated, true);
  assert.equal((await json(`${base}/api/admin/data`, { headers: { Cookie: cookie } })).response.status, 200, 'persistent admin receives the full data center');

  const pass = await json(`${base}/api/admin/loadout-codes`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInDays: 7, waiveLoadout: true, violetBottle: true, starterLand: true, creatorVault: true }) });
  assert.equal(pass.response.status, 201); assert.equal(pass.body.data.label, 'MZK Loadout Pass');
  const wallet = '0x5555555555555555555555555555555555555555';
  const activation = await json(`${base}/api/access/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pass.body.data.code, wallet, username: 'New User' }) });
  assert.equal(activation.response.status, 200); assert.equal(activation.body.data.account.loadoutStatus, 'waived'); assert.equal(activation.body.data.account.creatorVaultAccess, true);

  await json(`${base}/api/wallet/state`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: { MZK: 100 }, items: [{ id: 'new-user-pack', name: 'New User Pack' }], memory: { profile: { displayName: 'New User' } } }) });
  await json(`${base}/api/market/listings`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'new-user-pack', priceMzk: 75 }) });
  const listings = await json(`${base}/api/market/listings`); assert.equal(listings.response.status, 200); assert.deepEqual(listings.body.data.map((item) => item.itemName), ['New User Pack']);
});
