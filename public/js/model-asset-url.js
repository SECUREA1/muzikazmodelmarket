function browser() { return globalThis.window || globalThis; }
function pageUrl() {
  const location = browser().location || globalThis.location;
  return location?.href || (location?.origin ? location.origin + '/' : 'http://localhost/');
}

export function modelApiBase() {
  const win = browser(), api = win.MUZIKAZ_API;
  try { if (api?.url) return api.url('/'); } catch {}
  return api?.base || win.MUZIKAZ_API_BASE || globalThis.document?.documentElement?.dataset?.apiBase || new URL(pageUrl()).origin;
}

export function isModelUploadReference(value) {
  if (!value) return false;
  if (/^uploads\//.test(String(value))) return true;
  // An absolute service URL can be restored before API discovery has selected
  // that host. Wait for discovery for every upload path; credential scoping is
  // still decided separately against the selected origin after it completes.
  return /^\/uploads\//.test(new URL(String(value), pageUrl()).pathname);
}

// Repository files belong to the frontend release; persistent uploads belong
// to the selected API service. Explicit third-party model URLs retain their host.
export function resolveModelAssetUrl(value) {
  if (!value) return '';
  if (/^uploads\//.test(String(value))) return new URL('/' + value,modelApiBase()).href;
  const url = new URL(String(value), pageUrl()), site = new URL(pageUrl());
  if (/^\/uploads\//.test(url.pathname) && url.origin === site.origin) {
    return new URL(url.pathname + url.search + url.hash, modelApiBase()).href;
  }
  return url.href;
}

export function isApiModelAssetUrl(value) {
  const url = new URL(value, pageUrl());
  return /^\/uploads\//.test(url.pathname) && url.origin === new URL(modelApiBase(), pageUrl()).origin;
}
