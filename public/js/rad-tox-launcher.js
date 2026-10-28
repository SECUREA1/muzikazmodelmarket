import {activateGameAudio,mountGameAudioActivation} from './game-audio-activation.js';

/* One-click game bootstrap shared by desktop, mobile, Safari, and WebViews. */
(function () {
  'use strict';
  mountGameAudioActivation();
  var requested = false;
  var engineReady = false;
  var moduleFailed = false;
  var gameplayReady = false;
  var restarting = false;
  var launchRevision = 0;
  var loadTimer = 0;
  var button = document.querySelector('[data-house-start]');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  function event(name, detail) { try { return new CustomEvent(name, { detail: detail || {} }); } catch (ignore) { var fallback = document.createEvent('Event'); fallback.initEvent(name, true, true); fallback.detail = detail || {}; return fallback; } }
  function clearLoadTimer() { if (loadTimer) window.clearTimeout(loadTimer); loadTimer = 0; }
  function showError(message, needsRestart) {
    clearLoadTimer();
    launchRevision++;
    requested = false;
    gameplayReady = false;
    moduleFailed = Boolean(needsRestart);
    document.body.dataset.gameControls='pending';
    if (overlay) { overlay.classList.remove('is-loading'); overlay.classList.add('has-error'); }
    if (status) status.textContent = /try again/i.test(message) ? message : message + ' Select Try again to restart cleanly.';
    if (button) { button.disabled = false; button.textContent = 'Try again'; }
  }
  function showStall(revision) {
    if (revision !== launchRevision || !requested || engineReady || restarting) return;
    if (status) status.textContent = 'The game engine is still loading. Check your connection; this screen will continue automatically.';
  }
  function restartDocument() {
    // Browsers retain a rejected module evaluation in this document's module
    // map. A new import URL alone also retains any half-installed listeners.
    // Restart only after an explicit retry, preserving the selected world.
    restarting = true;
    requested = true;
    clearLoadTimer();
    launchRevision++;
    if (button) { button.disabled = true; button.textContent = 'Restarting…'; }
    if (status) status.textContent = 'Restarting the game with current code…';
    document.body.dataset.gameControls='loading';
    var target = new URL(window.location.href);
    target.searchParams.set('autoplay', '1');
    target.searchParams.set('gameRecovery', Date.now().toString(36) + '-' + launchRevision);
    window.location.replace(target.href);
  }
  function begin() {
    if (requested || restarting) return;
    if (moduleFailed) { restartDocument(); return; }
    var revision = ++launchRevision;
    requested = true;
    gameplayReady = false;
    document.body.dataset.gameControls='loading';
    if (overlay) overlay.classList.remove('has-error');
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    if (overlay) overlay.classList.add('is-loading');
    if (status) status.textContent = 'Loading game…';
    clearLoadTimer();
    if (engineReady) {
      document.dispatchEvent(event('muzikaz:rad-tox-request'));
      return;
    }
    var enginePath = './house-explorer-glb.js?v=startup-recovery-20261027';
    var recovery = new URLSearchParams(window.location.search).get('gameRecovery');
    if (recovery) enginePath += '&recovery=' + encodeURIComponent(recovery);
    loadTimer = window.setTimeout(function () { showStall(revision); }, 30000);
    import(enginePath).catch(function (error) {
      if (revision !== launchRevision || !requested || gameplayReady || restarting) return;
      showError('The game engine could not start: ' + (error && error.message || 'Please reload this page.'), true);
    });
  }
  if (button) button.addEventListener('click', function (click) { click.preventDefault(); activateGameAudio(); begin(); });
  document.addEventListener('muzikaz:rad-tox-engine-ready', function () {
    if (restarting) return;
    engineReady = true;
    clearLoadTimer();
    if (requested) document.dispatchEvent(event('muzikaz:rad-tox-request'));
  }, { once: true });
  document.addEventListener('muzikaz:gameplay-ready', function () {
    if (restarting) return;
    gameplayReady = true;
    clearLoadTimer();
    document.body.dataset.gameControls='ready';
  });
  document.addEventListener('muzikaz:rad-tox-stage', function (stage) { if (!restarting && stage.detail && stage.detail.message && status) status.textContent = stage.detail.message; });
  document.addEventListener('muzikaz:rad-tox-native-error', function (failure) {
    if (!restarting) showError((failure.detail && failure.detail.message) || 'The playable world could not be initialized.', moduleFailed || !engineReady);
  });
  // Builder TEST GAME links have always used autoplay=1. The engine is loaded
  // on demand now, so consume that launch contract here; waiting for its own
  // autoplay check would deadlock behind the Begin Game overlay.
  if (new URLSearchParams(window.location.search).get('autoplay') === '1') begin();
}());
