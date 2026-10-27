import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/js/api-connection.js', import.meta.url), 'utf8');
function loadConnection(fetch, configured = '', storage = new Map(), timers = {}) {
  const attributes = configured ? { 'data-api-base': configured } : {};
  const window = { URL, Promise, AbortController, fetch, setTimeout, clearTimeout, ...timers,
    localStorage: { getItem: k => storage.get('l:' + k) || null, setItem: (k,v) => storage.set('l:' + k,String(v)), removeItem: k => storage.delete('l:' + k) },
    sessionStorage: { getItem: k => storage.get('s:' + k) || null, setItem: (k,v) => storage.set('s:' + k,String(v)), removeItem: k => storage.delete('s:' + k) },
    location: { href: 'https://static.example/members.html', origin: 'https://static.example', hostname: 'static.example', protocol: 'https:' }
  };
  const document = { documentElement: { getAttribute: n => attributes[n] || '', setAttribute: (n,v) => { attributes[n] = v; } } };
  vm.runInNewContext(source, { window, document, JSON, Error });
  return { window, attributes };
}
const health = () => new Response(JSON.stringify({ success: true, service: 'muzikaz-member-market' }), { status: 200, headers: { 'content-type': 'application/json' } });

const fastRecovery = {setTimeout:(fn,delay)=>setTimeout(fn,delay===10000?10000:0)};
test('hosted startup retries temporary deployment pages before sending a single credential',async()=>{
  const requests=[];let probes=0;
  const {window,attributes}=loadConnection(async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/api/health'))return ++probes<3?new Response('<html>Starting</html>',{status:503,headers:{'content-type':'text/html'}}):health();
    return Response.json({success:true});
  },'https://muzikazmodelmarket.onrender.com',new Map(),fastRecovery);
  window.MUZIKAZ_API.setSessionToken('retained-member');
  await window.MUZIKAZ_API.fetch('/api/access/free-play',{method:'POST',body:'password-fixture'});
  assert.equal(probes,3);assert.equal(attributes['data-api-connected'],'true');
  assert.equal(requests.filter(request=>request.options.method==='POST').length,1);
  assert.equal(requests.at(-1).options.headers.Authorization,'Bearer retained-member');
});

test('permanent deployment failure is bounded and preserves the member without submitting credentials',async()=>{
  let probes=0,posts=0;
  const {window,attributes}=loadConnection(async(url,options)=>{
    if(options.method==='POST')posts++;
    probes++;return new Response('<html>Unavailable</html>',{status:502});
  },'https://muzikazmodelmarket.onrender.com',new Map(),fastRecovery);
  window.MUZIKAZ_API.setSessionToken('retained-member');
  await assert.rejects(window.MUZIKAZ_API.fetch('/api/access/free-play',{method:'POST'}),/starting or temporarily unavailable/);
  assert.equal(probes,3);assert.equal(posts,0);assert.equal(attributes['data-api-connected'],'false');
  assert.equal(window.MUZIKAZ_API.getSessionToken(),'retained-member');
});

test('cancelled model discovery leaves the shared connection usable and never sends the stale asset request',async()=>{
  let complete;const requests=[],probe=new Promise(resolve=>{complete=resolve;});
  const {window}=loadConnection(async(url,options)=>{requests.push({url,options});return url.endsWith('/api/health')?probe:Response.json({success:true});},'https://muzikazmodelmarket.onrender.com');
  const controller=new AbortController(),cancelled=window.MUZIKAZ_API.fetch('/uploads/assets/stale.glb',{signal:controller.signal});
  controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  complete(health());await window.MUZIKAZ_API.fetch('/api/models');
  assert.deepEqual(requests.map(request=>new URL(request.url).pathname),['/api/health','/api/models']);
  assert.equal(requests[0].options.signal.aborted,false,'one abandoned model must not cancel shared startup discovery');
});

test('timed-out health probes abort their transport before recovery starts another probe',async()=>{
  let active=0,maximum=0,aborted=0;
  const {window}=loadConnection((url,options)=>new Promise((resolve,reject)=>{
    active++;maximum=Math.max(maximum,active);
    options.signal.addEventListener('abort',()=>{active--;aborted++;reject(options.signal.reason);},{once:true});
  }),'https://muzikazmodelmarket.onrender.com',new Map(),{setTimeout:(fn,delay)=>setTimeout(fn,delay===10000?5:0)});
  await assert.rejects(window.MUZIKAZ_API.ready,/taking too long/);
  assert.equal(aborted,3);assert.equal(active,0);assert.equal(maximum,1);
});

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

test('member bearer sessions use sessionStorage when localStorage is blocked', async()=>{
 const storage=new Map();let sent;
 const transport=async(url,options)=>{if(url.endsWith('/api/health'))return health();sent=new Headers(options.headers);return new Response('{}');};
 const first=loadConnection(transport,'https://muzikazmodelmarket.onrender.com',storage);
 Object.defineProperty(first.window,'localStorage',{get(){throw Error('Storage blocked');}});
 first.window.MUZIKAZ_API.setSessionToken('member-portable');
 first.window.MUZIKAZ_API.setGameSessionToken('game-portable');
 await first.window.MUZIKAZ_API.fetch('/api/backpack');
 assert.equal(sent.get('authorization'),'Bearer member-portable');
 assert.equal(sent.get('x-game-session'),'game-portable');
 assert.equal(storage.get('s:muzikazAccountSessionToken'),'member-portable');
 const next=loadConnection(transport,'https://muzikazmodelmarket.onrender.com',storage);
 Object.defineProperty(next.window,'localStorage',{get(){throw Error('Storage blocked');}});
 assert.equal(next.window.MUZIKAZ_API.getSessionToken(),'member-portable','portable account remains available on another page');
 await next.window.MUZIKAZ_API.logout('csrf');
 assert.equal(next.window.MUZIKAZ_API.getSessionToken(),'');
 assert.equal(next.window.MUZIKAZ_API.getGameSessionToken(),'');
});

test('quota failures do not discard login tokens or restore them after logout',async()=>{
 let sent;const {window}=loadConnection(async(url,options)=>{if(url.endsWith('/api/health'))return health();sent=new Headers(options.headers);return new Response('{}');});
 window.localStorage.setItem=()=>{throw Error('Quota exceeded');};
 window.MUZIKAZ_API.setSessionToken('member-quota');
 await window.MUZIKAZ_API.fetch('/api/wallet/state');
 assert.equal(sent.get('authorization'),'Bearer member-quota');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'member-quota');
 await window.MUZIKAZ_API.logout('csrf');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'');
});

test('a quota-blocked account replacement removes the old local token before the next page',async()=>{
 const storage=new Map([['l:muzikazAccountSessionToken','old-account']]);let sent;
 const transport=async(url,options)=>{if(url.endsWith('/api/health'))return health();sent=new Headers(options.headers);return new Response('{}');};
 const first=loadConnection(transport,'https://muzikazmodelmarket.onrender.com',storage);
 first.window.localStorage.setItem=()=>{throw Error('Quota exceeded');};
 first.window.MUZIKAZ_API.setSessionToken('new-account');
 await first.window.MUZIKAZ_API.fetch('/api/backpack');
 assert.equal(sent.get('authorization'),'Bearer new-account');
 assert.equal(storage.has('l:muzikazAccountSessionToken'),false,'the old persistent login cannot outrank the new temporary session');
 const next=loadConnection(transport,'https://muzikazmodelmarket.onrender.com',storage);
 assert.equal(next.window.MUZIKAZ_API.getSessionToken(),'new-account');
});

test('new credentials and logout tombstones take priority over read-only stale storage',async()=>{
 const storage=new Map([['l:muzikazAccountSessionToken','old-account'],['s:muzikazAccountSessionToken','old-temporary'],['s:muzikazGameSessionToken','old-game']]);const sent=[];
 const {window}=loadConnection(async(url,options)=>{if(url.endsWith('/api/health'))return health();sent.push(new Headers(options.headers));return new Response('{}');},'https://muzikazmodelmarket.onrender.com',storage);
 for(const name of ['localStorage','sessionStorage'])for(const operation of ['setItem','removeItem'])window[name][operation]=()=>{throw Error('Storage is read only');};
 window.MUZIKAZ_API.setSessionToken('new-account');window.MUZIKAZ_API.setGameSessionToken('new-game');
 await window.MUZIKAZ_API.fetch('/api/backpack');
 assert.equal(sent[0].get('authorization'),'Bearer new-account');assert.equal(sent[0].get('x-game-session'),'new-game');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'new-account');assert.equal(window.MUZIKAZ_API.getGameSessionToken(),'new-game');
 await window.MUZIKAZ_API.logout('csrf');await window.MUZIKAZ_API.fetch('/api/health-check');
 assert.equal(storage.get('l:muzikazAccountSessionToken'),'old-account','the browser really retained its old value');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'');assert.equal(window.MUZIKAZ_API.getGameSessionToken(),'');
 assert.equal(sent.at(-1).has('authorization'),false);assert.equal(sent.at(-1).has('x-game-session'),false);
});

test('the current page remains authenticated when both browser storage areas are unavailable',async()=>{
 const requests=[];const {window}=loadConnection(async(url,options)=>{if(url.endsWith('/api/health'))return health();requests.push(new Headers(options.headers));return new Response('{}');});
 for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){throw Error('Denied');}});
 window.MUZIKAZ_API.setSessionToken('memory-member');window.MUZIKAZ_API.setGameSessionToken('memory-game');
 await window.MUZIKAZ_API.fetch('/api/backpack');
 assert.equal(requests[0].get('authorization'),'Bearer memory-member');assert.equal(requests[0].get('x-game-session'),'memory-game');
 await window.MUZIKAZ_API.logout('csrf');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'');assert.equal(window.MUZIKAZ_API.getGameSessionToken(),'');
});

test('an invalid local token does not erase a valid temporary member session',async()=>{
 const storage=new Map([['l:muzikazAccountSessionToken','bad\nheader'],['s:muzikazAccountSessionToken','valid-session']]);
 const {window}=loadConnection(async()=>health(),'https://muzikazmodelmarket.onrender.com',storage);
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'valid-session');
 assert.equal(storage.get('l:muzikazAccountSessionToken'),'valid-session');
 assert.equal(storage.has('s:muzikazAccountSessionToken'),false);
 storage.delete('l:muzikazAccountSessionToken');
 assert.equal(window.MUZIKAZ_API.getSessionToken(),'','cleared shared storage cannot resurrect a cached credential');
});

test('Headers and header tuples preserve caller authorization and CSRF values',async()=>{
 const sent=[];const {window}=loadConnection(async(url,options)=>{if(url.endsWith('/api/health'))return health();sent.push(new Headers(options.headers));return new Response('{}');});
 window.MUZIKAZ_API.setSessionToken('default-member');
 for(const headers of [new Headers({'X-CSRF-Token':'csrf','Authorization':'Bearer explicit'}),[['X-CSRF-Token','csrf'],['Authorization','Bearer explicit']]])
  await window.MUZIKAZ_API.fetch('/api/member-action',{method:'POST',headers});
 for(const headers of sent){assert.equal(headers.get('authorization'),'Bearer explicit');assert.equal(headers.get('x-csrf-token'),'csrf');}
});

test('member API JSON decoding reports deployment failures without a raw parser exception',async()=>{
 const {window}=loadConnection(async()=>health());
 const api=window.MUZIKAZ_API;
 for(const response of [new Response('<html>Updating</html>',{status:503,headers:{'content-type':'text/html'}}),new Response('{broken',{status:502}),new Response('null'),new Response('true')])
  await assert.rejects(api.readJson(response),error=>error.code==='INVALID_JSON_RESPONSE'&&error.status===response.status&&/Please try again/.test(error.message));
 const result={success:false,code:'SESSION_REQUIRED',message:'Sign in'};
 assert.deepEqual(await api.readJson(new Response(JSON.stringify(result))),result,'valid API errors retain their canonical code and message');
 const aborted=new Error('Cancelled');aborted.name='AbortError';
 await assert.rejects(api.readJson({status:200,headers:new Headers(),json:()=>Promise.reject(aborted)}),error=>error===aborted);
});
