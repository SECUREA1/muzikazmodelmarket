import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the Black Genie gate offers the boots pass code only on mobile devices', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');

  assert.match(source, /var MOBILE_PASSCODE = 'boots'/);
  assert.match(source, /matchMedia\('\(max-width: 768px\)'\)\.matches \|\| navigator\.maxTouchPoints > 0/);
  assert.match(source, /form\.hidden = !isMobileDevice\(\)/);
  assert.match(source, /trim\(\)\.toLowerCase\(\) !== MOBILE_PASSCODE/);
  assert.match(source, /openGame\(button\)/, 'a valid mobile pass code reuses the single-use game authorization');
});
