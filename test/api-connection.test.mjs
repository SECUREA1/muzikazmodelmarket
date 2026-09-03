import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/js/api-connection.js', import.meta.url), 'utf8');

function loadConnection(fetch) {
  const attributes = {};
  const storage = new Map();
  const window = {
    URL,
    Promise,
    fetch,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: (key) => storage.get('local:' + key) || null, setItem: (key, value) => storage.set('local:' + key, String(value)), removeItem: (key) => storage.delete('local:' + key) },
    sessionStorage: { getItem: (key) => storage.get('session:' + key) || null, setItem: (key, value) => storage.set('session:' + key, String(value)), removeItem: (key) => storage.delete('session:' + key) },
    location: {
      href: 'https://world.muzikaz.example/members.html',
      origin: 'https://world.muzikaz.example',
      hostname: 'world.muzikaz.example',
      protocol: 'https:'
    }
  };
  const document = {
    documentElement: {
      getAttribute: (name) => attributes[name] || '',
      setAttribute: (name, value) => { attributes[name] = value; }
    }
  };
  vm.runInNewContext(source, { window, document, JSON, Error });
  return { window, attributes };
}

test('custom static domains retry missing API routes on the hosted account service', async () => {
  const requests = [];
  const { window, attributes } = loadConnection(async (url) => {
    requests.push(url);
    if (requests.length === 1) return new Response(JSON.stringify({ message: 'API route not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const response = await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    'https://world.muzikaz.example/api/access/activate',
    'https://muzikazmodelmarket.onrender.com/api/access/activate'
  ]);
  assert.equal(window.MUZIKAZ_API_BASE, 'https://muzikazmodelmarket.onrender.com');
  assert.equal(attributes['data-api-fallback'], 'hosted');
});

test('an invalid access code response is not mistaken for a missing API route', async () => {
  const requests = [];
  const { window } = loadConnection(async (url) => {
    requests.push(url);
    return new Response(JSON.stringify({ success: false, message: 'This MZK Access Code is invalid.' }), { status: 404, headers: { 'content-type': 'application/json' } });
  });

  const response = await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' });
  assert.equal(response.status, 404);
  assert.deepEqual(requests, ['https://world.muzikaz.example/api/access/activate']);
});

test('punctuated route-not-found responses retry on the hosted account service', async () => {
  const requests = [];
  const { window } = loadConnection(async (url) => {
    requests.push(url);
    if (requests.length === 1) return new Response(JSON.stringify({ message: 'API route not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const response = await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    'https://world.muzikaz.example/api/access/activate',
    'https://muzikazmodelmarket.onrender.com/api/access/activate'
  ]);
});

test('access-code submission negotiates the legacy activation route during a rolling deploy', async () => {
  const requests = [];
  const { window } = loadConnection(async (url) => {
    requests.push(url);
    if (requests.length < 3) return new Response(JSON.stringify({ code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const response = await window.MUZIKAZ_API.fetch('/api/access-codes/redeem', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    'https://world.muzikaz.example/api/access-codes/redeem',
    'https://muzikazmodelmarket.onrender.com/api/access-codes/redeem',
    'https://muzikazmodelmarket.onrender.com/api/access/activate'
  ]);
});

test('CORS-style fetch failures retry POST activation without another user submission', async () => {
  const requests = [];
  const { window, attributes } = loadConnection(async (url) => {
    requests.push(url);
    if (requests.length === 1) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const response = await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    'https://world.muzikaz.example/api/access/activate',
    'https://muzikazmodelmarket.onrender.com/api/access/activate'
  ]);
  assert.equal(attributes['data-api-fallback'], 'hosted');
});

test('hosted account requests include the session cookie needed by paid loadout follow-ups', async () => {
  let requestOptions;
  const { window } = loadConnection(async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await window.MUZIKAZ_API.fetch('/api/account/loadout/paid', { method: 'POST' });
  assert.equal(requestOptions.credentials, 'include');
});

test('portable account sessions authorize cross-origin game requests when cookies are blocked', async () => {
  let requestOptions;
  const { window } = loadConnection(async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ success: true }), { status: 201, headers: { 'content-type': 'application/json' } });
  });
  window.MUZIKAZ_API.setSessionToken('portable-session');
  await window.MUZIKAZ_API.fetch('/api/game/session', { method: 'POST', headers: { 'X-CSRF-Token': 'csrf' } });
  assert.equal(requestOptions.headers.Authorization, 'Bearer portable-session');
  assert.equal(requestOptions.headers['X-CSRF-Token'], 'csrf');
});

test('session invalidation and logout remove the portable credential', async () => {
  const responses = [new Response(JSON.stringify({ code: 'SESSION_REQUIRED' }), { status: 401, headers: { 'content-type': 'application/json' } }), new Response(JSON.stringify({ success: true }), { status: 200 })];
  const { window } = loadConnection(async () => responses.shift());
  window.MUZIKAZ_API.setSessionToken('expired-session');
  await window.MUZIKAZ_API.fetch('/api/backpack');
  assert.equal(window.MUZIKAZ_API.getSessionToken(), '');
  window.MUZIKAZ_API.setSessionToken('active-session');
  await window.MUZIKAZ_API.logout('csrf-token');
  assert.equal(window.MUZIKAZ_API.getSessionToken(), '');
});
