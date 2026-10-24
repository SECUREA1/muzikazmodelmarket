const CACHE = 'muzikaz-world-v2.3.14-facility-controls';
const BRAND_SHELL = [
  '/favicon.ico', '/public/assets/app-icons/icon-192.png', '/public/assets/app-icons/icon-512.png',
  '/public/assets/app-icons/icon-maskable-512.png', '/public/assets/app-icons/apple-touch-icon.png',
  '/public/assets/app-icons/favicon-32.png', '/public/assets/app-icons/tile-150.png',
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
  // Account, inventory and telemetry responses must never enter offline caches.
  const requestedUrl=new URL(event.request.url);
  if (requestedUrl.pathname.startsWith('/api/') || requestedUrl.pathname.startsWith('/uploads/') || event.request.headers?.has('Authorization')) return;
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  // Revalidate stable entry points and modules even if an older deployment gave
  // the browser an hour-long freshness lifetime. Keep cached offline fallbacks.
  const revalidate=event.request.mode==='navigate'||/\.(?:html|js|mjs|css|json|webmanifest)$/i.test(requestedUrl.pathname);
  event.respondWith(fetch(event.request,revalidate?{cache:'no-cache'}:undefined).then((response) => {
    if (response.ok && !/(?:no-store|private)/i.test(response.headers.get('Cache-Control')||'')) {
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
