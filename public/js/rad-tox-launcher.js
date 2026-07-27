/* One-way RAD-TOX launcher: Begin, load to 100%, then reveal the running game. */
(function () {
  'use strict';

  var started = false;
  var progress = 0;
  var progressTimer = 0;

  function event(name) {
    try { return new window.CustomEvent(name); }
    catch (ignore) { var legacy = document.createEvent('Event'); legacy.initEvent(name, true, true); return legacy; }
  }

  function updateProgress(value, message) {
    var loader = document.getElementById('house-level-loader');
    var fill = loader && loader.querySelector('[data-level-loader-fill]');
    var percent = loader && loader.querySelector('[data-level-loader-percent]');
    var scale = loader && loader.querySelector('.house-level-loader__scale');
    var copy = loader && loader.querySelector('[data-level-loader-message]');
    progress = Math.max(progress, Math.min(100, Math.round(value)));
    if (fill) fill.style.width = progress + '%';
    if (percent) percent.textContent = progress + '%';
    if (scale) scale.setAttribute('aria-valuenow', String(progress));
    if (copy && message) copy.textContent = message;
  }

  function begin() {
    if (started) return;
    started = true;

    var start = document.getElementById('house-game-start');
    var loader = document.getElementById('house-level-loader');
    var button = document.querySelector('[data-house-start]');
    if (button) button.disabled = true;
    if (start) start.hidden = true;
    if (loader) loader.hidden = false;

    updateProgress(4, 'Loading the game…');
    progressTimer = window.setInterval(function () {
      if (progress < 90) updateProgress(progress + 2);
    }, 500);

    var module = document.createElement('script');
    module.type = 'module';
    module.src = 'public/js/house-explorer-glb.js';
    document.body.appendChild(module);
  }

  document.addEventListener('click', function (click) {
    var target = click.target;
    while (target && (!target.getAttribute || target.getAttribute('data-house-start') === null)) target = target.parentNode;
    if (!target) return;
    click.preventDefault();
    begin();
  }, true);

  document.addEventListener('muzikaz:rad-tox-engine-ready', function () {
    updateProgress(50, 'Loading level 1…');
    document.dispatchEvent(event('muzikaz:rad-tox-request'));
  });

  document.addEventListener('muzikaz:rad-tox-stage', function (stageEvent) {
    var detail = stageEvent.detail || {};
    if (detail.stage === 'loading-game') updateProgress(60, detail.message);
    if (detail.stage !== 'game-active') return;

    window.clearInterval(progressTimer);
    updateProgress(100, detail.message || 'Game ready.');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        var loader = document.getElementById('house-level-loader');
        if (loader) loader.hidden = true;
      });
    });
  });
}());
