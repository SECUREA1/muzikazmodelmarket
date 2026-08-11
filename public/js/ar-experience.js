(function initializeArExperience() {
  const layer = document.getElementById('ar-glove-layer');
  const toggle = document.getElementById('ar-glove-toggle');
  const frame = document.getElementById('ar-glove-frame');
  const status = document.getElementById('ar-glove-status');
  let previouslyFocused = null;
  const spatialLayer = document.getElementById('spatial-game-layer');
  const spatialToggle = document.getElementById('spatial-game-toggle');
  const spatialFrame = document.getElementById('spatial-game-frame');
  const spatialStatus = document.getElementById('spatial-game-status');
  let spatialPreviouslyFocused = null;

  function setSpatialGame(open) {
    if (!spatialLayer || !spatialToggle || !spatialFrame) return;
    if (open) {
      spatialPreviouslyFocused = document.activeElement;
      if (!spatialFrame.src) spatialFrame.src = 'ioncore_radtox_multiplatform_ar.html';
      spatialLayer.hidden = false;
      document.body.classList.add('spatial-game-open');
      spatialToggle.setAttribute('aria-pressed', 'true');
      spatialStatus.textContent = 'Game loaded. Allow camera access, then choose Enter Full AR Game or start the camera fallback.';
      spatialLayer.querySelector('[data-close-spatial-game]')?.focus();
      return;
    }
    spatialLayer.hidden = true;
    document.body.classList.remove('spatial-game-open');
    spatialToggle.setAttribute('aria-pressed', 'false');
    spatialStatus.textContent = 'Spatial AR game ready.';
    spatialPreviouslyFocused?.focus?.();
  }


  function setGloveLayer(open, message = '') {
    if (!layer || !toggle || !frame) return;
    if (open) {
      previouslyFocused = document.activeElement;
      if (!frame.src) frame.src = 'ioncore_radtox_mediapipe_ar_glove.html';
      layer.hidden = false;
      document.body.classList.add('ar-glove-open');
      toggle.setAttribute('aria-pressed', 'true');
      status.textContent = message || 'Glove layer active. Show your hand and allow camera access when prompted.';
      layer.querySelector('[data-close-ar-glove]')?.focus();
      return;
    }
    layer.hidden = true;
    document.body.classList.remove('ar-glove-open');
    toggle.setAttribute('aria-pressed', 'false');
    status.textContent = 'Glove layer ready.';
    previouslyFocused?.focus?.();
  }

  function openGloveFallback(detail = {}) {
    const modelName = String(detail.modelName || '').trim();
    const message = modelName
      ? `${modelName} could not open in native AR. Show your hand to use the MediaPipe glove and fire slime instead.`
      : 'Show your hand to use the MediaPipe glove and fire slime.';
    setGloveLayer(true, message);
  }

  // Use one fallback for slotted model-viewer controls and live-model buttons,
  // including cards rendered after the page first loads.
  window.MuzikazAR = Object.assign(window.MuzikazAR || {}, { openGlove: openGloveFallback });
  document.addEventListener('muzikaz:open-ar-glove', (event) => openGloveFallback(event.detail));

  spatialToggle?.addEventListener('click', () => setSpatialGame(spatialLayer.hidden));
  spatialLayer?.querySelector('[data-close-spatial-game]')?.addEventListener('click', () => setSpatialGame(false));
  spatialLayer?.addEventListener('click', (event) => { if (event.target === spatialLayer) setSpatialGame(false); });

  toggle?.addEventListener('click', () => setGloveLayer(layer.hidden));
  layer?.querySelector('[data-close-ar-glove]')?.addEventListener('click', () => setGloveLayer(false));
  layer?.addEventListener('click', (event) => { if (event.target === layer) setGloveLayer(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (spatialLayer && !spatialLayer.hidden) setSpatialGame(false);
    else if (layer && !layer.hidden) setGloveLayer(false);
  });

  // Slotted controls belong to model-viewer. Calling activateAR again here can
  // cancel a native Scene Viewer or Quick Look launch, so only normalize them.
  function prepareArButton(button) {
    if (button.dataset.arReady === 'true') return;
    button.dataset.arReady = 'true';
    button.type = 'button';
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', button.textContent.trim() || 'Open model in augmented reality');
  }
  function prepareArViewers(root = document) {
    root.querySelectorAll?.('model-viewer').forEach((viewer) => {
      if (viewer.dataset.arExperienceReady === 'true') return;
      viewer.dataset.arExperienceReady = 'true';
      viewer.setAttribute('ar', '');
      viewer.setAttribute('ar-modes', viewer.getAttribute('ar-modes') || 'webxr scene-viewer quick-look');
      viewer.querySelectorAll('[slot="ar-button"]').forEach(prepareArButton);
      viewer.addEventListener('ar-status', (event) => {
        if (event.detail?.status !== 'failed') return;
        openGloveFallback({ modelName: viewer.getAttribute('alt') || 'This model' });
      });
    });
  }
  prepareArViewers();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('[slot="ar-button"]')) prepareArButton(node);
    prepareArViewers(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
}());
