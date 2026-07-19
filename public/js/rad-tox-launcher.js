/* RAD-TOX launcher: deliberately ES5 so the start control remains usable when
 * a browser cannot load the module/WebGL explorer (including legacy webviews). */
(function () {
  'use strict';

  function signedIn() {
    return window.localStorage && window.localStorage.getItem('muzikazBottleMember') === 'true' && !!String(window.localStorage.getItem('muzikazBottleMemberEmail') || '').replace(/^\s+|\s+$/g, '');
  }

  function requestLogin() {
    var page = (window.location.pathname.split('/').pop() || 'index.html');
    var returnTo = page + '?play=rad-tox#house-explorer';
    try { window.sessionStorage.setItem('muzikazLoginRedirect', returnTo); } catch (ignore) {}
    window.location.href = 'members.html?login=required&redirect=' + encodeURIComponent(returnTo);
  }

  function setStatus(message) {
    var status = document.getElementById('house-status');
    var loadStatus = document.getElementById('house-game-load-status');
    if (status) status.innerHTML = message;
    if (loadStatus) loadStatus.innerHTML = message;
  }

  function startFallback() {
    var stage = document.querySelector('.house-stage');
    var screen = document.getElementById('house-game-start');
    if (!stage || stage.querySelector('.rad-tox-compat-game')) return;
    if (!signedIn()) { requestLogin(); return; }

    var game = document.createElement('section');
    game.className = 'rad-tox-compat-game';
    game.setAttribute('role', 'region');
    game.setAttribute('aria-label', 'RAD-TOX compatibility game');
    game.innerHTML = '<div class="rad-tox-compat-head"><strong>☢ RAD-TOX ACTIVE</strong><span data-rad-tox-score>Clear 0 / 12</span></div><p>Compatibility mode: tap every toxic bubble to clear the floor.</p><div class="rad-tox-compat-field" aria-live="polite"></div>';
    stage.appendChild(game);
    if (screen) screen.className += ' is-hidden';

    var score = 0;
    var scoreLabel = game.querySelector('[data-rad-tox-score]');
    var field = game.querySelector('.rad-tox-compat-field');
    function pop(event) {
      var bubble = event.currentTarget;
      if (bubble.getAttribute('data-popped')) return;
      bubble.setAttribute('data-popped', 'true');
      bubble.disabled = true;
      bubble.innerHTML = '✓';
      score += 1;
      scoreLabel.innerHTML = score >= 12 ? 'Floor cleared!' : 'Clear ' + score + ' / 12';
      setStatus(score >= 12 ? 'RAD-TOX complete! The compatibility floor is clear.' : 'Toxic bubble cleared. ' + (12 - score) + ' remain.');
    }
    for (var i = 0; i < 12; i += 1) {
      var bubble = document.createElement('button');
      bubble.type = 'button';
      bubble.className = 'rad-tox-compat-bubble';
      bubble.setAttribute('aria-label', 'Clear toxic bubble ' + (i + 1));
      bubble.style.left = (5 + ((i * 29) % 84)) + '%';
      bubble.style.top = (10 + ((i * 37) % 70)) + '%';
      bubble.innerHTML = '☢';
      bubble.addEventListener('click', pop, false);
      field.appendChild(bubble);
    }
    setStatus('RAD-TOX compatibility mode is active. Clear all toxic bubbles.');
  }

  function requestNativeStart() {
    var detail = { startNative: null };
    var event;
    if (typeof window.CustomEvent === 'function') event = new window.CustomEvent('muzikaz:rad-tox-request', { detail: detail });
    else { event = document.createEvent('Event'); event.initEvent('muzikaz:rad-tox-request', true, true); event.detail = detail; }
    document.dispatchEvent(event);
    if (typeof detail.startNative === 'function') detail.startNative();
    else startFallback();
  }

  document.addEventListener('click', function (event) {
    var button = event.target;
    while (button && button.id !== 'house-start-game') button = button.parentNode;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    requestNativeStart();
  }, true);

  document.addEventListener('muzikaz:rad-tox-native-error', startFallback, false);
}());
