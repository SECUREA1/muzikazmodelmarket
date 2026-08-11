(function initializeArExperience() {
  const layer = document.getElementById('ar-glove-layer');
  const toggle = document.getElementById('ar-glove-toggle');
  const frame = document.getElementById('ar-glove-frame');
  const status = document.getElementById('ar-glove-status');
  let previouslyFocused = null;

  function setGloveLayer(open) {
    if (!layer || !toggle || !frame) return;
    if (open) {
      previouslyFocused = document.activeElement;
      if (!frame.src) frame.src = 'ioncore_radtox_mediapipe_ar_glove.html';
      layer.hidden = false;
      document.body.classList.add('ar-glove-open');
      toggle.setAttribute('aria-pressed', 'true');
      status.textContent = 'Glove layer active. Allow camera access when prompted.';
      layer.querySelector('[data-close-ar-glove]')?.focus();
      return;
    }
    layer.hidden = true;
    document.body.classList.remove('ar-glove-open');
    toggle.setAttribute('aria-pressed', 'false');
    status.textContent = 'Glove layer ready.';
    previouslyFocused?.focus?.();
  }

  toggle?.addEventListener('click', () => setGloveLayer(layer.hidden));
  layer?.querySelector('[data-close-ar-glove]')?.addEventListener('click', () => setGloveLayer(false));
  layer?.addEventListener('click', (event) => { if (event.target === layer) setGloveLayer(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && layer && !layer.hidden) setGloveLayer(false); });

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
      viewer.setAttribute('ar', '');
      viewer.setAttribute('ar-modes', viewer.getAttribute('ar-modes') || 'webxr scene-viewer quick-look');
      viewer.querySelectorAll('[slot="ar-button"]').forEach(prepareArButton);
    });
  }
  prepareArViewers();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('[slot="ar-button"]')) prepareArButton(node);
    prepareArViewers(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
}());
