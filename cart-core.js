(function (root) {
  'use strict';

  const STORAGE_KEY = 'muzikazCheckoutCart';
  const LEGACY_KEYS = ['muzikazCart', 'muzikaz_cart', 'mzkCart', 'muzikaz-cart', 'checkoutCart', 'cart'];
  const MAX_ITEMS = 100;
  const MAX_QUANTITY = 99;
  const MAX_PAYLOAD_LENGTH = 100000;

  const text = (value, maximum = 300) => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
  const finiteMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1000000 ? Math.round(number * 100) / 100 : null;
  };
  const quantity = (value) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1 && number <= MAX_QUANTITY ? number : null;
  };
  function safeUrl(value, maximum = 2000) {
    const result = text(value, maximum);
    if (!result || /^(?:https?:|\/|\.\/|\.\.\/|data:image\/)/i.test(result)) return result;
    return '';
  }
  function normalizeDeliverable(value) {
    if (!value || typeof value !== 'object') return null;
    const modelUrl = safeUrl(value.modelUrl);
    if (!/\.(?:glb|gltf)(?:[?#]|$)/i.test(modelUrl)) return null;
    return { id: text(value.id || modelUrl, 200), name: text(value.name, 300) || '3D model', modelUrl, iosModelUrl: safeUrl(value.iosModelUrl), format: text(value.format, 12).toLowerCase() || 'glb', category: text(value.category, 100) || '3D Model' };
  }
  function normalizeItem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const name = text(value.name || value.title);
    const id = text(value.id || value.productId || value.listingId || value.sku || value.key, 300);
    const price = finiteMoney(value.unitPrice ?? value.price);
    const count = quantity(value.quantity ?? 1);
    if (!id || !name || price === null || count === null) return null;
    const item = {
      id, key: text(value.key, 500) || id, name, quantity: count, price,
      currency: text(value.currency, 12).toUpperCase() || 'USD',
      productType: text(value.productType || value.type || value.kind, 100) || 'STORE_ITEM',
      meta: text(value.meta, 1000), image: safeUrl(value.image || value.thumbnail),
      seller: text(value.seller || value.creator, 200), sku: text(value.sku || value.modelId || value.assetId, 200),
      listingId: text(value.listingId, 200), deliverable: normalizeDeliverable(value.deliverable)
    };
    return item;
  }
  function normalizeCart(value) {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
    const merged = new Map();
    for (const raw of value) {
      const item = normalizeItem(raw);
      if (!item) return null;
      const identity = `${item.listingId || item.id}|${item.sku}|${item.currency}`;
      const existing = merged.get(identity);
      if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + item.quantity);
      else merged.set(identity, item);
    }
    return [...merged.values()];
  }
  function encode(items) {
    const normalized = normalizeCart(items);
    if (!normalized?.length) return '';
    const bytes = new TextEncoder().encode(JSON.stringify(normalized));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(payload) {
    if (!payload || typeof payload !== 'string' || payload.length > MAX_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
      const json = new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
      return normalizeCart(JSON.parse(json));
    } catch (_) { return null; }
  }
  function checkoutUrl(items, base = 'checkout.html') {
    const url = new URL(base, root.location?.href || 'https://muzikaz.invalid/');
    const payload = encode(items);
    if (payload) url.searchParams.set('cart', payload); else url.searchParams.delete('cart');
    return url.origin === root.location?.origin ? `${url.pathname.split('/').pop() || 'checkout.html'}${url.search}${url.hash}` : url.href;
  }
  function restore(location = root.location) {
    const url = new URL(location.href);
    const queryPresent = url.searchParams.has('cart');
    const queryPayload = url.searchParams.get('cart');
    const legacyMatch = url.hash.match(/^#cart=([^&]*)/);
    // Query transport always has priority. A present but invalid query does not
    // fall through to a fragment, preventing ambiguous attacker-controlled input.
    const source = queryPresent ? 'query' : legacyMatch ? 'fragment' : '';
    const items = decode(queryPresent ? queryPayload : legacyMatch?.[1]);
    if (!items) return { restored: false, source };
    url.searchParams.delete('cart');
    if (source === 'fragment') url.hash = '';
    return { restored: true, source, items, cleanUrl: `${url.pathname}${url.search}${url.hash}` };
  }
  root.MuzikazCartCore = { STORAGE_KEY, LEGACY_KEYS, MAX_QUANTITY, normalizeItem, normalizeCart, encode, decode, checkoutUrl, restore };
}(window));
