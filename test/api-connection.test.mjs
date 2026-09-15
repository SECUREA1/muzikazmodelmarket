import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/js/api-connection.js', import.meta.url), 'utf8');
function loadConnection(fetch, configured = '') {
  const attributes = configured ? { 'data-api-base': configured } : {};
  const storage = new Map();
  const window = { URL, Promise, fetch, setTimeout, clearTimeout,
    localStorage: { getItem: k => storage.get('l:' + k) || null, setItem: (k,v) => storage.set('l:' + k,String(v)), removeItem: k => storage.delete('l:' + k) },
    sessionStorage: { getItem: k => storage.get('s:' + k) || null, setItem: (k,v) => storage.set('s:' + k,String(v)), removeItem: k => storage.delete('s:' + k) },
    location: { href: 'https://static.example/members.html', origin: 'https://static.example', hostname: 'static.example', protocol: 'https:' }
  };
  const document = { documentElement: { getAttribute: n => attributes[n] || '', setAttribute: (n,v) => { attributes[n] = v; } } };
  vm.runInNewContext(source, { window, document, JSON, Error });
  return { window, attributes };
}
const health = () => new Response(JSON.stringify({ success: true, service: 'muzikaz-member-market' }), { status: 200, headers: { 'content-type': 'application/json' } });

test('browser confirms Render before submitting a credential to a static host', async () => {
  const requests = [];
  const { window, attributes } = loadConnection(async (url) => {
    requests.push(url);
    if (url === 'https://static.example/api/health') return new Response('<html>static</html>', { status: 404, headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/api/health')) return health();
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' });
  assert.deepEqual(requests, ['https://static.example/api/health', 'https://muzikazmodelmarket.onrender.com/api/health', 'https://muzikazmodelmarket.onrender.com/api/access/activate']);
  assert.equal(attributes['data-api-connected'], 'true');
  assert.equal(attributes['data-api-base'], 'https://muzikazmodelmarket.onrender.com');
});

test('only explicit API_ROUTE_NOT_FOUND permits an activation alias', async () => {
  const requests = [];
  const { window } = loadConnection(async (url) => {
    requests.push(url);
    if (url.endsWith('/api/health')) return health();
    if (url.endsWith('/api/access/activate')) return new Response(JSON.stringify({ code: 'API_ROUTE_NOT_FOUND' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, 'https://muzikazmodelmarket.onrender.com');
  assert.equal((await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' })).status, 200);
  assert.deepEqual(requests.slice(1), ['https://muzikazmodelmarket.onrender.com/api/access/activate', 'https://muzikazmodelmarket.onrender.com/api/access-codes/redeem']);
});

test('invalid access and ambiguous static responses never replay a one-time activation', async () => {
  for (const response of [new Response(JSON.stringify({ code: 'ACCESS_CODE_INVALID' }), { status: 404, headers: { 'content-type': 'application/json' } }), new Response('<html>missing</html>', { status: 404, headers: { 'content-type': 'text/html' } })]) {
    let posts = 0; const { window } = loadConnection(async url => url.endsWith('/api/health') ? health() : (posts++, response.clone()), 'https://muzikazmodelmarket.onrender.com');
    assert.equal((await window.MUZIKAZ_API.fetch('/api/access/activate', { method: 'POST' })).status, 404); assert.equal(posts, 1);
  }
});

test('portable token is retained for unrelated 401 and cleared for account session errors', async () => {
  const responses = [new Response(JSON.stringify({ code: 'CSRF_INVALID' }), { status: 401, headers: { 'content-type': 'application/json' } }), new Response(JSON.stringify({ code: 'SESSION_EXPIRED' }), { status: 401, headers: { 'content-type': 'application/json' } })];
  let options; const { window } = loadConnection(async (url, request) => { if (url.endsWith('/api/health')) return health(); options = request; return responses.shift(); }, 'https://muzikazmodelmarket.onrender.com');
  window.MUZIKAZ_API.setSessionToken('portable'); await window.MUZIKAZ_API.fetch('/api/game/session', { method: 'POST' });
  assert.equal(options.headers.Authorization, 'Bearer portable'); assert.equal(window.MUZIKAZ_API.getSessionToken(), 'portable');
  await window.MUZIKAZ_API.fetch('/api/backpack'); assert.equal(window.MUZIKAZ_API.getSessionToken(), '');
});
