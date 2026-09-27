import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gameUrl = 'model-explorer.html?environment=muzikaz-main&amp;house=muzikaz-main&amp;autoplay=1&amp;localFallback=1&amp;sandbox=1';

async function source(file) {
  return readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('Vibe Crib entry links launch the stable muzikaz-main game environment', async () => {
  const entryPages = await Promise.all([
    'members.html',
    'index.html',
    'model-market.html',
    'avatar-whitepaper.html',
    'token-mixer.html',
    'chaines-ar-collectibles.html',
    'model-explorer.html'
  ].map(source));

  for (const html of entryPages) assert.match(html, new RegExp(gameUrl.replace(/[?&]/g, '\\$&')));

  const header = await source('global-header.js');
  assert.ok(header.includes(gameUrl), 'the shared World Map navigation should launch the game environment');

  const gallery = await source('public/js/model-gallery-core.js');
  assert.match(gallery, /model-explorer\.html\?environment=muzikaz-main&house=muzikaz-main&autoplay=1&localFallback=1&sandbox=1/);
});
