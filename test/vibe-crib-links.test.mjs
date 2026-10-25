import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gameUrl = 'model-explorer.html?environment=muzikaz-main&amp;house=muzikaz-main&amp;autoplay=1&amp;localFallback=1&amp;sandbox=1';

async function source(file) {
  return readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('Vibe Crib entries and shared world navigation retain a route to muzikaz-main', async () => {
  const entryPages = await Promise.all([
    'members.html',
    'index.html',
    'model-market.html',
    'token-mixer.html',
    'chaines-ar-collectibles.html',
    'model-explorer.html'
  ].map(source));

  for (const html of entryPages) assert.match(html, new RegExp(gameUrl.replace(/[?&]/g, '\\$&')));

  const header = await source('global-header.js');
  assert.match(header, /href="index\.html#world-map"/, 'shared navigation opens the public world directory');
  assert.match(await source('index.html'), /id="world-map"/, 'the directory anchor exists on the page containing the verified main entry');
  assert.match(await source('avatar-whitepaper.html'), /<script[^>]+src="global-header\.js"/, 'the white paper uses the shared navigation entry');

  const gallery = await source('public/js/model-gallery-core.js');
  assert.match(gallery, /model-explorer\.html\?environment=muzikaz-main&house=muzikaz-main&autoplay=1&localFallback=1&sandbox=1/);
});
