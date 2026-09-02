/* Cross-browser API connection shared by the avatar gate, game and live Crib. */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var configured = window.MUZIKAZ_API_BASE || window.MUZIKAZ_SHARED_AVATAR_API || root.getAttribute('data-api-base') || '';
  var staticHost = /(?:github\.io|pages\.dev|netlify\.app|vercel\.app)$/i.test(window.location.hostname) || window.location.protocol === 'file:';
  if (!configured && staticHost) configured = 'https://muzikazmodelmarket.onrender.com';
  var base;
  try {
    base = new window.URL(configured || window.location.origin, window.location.href);
    /* Never let an old http configuration create mixed-content failures on mobile. */
    if (window.location.protocol === 'https:' && base.protocol === 'http:') base.protocol = 'https:';
  } catch (ignore) {
    base = new window.URL(window.location.origin);
  }
  base = base.href.replace(/\/$/, '');

  function url(path) {
    return new window.URL(path, base + '/').href;
  }

  function fetchApi(path, options) {
    options = options || {};
    var request = {};
    var key;
    for (key in options) if (Object.prototype.hasOwnProperty.call(options, key)) request[key] = options[key];
    request.headers = options.headers || {};
    request.cache = options.cache || 'no-store';
    request.mode = 'cors';
    request.credentials = new window.URL(url(path)).origin === window.location.origin ? 'same-origin' : 'omit';
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
        return response;
      }, function (error) {
        window.clearTimeout(timer);
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
