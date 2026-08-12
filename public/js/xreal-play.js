(function () {
  'use strict';

  var XREAL_DOWNLOAD_URL = 'https://www.xreal.com/app/';
  var dialog = document.createElement('dialog');
  dialog.className = 'xreal-play-dialog';
  dialog.setAttribute('aria-labelledby', 'xreal-play-title');
  dialog.innerHTML = '<div class="xreal-play-dialog__card"><div class="xreal-play-dialog__head"><div><small>XREAL AIR 2 ULTRA / NATIVE AR</small><h2 id="xreal-play-title">Move RAD-TOX to your glasses</h2></div><button class="xreal-play-dialog__close" type="button" aria-label="Close XREAL launcher">×</button></div><p>This launcher hands the game to the installed XREAL Android client instead of opening it in this browser. The native session requests the glasses cameras and both hands for immersive gesture play.</p><ul class="xreal-capabilities" aria-label="XREAL launch requirements"><li data-xreal-device>Checking device…</li><li class="ok">✓ Native immersive AR</li><li class="ok">✓ Glasses camera tracking requested</li><li class="ok">✓ Left + right hand joints required</li></ul><div class="xreal-play-actions"><a class="primary" data-xreal-activate href="xrealmodel://scene/rad-tox">Open on XREAL glasses</a><a data-xreal-download href="https://www.xreal.com/app/">Download XREAL app</a></div><p class="xreal-play-status" data-xreal-status role="status" aria-live="polite">Connect your glasses to an Android spatial-computing device, then open the game.</p></div>';
  document.body.appendChild(dialog);

  var status = dialog.querySelector('[data-xreal-status]');
  var activateLink = dialog.querySelector('[data-xreal-activate]');
  var downloadLink = dialog.querySelector('[data-xreal-download]');
  var deviceItem = dialog.querySelector('[data-xreal-device]');

  function nativeSceneUrl(room, multiplayer) {
    var query = [
      'mode=immersive-ar',
      'handTracking=required',
      'hands=left,right',
      'camera=glasses',
      'gestureProfile=rad-tox'
    ];
    if (multiplayer) query.push('multiplayer=1');
    return 'xrealmodel://scene/' + encodeURIComponent(room) + '?' + query.join('&');
  }

  function androidIntentUrl(room, multiplayer) {
    var scenePath = encodeURIComponent(room) + '?mode=immersive-ar&handTracking=required&hands=left%2Cright&camera=glasses&gestureProfile=rad-tox';
    if (multiplayer) scenePath += '&multiplayer=1';
    return 'intent://scene/' + scenePath + '#Intent;scheme=xrealmodel;action=android.intent.action.VIEW;S.browser_fallback_url=' + encodeURIComponent(XREAL_DOWNLOAD_URL) + ';end';
  }

  function openLauncher(button) {
    var room = button.getAttribute('data-xreal-room') || 'rad-tox';
    var multiplayer = button.getAttribute('data-xreal-multiplayer') === 'true';
    var android = /Android/i.test(navigator.userAgent);

    activateLink.href = android ? androidIntentUrl(room, multiplayer) : nativeSceneUrl(room, multiplayer);
    activateLink.textContent = multiplayer ? 'Open multiplayer on XREAL' : 'Open RAD-TOX on XREAL';
    downloadLink.href = XREAL_DOWNLOAD_URL;
    deviceItem.textContent = android ? '✓ Android spatial device detected' : '• Open this page on your XREAL Android device';
    deviceItem.classList.toggle('ok', android);
    status.textContent = android
      ? 'Ready. XREAL will ask for camera and hand-tracking permission inside the headset session.'
      : 'The game will not open in this browser. Continue on the Android device connected to your XREAL glasses.';
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
