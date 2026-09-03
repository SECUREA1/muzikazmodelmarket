import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function runningServer(t) {
  const data = await mkdtemp(join(tmpdir(), 'mzk-api-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUZIKAZ_DATA_DIR: data, MUZIKAZ_ACCOUNTS_FILE: join(data, 'accounts.json'), MUZIKAZ_USER_DATABASE_FILE: join(data, 'users.json'), MUZIKAZ_PAYMENT_ORDERS_FILE: join(data, 'orders.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); await rm(data, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { child.stdout.on('data', resolve); child.once('exit', (code) => reject(new Error(`server exited ${code}`))); });
  return `http://127.0.0.1:${port}`;
}

async function json(base, path, options = {}) {
  const response = await fetch(base + path, options); return { response, body: await response.json(), cookie: response.headers.getSetCookie?.()[0]?.split(';')[0] || response.headers.get('set-cookie')?.split(';')[0] };
}

test('canonical session, isolated Backpack, avatar and short-lived game contract', async (t) => {
  const base = await runningServer(t);
  const unauthenticated = await json(base, '/api/backpack');
  assert.equal(unauthenticated.response.status, 401); assert.equal(unauthenticated.body.code, 'SESSION_REQUIRED');
  assert.match(unauthenticated.response.headers.get('content-type'), /json/);

  const admin = await json(base, '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'giraff', password: 'boots' }) });
  const makeCode = async () => (await json(base, '/api/admin/access-codes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': admin.body.data.token }, body: '{}' })).body.data.code;
  const redeem = async (code) => json(base, '/api/access-codes/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const first = await redeem(await makeCode()); const second = await redeem(await makeCode());
  assert.notEqual(first.body.data.account.accountId, second.body.data.account.accountId);
  assert.match(first.body.data.sessionToken, /^[A-Za-z0-9_-]+$/, 'code entry returns a portable API session for browsers that block third-party cookies');
  const firstHeaders = { cookie: first.cookie }; const secondHeaders = { cookie: second.cookie };
  const session = await json(base, '/api/session', { headers: firstHeaders });
  const bootstrap = await json(base, '/api/account/bootstrap', { headers: firstHeaders });
  assert.equal(bootstrap.body.data.account.loadoutAccess, true);
  assert.equal(bootstrap.body.data.permissions.radTox, true);
  assert.equal(bootstrap.body.data.backpack.status, 'ready');
  assert.ok(bootstrap.body.data.backpack.entitlements.includes('backpack-loadout'));
  const backpack = await json(base, '/api/backpack?accountId=' + second.body.data.account.accountId, { headers: firstHeaders });
  assert.equal(backpack.body.data.accountId, first.body.data.account.accountId, 'query parameters cannot cross account boundaries');
  assert.equal((await json(base, '/api/backpack', { headers: secondHeaders })).body.data.accountId, second.body.data.account.accountId);
  assert.equal(backpack.body.data.status, 'ready'); assert.equal(backpack.body.data.mzkBalance, 500);
  assert.ok(backpack.body.data.assets.every((asset) => asset.id && asset.state));

  const csrfHeaders = { ...firstHeaders, 'content-type': 'application/json', 'x-csrf-token': session.body.data.csrfToken };
  const invalidAvatar = await json(base, '/api/avatar-selection', { method: 'PUT', headers: csrfHeaders, body: JSON.stringify({ avatarId: 'not-owned' }) });
  assert.equal(invalidAvatar.response.status, 409);
  const selection = await json(base, '/api/avatar-selection', { method: 'PUT', headers: csrfHeaders, body: JSON.stringify({ avatarId: 'starter-avatar' }) });
  assert.equal(selection.body.data.selectedAvatarId, 'starter-avatar');
  const gameCreation = await json(base, '/api/game/session', { method: 'POST', headers: csrfHeaders, body: '{}' });
  assert.equal(gameCreation.response.status, 201);
  const game = await json(base, '/api/game/session', { headers: { cookie: `${first.cookie}; ${gameCreation.cookie}` } });
  assert.equal(game.body.data.accountId, first.body.data.account.accountId); assert.equal(game.body.data.selectedAvatar.id, 'starter-avatar');
  assert.equal((await json(base, '/api/game/session', { headers: firstHeaders })).response.status, 410);
  const bearerHeaders = { authorization: `Bearer ${first.body.data.sessionToken}`, 'x-csrf-token': first.body.data.csrfToken };
  assert.equal((await json(base, '/api/backpack', { headers: bearerHeaders })).body.data.accountId, first.body.data.account.accountId);
  assert.equal((await json(base, '/api/game/session', { method: 'POST', headers: bearerHeaders, body: '{}' })).response.status, 201, 'portable sessions can unlock RAD-TOX without a third-party cookie');
  const staleCookie = { ...bearerHeaders, cookie: 'mzk_session=expired-cookie' };
  assert.equal((await json(base, '/api/account/bootstrap', { headers: staleCookie })).body.data.account.accountId, first.body.data.account.accountId, 'a valid bearer session takes precedence over a stale cookie');
  const anonymousGame = await json(base, '/api/game/session', { method: 'POST', headers: { 'x-csrf-token': 'client-controlled' }, body: '{}' });
  assert.equal(anonymousGame.response.status, 401); assert.equal(anonymousGame.body.stage, 'authentication');
  const invalidBearer = await json(base, '/api/account/bootstrap', { headers: { authorization: 'Bearer invalid-session', cookie: first.cookie } });
  assert.equal(invalidBearer.response.status, 401, 'an invalid explicit bearer token is not replaced by a different cookie identity');
  const walletOnly = await json(base, '/api/access/wallet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: '0x1111111111111111111111111111111111111111' }) });
  const walletOnlyHeaders = { authorization: `Bearer ${walletOnly.body.data.sessionToken}`, 'x-csrf-token': walletOnly.body.data.csrfToken };
  const denied = await json(base, '/api/game/session', { method: 'POST', headers: walletOnlyHeaders, body: '{}' });
  assert.equal(denied.response.status, 403); assert.equal(denied.body.code, 'LOADOUT_ACCESS_REQUIRED'); assert.equal(denied.body.stage, 'entitlement');
  const otherGame = await json(base, '/api/game/session', { headers: { ...walletOnlyHeaders, 'x-game-session': gameCreation.body.data.gameSessionToken } });
  assert.equal(otherGame.response.status, 403, 'an unentitled account cannot use another account game session');
  const logout = await json(base, '/api/session', { method: 'DELETE', headers: bearerHeaders });
  assert.equal(logout.response.status, 200);
  assert.equal((await json(base, '/api/account/bootstrap', { headers: bearerHeaders })).response.status, 401, 'DELETE revokes the portable session');
  assert.equal((await json(base, '/api/does-not-exist')).body.code, 'API_ROUTE_NOT_FOUND');
});

test('production CORS origins receive complete credentialed preflight headers', async (t) => {
  const base = await runningServer(t);
  for (const origin of ['https://muzikaz.com', 'https://www.muzikaz.com', 'https://muzikazmodelmarket.onrender.com']) {
    const response = await fetch(base + '/api/access/activate', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type,Authorization,X-CSRF-Token,X-Game-Session,X-Idempotency-Key' } });
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), origin); assert.equal(response.headers.get('access-control-allow-credentials'), 'true'); assert.match(response.headers.get('access-control-allow-methods'), /OPTIONS/); assert.match(response.headers.get('access-control-allow-headers'), /X-Idempotency-Key/i); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const denied = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } }); assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'CORS_ORIGIN_DENIED');
});

test('subscriber credentials receive the same 500 MZK Loadout and portable session', async (t) => {
  const base = await runningServer(t);
  const login = await json(base, '/api/access/subscriber', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Subscriber', email: 'subscriber@example.com', password: 'secret7' }) });
  assert.equal(login.response.status, 200); assert.equal(login.body.data.account.mzkBalance, 500); assert.equal(login.body.data.account.loadoutAccess, true); assert.ok(login.body.data.sessionToken);
  const backpack = await json(base, '/api/backpack', { headers: { authorization: `Bearer ${login.body.data.sessionToken}` } });
  assert.equal(backpack.body.data.status, 'ready'); assert.equal(backpack.body.data.mzkBalance, 500); assert.ok(backpack.body.data.entitlements.includes('members-game'));
  const reopened = await json(base, '/api/access/subscriber', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Subscriber', email: 'subscriber@example.com', password: 'secret7' }) });
  assert.equal(reopened.body.data.account.accountId, login.body.data.account.accountId); assert.equal(reopened.body.data.account.mzkBalance, 500);
});
