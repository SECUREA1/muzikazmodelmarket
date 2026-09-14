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

test('every resolved login keeps authoritative permissions before opening restricted controls', async () => {
  const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.match(source, /backpack: session\.backpack/);
  assert.match(source, /permissions: session\.permissions/);
  assert.match(source, /if \(permissions\.members !== true\)/, 'an account without member permission must stay outside the restricted area');
  assert.match(source, /lockedContent\.hidden = false/);
  for (const credentialButton of ['bottle-wallet-connect', 'meknx-wallet-entry', 'loadout-code-redeem', 'account-wallet-validate', 'admin-game-bypass-button', 'bottle-backpack-loadout']) {
    const html = await readFile(new URL('../members.html', import.meta.url), 'utf8');
    assert.match(html, new RegExp(`id="${credentialButton}"`), `${credentialButton} remains connected to a credential resolver`);
  }
});

test('the owner word submits directly to the complete members API flow', async () => {
  const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.match(source, /adminBypassPassword\?\.addEventListener\('keydown'/, 'the password field handles keyboard submission itself');
  assert.match(source, /if \(event\.key !== 'Enter'\) return;/, 'Enter cannot fall through to the surrounding wallet form');
  for (const permission of ['members', 'backpack', 'creatorTools', 'marketplace', 'games', 'world']) {
    assert.ok(source.includes(`permissions.${permission} !== true`), `admin entry verifies ${permission} access before unlocking the UI`);
  }
  assert.match(source, /const redirect = window\.sessionStorage\.getItem\('muzikazLoginRedirect'\);[\s\S]*window\.location\.href = redirect;/, 'admin entry returns the member to the originally requested protected page');
});
