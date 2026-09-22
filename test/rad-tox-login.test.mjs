import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RAD-TOX offers an inline desktop member login and keeps guest play available', async () => {
  const [page, launcher] = await Promise.all([
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8')
  ]);

  assert.match(page, /id="game-quick-login"/);
  assert.match(page, /name="email"[^>]*autocomplete="email"/);
  assert.match(page, /name="passcode"[^>]*autocomplete="current-password"/);
  assert.match(page, />Play as guest</);
  assert.match(launcher, /localStorage\.setItem\('muzikazBottleMember', 'true'\)/);
  assert.match(launcher, /localStorage\.setItem\('muzikazBottleMemberEmail', email\)/);
  assert.match(launcher, /renderLogin\(signedInEmail\(\)\)/);
  assert.doesNotMatch(launcher, /\/api\/access\//, 'the quick login stays browser-only and cannot stall on an API request');
});

test('RAD-TOX mobile loading recovers and multiplayer starts for guests', async () => {
  const [launcher, multiplayer, server] = await Promise.all([
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/crib-multiplayer.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(launcher, /setTimeout\(function \(\) \{ module\.remove\(\); showError/);
  assert.match(launcher, /button\.disabled = false/, 'a stalled mobile module must leave a usable Retry button');
  assert.doesNotMatch(multiplayer, /muzikazBottleMember'\) !== 'true'/, 'guests are not discarded before multiplayer starts');
  assert.match(multiplayer, /starter-avatar/);
  const routes = server.slice(server.indexOf("'/api/houses/ioncore-house/events'"), server.indexOf("url.pathname.startsWith('/api/')"));
  assert.doesNotMatch(routes, /accountSession\(req, res\)/, 'public presence and chat do not require a member cookie');
});
