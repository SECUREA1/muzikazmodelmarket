(function () {
  'use strict';

  var XREAL_DOWNLOAD_URL = 'https://www.xreal.com/app/';
  // Nebula and Android spatial browsers enter the complete standards-based
  // browser game directly; other devices retain the official app fallback.
  var dialog = document.createElement('dialog');
  dialog.className = 'xreal-play-dialog';
  dialog.setAttribute('aria-labelledby', 'xreal-play-title');
  dialog.innerHTML = '<div class="xreal-play-dialog__card"><div class="xreal-play-dialog__head"><div><small>XREAL AIR 2 ULTRA / WEBXR</small><h2 id="xreal-play-title">Start RAD-TOX on your glasses</h2></div><button class="xreal-play-dialog__close" type="button" aria-label="Close XREAL launcher">×</button></div><p>Start the complete browser game and allow the immersive session. RAD-TOX loads targets and XR controls automatically; thumb-and-index pinch fires.</p><ul class="xreal-capabilities" aria-label="XREAL launch requirements"><li data-xreal-device>Checking device…</li><li class="ok">✓ Immersive WebXR AR</li><li class="ok">✓ Phone and glasses rendering</li><li class="ok">✓ Hand pinch and controller input</li></ul><div class="xreal-play-actions"><a class="primary" data-xreal-activate href="ioncore_radtox_multiplatform_ar.html?xreal=1&amp;autostart=1">Start RAD-TOX</a><a data-xreal-download href="https://www.xreal.com/app/">Download XREAL app</a></div><p class="xreal-play-status" data-xreal-status role="status" aria-live="polite">Connect your glasses to an Android spatial-computing device, then start the game.</p></div>';
  document.body.appendChild(dialog);

  var status = dialog.querySelector('[data-xreal-status]');
  var activateLink = dialog.querySelector('[data-xreal-activate]');
  var downloadLink = dialog.querySelector('[data-xreal-download]');
  var deviceItem = dialog.querySelector('[data-xreal-device]');

  function browserGameUrl(multiplayer) {
    return 'ioncore_radtox_multiplatform_ar.html?xreal=1&autostart=1' + (multiplayer ? '&multiplayer=1' : '');
  }

  function openLauncher(button) {
    var multiplayer = button.getAttribute('data-xreal-multiplayer') === 'true';
    var android = /Android/i.test(navigator.userAgent);
    var nebula = /XREAL|Nebula/i.test(navigator.userAgent);

    // Nebula and Android browsers can run the standards-based WebXR build. Keep
    // the selecting tap as navigation and avoid an unregistered custom scheme.
    if (nebula || android) {
      window.location.assign(browserGameUrl(multiplayer));
      return;
    }

    activateLink.href = browserGameUrl(multiplayer);
    activateLink.textContent = multiplayer ? 'Start multiplayer RAD-TOX' : 'Start RAD-TOX';
    downloadLink.href = XREAL_DOWNLOAD_URL;
    deviceItem.textContent = android ? '✓ Android spatial device detected' : '• Open this page on your XREAL Android device';
    deviceItem.classList.toggle('ok', android);
    status.textContent = android
      ? 'Ready. XREAL will ask for camera and hand-tracking permission inside the headset session.'
      : 'Open the browser game now, or continue on the Android device connected to your XREAL glasses.';
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }

  document.querySelectorAll('[data-xreal-play]').forEach(function (button) {
    button.addEventListener('click', function () { openLauncher(button); });
  });
  activateLink.addEventListener('click', function () {
    status.textContent = 'Handing off to XREAL… Accept camera and hand-tracking permissions in the native session.';
  });
  downloadLink.addEventListener('click', function () {
    status.textContent = 'Opening the XREAL app download. Return here after installation to launch RAD-TOX on the glasses.';
  });
  dialog.querySelector('.xreal-play-dialog__close').addEventListener('click', function () {
    dialog.close ? dialog.close() : dialog.removeAttribute('open');
  });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog && dialog.close) dialog.close();
  });
}());
