import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/js/api-connection.js', import.meta.url), 'utf8');
function loadConnection(fetch, configured = '', storage = new Map()) {
  const attributes = configured ? { 'data-api-base': configured } : {};
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

test('health compatibility does not block username login on a rolling deployment', async () => {
  const requests = [];
  const { window, attributes } = loadConnection(async (url) => {
    requests.push(url);
    if (url.endsWith('/api/health')) return new Response(JSON.stringify({ success: true, service: 'muzikaz-member-market' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, 'https://muzikazmodelmarket.onrender.com');
  assert.equal((await window.MUZIKAZ_API.fetch('/api/access/free-play', { method: 'POST' })).status, 200);
  assert.deepEqual(requests, ['https://muzikazmodelmarket.onrender.com/api/health', 'https://muzikazmodelmarket.onrender.com/api/access/free-play']);
  assert.equal(attributes['data-api-connected'], 'true');
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

test('missing member-market routes on a custom domain retry against the hosted API', async () => {
  const requests = [];
  const { window, attributes } = loadConnection(async (url) => {
    requests.push(url);
    if (url.endsWith('/api/health')) return health();
    if (url === 'https://static.example/api/market/members') return new Response(JSON.stringify({ success: false, code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const response = await window.MUZIKAZ_API.fetch('/api/market/members');
  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    'https://static.example/api/health',
    'https://static.example/api/market/members',
    'https://muzikazmodelmarket.onrender.com/api/health',
    'https://muzikazmodelmarket.onrender.com/api/market/members'
  ]);
  assert.equal(attributes['data-api-base'], 'https://muzikazmodelmarket.onrender.com');
  assert.equal(attributes['data-api-fallback'], 'hosted');
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

test('game session token follows cross-origin RAD-TOX requests', async () => {
  let options; const { window } = loadConnection(async (url, request) => { if (url.endsWith('/api/health')) return health(); options = request; return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }, 'https://muzikazmodelmarket.onrender.com');
  window.MUZIKAZ_API.setGameSessionToken('game-portable');
  await window.MUZIKAZ_API.fetch('/api/game/session');
  assert.equal(options.headers['X-Game-Session'], 'game-portable');
  assert.equal(window.MUZIKAZ_API.getGameSessionToken(), 'game-portable');
});

test('login recovers after initial API discovery fails without reloading', async () => {
  let online = false; let posts = 0;
  const { window, attributes } = loadConnection(async (url) => {
    if (!online) throw new Error('offline');
    if (url.endsWith('/api/health')) return health();
    posts++; return new Response('{}');
  }, 'https://muzikazmodelmarket.onrender.com');
  await assert.rejects(window.MUZIKAZ_API.ready, /offline/);
  assert.equal(attributes['data-api-connected'], 'false');
  online = true;
  assert.equal((await window.MUZIKAZ_API.fetch('/api/access/free-play', {method:'POST'})).status, 200);
  assert.equal(posts, 1);
  assert.equal(attributes['data-api-connected'], 'true');
});

test('an unrelated successful health endpoint cannot receive member passwords', async () => {
  const posts = [];
  const {window} = loadConnection(async (url, request) => {
    if (url === 'https://static.example/api/health') return new Response(JSON.stringify({success:true}));
    if (url.endsWith('/api/health')) return health();
    posts.push([url, request.body]); return new Response('{}');
  });
  await window.MUZIKAZ_API.fetch('/api/access/free-play', {method:'POST', body:'credential'});
  assert.deepEqual(posts, [['https://muzikazmodelmarket.onrender.com/api/access/free-play','credential']]);
});

test('a failed credential request is never submitted twice', async () => {
  let posts = 0;
  const {window} = loadConnection(async url => {
    if (url.endsWith('/api/health')) return health();
    posts++; throw new Error('connection lost');
  });
  await assert.rejects(window.MUZIKAZ_API.fetch('/api/access/free-play', {method:'POST'}), /connection lost/);
  assert.equal(posts, 1);
});

test('service worker leaves authenticated API requests entirely on the network', async () => {
  const listeners = {};
  let intercepted = false;
  vm.runInNewContext(await readFile(new URL('../service-worker.js', import.meta.url), 'utf8'), {
    self: {addEventListener: (name, handler) => { listeners[name] = handler; }},
    URL, location: {origin:'https://muzikazmodelmarket.onrender.com'}
  });
  listeners.fetch({request:{url:'https://muzikazmodelmarket.onrender.com/api/market/session',method:'GET'},respondWith(){intercepted=true;}});
  assert.equal(intercepted, false);
});


test('account credentials survive a new page and logout clears the shared browser session', async () => {
  const storage = new Map();
  const fetch = async url => url.endsWith('/api/health') ? health() : new Response('{}');
  const first = loadConnection(fetch, 'https://muzikazmodelmarket.onrender.com', storage);
  first.window.MUZIKAZ_API.setSessionToken('persistent-account');
  const nextPage = loadConnection(fetch, 'https://muzikazmodelmarket.onrender.com', storage);
  assert.equal(nextPage.window.MUZIKAZ_API.getSessionToken(), 'persistent-account');
  await nextPage.window.MUZIKAZ_API.logout('csrf');
  assert.equal(first.window.MUZIKAZ_API.getSessionToken(), '');
});

test('invalid saved header tokens are cleared before browser fetch and valid drafts remain',async()=>{
 const storage=new Map([['l:muzikazAccountSessionToken','broken\nheader'],['s:muzikazGameSessionToken','雪'],['l:muzikaz.builder.scene','keep this map']]);
 const {window}=loadConnection(async(url,options)=>{new Headers(options?.headers);return health();},'',storage);
 await window.MUZIKAZ_API.fetch('/api/game/room-session');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'');assert.equal(window.MUZIKAZ_API.getGameSessionToken(),'');assert.equal(storage.get('l:muzikaz.builder.scene'),'keep this map');
});

test('a non-HTTP saved API base resets to the current web origin',async()=>{
 const paths=[];const {window}=loadConnection(async url=>{paths.push(url);return health();},'data:text/plain,broken');
 await window.MUZIKAZ_API.fetch('/api/market/session');assert.ok(paths.every(url=>url.startsWith('https://static.example/')));
});
