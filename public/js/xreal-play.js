(function () {
  'use strict';
  var installPrompt = null;
  var dialog = document.createElement('dialog');
  dialog.className = 'xreal-play-dialog';
  dialog.setAttribute('aria-labelledby', 'xreal-play-title');
  dialog.innerHTML = '<div class="xreal-play-dialog__card"><div class="xreal-play-dialog__head"><div><small>XREAL AIR 2 ULTRA / WEBXR</small><h2 id="xreal-play-title">Play RAD-TOX in spatial AR</h2></div><button class="xreal-play-dialog__close" type="button" aria-label="Close XREAL Play">×</button></div><p>Play completely in the browser, or activate the installed XREAL Android client. Pinch to shoot, point to aim, and use an open palm to change tools when browser hand tracking is available.</p><ul class="xreal-capabilities" aria-label="Detected XREAL play capabilities"><li data-xreal-secure>Checking HTTPS…</li><li data-xreal-webxr>Checking immersive AR…</li><li data-xreal-hands>Hand tracking requested at launch</li><li data-xreal-mode>Browser multiplayer ready</li></ul><div class="xreal-play-actions"><a class="primary" data-xreal-browser href="ioncore_radtox_multiplatform_ar.html?xreal=1">Play full AR in browser</a><a data-xreal-activate href="xrealmodel://scene/rad-tox">Activate XREAL app</a><button data-xreal-install type="button">Install browser game</button></div><p class="xreal-play-status" data-xreal-status role="status" aria-live="polite">Choose how to launch.</p></div>';
  document.body.appendChild(dialog);

  var status = dialog.querySelector('[data-xreal-status]');
  var browserLink = dialog.querySelector('[data-xreal-browser]');
  var activateLink = dialog.querySelector('[data-xreal-activate]');
  var installButton = dialog.querySelector('[data-xreal-install]');
  var currentRoom = 'rad-tox';

  function setCapability(selector, supported, yes, no) {
    var item = dialog.querySelector(selector);
    item.textContent = supported ? '✓ ' + yes : '• ' + no;
    item.classList.toggle('ok', supported);
  }

  async function detect() {
    var secure = window.isSecureContext || location.hostname === 'localhost';
    setCapability('[data-xreal-secure]', secure, 'Secure browser context', 'HTTPS required for camera and AR');
    var immersive = false;
    if (secure && navigator.xr && navigator.xr.isSessionSupported) {
      try { immersive = await navigator.xr.isSessionSupported('immersive-ar'); } catch (_) { immersive = false; }
    }
    setCapability('[data-xreal-webxr]', immersive, 'Immersive WebXR AR detected', '3D/camera fallback available');
    status.textContent = immersive ? 'XREAL-compatible immersive AR is available. Press Play full AR in browser.' : 'Immersive AR was not reported; the browser game will use its camera or 3D fallback.';
  }

  function openLauncher(button) {
    currentRoom = button.getAttribute('data-xreal-room') || 'rad-tox';
    var multiplayer = button.getAttribute('data-xreal-multiplayer') === 'true';
    var room = encodeURIComponent(currentRoom);
    browserLink.href = multiplayer ? 'model-explorer.html?xreal=1&autoplay=1&room=' + room + '#house-explorer' : 'ioncore_radtox_multiplatform_ar.html?xreal=1&room=' + room;
    browserLink.textContent = multiplayer ? 'Play multiplayer AR in browser' : 'Play full AR in browser';
    activateLink.href = 'xrealmodel://scene/' + room + (multiplayer ? '?multiplayer=1' : '');
    dialog.querySelector('[data-xreal-mode]').textContent = multiplayer ? '✓ Logged-in shared multiplayer room' : '✓ Full single-player AR game';
    dialog.querySelector('[data-xreal-mode]').classList.add('ok');
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    detect();
  }

  document.querySelectorAll('[data-xreal-play]').forEach(function (button) { button.addEventListener('click', function () { openLauncher(button); }); });
  dialog.querySelector('.xreal-play-dialog__close').addEventListener('click', function () { dialog.close ? dialog.close() : dialog.removeAttribute('open'); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog && dialog.close) dialog.close(); });
  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); installPrompt = event; installButton.textContent = 'Download / install browser game'; });
  installButton.addEventListener('click', async function () {
    if (!installPrompt) { status.textContent = 'Use your browser menu and choose Install app or Add to Home screen. The game remains fully playable without installing.'; return; }
    installPrompt.prompt();
    var choice = await installPrompt.userChoice;
    status.textContent = choice.outcome === 'accepted' ? 'MUZIKAZ was added to this device.' : 'Install cancelled; browser play is still available.';
    installPrompt = null;
  });
  activateLink.addEventListener('click', function () { status.textContent = 'Opening the installed XREAL client. If it is not installed, use browser play or install this web app.'; });
}());
