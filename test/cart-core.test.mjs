import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function core(href = 'https://host-a.example/index.html') {
  const window = { location: new URL(href), TextEncoder, TextDecoder, URL, btoa, atob };
  vm.runInNewContext(fs.readFileSync('cart-core.js', 'utf8'), { window, TextEncoder, TextDecoder, URL, btoa, atob });
  return window.MuzikazCartCore;
}
const product = (id, price, quantity = 1, extra = {}) => ({ id, key: id, name: `Unicode ⚡ ${id}`, price, quantity, ...extra });

test('multi-item portable query is normalized, deduplicated, cross-host restorable and cleaned', () => {
  const source = core();
  const url = source.checkoutUrl([product('a', 10), product('b', 4.25), product('a', 10)], 'https://host-b.example/checkout.html?campaign=crew');
  assert.match(url, /^https:\/\/host-b\.example\/checkout\.html\?campaign=crew&cart=/);
  const destination = core(url); const restored = destination.restore(new URL(url));
  assert.equal(restored.restored, true); assert.equal(restored.items.length, 2);
  assert.equal(restored.items[0].quantity, 2); assert.equal(restored.items.reduce((sum, item) => sum + item.price * item.quantity, 0), 24.25);
  assert.equal(restored.cleanUrl, '/checkout.html?campaign=crew');
  assert.equal(destination.normalizeCart(restored.items).length, 2);
});

test('legacy fragment remains supported and query takes deterministic priority', () => {
  const api = core(); const payload = api.encode([product('legacy', 12)]);
  assert.equal(api.restore(new URL(`https://b.example/checkout.html#cart=${payload}`)).items[0].id, 'legacy');
  const invalidQuery = api.restore(new URL(`https://b.example/checkout.html?cart=bad!#cart=${payload}`));
  assert.equal(invalidQuery.restored, false); assert.equal(invalidQuery.source, 'query');
});

test('malformed, unsafe, oversized and invalid values never restore', () => {
  const api = core();
  for (const payload of ['', '%', 'not-json', 'x'.repeat(100001)]) assert.equal(api.decode(payload), null);
  for (const value of [{}, [product('', 2)], [product('a', -1)], [product('a', 2, 0)], [product('a', 2, Infinity)]]) assert.equal(api.normalizeCart(value), null);
  const normalized = api.normalizeCart([product('safe', 1.005, 1, { unknown: '<script>', image: 'javascript:alert(1)' })]);
  assert.equal(normalized[0].price, 1); assert.equal(normalized[0].image, ''); assert.equal('unknown' in normalized[0], false);
});

test('empty carts do not produce a transport parameter and quantities are capped', () => {
  const api = core();
  assert.equal(api.encode([]), ''); assert.equal(api.checkoutUrl([], 'checkout.html?campaign=x'), 'checkout.html?campaign=x');
  assert.equal(api.normalizeCart([product('a', 1, 99), product('a', 1, 99)])[0].quantity, 99);
});
