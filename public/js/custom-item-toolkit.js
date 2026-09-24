(function customItemToolkit() {
  'use strict';

  const canvas = document.getElementById('custom-item-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const preview = document.getElementById('custom-extruded-preview');
  const glbPreview = document.getElementById('custom-glb-preview');
  const libraryGrid = document.getElementById('custom-library-grid');
  const libraryStatus = document.getElementById('custom-library-status');
  const libraryDialog = document.getElementById('custom-library-dialog');
  const libraryDialogGrid = document.getElementById('custom-library-dialog-grid');
  const libraryDialogStatus = document.getElementById('custom-library-dialog-status');
  const dialog = document.getElementById('custom-item-dialog');
  const dialogModel = document.getElementById('custom-dialog-model');
  const dialogImage = document.getElementById('custom-dialog-image');
  const storageKey = 'muzikazCustomGameItems';
  const state = { drawing: false, tool: 'draw', paths: [], current: null, items: [], selected: null, hasArtwork: false };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const snapshot = state.hasArtwork ? canvas.toDataURL() : '';
    canvas.width = Math.max(600, Math.round(rect.width * ratio));
    canvas.height = Math.max(400, Math.round(rect.height * ratio));
    if (snapshot) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = snapshot;
    } else drawGuide();
  }

  function drawGuide() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.strokeStyle = 'rgba(168,255,24,.13)';
    ctx.lineWidth = 1;
    const step = Math.max(36, canvas.width / 15);
    for (let x = 0; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.restore();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  function renderPaths() {
    drawGuide();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    state.paths.forEach((path) => {
      if (path.points.length < 2) return;
      ctx.globalCompositeOperation = path.tool === 'erase' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = path.color; ctx.lineWidth = path.size;
      ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y);
      path.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
    state.hasArtwork = state.paths.some((path) => path.tool === 'draw');
    updatePreview();
  }

  function updatePreview() {
    const depth = document.getElementById('custom-depth').value;
    const bevel = document.getElementById('custom-bevel').value;
    const color = document.getElementById('custom-item-color').value;
    preview.style.setProperty('--item-depth', `${Math.round(depth / 3)}px`);
    preview.style.setProperty('--item-bevel', `${bevel}px`);
    preview.style.setProperty('--item-color', color);
    if (state.hasArtwork) {
      preview.style.setProperty('--item-art', `url(${canvas.toDataURL('image/png')})`);
      preview.classList.add('has-art'); preview.querySelector('span').textContent = '';
    } else {
      preview.style.removeProperty('--item-art'); preview.classList.remove('has-art'); preview.querySelector('span').innerHTML = 'Draw<br>here';
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    state.drawing = true; canvas.setPointerCapture(event.pointerId);
    state.current = { tool: state.tool, size: Number(document.getElementById('custom-brush-size').value) * (canvas.width / canvas.clientWidth), color: document.getElementById('custom-item-color').value, points: [canvasPoint(event)] };
    state.paths.push(state.current);
  });
  canvas.addEventListener('pointermove', (event) => { if (!state.drawing) return; state.current.points.push(canvasPoint(event)); renderPaths(); });
  canvas.addEventListener('pointerup', () => { state.drawing = false; state.current = null; renderPaths(); });
  canvas.addEventListener('pointercancel', () => { state.drawing = false; });

  document.querySelectorAll('[data-custom-tool]').forEach((button) => button.addEventListener('click', () => {
    state.tool = button.dataset.customTool;
    document.querySelectorAll('[data-custom-tool]').forEach((item) => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); });
  }));
  document.querySelector('[data-custom-action="undo"]').addEventListener('click', () => { state.paths.pop(); renderPaths(); });
  document.querySelector('[data-custom-action="clear"]').addEventListener('click', () => { state.paths = []; state.hasArtwork = false; glbPreview.hidden = true; preview.hidden = false; renderPaths(); });
  document.querySelector('[data-custom-action="reset-view"]').addEventListener('click', () => { preview.classList.remove('is-spinning'); void preview.offsetWidth; preview.classList.add('is-spinning'); });

  ['depth', 'bevel'].forEach((name) => document.getElementById(`custom-${name}`).addEventListener('input', (event) => {
    document.getElementById(`custom-${name}-output`).textContent = `${event.target.value} mm`; updatePreview();
  }));
  document.getElementById('custom-brush-size').addEventListener('input', (event) => { document.getElementById('custom-brush-output').textContent = `${event.target.value} px`; });
  document.getElementById('custom-item-color').addEventListener('input', updatePreview);

  function savedItems() { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_) { return []; } }
  function saveItems(items) { localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 24))); }

  function buildObject(useExisting) {
    if (!state.hasArtwork && !state.selected) {
      document.getElementById('custom-canvas-help').textContent = 'Draw a silhouette or choose an existing item first.'; canvas.focus(); return;
    }
    const title = document.getElementById('custom-item-name').value.trim() || 'Custom game item';
    const item = {
      id: `custom-${Date.now()}`, name: title, type: 'custom prop', format: state.selected?.format || 'svg',
      modelUrl: state.selected?.modelUrl || '', thumbnailUrl: state.hasArtwork ? canvas.toDataURL('image/png') : state.selected?.thumbnailUrl,
      depth: Number(document.getElementById('custom-depth').value), bevel: Number(document.getElementById('custom-bevel').value),
      color: document.getElementById('custom-item-color').value, playable: true, createdAt: new Date().toISOString()
    };
    const items = [item, ...savedItems().filter((saved) => saved.name !== item.name)]; saveItems(items);
    window.dispatchEvent(new CustomEvent('muzikaz:custom-item-built', { detail: item }));
    const toast = document.getElementById('custom-build-toast');
    toast.innerHTML = `<b>✓ ${escapeHtml(title)} added</b><span>Reusable object saved to My Builds and ready for the game.</span>`;
    toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 4200);
    if (useExisting && dialog.open) dialog.close();
    renderLibrary();
  }
  document.querySelector('[data-build-custom-item]').addEventListener('click', () => buildObject(false));

  function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; }
  function normaliseAsset(asset, source) {
    const modelUrl = asset.modelUrl || '';
    const thumbnailUrl = asset.thumbnailUrl || '';
    return { id: `${source}-${asset.id}`, name: asset.name || 'Untitled item', type: asset.assetType || asset.type || asset.category || 'game item', format: modelUrl ? (asset.format || 'glb').toLowerCase() : 'svg', modelUrl, thumbnailUrl, description: asset.description || `A ready-to-use ${asset.type || 'game item'} from the MUZIKAZ library.`, source };
  }

  async function loadLibrary() {
    const catalogUrls = [
      'public/models/glb-models.json', 'public/models/backpack-assets.json',
      'public/models/avatars.json', 'public/models/environments/environments.json',
      'public/models/backpack/avatars.json', 'public/models/backpack/lands.json',
      'public/models/backpack/pets.json', 'public/models/backpack/props.json',
      'public/models/backpack/vehicles.json', 'public/models/backpack/wearables.json'
    ];
    const results = await Promise.allSettled(catalogUrls.map((url) => fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    })));
    const catalogItems = results.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      const catalog = result.value;
      if (Array.isArray(catalog)) return catalog;
      return catalog.models || catalog.assets || catalog.avatars || catalog.environments || catalog.items || [];
    });
    const seen = new Set();
    state.items = catalogItems.map((item) => normaliseAsset(item, 'catalog')).filter((item) => {
      const key = item.modelUrl || item.thumbnailUrl; if (!key || seen.has(key)) return false; seen.add(key); return true;
    });
    renderLibrary();
  }

  function itemArtwork(item) {
    const source = item.thumbnailUrl || (item.format === 'svg' ? item.modelUrl : 'public/assets/muzikaz-world-logo.svg');
    return `<img src="${escapeHtml(source)}" alt="" loading="lazy">`;
  }
  function matchingItems(queryValue, filter) {
    const query = queryValue.trim().toLowerCase();
    const mine = savedItems().map((item) => ({ ...item, source: 'mine' }));
    const all = [...mine, ...state.items];
    const visible = all.filter((item) => (!query || `${item.name} ${item.type}`.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'mine' ? item.source === 'mine' : filter === 'glb' ? /^(glb|gltf)$/.test(item.format) : item.format === filter)));
    return { all, visible };
  }
  function renderCards(grid, status, query, filter) {
    const { all, visible } = matchingItems(query, filter);
    status.textContent = `${visible.length} item${visible.length === 1 ? '' : 's'} ready to preview, deploy, or customize.`;
    grid.innerHTML = visible.map((item) => `<button type="button" class="custom-library-card" data-library-index="${all.indexOf(item)}"><span class="custom-card-art">${itemArtwork(item)}<i>${escapeHtml(item.format.toUpperCase())}</i></span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type)}</small></span><b aria-hidden="true">↗</b></button>`).join('') || '<p class="empty-state">No matching items. Upload a GLB or SVG, or start drawing above.</p>';
    grid.querySelectorAll('[data-library-index]').forEach((button) => button.addEventListener('click', () => openItem(all[Number(button.dataset.libraryIndex)])));
  }
  function renderLibrary() {
    renderCards(libraryGrid, libraryStatus, document.getElementById('custom-library-search').value, document.getElementById('custom-library-filter').value);
    renderCards(libraryDialogGrid, libraryDialogStatus, document.getElementById('custom-library-dialog-search').value, document.getElementById('custom-library-dialog-filter').value);
  }

  function openItem(item) {
    state.selected = item;
    if (libraryDialog.open) libraryDialog.close();
    document.getElementById('custom-dialog-title').textContent = item.name;
    document.getElementById('custom-dialog-copy').textContent = item.description || 'This reusable item is ready to run now or become the base of a new custom build.';
    document.getElementById('custom-dialog-format').textContent = item.source === 'mine' ? 'Your saved build' : 'Existing library item';
    document.getElementById('custom-dialog-format-value').textContent = item.format.toUpperCase();
    document.getElementById('custom-dialog-type').textContent = item.type;
    const isModel = Boolean(item.modelUrl && /\.(glb|gltf)(\?|$)/i.test(item.modelUrl));
    dialogModel.hidden = !isModel; dialogImage.hidden = isModel;
    if (isModel) { dialogModel.src = item.modelUrl; dialogModel.alt = `${item.name} interactive 3D preview`; }
    else { dialogImage.src = item.thumbnailUrl || item.modelUrl; dialogImage.alt = `${item.name} preview`; }
    dialog.showModal();
  }
  document.querySelector('[data-close-item-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelector('[data-use-item]').addEventListener('click', () => { document.getElementById('custom-item-name').value = state.selected.name; buildObject(true); });
  document.querySelector('[data-run-item]').addEventListener('click', () => {
    const item = state.selected;
    window.dispatchEvent(new CustomEvent('muzikaz:run-custom-item', { detail: item }));
    localStorage.setItem('muzikazActiveGameItem', JSON.stringify(item));
    dialog.close();
    const game = document.getElementById('vibe-crib-game') || document.getElementById('house-explorer');
    if (game) game.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const toast = document.getElementById('custom-build-toast');
    toast.innerHTML = `<b>▶ ${escapeHtml(item.name)} ready to run</b><span>The item is now the active object for your next game session.</span>`;
    toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 4200);
  });
  document.querySelector('[data-edit-item]').addEventListener('click', () => {
    const item = state.selected; document.getElementById('custom-item-name').value = `${item.name} Remix`;
    document.getElementById('custom-source-label').textContent = `Building on ${item.name}`;
    if (item.modelUrl && /\.(glb|gltf)(\?|$)/i.test(item.modelUrl)) { glbPreview.src = item.modelUrl; glbPreview.hidden = false; preview.hidden = true; }
    else importImage(item.thumbnailUrl || item.modelUrl);
    dialog.close(); document.getElementById('custom-item-toolkit').scrollIntoView({ behavior: 'smooth' });
  });

  function importImage(source) {
    if (!source) return;
    const image = new Image(); image.onload = () => { drawGuide(); const scale = Math.min(canvas.width * .72 / image.width, canvas.height * .72 / image.height); const width = image.width * scale; const height = image.height * scale; ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); state.hasArtwork = true; glbPreview.hidden = true; preview.hidden = false; updatePreview(); }; image.src = source;
  }
  const upload = document.getElementById('custom-svg-upload');
  function beginUpload() { upload.click(); }
  document.querySelectorAll('[data-import-svg]').forEach((button) => button.addEventListener('click', beginUpload));
  document.querySelector('[data-open-item-library]').addEventListener('click', () => libraryDialog.showModal());
  document.querySelector('[data-close-library-dialog]').addEventListener('click', () => libraryDialog.close());
  libraryDialog.addEventListener('click', (event) => { if (event.target === libraryDialog) libraryDialog.close(); });
  upload.addEventListener('change', () => {
    const file = upload.files[0]; if (!file) return;
    const url = URL.createObjectURL(file); const isModel = /\.(glb|gltf)$/i.test(file.name);
    state.selected = { id: `upload-${Date.now()}`, name: file.name.replace(/\.(svg|glb|gltf)$/i, ''), type: isModel ? 'imported 3D model' : 'imported silhouette', format: isModel ? file.name.split('.').pop().toLowerCase() : 'svg', modelUrl: isModel ? url : '', thumbnailUrl: isModel ? '' : url, source: 'upload' };
    document.getElementById('custom-item-name').value = state.selected.name;
    document.getElementById('custom-source-label').textContent = `Imported ${file.name}`;
    if (libraryDialog.open) libraryDialog.close();
    if (isModel) { glbPreview.src = url; glbPreview.hidden = false; preview.hidden = true; state.hasArtwork = false; }
    else importImage(url);
  });
  document.getElementById('custom-library-search').addEventListener('input', renderLibrary);
  document.getElementById('custom-library-filter').addEventListener('change', renderLibrary);
  document.getElementById('custom-library-dialog-search').addEventListener('input', renderLibrary);
  document.getElementById('custom-library-dialog-filter').addEventListener('change', renderLibrary);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas(); loadLibrary();
}());
