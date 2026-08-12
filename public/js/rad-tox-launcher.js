/* One-click game bootstrap shared by desktop, mobile, Safari, and WebViews. */
(function () {
  'use strict';
  var requested = false;
  var button = document.querySelector('[data-house-start]');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  function event(name, detail) { try { return new CustomEvent(name, { detail: detail || {} }); } catch (ignore) { var fallback = document.createEvent('Event'); fallback.initEvent(name, true, true); fallback.detail = detail || {}; return fallback; } }
  function showError(message) { if (overlay) { overlay.classList.remove('is-loading'); overlay.classList.add('has-error'); } if (status) status.textContent = message + ' Reload the page to try again.'; }
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
  }
  if (button) button.addEventListener('click', function (click) { click.preventDefault(); begin(); }, { once: true });
  document.addEventListener('muzikaz:rad-tox-engine-ready', function () { document.dispatchEvent(event('muzikaz:rad-tox-request')); }, { once: true });
  document.addEventListener('muzikaz:rad-tox-stage', function (stage) { if (stage.detail && stage.detail.message && status) status.textContent = stage.detail.message; });
  document.addEventListener('muzikaz:rad-tox-native-error', function (failure) { showError((failure.detail && failure.detail.message) || 'The playable world could not be initialized.'); }, { once: true });
  // A glasses/browser handoff must deploy the same game as the visible Begin
  // button. It intentionally does not request an immersive session here:
  // browsers require the subsequent ENTER AR press to be a fresh user gesture.
  var params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') begin();
}());
