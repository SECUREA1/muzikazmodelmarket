/* Cross-browser API connection shared by the avatar gate, game and live Crib. */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var configured = window.MUZIKAZ_API_BASE || window.MUZIKAZ_SHARED_AVATAR_API || root.getAttribute('data-api-base') || '';
  var staticHost = /(?:github\.io|pages\.dev|netlify\.app|vercel\.app)$/i.test(window.location.hostname) || window.location.protocol === 'file:';
  if (!configured && staticHost) configured = 'https://muzikazmodelmarket.onrender.com';
  var base;
  var hostedApi = new window.URL('https://muzikazmodelmarket.onrender.com');
  try {
    base = new window.URL(configured || window.location.origin, window.location.href);
    /* Never let an old http configuration create mixed-content failures on mobile. */
    if (window.location.protocol === 'https:' && base.protocol === 'http:') base.protocol = 'https:';
  } catch (ignore) {
    base = new window.URL(window.location.origin);
  }
  base = base.href.replace(/\/$/, '');

  /*
   * A branded/custom domain can be a static host even though its hostname does
   * not match one of the well-known static-host suffixes above. In that case a
   * relative API request receives the host's "API route not found" response.
   * Keep same-origin as the first choice, but move to the persistent service
   * when the response proves that the route itself is missing. Do not fail over
   * ordinary 404s (for example, an invalid access code).
   */
  function routeIsMissing(response) {
    if (response.status !== 404) return window.Promise.resolve(false);
    var contentType = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
    return response.clone().text().then(function (body) {
      if (!/json/i.test(contentType)) return true;
      try {
        var payload = JSON.parse(body);
        return /^(?:(?:api\s+)?route\s+(?:not\s+)?found|not found)[.!\s]*$/i.test(String(payload.message || payload.error || '').trim());
      } catch (ignore) {
        return true;
      }
    }, function () { return false; });
  }

  function useHostedApi() {
    if (new window.URL(base).origin === hostedApi.origin) return false;
    base = hostedApi.href.replace(/\/$/, '');
    window.MUZIKAZ_API_BASE = base;
    window.MUZIKAZ_SHARED_AVATAR_API = base;
    root.setAttribute('data-api-fallback', 'hosted');
    return true;
  }

  function url(path) {
    return new window.URL(path, base + '/').href;
  }

  function fetchApi(path, options) {
    options = options || {};
    var request = {};
    var key;
    for (key in options) if (Object.prototype.hasOwnProperty.call(options, key)) request[key] = options[key];
    request.headers = {};
    for (key in (options.headers || {})) if (Object.prototype.hasOwnProperty.call(options.headers, key)) request.headers[key] = options.headers[key];
    /* Portable sessions are tab-scoped and are never placed in URLs. */
    var portable = window.sessionStorage && window.sessionStorage.getItem('muzikazPortableSession');
    if (portable && !request.headers.Authorization && !request.headers.authorization) request.headers.Authorization = 'Bearer ' + portable;
    request.cache = options.cache || 'no-store';
    request.mode = 'cors';
    /* Preserve the account cookie when a branded frontend uses the hosted API. */
    request.credentials = 'include';
    var timeout = Number(options.timeout) || 15000;
    var retries = options.retries == null ? (/^(GET|HEAD)$/i.test(options.method || 'GET') ? 1 : 0) : Number(options.retries);
    delete request.timeout;
    delete request.retries;

    function attempt(remaining) {
      var timer;
      var expired = new window.Promise(function (_, reject) {
        timer = window.setTimeout(function () { reject(new Error('The MUZIKAZ API connection timed out.')); }, timeout);
      });
      return window.Promise.race([window.fetch(url(path), request), expired]).then(function (response) {
        window.clearTimeout(timer);
        if (response.status >= 500 && remaining > 0) return attempt(remaining - 1);
        return routeIsMissing(response).then(function (missing) {
          if (missing && useHostedApi()) return attempt(remaining);
          return response;
        });
      }, function (error) {
        window.clearTimeout(timer);
        /*
         * Some static hosts answer API requests without CORS headers. Browsers
         * expose that as a rejected fetch instead of the host's 404 response,
         * so the response-based fallback above never gets a chance to run.
         * Move POST requests (including access-code activation) to the account
         * service immediately as well; this does not consume a retry or ask the
         * member to submit their code a second time.
         */
        if (useHostedApi()) return attempt(remaining);
        if (remaining > 0) return attempt(remaining - 1);
        throw error;
      });
    }
    return attempt(retries);
  }

  window.MUZIKAZ_API_BASE = base;
  window.MUZIKAZ_SHARED_AVATAR_API = base;
  window.MUZIKAZ_API = { base: base, url: url, fetch: fetchApi };
  root.setAttribute('data-api-connected', 'true');
}(window, document));
