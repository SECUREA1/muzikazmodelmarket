const CACHE = 'muzikaz-world-v2.6.20-header-radio-menu';
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
  if (requestedUrl.pathname.startsWith('/api/') || requestedUrl.pathname.startsWith('/uploads/') || event.request.headers?.has('Authorization') || event.request.headers?.has('Range') || event.request.cache==='no-store' || /(?:^|,)\s*no-store\b/i.test(event.request.headers?.get('Cache-Control')||'')) return;
  if (event.request.method !== 'GET' || requestedUrl.origin !== location.origin) return;
  // Revalidate stable entry points and modules even if an older deployment gave
  // the browser an hour-long freshness lifetime. Keep cached offline fallbacks.
  const revalidate=event.request.mode==='navigate'||/\.(?:html|js|mjs|css|json|webmanifest)$/i.test(requestedUrl.pathname);
  const expectedContent = (response) => {
    const type=response?.headers.get('Content-Type')||'';
    if(/\.(?:js|mjs)$/i.test(requestedUrl.pathname))return /(?:javascript|ecmascript)/i.test(type);
    if(/\.json$/i.test(requestedUrl.pathname))return /(?:application|text)\/(?:[\w.-]+\+)?json\b/i.test(type);
    if(/\.(?:glb|usdz|bin)$/i.test(requestedUrl.pathname))return /^(?:model\/|application\/octet-stream\b)/i.test(type);
    if(/\.(?:png|jpe?g|webp|gif|svg|ico|avif|ktx2)$/i.test(requestedUrl.pathname))return /^(?:image\/|application\/octet-stream\b)/i.test(type);
    if(/\.woff2?$/i.test(requestedUrl.pathname))return /^(?:font\/|application\/(?:font-|x-font-|octet-stream\b))/i.test(type);
    return true;
  };
  const storable=response=>response?.status===200&&expectedContent(response)&&!/(?:no-store|private)/i.test(response.headers.get('Cache-Control')||'')&&!/\*/.test(response.headers.get('Vary')||'');
  // Only explicitly public binary assets may skip fetch. Stable code, map JSON,
  // navigation and unknown routes always retain deployment revalidation.
  const reusableAsset=!revalidate&&(requestedUrl.pathname.startsWith('/public/')||BRAND_SHELL.includes(requestedUrl.pathname))&&/\.(?:glb|usdz|bin|ktx2|png|jpe?g|webp|gif|svg|ico|avif|woff2?)$/i.test(requestedUrl.pathname);
  const fresh=response=>{
    if(!storable(response))return false;
    const policy=response.headers.get('Cache-Control')||'',lifetime=/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i.exec(policy);
    if(!/(?:^|,)\s*public\s*(?:,|$)/i.test(policy)||/(?:^|,)\s*no-cache\b/i.test(policy)||!lifetime)return false;
    const now=Date.now(),date=Date.parse(response.headers.get('Date')||''),age=Number(response.headers.get('Age')||0),seconds=Number(lifetime[1]);
    // Include intermediary age conservatively. An absent/invalid server date
    // cannot grant a stored asset an unbounded new freshness lifetime.
    return Number.isFinite(date)&&date<=now&&Number.isFinite(age)&&age>=0&&Number.isSafeInteger(seconds)&&now-date+age*1000<seconds*1000;
  };
  const network=()=>fetch(event.request,revalidate?{cache:'no-cache'}:undefined).then((response) => {
    if (storable(response)) {
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
    }
    return response;
  });
  event.respondWith((async()=>{
    const force=event.request.cache==='reload'||event.request.cache==='no-cache'||/\b(?:no-cache|no-store|max-age\s*=\s*0)\b/i.test(event.request.headers?.get('Cache-Control')||'');
    if(reusableAsset&&!force){
      try{const cache=await caches.open(CACHE),cached=await cache.match?.(event.request);if(fresh(cached))return cached;}catch{/* An unavailable disk cache must not block a live asset. */}
    }
    return network();
  })().catch(async()=>{
    try{
      const cached=await caches.match(event.request);if(storable(cached))return cached;
      if(event.request.mode==='navigate'){const shell=await caches.match('/index.html');if(storable(shell))return shell;}
    }catch{/* Preserve fetch's failed-response behavior if offline storage fails. */}
    return Response.error();
  }));
});
