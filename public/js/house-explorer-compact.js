const ALLOWED_ENVIRONMENTS = new Set(['muzimakz-main', 'muzikaz-upper']);
const DEFAULT_ENVIRONMENT = 'muzimakz-main';

function restoreCompactHouseWindow() {
  const sectionTitle = document.querySelector('#house-explorer-title');
  const hud = document.querySelector('.house-hud');
  const originalPanel = document.querySelector('.environment-panel');
  const selector = document.querySelector('#environment-selector');
  const progress = document.querySelector('#environment-progress');
  const loadStatus = document.querySelector('#environment-load-status');
  const actions = document.querySelector('.house-actions');
  const cameraPanel = document.querySelector('.camera-preview-panel');

  if (!hud || !selector) return false;

  if (sectionTitle) sectionTitle.textContent = '3D House Explorer';
  const kicker = hud.querySelector('.kicker');
  const heading = hud.querySelector('h3');
  if (kicker) kicker.textContent = 'MUZIKAZ playable GLB house';
  if (heading) heading.textContent = 'Choose a floor and explore it.';

  const pills = hud.querySelector('.hud-pill-grid');
  if (pills) {
    const active = pills.querySelector('#house-active-id');
    const coordinates = pills.querySelector('#house-coordinates');
    pills.replaceChildren();
    ['WASD / arrows: move', 'Drag or game mode: look', 'Wheel: field of view', 'Esc: leave game mode']
      .forEach((label) => {
        const item = document.createElement('span');
        item.textContent = label;
        pills.append(item);
      });
    if (active) pills.append(active);
    if (coordinates) pills.append(coordinates);
  }

  let compactMenu = document.querySelector('#environment-quick-menu');
  if (!compactMenu) {
    compactMenu = document.createElement('div');
    compactMenu.id = 'environment-quick-menu';
    compactMenu.className = 'environment-quick-menu';
    compactMenu.style.display = 'grid';
    compactMenu.style.gap = '.55rem';
    compactMenu.style.margin = '1rem 0';

    const label = document.createElement('label');
    label.htmlFor = 'environment-selector';
    label.innerHTML = '<strong>Playable Floor</strong>';
    compactMenu.append(label, selector);

    const directedToggle = document.querySelector('#directed-environment-toggle');
    const directedButtons = document.querySelector('#directed-environment-buttons');
    if (directedToggle) {
      const directedLabel = document.createElement('label');
      directedLabel.className = 'inline-toggle';
      directedLabel.append(directedToggle, document.createTextNode(' Directed MUZKAKZ house GLBs'));
      compactMenu.append(directedLabel);
    }
    if (directedButtons) compactMenu.append(directedButtons);
    if (progress) compactMenu.append(progress);
    if (loadStatus) compactMenu.append(loadStatus);
    hud.insertBefore(compactMenu, actions || cameraPanel || null);
  }

  if (originalPanel) originalPanel.hidden = true;
  if (cameraPanel) cameraPanel.hidden = true;
  document.querySelectorAll('.environment-browser,.model-collection-panel,.scene-hierarchy-panel,.object-tools,.scene-builder-toolbar')
    .forEach((element) => { element.hidden = true; });

  const walkButton = document.querySelector('#walk-mode');
  if (walkButton) walkButton.textContent = 'Enter game mode';
  const resetButton = document.querySelector('#house-reset');
  if (resetButton) resetButton.textContent = 'Reset view';

  return true;
}

function keepOnlyPlayableFloors(selector) {
  const params = new URLSearchParams(window.location.search);
  const rawRequested = (params.get('floor') || params.get('house') || '').toLowerCase();
  const requested = ['upper', 'muzikaz-upper'].includes(rawRequested) ? 'muzikaz-upper' : (['main', 'main-floor', 'muzimakz-main'].includes(rawRequested) ? 'muzimakz-main' : null);
  [...selector.options].forEach((option) => {
    if (!ALLOWED_ENVIRONMENTS.has(option.value)) option.remove();
  });

  const available = [...selector.options].map((option) => option.value);
  if (!available.length) return;

  const desired = requested && ALLOWED_ENVIRONMENTS.has(requested) && available.includes(requested)
    ? requested
    : (available.includes(DEFAULT_ENVIRONMENT) ? DEFAULT_ENVIRONMENT : available[0]);

  if (selector.value !== desired) {
    selector.value = desired;
    selector.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function initializeCompactExplorer() {
  if (!restoreCompactHouseWindow()) {
    requestAnimationFrame(initializeCompactExplorer);
    return;
  }

  const selector = document.querySelector('#environment-selector');
  if (!selector) return;

  let syncing = false;
  const sync = () => {
    if (syncing) return;
    syncing = true;
    keepOnlyPlayableFloors(selector);
    syncing = false;
  };

  const observer = new MutationObserver(sync);
  observer.observe(selector, { childList: true, subtree: true });
  sync();

  window.addEventListener('pageshow', sync);
}

initializeCompactExplorer();
