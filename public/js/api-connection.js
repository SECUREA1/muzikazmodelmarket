/* Cross-browser API connection shared by the avatar gate, game and live Crib. */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var configured = window.MUZIKAZ_API_BASE || window.MUZIKAZ_SHARED_AVATAR_API || root.getAttribute('data-api-base') || '';
  var base;
  var hostedApi = new window.URL('https://muzikazmodelmarket.onrender.com');
  var compatibleRoutes = { '/api/access/activate': ['/api/access-codes/redeem', '/api/loadout-codes/redeem'] };
  var accountTokenMemory = '';
  var accountTokenVolatile = false;
  var gameTokenMemory = '';
  var gameTokenVolatile = false;
  try {
    base = new window.URL(configured || window.location.origin, window.location.href);
    if (!/^https?:$/.test(base.protocol) || !base.hostname) base = new window.URL(window.location.origin);
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
    var suppliedHeaders = options.headers || {};
    if (Array.isArray(suppliedHeaders)) suppliedHeaders.forEach(function (pair) { request.headers[pair[0]] = pair[1]; });
    else if (typeof suppliedHeaders.forEach === 'function') suppliedHeaders.forEach(function (value, name) { request.headers[name] = value; });
    else for (headerName in suppliedHeaders) if (Object.prototype.hasOwnProperty.call(suppliedHeaders, headerName)) request.headers[headerName] = suppliedHeaders[headerName];
    /* Third-party cookies are blocked by several browsers and embedded webviews.
     * Carry the same short-lived account session explicitly when the member site
     * and persistent API are on different origins. */
    var sessionToken = getSessionToken();
    var gameSessionToken = getGameSessionToken();
    var hasAuthorization = false;
    var hasGameSession = false;
    for (headerName in request.headers) { if (headerName.toLowerCase() === 'authorization') hasAuthorization = true; if (headerName.toLowerCase() === 'x-game-session') hasGameSession = true; }
    if (sessionToken && !hasAuthorization) request.headers.Authorization = 'Bearer ' + sessionToken;
    if (gameSessionToken && !hasGameSession) request.headers['X-Game-Session'] = gameSessionToken;
    request.cache = options.cache || 'no-store';
    request.mode = 'cors';
    /* Preserve the account cookie when a branded frontend uses the hosted API. */
    request.credentials = 'include';
    var timeout = Number(options.timeout) || 15000;
    var retries = options.retries == null ? (/^(GET|HEAD)$/i.test(options.method || 'GET') ? 1 : 0) : Number(options.retries);
    // Gameplay owns an aborting deadline that also covers the response body
    // and allows queued fetch completions after a long rendering task.
    var deadlineManaged = options.deadlineManaged === true && request.signal;
    delete request.timeout;
    delete request.retries;
    delete request.deadlineManaged;

    function attempt(remaining, requestPath, aliases) {
      requestPath = requestPath || path;
      aliases = aliases || (compatibleRoutes[path] || []).slice();
      var timer;
      var expired = deadlineManaged ? null : new window.Promise(function (_, reject) {
        timer = window.setTimeout(function () { reject(new Error('The MUZIKAZ API connection timed out.')); }, timeout);
      });
      var response = window.fetch(url(requestPath), request);
      return (deadlineManaged ? response : window.Promise.race([response, expired])).then(function (response) {
        window.clearTimeout(timer);
        var invalidation = window.Promise.resolve();
        if (response.status === 401 && sessionToken) {
          invalidation = response.clone().json().then(function (payload) {
            if (payload && /^(SESSION_REQUIRED|SESSION_INVALID|SESSION_EXPIRED|SESSION_REVOKED|ACCOUNT_NOT_FOUND)$/.test(payload.code || '') && getSessionToken() === sessionToken) setSessionToken('');
          }, function () {});
        }
        if (response.status >= 500 && remaining > 0) return attempt(remaining - 1, requestPath, aliases);
        return invalidation.then(function () { return routeIsMissing(response); }).then(function (missing) {
          /* Deployments can briefly serve the previous account-route contract
           * while Render rolls a new server revision. Try its equivalent route
           * in the same request so a valid code never strands the member on
           * members.html or asks them to submit the credential again. */
          if (missing && aliases.length) return attempt(remaining, aliases.shift(), aliases);
          /* A custom domain may expose a compatible health route while its
           * static deployment has no application routes. Route discovery is
           * therefore authoritative too: move the original request to the
           * persistent service once, rather than showing API_ROUTE_NOT_FOUND
           * in otherwise functional member-market panels. */
          if (missing && useHostedApi()) return confirm(base).then(function () { return attempt(remaining, path, (compatibleRoutes[path] || []).slice()); });
          return response;
        });
      }, function (error) {
        window.clearTimeout(timer);
        /* Never replay a credential after an ambiguous network failure. */
        if (remaining > 0) return attempt(remaining - 1, requestPath, aliases);
        throw error;
      });
    }
    return attempt(retries);
  }

  /* Resolve the API host before any login POST can leave the browser. */
  root.setAttribute('data-api-connected', 'pending');
  root.setAttribute('data-api-base', base);
  function probeHealth(candidate) {
    var timer;
    var controller = window.AbortController ? new window.AbortController() : null;
    var expired = new window.Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        var error = new Error('The game service is taking too long to respond. Please try again.');
        error.retryable = true;
        reject(error);
        if (controller) controller.abort();
      }, 10000);
    });
    var request = { method: 'GET', mode: 'cors', credentials: 'include', cache: 'no-store' };
    if (controller) request.signal = controller.signal;
    return window.Promise.race([window.Promise.resolve().then(function () {
      return window.fetch(new window.URL('/api/health', candidate + '/').href, request);
    }).then(function (response) {
      if (response.status >= 500) {
        var error = new Error('The game service is starting or temporarily unavailable. Please try again.');
        error.status = response.status; error.retryable = true;
        throw error;
      }
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.success !== true || payload.service !== 'muzikaz-member-market') throw new Error('The member API is unavailable. Please try signing in again.');
        return true;
      }, function () { throw new Error('The member API returned an invalid response. Check your connection and try again.'); });
    }), expired]).then(function (value) { window.clearTimeout(timer); return value; }, function (error) { window.clearTimeout(timer); throw error; });
  }
  function confirm(candidate) {
    var attempts = 0;
    function probe() {
      return probeHealth(candidate).catch(function (error) {
        // Deployment warm-up may briefly return an HTML 502/503. Retry only
        // this safe health check; passwords and gameplay writes are untouched.
        if (!error.retryable || attempts >= 2) throw error;
        var delay = ++attempts * 500;
        return new window.Promise(function (resolve) { window.setTimeout(resolve, delay); }).then(probe);
      });
    }
    return probe();
  }
  var connecting = null;
  function connect() {
    if (connecting) return connecting;
    root.setAttribute('data-api-connected', 'pending');
    connecting = confirm(base).catch(function (error) {
      if (!useHostedApi()) throw error;
      return confirm(base);
    }).then(function () {
      root.setAttribute('data-api-connected', 'true');
      root.setAttribute('data-api-base', base);
      return base;
    }, function (error) {
      connecting = null;
      root.setAttribute('data-api-connected', 'false');
      throw error;
    });
    if (window.MUZIKAZ_API) window.MUZIKAZ_API.ready = connecting;
    return connecting;
  }
  var ready = connect();
  /* Initial discovery may fail before any panel has subscribed. A later login
   * starts discovery again instead of retaining a permanently rejected promise. */
  ready.catch(function () {});
  function whenReady(signal) {
    function cancelled() { var error = new Error('The API request was cancelled.'); error.name = 'AbortError'; return signal.reason || error; }
    if (signal && signal.aborted) return window.Promise.reject(cancelled());
    var waiting = connect();
    if (signal) waiting = new window.Promise(function (resolve, reject) {
      function cleanup() { signal.removeEventListener('abort', abort); }
      function abort() { cleanup(); reject(cancelled()); }
      signal.addEventListener('abort', abort, { once: true });
      waiting.then(function (value) { cleanup(); resolve(value); }, function (error) { cleanup(); reject(error); });
    });
    return waiting.then(function () {
      if (signal && signal.aborted) throw cancelled();
      return base;
    });
  }
  function fetchApi(path, options) {
    return whenReady(options && options.signal).then(function () { return requestApi(path, options); });
  }

  function readJson(response, options) {
    var label = options && options.label || 'The member API';
    function invalid(cause) {
      var error = new Error(label + (response.status >= 500 ? ' is temporarily unavailable' : ' returned an invalid response') + '. Please try again.');
      error.code = 'INVALID_JSON_RESPONSE'; error.status = response.status; if (cause) error.cause = cause;
      return error;
    }
    var contentType = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
    if (/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) return window.Promise.reject(invalid());
    return window.Promise.resolve().then(function () { return response.json(); }).then(function (payload) {
      if (payload === null || typeof payload !== 'object') throw invalid();
      return payload;
    }, function (error) { if (error && error.name === 'AbortError') throw error; throw invalid(error); });
  }

  function tokenStorage(name) { try { return window[name] || null; } catch (ignore) { return null; } }
  function storedToken(name, key) {
    var storage = tokenStorage(name);
    try {
      if (!storage) return { available: false, value: '' };
      var value = storage.getItem(key) || '';
      if (value && !/^[\x21-\x7e]+$/.test(value)) { storage.removeItem(key); value = ''; }
      return { available: true, value: value };
    } catch (ignore) { return { available: false, value: '' }; }
  }
  function saveToken(name, key, value) {
    var storage = tokenStorage(name);
    try { if (!storage) return false; if (value) storage.setItem(key, value); else storage.removeItem(key); return true; } catch (ignore) { return false; }
  }

  function getSessionToken() {
    // A newer login (or logout) must win over a readable value that the browser
    // refused to replace or remove, even when storage failed only on writes.
    if (accountTokenVolatile) return accountTokenMemory;
    var local = storedToken('localStorage', 'muzikazAccountSessionToken'), session = storedToken('sessionStorage', 'muzikazAccountSessionToken');
    var token = local.value || session.value;
    if (token) {
      accountTokenMemory = token;
      if (saveToken('localStorage', 'muzikazAccountSessionToken', token)) saveToken('sessionStorage', 'muzikazAccountSessionToken', '');
      accountTokenVolatile = false;
      return token;
    }
    if (accountTokenVolatile || !local.available && !session.available) return accountTokenMemory;
    accountTokenMemory = ''; return '';
  }

  function setSessionToken(token) {
    accountTokenMemory = typeof token === 'string' && /^[\x21-\x7e]+$/.test(token) ? token : '';
    var saved = saveToken('localStorage', 'muzikazAccountSessionToken', accountTokenMemory);
    var temporary = saveToken('sessionStorage', 'muzikazAccountSessionToken', saved ? '' : accountTokenMemory);
    // A quota failure can leave an older local token behind. Remove it once
    // the replacement is safely held in the temporary store, including for
    // the next page, which cannot see this page's memory fallback.
    if (!saved && temporary) saveToken('localStorage', 'muzikazAccountSessionToken', '');
    var local = storedToken('localStorage', 'muzikazAccountSessionToken'), session = storedToken('sessionStorage', 'muzikazAccountSessionToken');
    accountTokenVolatile = Boolean(!saved && !temporary || local.value && local.value !== accountTokenMemory || !accountTokenMemory && (session.value || !saved || !temporary));
  }

  function getGameSessionToken() {
    if (gameTokenVolatile) return gameTokenMemory;
    var session = storedToken('sessionStorage', 'muzikazGameSessionToken');
    if (session.value) { gameTokenMemory = session.value; gameTokenVolatile = false; return session.value; }
    if (gameTokenVolatile || !session.available) return gameTokenMemory;
    gameTokenMemory = ''; return '';
  }

  function setGameSessionToken(token) {
    gameTokenMemory = typeof token === 'string' && /^[\x21-\x7e]+$/.test(token) ? token : '';
    gameTokenVolatile = !saveToken('sessionStorage', 'muzikazGameSessionToken', gameTokenMemory);
  }

  function logout(csrfToken) {
    return fetchApi('/api/session', { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken || '' }, retries: 0 }).then(function (response) {
      if (response.ok || response.status === 401) { setSessionToken(''); setGameSessionToken(''); }
      return response;
    }, function (error) {
      throw error;
    });
  }

  window.MUZIKAZ_API_BASE = base;
  window.MUZIKAZ_SHARED_AVATAR_API = base;
  window.MUZIKAZ_API = { base: base, url: url, fetch: fetchApi, whenReady: whenReady, readJson: readJson, ready: ready, getSessionToken: getSessionToken, setSessionToken: setSessionToken, getGameSessionToken: getGameSessionToken, setGameSessionToken: setGameSessionToken, logout: logout };
}(window, document));
