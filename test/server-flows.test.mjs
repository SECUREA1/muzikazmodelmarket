import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUZIKAZ_DATA_DIR: directory, MUZIKAZ_USER_DATABASE_FILE: join(directory, 'users.json'), MUZIKAZ_ACCOUNTS_FILE: join(directory, 'accounts.json'), MUZIKAZ_PAYMENT_ORDERS_FILE: join(directory, 'payments.json'), MUZIKAZ_ADMIN_USERNAME: 'test-admin', MUZIKAZ_ADMIN_PASSWORD: 'test-password', MUZIKAZ_ADMIN_SESSION_SECRET: 'test-session-secret', MUZIKAZ_CORS_ORIGINS: 'https://admin.muzikaz.test' }, stdio: 'ignore' });
  t.after(() => { if (child.exitCode == null) child.kill('SIGTERM'); }); await waitFor(`${base}/api/health`, child);

  const health = await json(`${base}/api/health`, { headers: { Origin: 'https://admin.muzikaz.test' } });
  assert.equal(health.body.storage, 'ready');
  assert.equal(health.body.service, 'muzikaz-member-market');
  assert.equal(health.body.version, '1.0.0');
  assert.ok(health.body.commit);
  assert.ok(health.body.startedAt);
  assert.deepEqual(health.body.routes, { accountBootstrap: true, accessActivation: true, gameSession: true });
  assert.equal(health.body.persistentStorageConfigured, false);
  assert.equal(health.response.headers.get('access-control-allow-origin'), 'https://admin.muzikaz.test', 'approved static admin deployments can call the live API with credentials');
  assert.equal(health.response.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(health.response.headers.get('x-request-id'));
  assert.equal((await json(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } })).response.headers.get('access-control-allow-origin'), null, 'unknown origins are never reflected');

  const login = await json(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-admin', password: 'test-password' }) });
  assert.equal(login.response.status, 200); assert.equal(login.body.data.persistent, true); assert.ok(login.body.data.token);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await json(`${base}/api/admin/session`, { headers: { Cookie: cookie } })).body.data.authenticated, true);
  assert.equal((await json(`${base}/api/admin/data`, { headers: { Cookie: cookie } })).response.status, 200, 'persistent admin receives the full data center');

  const pass = await json(`${base}/api/admin/loadout-codes`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInDays: 7, waiveLoadout: true, violetBottle: true, starterLand: true, creatorVault: true }) });
  assert.equal(pass.response.status, 201); assert.equal(pass.body.data.label, 'MZK Loadout Pass');
  assert.equal(pass.body.data.activationPath, `/members.html#access-code=${pass.body.data.code}`, 'admin receives a directly shareable activation route');
  const wallet = '0x5555555555555555555555555555555555555555';
  const activation = await json(`${base}/api/access/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pass.body.data.code, username: 'New User' }) });
  assert.equal(activation.response.status, 200); assert.equal(activation.body.data.account.loadoutStatus, 'included'); assert.equal(activation.body.data.account.creatorVaultAccess, true); assert.equal(activation.body.data.account.primaryEthereumWallet, null);
  assert.equal(activation.body.data.account.mzkBalance, 500, 'admin Loadout codes include the full 500 MZK starter grant');
  const accountCookie = activation.response.headers.get('set-cookie').split(';')[0];
  const codeOnlyState = await json(`${base}/api/wallet/state`, { headers: { Cookie: accountCookie } });
  assert.equal(codeOnlyState.response.status, 200, 'an access-code session opens the new Backpack without an Ethereum address');
  assert.ok(codeOnlyState.body.data.items.some((item) => item.name === 'Starter Avatar'), 'the loadout is in durable game memory');
  assert.equal(codeOnlyState.body.data.tokens.MZK, 500, 'the starter balance is available to multiplayer and market APIs');
  const walletLogin = await json(`${base}/api/access/wallet`, { method: 'POST', headers: { Cookie: accountCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet }) });
  assert.equal(walletLogin.response.status, 200); assert.equal(walletLogin.body.data.account.primaryEthereumWallet, wallet);
  assert.equal(walletLogin.body.data.account.accountId, activation.body.data.account.accountId, 'wallet and code open one canonical account');
  assert.equal(walletLogin.body.data.account.backpackId, activation.body.data.account.backpackId, 'opening Ethereum attaches it to the code-created Backpack');
  assert.deepEqual(walletLogin.body.data.account.gameAssets, ['Starter Avatar', 'Unrevealed Loadout Avatar', 'Community Spot', 'Starter Room Shell', 'Builder Tool Kit', 'Creator Market Station', 'RAD-TOX Starter Gear']);

  const bypassDenied = await json(`${base}/api/access/admin-bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(bypassDenied.response.status, 401, 'an incorrect owner word cannot bypass the Bottle gate');
  const bypass = await json(`${base}/api/access/admin-bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password' }) });
  assert.equal(bypass.response.status, 200, 'the configured admin word opens an owner Loadout session');
  assert.equal(bypass.body.data.account.mzkBalance, 500);
  assert.equal(bypass.body.data.account.gameAccess, true);
  const bypassCookie = bypass.response.headers.get('set-cookie').split(';')[0];
  const game = await json(`${base}/api/game/session`, { method: 'POST', headers: { Cookie: bypassCookie, 'X-CSRF-Token': bypass.body.data.csrfToken } });
  assert.equal(game.response.status, 201, 'the owner bypass proceeds through the authenticated game-session route');
  assert.match(game.response.headers.get('set-cookie'), /^mzk_game=/);

  await json(`${base}/api/wallet/state`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: { MZK: 100 }, items: [{ id: 'new-user-pack', name: 'New User Pack' }], memory: { profile: { displayName: 'New User' } } }) });
  await json(`${base}/api/market/listings`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'new-user-pack', priceMzk: 75 }) });
  const listings = await json(`${base}/api/market/listings`); assert.equal(listings.response.status, 200); assert.deepEqual(listings.body.data.map((item) => item.itemName), ['New User Pack']);
});

test('member loadout entry is simple and only the saved admin bypass uses the account API', async () => {
  const html = await readFile(new URL('../members.html', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../members-entry.js', import.meta.url), 'utf8');
  assert.ok(!html.includes('api-connection.js'));
  assert.equal((entry.match(/\/api\//g) || []).length, 1);
  assert.ok(entry.includes("fetch('/api/access/admin-bypass'"));
  assert.ok(html.includes('data-entry-option="meknx"'));
  assert.ok(html.includes('data-entry-option="pay"'));
  assert.ok(entry.includes("window.localStorage.setItem('muzikazStarterLoadout'"));
  assert.ok(entry.includes("accountId: account.accountId"));
  assert.ok(entry.includes("window.location.assign('model-market.html?access='"));
});
