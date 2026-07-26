const CATALOG_URL = 'public/models/glb-models.json';

const aliases = {
  originals: ['aape'],
  legends: ['voltwolf'],
  beasts: ['sharko'],
  crew: ['beeduck'],
  chaos: ['byte'],
  'new-legends': ['ioncduck'],
  'trait-avatars': ['muzkat'],
  'online-events': ['drone-engine']
};

function key(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function makeViewer(model, label) {
  const viewer = document.createElement('model-viewer');
  viewer.className = 'connected-model-viewer';
  viewer.setAttribute('src', model.modelUrl);
  viewer.setAttribute('alt', `${label || model.name} interactive 3D model`);
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('touch-action', 'pan-y');
  viewer.setAttribute('shadow-intensity', '1');
  viewer.setAttribute('loading', 'lazy');
  viewer.setAttribute('reveal', 'auto');
  viewer.setAttribute('ar', '');
  viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
  viewer.setAttribute('ar-placement', 'floor');
  viewer.setAttribute('ar-scale', 'auto');
  if (model.iosModelUrl) viewer.setAttribute('ios-src', model.iosModelUrl);

  const arButton = document.createElement('button');
  arButton.type = 'button';
  arButton.slot = 'ar-button';
  arButton.className = 'connected-model-ar';
  arButton.textContent = 'View in AR';
  viewer.append(arButton);
  return viewer;
}

function replaceConnectedImages(models) {
  const byId = new Map();
  models.forEach((model) => {
    [model.id, model.name, model.modelUrl?.split('/').pop()?.replace(/\.[^.]+$/, '')]
      .filter(Boolean).forEach((value) => byId.set(key(value), model));
  });

  document.querySelectorAll('[data-connected-model]:not([data-connected-model-ready])').forEach((host) => {
    const requested = key(host.dataset.connectedModel);
    const model = [requested, ...(aliases[requested] || [])].map((id) => byId.get(id)).find(Boolean);
    if (!model?.modelUrl) return;
    const label = host.getAttribute('alt') || host.getAttribute('aria-label') || model.name;
    const viewer = makeViewer(model, label);
    if (host.matches('img')) {
      viewer.classList.add(...host.classList);
      host.replaceWith(viewer);
    } else {
      host.replaceChildren(viewer);
      host.removeAttribute('role');
      host.setAttribute('aria-label', `${label} interactive 3D model`);
      host.dataset.connectedModelReady = 'true';
    }
    viewer.dataset.connectedModelReady = 'true';
  });
}

async function start() {
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
    const catalog = await response.json();
    const models = Array.isArray(catalog) ? catalog : catalog.models || [];
    replaceConnectedImages(models);
    new MutationObserver(() => replaceConnectedImages(models)).observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.warn('[Connected models] Keeping image fallbacks because the GLB catalog could not be loaded.', error);
  }
}

start();
