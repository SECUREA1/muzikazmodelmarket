/* One-click game bootstrap shared by desktop, mobile, Safari, and WebViews. */
(function () {
  'use strict';
  var requested = false;
  var engineReady = false;
  var loadTimer = 0;
  var retryTimer = 0;
  var retryCount = 0;
  var playSessionKey = 'muzikaz.radTox.playing';
  var button = document.querySelector('[data-house-start]');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  function event(name, detail) { try { return new CustomEvent(name, { detail: detail || {} }); } catch (ignore) { var fallback = document.createEvent('Event'); fallback.initEvent(name, true, true); fallback.detail = detail || {}; return fallback; } }
  function clearLoadTimer() { if (loadTimer) window.clearTimeout(loadTimer); loadTimer = 0; }
  function rememberPlaying() { try { sessionStorage.setItem(playSessionKey, 'true'); } catch (ignore) {} }
  function wasPlaying() { try { return sessionStorage.getItem(playSessionKey) === 'true'; } catch (ignore) { return false; } }
  function retryAutomatically() {
    if (!wasPlaying() || retryTimer || retryCount >= 3) return;
    retryCount += 1;
    if (status) status.textContent = 'The game stopped while starting. Restoring your game automatically…';
    retryTimer = window.setTimeout(function () { retryTimer = 0; begin(); }, 1200);
  }
  function showError(message) {
    clearLoadTimer();
    requested = false;
    if (overlay) { overlay.classList.remove('is-loading'); overlay.classList.add('has-error'); }
    if (status) status.textContent = message + ' Select Try again to restart cleanly.';
    if (button) { button.disabled = false; button.textContent = 'Try again'; }
    retryAutomatically();
  }
  function showStall() {
    if (status) status.textContent = 'The game engine is still loading. Check your connection; this screen will continue automatically.';
  }
  function begin() {
    if (requested) return;
    rememberPlaying();
    requested = true;
    if (overlay) overlay.classList.remove('has-error');
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    if (overlay) overlay.classList.add('is-loading');
    if (status) status.textContent = 'Loading game…';
    if (engineReady) {
      document.dispatchEvent(event('muzikaz:rad-tox-request'));
      return;
    }
    var module = document.createElement('script');
    module.type = 'module'; module.src = 'public/js/house-explorer-glb.js';
    module.onerror = function () { showError('The game engine could not be loaded.'); };
    document.body.appendChild(module);
    loadTimer = window.setTimeout(showStall, 30000);
  }
  if (button) button.addEventListener('click', function (click) { click.preventDefault(); begin(); });
  document.addEventListener('muzikaz:rad-tox-engine-ready', function () { engineReady = true; clearLoadTimer(); document.dispatchEvent(event('muzikaz:rad-tox-request')); }, { once: true });
  document.addEventListener('muzikaz:gameplay-ready', function () { clearLoadTimer(); retryCount = 0; });
  document.addEventListener('muzikaz:rad-tox-stage', function (stage) { if (stage.detail && stage.detail.message && status) status.textContent = stage.detail.message; });
  document.addEventListener('muzikaz:rad-tox-native-error', function (failure) { showError((failure.detail && failure.detail.message) || 'The playable world could not be initialized.'); });
  if (wasPlaying()) window.setTimeout(begin, 0);
}());
