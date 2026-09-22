/* One-click game bootstrap shared by desktop, mobile, Safari, and WebViews. */
(function () {
  'use strict';
  var requested = false;
  var button = document.querySelector('[data-house-start]');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  var loginForm = document.getElementById('game-quick-login');
  var loginName = document.getElementById('game-login-name');
  var loginStatus = document.getElementById('game-login-status');
  var switchButton = document.getElementById('game-login-switch');
  var loadTimer = 0;
  function event(name, detail) { try { return new CustomEvent(name, { detail: detail || {} }); } catch (ignore) { var fallback = document.createEvent('Event'); fallback.initEvent(name, true, true); fallback.detail = detail || {}; return fallback; } }
  function showError(message) {
    clearTimeout(loadTimer); requested = false;
    if (overlay) { overlay.classList.remove('is-loading'); overlay.classList.add('has-error'); }
    if (button) { button.disabled = false; button.textContent = signedInEmail() ? 'Retry RAD-TOX' : 'Retry as guest'; }
    if (status) status.textContent = message + ' Check your connection, then tap Retry.';
  }
  function signedInEmail() {
    return localStorage.getItem('muzikazBottleMember') === 'true' ? (localStorage.getItem('muzikazBottleMemberEmail') || '').trim().toLowerCase() : '';
  }
  function renderLogin(email) {
    var active = Boolean(email);
    if (loginName) loginName.textContent = active ? email : 'Guest player';
    if (loginForm) loginForm.hidden = active;
    if (switchButton) switchButton.hidden = !active;
    if (button) button.textContent = active ? 'Begin RAD-TOX' : 'Play as guest';
    if (loginStatus) loginStatus.textContent = active ? 'Signed in — your Backpack is ready on this device.' : 'Use the same simple member login as the Bottle area.';
    var profileName = document.getElementById('game-profile-name');
    if (profileName) profileName.textContent = active ? email.split('@')[0] : 'Guest Player';
  }
  function begin() {
    if (requested) return;
    requested = true;
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    if (overlay) overlay.classList.add('is-loading');
    if (status) status.textContent = 'Loading game…';
    var module = document.createElement('script');
    module.type = 'module'; module.src = 'public/js/house-explorer-glb.js';
    module.onerror = function () { showError('The game engine could not be loaded.'); };
    document.body.appendChild(module);
    // Some mobile WebViews never fire an error when a module dependency stalls.
    // Recover the controls instead of leaving an endless loading overlay.
    loadTimer = setTimeout(function () { module.remove(); showError('The game engine took too long to load.'); }, 45000);
  }
  if (button) button.addEventListener('click', function (click) { click.preventDefault(); begin(); });
  if (loginForm) loginForm.addEventListener('submit', function (submit) {
    submit.preventDefault();
    if (!loginForm.reportValidity()) return;
    var email = String(new FormData(loginForm).get('email') || '').trim().toLowerCase();
    localStorage.setItem('muzikazBottleMember', 'true');
    localStorage.setItem('muzikazBottleMemberEmail', email);
    document.dispatchEvent(event('muzikaz:member-authenticated', { email: email }));
    renderLogin(email);
    begin();
  });
  if (switchButton) switchButton.addEventListener('click', function () {
    localStorage.removeItem('muzikazBottleMember');
    localStorage.removeItem('muzikazBottleMemberEmail');
    renderLogin('');
    if (loginForm) loginForm.querySelector('input[name="email"]').focus();
  });
  renderLogin(signedInEmail());
  document.addEventListener('muzikaz:rad-tox-engine-ready', function () { clearTimeout(loadTimer); document.dispatchEvent(event('muzikaz:rad-tox-request')); }, { once: true });
  document.addEventListener('muzikaz:rad-tox-stage', function (stage) { if (stage.detail && stage.detail.message && status) status.textContent = stage.detail.message; });
  document.addEventListener('muzikaz:rad-tox-native-error', function (failure) { showError((failure.detail && failure.detail.message) || 'The playable world could not be initialized.'); }, { once: true });
}());
