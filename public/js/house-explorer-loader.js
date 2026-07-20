/* Loads the heavyweight WebGL game only when a player chooses the 3D experience. */
(function () {
  'use strict';
  var started = false;

  function event(name, detail) {
    var e;
    try { e = new CustomEvent(name, { detail: detail || {} }); }
    catch (ignore) { e = document.createEvent('Event'); e.initEvent(name, true, true); e.detail = detail || {}; }
    document.dispatchEvent(e);
  }

  function loadEngine() {
    if (started) return;
    started = true;
    event('muzikaz:rad-tox-stage', { stage: 'loading-engine', message: 'Loading the mobile-ready 3D game…' });
    var script = document.createElement('script');
    script.type = 'module';
    script.src = 'public/js/house-explorer-glb.js';
    script.onerror = function () {
      event('muzikaz:rad-tox-native-error', { stage: '3D game download', message: 'The 3D game could not be downloaded.' });
    };
    document.head.appendChild(script);
  }

  document.addEventListener('muzikaz:rad-tox-load-engine', loadEngine);
  document.addEventListener('muzikaz:rad-tox-retry', function () { started = false; loadEngine(); });
}());
