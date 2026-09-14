/* Server-authoritative gate shared by standalone member tools. */
(function (window, document) {
  'use strict';
  var root = document.documentElement;
  var section = root.getAttribute('data-member-section') || 'members';
  root.classList.add('member-access-pending');

  function safeReturnLocation() {
    return window.location.pathname.replace(/^\//, '') + window.location.search + window.location.hash;
  }
  function sendToLogin() {
    try { window.sessionStorage.setItem('muzikazLoginRedirect', safeReturnLocation()); } catch (ignore) {}
    window.location.replace('members.html?return=' + encodeURIComponent(safeReturnLocation()) + '#bottle-login');
  }
  function verify() {
    if (!window.MUZIKAZ_API || !window.MUZIKAZ_API.fetch) return window.Promise.reject(new Error('Member API connection is unavailable.'));
    return window.MUZIKAZ_API.fetch('/api/member/access?section=' + encodeURIComponent(section), { headers: { Accept: 'application/json' }, retries: 1 }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || !payload.success || !payload.data || payload.data.allowed !== true) throw new Error(payload.message || 'Member access is required.');
        window.MuzikazMemberAccess = payload.data;
        root.classList.remove('member-access-pending');
        root.classList.add('member-access-granted');
        document.dispatchEvent(new window.CustomEvent('muzikaz:member-access', { detail: payload.data }));
        return payload.data;
      });
    });
  }
  window.MUZIKAZ_MEMBER_READY = (window.MUZIKAZ_API && window.MUZIKAZ_API.ready ? window.MUZIKAZ_API.ready : window.Promise.resolve()).then(verify).catch(function () { sendToLogin(); return null; });
}(window, document));
