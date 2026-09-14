import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('standalone audio member pages use the shared server access gate', async () => {
  for (const page of ['token-mixer.html', 'voice-changer.html', 'quest-board.html']) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /data-member-section="audio"/);
    assert.match(html, /public\/js\/api-connection\.js/);
    assert.match(html, /public\/js\/member-page-access\.js/);
  }
  const gate = await readFile(new URL('../public/js/member-page-access.js', import.meta.url), 'utf8');
  assert.match(gate, /\/api\/member\/access\?section=/);
  assert.match(gate, /muzikazLoginRedirect/);
  assert.match(gate, /members\.html\?return=/);
});

test('members login consumes only a same-site return path', async () => {
  const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('return'\)/);
  assert.match(source, /!\/\^\(\?:\[a-z\]/, 'absolute and protocol-relative return URLs are rejected');
});
