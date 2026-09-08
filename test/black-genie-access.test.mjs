import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the Black Genie gate offers the boots pass code on desktop and mobile devices', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');

  assert.match(source, /var SINGLE_PLAYER_PASSCODE = 'boots'/);
  assert.doesNotMatch(source, /isMobileDevice|matchMedia/);
  assert.match(source, /trim\(\)\.toLowerCase\(\) !== SINGLE_PLAYER_PASSCODE/);
  assert.match(source, /openGame\(button\)/, 'a valid pass code reuses the single-use game authorization');
});
