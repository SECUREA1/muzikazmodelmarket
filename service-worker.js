const CACHE = 'muzikaz-world-v2.2.0';
const BRAND_SHELL = [
  '/', '/index.html', '/styles.css', '/pwa.js', '/site.webmanifest',
  '/public/assets/muzikaz-world-logo.svg', '/muzikaz_bolt_logo_editable.svg',
  '/brand_name_tagline_panel_2x.png', '/logo_symbol_crop_2x_transparent.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(BRAND_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('muzikaz-world-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
