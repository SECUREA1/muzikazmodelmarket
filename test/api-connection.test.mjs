import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/js/api-connection.js', import.meta.url), 'utf8');

function loadConnection(fetch) {
  const attributes = {};
  const window = {
    URL,
    Promise,
    fetch,
    setTimeout,
    clearTimeout,
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
