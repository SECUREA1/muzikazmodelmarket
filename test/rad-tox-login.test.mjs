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
