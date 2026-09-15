/* Cross-browser API connection shared by the avatar gate, game and live Crib. */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var configured = window.MUZIKAZ_API_BASE || window.MUZIKAZ_SHARED_AVATAR_API || root.getAttribute('data-api-base') || '';
  var base;
  var hostedApi = new window.URL('https://muzikazmodelmarket.onrender.com');
  var compatibleRoutes = { '/api/access/activate': ['/api/access-codes/redeem', '/api/loadout-codes/redeem'] };
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
   * A route alias is safe only when an API response explicitly identifies a
   * missing route. HTML/static-host 404s are deliberately never retried after
   * a credential has been submitted.
   */
  function routeIsMissing(response) {
    if (response.status !== 404) return window.Promise.resolve(false);
    var contentType = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
    return response.clone().text().then(function (body) {
      if (!/json/i.test(contentType)) return false;
      try {
        var payload = JSON.parse(body);
        return payload && payload.code === 'API_ROUTE_NOT_FOUND';
      } catch (ignore) {
        return false;
      }
    }, function () { return false; });
  }

  function useHostedApi() {
    if (new window.URL(base).origin === hostedApi.origin) return false;
    base = hostedApi.href.replace(/\/$/, '');
    window.MUZIKAZ_API_BASE = base;
    window.MUZIKAZ_SHARED_AVATAR_API = base;
    if (window.MUZIKAZ_API) window.MUZIKAZ_API.base = base;
    root.setAttribute('data-api-base', base);
    root.setAttribute('data-api-fallback', 'hosted');
    return true;
  }

  function url(path) {
    return new window.URL(path, base + '/').href;
  }

  function requestApi(path, options) {
    options = options || {};
    var request = {};
    var key;
    for (key in options) if (Object.prototype.hasOwnProperty.call(options, key)) request[key] = options[key];
    request.headers = {};
    var headerName;
    for (headerName in (options.headers || {})) if (Object.prototype.hasOwnProperty.call(options.headers, headerName)) request.headers[headerName] = options.headers[headerName];
    /* Third-party cookies are blocked by several browsers and embedded webviews.
     * Carry the same short-lived account session explicitly when the member site
     * and persistent API are on different origins. */
    var sessionToken = getSessionToken();
    var hasAuthorization = false;
    for (headerName in request.headers) if (headerName.toLowerCase() === 'authorization') hasAuthorization = true;
    if (sessionToken && !hasAuthorization) request.headers.Authorization = 'Bearer ' + sessionToken;
    request.cache = options.cache || 'no-store';
    request.mode = 'cors';
    /* Preserve the account cookie when a branded frontend uses the hosted API. */
    request.credentials = 'include';
    var timeout = Number(options.timeout) || 15000;
    var retries = options.retries == null ? (/^(GET|HEAD)$/i.test(options.method || 'GET') ? 1 : 0) : Number(options.retries);
    delete request.timeout;
    delete request.retries;

    function attempt(remaining, requestPath, aliases) {
      requestPath = requestPath || path;
      aliases = aliases || (compatibleRoutes[path] || []).slice();
      var timer;
      var expired = new window.Promise(function (_, reject) {
        timer = window.setTimeout(function () { reject(new Error('The MUZIKAZ API connection timed out.')); }, timeout);
      });
      return window.Promise.race([window.fetch(url(requestPath), request), expired]).then(function (response) {
        window.clearTimeout(timer);
        var invalidation = window.Promise.resolve();
        if (response.status === 401 && sessionToken) {
          invalidation = response.clone().json().then(function (payload) {
            if (payload && /^(SESSION_REQUIRED|SESSION_INVALID|SESSION_EXPIRED|SESSION_REVOKED|ACCOUNT_NOT_FOUND)$/.test(payload.code || '')) setSessionToken('');
          }, function () {});
        }
        if (response.status >= 500 && remaining > 0) return attempt(remaining - 1, requestPath, aliases);
        return invalidation.then(function () { return routeIsMissing(response); }).then(function (missing) {
          /* Deployments can briefly serve the previous account-route contract
           * while Render rolls a new server revision. Try its equivalent route
           * in the same request so a valid code never strands the member on
           * members.html or asks them to submit the credential again. */
          if (missing && aliases.length) return attempt(remaining, aliases.shift(), aliases);
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
        if (remaining > 0) return attempt(remaining - 1, requestPath, aliases);
        throw error;
      });
    }
    return attempt(retries);
  }

  /* Resolve the API host before any login POST can leave the browser. */
  root.setAttribute('data-api-connected', 'pending');
  root.setAttribute('data-api-base', base);
  function confirm(candidate) {
    return window.fetch(new window.URL('/api/health', candidate + '/').href, { method: 'GET', mode: 'cors', credentials: 'include', cache: 'no-store' }).then(function (response) {
      return response.clone().json().then(function (payload) {
        if (!response.ok || !payload || payload.service !== 'muzikaz-member-market') throw new Error('Not the MUZIKAZ member API.');
        return true;
      });
    });
  }
  var ready = confirm(base).catch(function () {
    useHostedApi();
    return confirm(base);
  }).then(function () {
    root.setAttribute('data-api-connected', 'true');
    root.setAttribute('data-api-base', base);
    return base;
  }, function (error) {
    root.setAttribute('data-api-connected', 'false');
    throw error;
  });
  function fetchApi(path, options) { return ready.then(function () { return requestApi(path, options); }); }

  function getSessionToken() {
    try {
      var token = window.sessionStorage.getItem('muzikazAccountSessionToken') || '';
      window.localStorage.removeItem('muzikazAccountSessionToken');
      return token;
    } catch (ignore) { return ''; }
  }

  function setSessionToken(token) {
    try {
      if (token) window.sessionStorage.setItem('muzikazAccountSessionToken', token);
      else window.sessionStorage.removeItem('muzikazAccountSessionToken');
      window.localStorage.removeItem('muzikazAccountSessionToken');
    } catch (ignore) {}
  }

  function logout(csrfToken) {
    return fetchApi('/api/session', { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken || '' }, retries: 0 }).then(function (response) {
      if (response.ok || response.status === 401) { setSessionToken(''); try { window.sessionStorage.removeItem('muzikazGameSessionToken'); } catch (ignore) {} }
      return response;
    }, function (error) {
      throw error;
    });
  }

  window.MUZIKAZ_API_BASE = base;
  window.MUZIKAZ_SHARED_AVATAR_API = base;
  window.MUZIKAZ_API = { base: base, url: url, fetch: fetchApi, ready: ready, getSessionToken: getSessionToken, setSessionToken: setSessionToken, logout: logout };
}(window, document));
