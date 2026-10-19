const RELEASE = 'development';
const CACHE = 'muzikaz-world-runtime-v3-' + RELEASE;
const BRAND_SHELL = [
  '/favicon.ico', '/public/assets/app-icons/icon-192.png', '/public/assets/app-icons/icon-512.png',
  '/public/assets/app-icons/icon-maskable-512.png', '/public/assets/app-icons/apple-touch-icon.png',
  '/public/assets/app-icons/favicon-32.png', '/public/assets/app-icons/tile-150.png',
  '/', '/index.html', '/styles.css', '/pwa.js', '/site.webmanifest',
  '/public/assets/muzikaz-world-logo.svg', '/muzikaz_bolt_logo_editable.svg',
  '/brand_name_tagline_panel_2x.png', '/logo_symbol_crop_2x_transparent.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(BRAND_SHELL.map(url=>new Request(url,{cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('muzikaz-world-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url=new URL(event.request.url);
  // Account, inventory and telemetry responses must never enter offline caches.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  const runtimeCode=/\.(?:m?js|css)$/i.test(url.pathname);
  const documentRequest=event.request.mode==='navigate'||/\.html?$/i.test(url.pathname);
  event.respondWith(fetch(event.request,{cache:runtimeCode||documentRequest?'no-cache':'default'}).then((response) => {
    // An unavailable engine should show a connection error, never silently run
    // a cached client against a newer live game protocol.
    if (response.ok&&!runtimeCode) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => runtimeCode?Response.error():caches.match(event.request).then((cached) => cached || (documentRequest ? caches.match('/index.html') : Response.error()))));
});
