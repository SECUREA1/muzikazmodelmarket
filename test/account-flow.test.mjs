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
  assert.equal((await json(base, '/api/game/session', { headers: firstHeaders })).response.status, 401);
  const bearerHeaders = { authorization: `Bearer ${first.body.data.sessionToken}`, 'x-csrf-token': first.body.data.csrfToken };
  assert.equal((await json(base, '/api/backpack', { headers: bearerHeaders })).body.data.accountId, first.body.data.account.accountId);
  assert.equal((await json(base, '/api/game/session', { method: 'POST', headers: bearerHeaders, body: '{}' })).response.status, 201, 'portable sessions can unlock RAD-TOX without a third-party cookie');
  assert.equal((await json(base, '/api/does-not-exist')).body.code, 'API_ROUTE_NOT_FOUND');
});
