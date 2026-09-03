import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
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

test('admin reporting, subscriber and verified MEKNX access work through the live server', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-server-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const rpcPort = await freePort();
  const rpc = createServer((req, res) => { let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => { const method = JSON.parse(body).method; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: method === 'eth_getCode' ? '0x6001' : '0x1' })); }); });
  await new Promise((resolve) => rpc.listen(rpcPort, '127.0.0.1', resolve)); t.after(() => rpc.close());
  const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUZIKAZ_DATA_DIR: directory, MUZIKAZ_USER_DATABASE_FILE: join(directory, 'users.json'), MUZIKAZ_ACCOUNTS_FILE: join(directory, 'accounts.json'), MUZIKAZ_PAYMENT_ORDERS_FILE: join(directory, 'payments.json'), MUZIKAZ_ADMIN_USERNAME: 'test-admin', MUZIKAZ_ADMIN_PASSWORD: 'test-password', MUZIKAZ_ADMIN_SESSION_SECRET: 'test-session-secret', MUZIKAZ_CORS_ORIGINS: 'https://admin.muzikaz.test', MUZIKAZ_ETH_RPC_URL: `http://127.0.0.1:${rpcPort}` }, stdio: 'ignore' });
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

  const disabledCode = await json(`${base}/api/access/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(disabledCode.response.status, 403);
  const disabledBypass = await json(`${base}/api/access/admin-bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(disabledBypass.response.status, 403);

  const subscriber = await json(`${base}/api/access/subscriber`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'New User', email: 'new@example.com', password: 'secret7' }) });
  assert.equal(subscriber.response.status, 200);
  assert.equal(subscriber.body.data.account.mzkBalance, 500);
  const wallet = '0x5555555555555555555555555555555555555555';

  const meknxWallet = '0x6666666666666666666666666666666666666666';
  const meknxLogin = await json(`${base}/api/access/wallet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: meknxWallet }) });
  const meknxCookie = meknxLogin.response.headers.get('set-cookie').split(';')[0];
  const meknxGrant = await json(`${base}/api/account/meknx-loadout`, { method: 'POST', headers: { Cookie: meknxCookie, 'X-CSRF-Token': meknxLogin.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ contract: '0xEf74118D5fB730E9B2729c7303DC29980b4771f0' }) });
  assert.equal(meknxGrant.response.status, 200);
  assert.equal(meknxGrant.body.data.mzkBalance, 500);
  assert.equal(meknxGrant.body.data.gameAccess, true);
  assert.equal((await json(`${base}/api/account/bootstrap`, { headers: { Cookie: meknxCookie } })).body.data.permissions.radTox, true);

  const adminData = await json(`${base}/api/admin/data`, { headers: { Cookie: cookie } });
  assert.equal(adminData.body.data.accounts.length, 2, 'every signup is retained in the private administrator report');
  assert.equal(adminData.body.data.accounts[0].passwordHash, undefined, 'password verifiers never leave the account store');
  await json(`${base}/api/wallet/state`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: { MZK: 100 }, items: [{ id: 'new-user-pack', name: 'New User Pack' }], memory: { profile: { displayName: 'New User' } } }) });
  await json(`${base}/api/market/listings`, { method: 'PUT', headers: { 'X-Wallet-Address': wallet, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'new-user-pack', priceMzk: 75 }) });
  const listings = await json(`${base}/api/market/listings`); assert.equal(listings.response.status, 200); assert.deepEqual(listings.body.data.map((item) => item.itemName), ['New User Pack']);
});

test('member loadout entry uses the shared canonical account API', async () => {
  const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.match(source, /const accountApiFetch = .*window\.MUZIKAZ_API\?\.fetch/s);
  assert.match(source, /accountApiFetch\('\/api\/access\/wallet'/);
  assert.match(source, /accountApiFetch\('\/api\/access\/activate'/);
  assert.match(source, /accountApiFetch\('\/api\/account\/loadout\/paid'/);
  assert.match(source, /accountApiFetch\('\/api\/account\/access-code'/);
  assert.match(source, /accountApiFetch\('\/api\/account\/meknx-loadout'/, 'verified MEKNX entry provisions the canonical account');
  assert.ok(source.includes('Your full account, 500 MZK, Builder Loadout, Backpack, creator tools and RAD-TOX access are ready.'));
  assert.ok(source.includes('[A-Z0-9]{8}-[A-Z0-9]{8}'), 'legacy Rust pass format remains accepted by the member login');
  assert.ok(source.includes("document.querySelector('#loadout-code-redeem')?.click()"), 'shared pass links automatically submit the member login');
  assert.ok(source.includes("accountApiFetch('/api/account/bootstrap')"), 'account and Backpack state are loaded from authoritative bootstrap');
  assert.ok(!source.slice(source.indexOf('const enterGame'), source.indexOf('const verifyAndUnlock')).includes("accountApiFetch('/api/game/session'"), 'members navigation does not create and discard a game session');
  assert.ok(source.includes("window.sessionStorage.setItem('muzikazGameSessionToken'"), 'the destination persists its game token for protected requests');
  assert.ok(source.includes("accountApiFetch('/api/access/admin-bypass'"), 'the Bottle page owner shortcut uses the server-validated bypass route');
  assert.ok(source.includes('const openAuthenticatedSubscriber = (account, message) =>'), 'authenticated pass options share one subscriber-area opening process');
  assert.ok(source.includes("openAuthenticatedSubscriber(account, account.primaryEthereumWallet"), 'an MZK Access Code opens the subscriber area instead of forcing a game redirect');
  assert.ok(source.includes("openAuthenticatedSubscriber(account, 'Admin Loadout opened."), 'the admin pass opens the same subscriber area');
  assert.ok(!source.includes('window.MZKWallet?.provisionStandardLoadout(account)'), 'local storage is not an ownership authority');
  assert.ok(source.includes('model-market.html?access=loadout#house-explorer'), 'the subscriber area retains an explicit RAD-TOX entry route');
});
