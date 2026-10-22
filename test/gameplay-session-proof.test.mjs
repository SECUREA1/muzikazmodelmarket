import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('concurrent panel session reads preserve the proof used by ongoing gameplay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gameplay-session-proof-'));
  const previous = {...process.env};
  Object.assign(process.env, {
    MUZIKAZ_DATA_DIR: directory,
    MUZIKAZ_USER_DATABASE_FILE: join(directory, 'users.json'),
    MUZIKAZ_ACCOUNTS_FILE: join(directory, 'accounts.json'),
    MUZIKAZ_PAYMENT_ORDERS_FILE: join(directory, 'orders.json'),
    MUZIKAZ_CUSTOM_MAPS_FILE: join(directory, 'custom-maps.json'),
    MUZIKAZ_ENVIRONMENT_DATA_FILE: join(directory, 'environments.json'),
    MUZIKAZ_ACCOUNT_SESSIONS_FILE: join(directory, 'account-sessions.json'),
    MUZIKAZ_GAME_SESSIONS_FILE: join(directory, 'game-sessions.json')
  });
  try {
    const original = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
    const source = original
      .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL('../' + path, import.meta.url).href}'`)
      .replace(/server\.listen\(port,[^\n]+\);/, 'export {server};')
      .replace(/\nbackgroundJob\(\(\)=>snapshotServer\(\)\);/, '');
    const filename = join(directory, 'handler.mjs');
    await writeFile(filename, source);
    const {server} = await import(pathToFileURL(filename).href);
    const handler = server.listeners('request')[0];
    async function call(url, headers = {}, body) {
      const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
      Object.assign(request, {url, method: body ? 'POST' : 'GET', headers: {host: 'localhost', 'content-type': 'application/json', ...headers}, socket: {remoteAddress: '127.0.0.1'}});
      const result = {headers: {}};
      const response = {
        setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
        getHeader(key) { return result.headers[key.toLowerCase()]; },
        writeHead(status, headers = {}) { result.status = status; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); this.headersSent = true; },
        end(data) { result.body = JSON.parse(data); }
      };
      await handler(request, response);
      return result;
    }
    const login = await call('/api/access/free-play', {}, {username: 'GameplayProofPlayer', password: 'gameplay-proof-fixture'});
    assert.equal(login.status, 200);
    const cookieHeaders = {cookie: login.headers['set-cookie'].split(';')[0]};
    const session = await call('/api/game/room-session', cookieHeaders);
    assert.equal(session.status, 200);
    const proof = session.body.data.csrfToken;
    assert.ok(proof);
    const headers = {...cookieHeaders, 'x-csrf-token': proof};
    const endpoint = '/api/rooms/public-commons/gameplay';
    const joined = await call(endpoint, headers, {action: 'join', requestId: 'proof-join'});
    assert.equal(joined.status, 200);
    for (let round = 0; round < 3; round++) {
      const panels = await Promise.all(['/api/account/bootstrap', '/api/market/session', '/api/session', '/api/game/room-session'].map(path => call(path, cookieHeaders)));
      assert.ok(panels.every(panel => panel.status === 200));
      const movement = await call(endpoint, headers, {action: 'input', requestId: 'proof-move-' + round, inputEpoch: joined.body.data.inputEpoch, inputSequence: round + 1, input: {forward: round % 2 ? -1 : 1}});
      assert.equal(movement.status, 200, 'panel refreshes preserve the original gameplay proof');
      const state = movement.body.data;
      assert.equal(state.players[state.selfId].input.forward, round % 2 ? -1 : 1, 'the server applies the input');
    }
    for (const invalid of [cookieHeaders, {...cookieHeaders, 'x-csrf-token': 'invalid-proof'}]) {
      const denied = await call(endpoint, invalid, {action: 'input', requestId: 'denied-input', input: {forward: 1}});
      assert.equal(denied.status, 401);
      assert.equal(denied.body.code, 'CSRF_INVALID');
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(directory, {recursive: true, force: true});
  }
});
