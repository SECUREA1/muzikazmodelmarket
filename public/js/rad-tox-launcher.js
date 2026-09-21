/* One-click game bootstrap shared by desktop, mobile, Safari, and WebViews. */
(function () {
  'use strict';
  var requested = false;
  var button = document.querySelector('[data-house-start]');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  var loginName = document.getElementById('game-login-name');
  var loginLink = document.getElementById('game-login-link');
  var avatarField = document.getElementById('game-avatar-field');
  var avatarSelect = document.getElementById('game-avatar-select');
  var accountData = null;
  var csrfToken = '';
  var apiFetch = function (path, options) { return window.MUZIKAZ_API ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options); };
  function event(name, detail) { try { return new CustomEvent(name, { detail: detail || {} }); } catch (ignore) { var fallback = document.createEvent('Event'); fallback.initEvent(name, true, true); fallback.detail = detail || {}; return fallback; } }
  function payload(result) { return result && result.data ? result.data : result; }
  function json(response) { return response.json().catch(function () { return {}; }).then(function (result) { if (!response.ok || result.success === false) throw new Error(result.message || result.error || 'The game service did not respond.'); return payload(result); }); }
  function showError(message) { requested = false; if (overlay) { overlay.classList.remove('is-loading'); overlay.classList.add('has-error'); } if (button) { button.disabled = false; button.textContent = accountData ? 'Try again' : 'Begin solo game'; } if (status) status.textContent = message; }
  function setDesignatedAvatar(avatar) {
    if (!avatar) return;
    var selected = { id: avatar.id, displayName: avatar.name || 'Player avatar', modelUrl: avatar.modelUrl, scale: avatar.scale || 1, rotation: avatar.rotation || 0, animation: 'auto' };
    window.MUZIKAZ_DESIGNATED_AVATAR = selected;
    try { localStorage.setItem('muzikazDesignatedAvatar', JSON.stringify(selected)); } catch (ignore) {}
    window.dispatchEvent(event('muzikaz-avatar-ready', selected));
  }
  function renderAccount(data) {
    accountData = data; csrfToken = data.csrfToken || '';
    var backpack = data.backpack || {}; var avatars = (backpack.avatars || []).filter(function (avatar) { return avatar.eligible !== false && avatar.modelUrl; });
    if (loginName) loginName.textContent = (data.account && data.account.username) || 'Loadout player';
    if (loginLink) { loginLink.hidden = false; loginLink.textContent = 'Switch'; }
    if (avatarField) avatarField.hidden = avatars.length === 0;
    if (avatarSelect) {
      avatarSelect.replaceChildren.apply(avatarSelect, avatars.map(function (avatar) { var option = document.createElement('option'); option.value = avatar.id; option.textContent = avatar.name; option.selected = avatar.id === backpack.selectedAvatarId; return option; }));
      setDesignatedAvatar(avatars.find(function (avatar) { return avatar.id === avatarSelect.value; }) || avatars[0]);
    }
    if (button) button.textContent = 'Start multiplayer game';
    if (status) status.textContent = 'Backpack ready. Choose your avatar, then start RAD-TOX with this account.';
    document.dispatchEvent(event('muzikaz:backpack-game-ready', data));
  }
  function loadAccount() {
    return apiFetch('/api/account/bootstrap', { cache: 'no-store', credentials: 'include' }).then(json).then(renderAccount).catch(function () {
      accountData = null; csrfToken = '';
      if (loginName) loginName.textContent = 'Guest player · solo mode';
      if (loginLink) { loginLink.hidden = false; loginLink.textContent = 'Backpack login'; }
      if (avatarField) avatarField.hidden = true;
      if (button) button.textContent = 'Begin solo game';
      if (status) status.textContent = 'Play solo now, or sign in to your Backpack to select an avatar and join multiplayer.';
      return null;
    });
  }
  function prepareSession() {
    if (!accountData) return Promise.resolve(null);
    var selectedId = avatarSelect && avatarSelect.value;
    var headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
    var selection = selectedId && selectedId !== accountData.backpack.selectedAvatarId
      ? apiFetch('/api/avatar-selection', { method: 'PUT', credentials: 'include', headers: headers, body: JSON.stringify({ avatarId: selectedId }) }).then(json)
      : Promise.resolve();
    return selection.then(function () {
      var avatar = (accountData.backpack.avatars || []).find(function (item) { return item.id === selectedId; }); setDesignatedAvatar(avatar);
      return apiFetch('/api/game/session', { method: 'POST', credentials: 'include', headers: headers, body: '{}' }).then(json);
    }).then(function (game) {
      if (game && game.gameSessionToken && window.MUZIKAZ_API && window.MUZIKAZ_API.setGameSessionToken) window.MUZIKAZ_API.setGameSessionToken(game.gameSessionToken);
      document.dispatchEvent(event('muzikaz:rad-tox-session-ready', { account: accountData, game: game }));
      return game;
    });
  }
  function loadEngine() {
    var module = document.createElement('script');
    module.type = 'module'; module.src = 'public/js/house-explorer-glb.js';
    module.onerror = function () { showError('The game engine could not be loaded. Check your connection and try again.'); };
    document.body.appendChild(module);
  }
  function begin() {
    if (requested) return;
    requested = true;
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    if (overlay) overlay.classList.add('is-loading');
    if (status) status.textContent = 'Loading game…';
    Promise.resolve(window.MUZIKAZ_GAME_BOOTSTRAP).then(prepareSession).then(loadEngine).catch(function (failure) { showError((failure && failure.message) || 'Your Backpack could not start the game. Please sign in again.'); });
  }
  window.MUZIKAZ_GAME_BOOTSTRAP = loadAccount();
  if (avatarSelect) avatarSelect.addEventListener('change', function () { var avatars = accountData && accountData.backpack && accountData.backpack.avatars || []; setDesignatedAvatar(avatars.find(function (avatar) { return avatar.id === avatarSelect.value; })); });
  if (button) button.addEventListener('click', function (click) { click.preventDefault(); begin(); });
  document.addEventListener('muzikaz:rad-tox-engine-ready', function () { document.dispatchEvent(event('muzikaz:rad-tox-request')); }, { once: true });
  document.addEventListener('muzikaz:rad-tox-stage', function (stage) { if (stage.detail && stage.detail.message && status) status.textContent = stage.detail.message; });
  document.addEventListener('muzikaz:rad-tox-native-error', function (failure) { showError((failure.detail && failure.detail.message) || 'The playable world could not be initialized.'); }, { once: true });
}());
