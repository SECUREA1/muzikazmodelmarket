(async function () {
  'use strict';
  const {marketItemPreview,hydrateMarketPreviews,openMarketPreview}=await import('./public/js/market-item-preview.js');
  const categories = ['WORLD','BUILDINGS','PROPS','TERRAIN','NPC','AI','VEHICLES','GAME SYSTEMS','FUNCTIONS','AUDIO','EFFECTS','SCRIPTS','INTERACTIVE','UTILITIES'];
  let roomStyles = [{ id:'loft', name:'Open Studio', label:'Flexible creative loft', color:'#ff5ba7', walls:'l' }, { id:'suite', name:'Connected Suite', label:'Three linked rooms', color:'#61e7ff', walls:'h' }, { id:'courtyard', name:'Garden Courtyard', label:'Indoor / outdoor flow', color:'#b5ff55', walls:'u' }];
  let builderModels = [['canopy-tree','Canopy Tree','landscape'],['pine-tree','Pine Tree','landscape'],['flower-bed','Flower Bed','landscape'],['hedge-corner','Hedge Corner','landscape'],['garden-rocks','Garden Rocks','landscape'],['pond','Reflecting Pond','landscape'],['path-tile','Path Tile','landscape'],['hill','Soft Hill','landscape'],['lamp-post','Lamp Post','landscape'],['planter','Tall Planter','landscape'],['pillow-ring','Pillow Ring Seat','interior'],['sofa','Cloud Sofa','interior'],['armchair','Accent Chair','interior'],['coffee-table','Coffee Table','interior'],['bookshelf','Bookshelf','interior'],['floor-lamp','Floor Lamp','interior'],['room-divider','Room Divider','interior'],['kitchen-island','Kitchen Island','interior'],['spiral-stairs','Spiral Stairs','interior'],['archway','Archway','interior'],['art-wall','Art Wall','interior']];
  const $ = (selector) => document.querySelector(selector); let state = { permissions:{}, land:[], assets:[], listings:[], placements:[], csrf:'' };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character]);
  const status = (message, error = false) => { $('#builder-status').textContent = message; $('#builder-status').classList.toggle('error', error); };
  async function api(path, options = {}) {
    const headers = { Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(state.csrf ? { 'X-CSRF-Token':state.csrf } : {}), ...(options.headers || {}) };
    const response = await window.MUZIKAZ_API.fetch(path, { ...options, headers, retries:0 }); const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.message || 'Builder service request failed.'); if(options.method&&options.method!=='GET') window.MuzikazInventorySync?.signalInventoryChange(); return payload.data;
  }
  function card(asset, body, actions = '') {
    const functional = asset.function_data || asset.interaction_data || asset.ai_profile;
    return `<article class="builder-card">${marketItemPreview(asset)}<small>${escapeHtml(asset.builder_category)} · v${escapeHtml(asset.version)}</small><h3>${escapeHtml(asset.name)}</h3><p>${escapeHtml(asset.description || 'Reusable MUZIKAZ builder component.')}</p>${functional ? '<div class="builder-card__meta"><span>CONFIGURABLE FUNCTION</span></div>' : ''}${body}<div class="builder-actions">${actions}</div></article>`;
  }
  const button = (label, action, id, allowed = true) => allowed ? `<button type="button" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>` : '';
  let nativeItems = [], nativeLimit = 36, nativeVersion = 0, nativeMarketplace;
  const nativeMaps = item => (item.nativeMaps || item.maps || []).map(map => typeof map === 'string' ? map : map.name || map.id || '').filter(Boolean);
  const nativeFunctions = item => [...new Set([item.nativeFunction, item.behavior, item.configuration?.behavior, item.function_data?.behavior, ...(item.interactions || [])].filter(value => typeof value === 'string' && value !== 'decor'))];
  function renderNativeCatalog() {
    const query = $('#builder-native-search').value.trim().toLowerCase(), category = $('#builder-native-category').value;
    const matches = nativeItems.filter(item => (!category || item.category === category) && [item.name, item.description, item.category, ...nativeMaps(item), ...nativeFunctions(item), JSON.stringify(item.function_data || {}), ...(item.components || []).map(component => component.name)].join(' ').toLowerCase().includes(query));
    const visible = matches.slice(0, nativeLimit);
    $('#builder-native-status').textContent = `${matches.length} of ${nativeItems.length} native items${visible.length < matches.length ? ` · showing ${visible.length}` : ''}.`;
    $('#builder-native-items').innerHTML = visible.map(item => {
      const functions = nativeFunctions(item), maps = nativeMaps(item), template = item.source === 'native-map';
      const components = template && item.components?.length ? `<details class="builder-native__components"><summary>${Number(item.itemCount || item.components.reduce((sum, part) => sum + part.count, 0))} map pieces · ${item.components.length} item types</summary><ul>${item.components.map(part => `<li>${escapeHtml(part.name)} × ${Number(part.count || 1)}${part.sku ? ` <button type="button" data-native-open="${escapeHtml(part.sku)}">VIEW ITEM</button>` : ''}</li>`).join('')}</ul></details>` : '';
      const actions = template ? `${item.builderUrl ? `<a class="builder-link" href="${escapeHtml(item.builderUrl)}">EDIT MAP TEMPLATE</a>` : ''}${item.visitUrl ? `<a class="builder-link" href="${escapeHtml(item.visitUrl)}">VISIT MAP</a>` : ''}` : `<button type="button" data-native-open="${escapeHtml(item.sku)}">${item.basic ? 'OPEN BASIC ITEM' : 'VIEW / BUY WITH MZK'}</button>`;
      return `<article class="builder-card">${marketItemPreview(item)}<small>${escapeHtml(item.category)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || 'Reusable native game item.')}</p>${functions.length ? `<p class="builder-native__function">Functions: ${escapeHtml(functions.map(value => value.replaceAll('-', ' ')).join(' · '))}</p>` : ''}${maps.length ? `<p class="builder-native__maps">Maps: ${escapeHtml(maps.join(' · '))}</p>` : ''}${components}<strong class="builder-price">${item.basic ? template ? 'Public map template · free' : 'Basic kit · free' : `${Number(item.priceMzk || 0).toLocaleString()} MZK`}</strong><div class="builder-actions">${actions}<button type="button" data-native-preview="${escapeHtml(item.sku || item.id)}">PREVIEW</button></div></article>`;
    }).join('') || '<p class="builder-empty">No native items match your filters.</p>';
    $('#builder-native-more').hidden = visible.length >= matches.length;
    hydrateMarketPreviews($('#builder-native-items'));
  }
  async function loadNativeCatalog() {
    const version = ++nativeVersion;
    $('#builder-native-status').textContent = 'Loading native items…';
    $('#builder-native-refresh').disabled = true;
    try {
      const items = await api('/api/market/catalog');
      if (version !== nativeVersion) return;
      if (!Array.isArray(items)) throw new Error('Native catalog is invalid.');
      nativeItems = items.filter(item => item.source === 'native-map' || item.source === 'upgrade' && item.sku && (item.native || !item.sku.startsWith('repository:')));
      const selected = $('#builder-native-category').value;
      const categories = [...new Set(nativeItems.map(item => item.category).filter(Boolean))].sort();
      $('#builder-native-category').innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
      $('#builder-native-category').value = categories.includes(selected) ? selected : '';
      nativeLimit = 36;
      renderNativeCatalog();
    } catch (error) {
      if (version === nativeVersion) $('#builder-native-status').textContent = `${error.message} Refresh to retry the native catalog.`;
    } finally { if (version === nativeVersion) $('#builder-native-refresh').disabled = false; }
  }
  async function openNativeItem(sku) {
    if (!nativeItems.some(item => item.sku === sku)) return;
    if (!nativeMarketplace) {
      const {createGameMarketplace} = await import('./public/js/in-game-market.js');
      nativeMarketplace = createGameMarketplace();
      nativeMarketplace.dialog.id = 'builder-native-market';
      nativeMarketplace.dialog.querySelector('h2').id = 'builder-native-market-title';
      nativeMarketplace.dialog.setAttribute('aria-labelledby', 'builder-native-market-title');
    }
    nativeMarketplace.open('upgrades', {sku});
  }
  let packFilter = 'all';
  const trayKey = 'muzikaz.builder.buildTray';
  function readTray() { try { const tray = JSON.parse(localStorage.getItem(trayKey) || '[]'); return Array.isArray(tray) ? tray : []; } catch { return []; } }
  function renderBuilderPack(filter = packFilter) {
    packFilter = filter;
    const selected = new Set(readTray().map(item => item.id));
    document.querySelector('[data-pack-count]').textContent = `${builderModels.length} models`;
    document.querySelector('[data-pack-filter="all"]').textContent = `ALL ${builderModels.length}`;
    $('#room-style-grid').innerHTML = roomStyles.map((room) => `<button type="button" class="room-style" data-room-style="${escapeHtml(room.id)}" style="--room-color:${room.color}"><span class="room-style__plan room-style__plan--${room.walls}" aria-hidden="true"><i></i><b></b></span><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.label)}</small></button>`).join('');
    $('#builder-model-grid').innerHTML = builderModels.filter(([, , type]) => filter === 'all' || type === filter).map(([id, name, type, thumbnail], index) => `<button type="button" class="builder-model ${selected.has(id) ? 'selected' : ''}" aria-pressed="${selected.has(id)}" data-builder-model="${escapeHtml(id)}" data-model-name="${escapeHtml(name)}"><span class="builder-model__number">${String(index + 1).padStart(2, '0')}</span><img src="${escapeHtml(thumbnail || `public/images/builder-pack/${id}.svg`)}" alt="" loading="lazy"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(type.toUpperCase())}</small></span><b aria-hidden="true">＋</b></button>`).join('');
  }
  async function loadCompletePack() {
    try {
      const response = await fetch('public/models/backpack-assets.json', { cache:'no-cache' });
      if (!response.ok) throw new Error('Builder catalog could not be loaded.');
      const catalog = await response.json();
      if (!Array.isArray(catalog.assets)) throw new Error('Builder catalog is invalid.');
      const models = catalog.assets.filter(item => item.buildAssetId);
      const layouts = catalog.assets.filter(item => item.builderLayoutId);
      if (!models.length || !layouts.length) throw new Error('Builder catalog is empty.');
      builderModels = models.map(item => [item.buildAssetId, item.name, item.builderCategory || item.type || 'props', item.thumbnailUrl]);
      roomStyles = layouts.filter(item => item.builderLayoutId !== 'grand-floor').map(item => ({id:item.builderLayoutId,name:item.name,label:item.description || 'Editable world layout',color:'#61e7ff',walls:'l'}));
      document.querySelector('[data-layout-count]').textContent = `${roomStyles.length} layouts`;
      const filters = document.querySelector('.builder-library__filters');
      for (const category of new Set(builderModels.map(item => item[2]))) {
        if ([...filters.querySelectorAll('[data-pack-filter]')].some(control => control.dataset.packFilter === category)) continue;
        const control = document.createElement('button'); control.type = 'button'; control.dataset.packFilter = category; control.textContent = category.toUpperCase(); filters.append(control);
      }
      renderBuilderPack();
      setPackStatus(`${models.length} models and ${layouts.length} world templates available. Select pieces for your build tray.`);
    } catch (error) { setPackStatus(`${error.message} Showing the core pack. Reload to retry the complete catalog.`); }
  }
  function setPackStatus(message) { $('#builder-pack-status').textContent = message; }
  function render() {
    $('#builder-balance').textContent = `${Number(state.balance || 0).toLocaleString()} MZK`;
    $('#builder-listings').innerHTML = state.listings.length ? state.listings.map((listing) => card(listing.asset, `<strong class="builder-price">${listing.price_mzk.toLocaleString()} MZK</strong>`, button('BUY WITH MZK','buy',listing.listing_id,state.permissions['market.builder.buy']) + button('PREVIEW','preview',listing.asset_id))).join('') : '<p class="builder-empty">No active listings in this category yet.</p>';
    $('#builder-assets').innerHTML = state.assets.length ? state.assets.map((asset) => card(asset, `<div class="builder-card__meta"><span>${escapeHtml(asset.asset_type)}</span><span>OWNED</span></div>`, `<button type="button" data-gameplay-download="${escapeHtml(asset.id)}">DOWNLOAD FILE</button>` + button('PLACE','place',asset.id,state.permissions['builder.asset.place']) + button('CONFIGURE','configure',asset.id,state.permissions['builder.asset.configure']) + button('PREVIEW','preview',asset.id) + button(asset.listing ? 'LISTED' : 'SELL / LIST','list',asset.id,state.permissions['market.builder.sell'] && !asset.listing))).join('') : '<p class="builder-empty">Your Builder Backpack is empty. Purchase or create a game-builder asset to start.</p>';
    $('#builder-worlds').innerHTML = state.land.length ? state.land.map((land) => `<article class="builder-card"><div class="builder-card__visual">🗺️</div><small>OWNED LAND</small><h3>${escapeHtml(land.name)}</h3><p>World ID: ${escapeHtml(land.worldId)}</p><button type="button" data-gameplay-download="${escapeHtml(land.id)}">DOWNLOAD DEED</button></article>`).join('') : '<p class="builder-empty">No authoritative land deed is attached to this account.</p>';
    $('#builder-placements').innerHTML = state.placements.length ? state.placements.map((placement) => { const asset = state.assets.find((item) => item.id === placement.asset_id) || { name:placement.asset_id, builder_category:'WORLD', version:placement.asset_version }; return card(asset, `<div class="builder-card__meta"><span>${escapeHtml(placement.world_id)}</span><span>${escapeHtml(placement.placement_id)}</span></div>`, button('CONFIGURE','configure-placement',placement.placement_id,state.permissions['builder.asset.configure']) + button('REMOVE FROM WORLD','remove-placement',placement.placement_id,state.permissions['builder.world.edit'])); }).join('') : '<p class="builder-empty">Nothing has been placed in your worlds.</p>';
  }
  async function refresh() {
    const category = $('#builder-category').value;
    const results = await Promise.allSettled([api('/api/builder/permissions'), api('/api/builder/backpack'), api(`/api/builder/market?category=${encodeURIComponent(category)}`)]);
    if (category !== $('#builder-category').value) return;
    const [profile, backpack, listings] = results;
    if (profile.status === 'fulfilled') { Object.assign(state, { permissions:profile.value.permissions, land:profile.value.land, balance:profile.value.mzk_balance }); $('#builder-account').textContent = profile.value.account_id; }
    else { Object.assign(state, {permissions:{},land:[],balance:0}); $('#builder-account').textContent = 'Account unavailable'; }
    Object.assign(state, {assets:backpack.status === 'fulfilled' ? backpack.value.assets : [], placements:backpack.status === 'fulfilled' ? backpack.value.placements : [], listings:listings.status === 'fulfilled' ? listings.value : []});
    render(); hydrateMarketPreviews(document);
    const unavailable = '<p class="builder-empty">Unable to load this section. Refresh to retry, or sign in through <a href="members.html">Members</a>.</p>';
    if (profile.status === 'rejected') $('#builder-worlds').innerHTML = unavailable;
    if (backpack.status === 'rejected') { $('#builder-assets').innerHTML = unavailable; $('#builder-placements').innerHTML = unavailable; }
    if (listings.status === 'rejected') $('#builder-listings').innerHTML = unavailable;
    const errors = results.filter(result => result.status === 'rejected');
    status(errors.length ? errors.map(result => result.reason.message).join(' ') : 'Builder account verified. Prices, ownership and permissions are validated by MUZIKAZ servers.', errors.length > 0);
  }
  function openDialog(title, fields, submit) { $('#builder-dialog-title').textContent = title; $('#builder-form-fields').innerHTML = fields; $('#builder-dialog-status').textContent = ''; $('#builder-form').onsubmit = async (event) => { event.preventDefault(); $('#builder-dialog-submit').disabled = true; try { await submit(new FormData(event.currentTarget)); $('#builder-dialog').close(); await refresh(); } catch (error) { $('#builder-dialog-status').textContent = error.message; } finally { $('#builder-dialog-submit').disabled = false; } }; $('#builder-dialog').showModal(); }
  const json = (value) => { if (!String(value || '').trim()) return {}; try { return JSON.parse(value); } catch (_) { throw new Error('Configuration must be valid JSON.'); } };
  function createAsset() { openDialog('Create Builder Asset', `<label>Name<input name="name" maxlength="140" required></label><label>Asset type<input name="asset_type" value="interactive_prop" required></label><label>Category<select name="builder_category">${categories.map((category) => `<option>${category}</option>`).join('')}</select></label><label>Version<input name="version" value="1.0.0"></label><label class="wide">Description<textarea name="description" rows="3"></textarea></label><label class="wide">GLB URL (optional)<input name="glb_url" type="url"></label><label class="wide">Item artwork URL (optional)<input name="thumbnail_url" type="url"></label><label class="wide">Function data (JSON)<textarea name="function_data" rows="4" placeholder='{"behavior":"seat","seatOffset":[0,0.65,0],"prompt":"Sit down"}'></textarea></label>`, (form) => api('/api/builder/assets', { method:'POST', body:JSON.stringify({ name:form.get('name'), asset_type:form.get('asset_type'), builder_category:form.get('builder_category'), version:form.get('version'), description:form.get('description'), glb_url:form.get('glb_url'), thumbnail_url:form.get('thumbnail_url'), function_data:json(form.get('function_data')) }) })); }
  function act(action, id) {
    const asset = state.assets.find((item) => item.id === id) || state.listings.find((item) => item.asset_id === id)?.asset;
    if (action === 'buy') return confirm('Purchase this asset using your authoritative MZK balance?') && api(`/api/builder/listings/${encodeURIComponent(id)}/purchase`, { method:'POST', body:JSON.stringify({ request_id:crypto.randomUUID() }) }).then(refresh);
    if (action === 'preview') return openMarketPreview(asset);
    if (action === 'list') return openDialog(`List ${asset.name}`, '<label>MZK price<input name="price" type="number" min="1" max="1000000" required></label><label class="wide">Listing description<textarea name="description"></textarea></label>', (form) => api('/api/builder/listings', { method:'POST', body:JSON.stringify({ asset_id:id, price_mzk:Number(form.get('price')), description:form.get('description') }) }));
    if (action === 'place') return openDialog(`Place ${asset.name}`, `<label>Owned world<select name="world">${state.land.map((land) => `<option value="${escapeHtml(land.worldId)}">${escapeHtml(land.name)}</option>`)}</select></label><label class="wide">Instance configuration (JSON)<textarea name="configuration">{}</textarea></label>`, (form) => api('/api/builder/placements', { method:'POST', body:JSON.stringify({ world_id:form.get('world'), asset_id:id, transform:{ position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] }, configuration:json(form.get('configuration')) }) }));
    if (action === 'configure') return alert('Configuration is stored per placed instance. Place this asset in an owned world first.');
    if (action === 'configure-placement') { const placement = state.placements.find((item) => item.placement_id === id); return openDialog('Configure World Instance', `<label class="wide">Configuration (JSON)<textarea name="configuration" rows="8">${escapeHtml(JSON.stringify(placement.configuration || {}, null, 2))}</textarea></label>`, (form) => api(`/api/builder/placements/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ configuration:json(form.get('configuration')) }) })); }
    if (action === 'remove-placement') return confirm('Remove this instance from the world?') && api(`/api/builder/placements/${encodeURIComponent(id)}`, { method:'DELETE' }).then(refresh);
  }
  document.addEventListener('click', (event) => { const tab = event.target.closest('[data-builder-tab]'); if (tab) { document.querySelectorAll('[data-builder-tab]').forEach((item) => item.classList.toggle('active', item === tab)); document.querySelectorAll('[data-builder-panel]').forEach((item) => item.classList.toggle('active', item.dataset.builderPanel === tab.dataset.builderTab)); } const action = event.target.closest('[data-action]'); if (action) Promise.resolve(act(action.dataset.action, action.dataset.id)).catch((error) => status(error.message, true)); });
  $('#builder-category').innerHTML += categories.map((category) => `<option>${category}</option>`).join('');
  const requestedCategory = new URLSearchParams(location.search).get('category');
  if (categories.includes(requestedCategory)) $('#builder-category').value = requestedCategory;
  $('#builder-category').addEventListener('change', () => refresh().catch((error) => status(error.message, true))); $('#open-create-asset').addEventListener('click', createAsset);
  renderBuilderPack();
  loadCompletePack();
  loadNativeCatalog();
  for (const selector of ['#builder-native-search', '#builder-native-category']) $(selector).addEventListener(selector.endsWith('search') ? 'input' : 'change', () => { nativeLimit = 36; renderNativeCatalog(); });
  $('#builder-native-reset').addEventListener('click', () => { $('#builder-native-search').value = ''; $('#builder-native-category').value = ''; nativeLimit = 36; renderNativeCatalog(); });
  $('#builder-native-refresh').addEventListener('click', loadNativeCatalog);
  $('#builder-native-more').addEventListener('click', () => { nativeLimit += 36; renderNativeCatalog(); });
  $('#builder-native-items').addEventListener('click', event => {
    const open = event.target.closest('[data-native-open]'), preview = event.target.closest('[data-native-preview]');
    if (open) openNativeItem(open.dataset.nativeOpen).catch(error => { $('#builder-native-status').textContent = error.message; });
    if (preview) { const item = nativeItems.find(item => (item.sku || item.id) === preview.dataset.nativePreview); if (item) openMarketPreview(item); }
  });
  document.querySelector('.builder-library__filters').addEventListener('click', event => { const control = event.target.closest('[data-pack-filter]'); if (!control) return; document.querySelectorAll('[data-pack-filter]').forEach(item => item.classList.toggle('active', item === control)); renderBuilderPack(control.dataset.packFilter); setPackStatus(`${control.textContent.trim()} shapes shown.`); });
  $('#room-style-grid').addEventListener('click', (event) => { const room = event.target.closest('[data-room-style]'); if (!room) return; location.href = `environment-builder.html?layout=${encodeURIComponent(room.dataset.roomStyle)}`; });
  $('#builder-model-grid').addEventListener('click', (event) => { const model = event.target.closest('[data-builder-model]'); if (!model) return; const tray = readTray(), index = tray.findIndex(item => item.id === model.dataset.builderModel);
    if (index >= 0) tray.splice(index, 1); else { const [id,name,type,thumbnailUrl] = builderModels.find(item => item[0] === model.dataset.builderModel); tray.push({id,name,type,thumbnailUrl,addedAt:new Date().toISOString()}); }
    try { localStorage.setItem(trayKey, JSON.stringify(tray)); } catch { setPackStatus('Your build tray could not be saved. Check browser storage and try again.'); return; }
    renderBuilderPack(); setPackStatus(`${model.dataset.modelName} ${index < 0 ? 'added to' : 'removed from'} your build tray.`); });
  document.querySelector('[data-pack-template]').addEventListener('click', (event) => { location.href = `environment-builder.html?layout=${encodeURIComponent(event.currentTarget.dataset.packTemplate)}`; });
  const requestedTab = location.hash.slice(1); if (['market','backpack','worlds'].includes(requestedTab)) document.querySelector(`[data-builder-tab="${requestedTab}"]`)?.click();
  import('./public/js/shared-game-inventory.js').then(sync=>{window.MuzikazInventorySync=sync;sync.watchInventoryChange(()=>refresh().catch(error=>status(error.message,true)));});
  api('/api/account/bootstrap').then((bootstrap) => { state.csrf = bootstrap.csrfToken || ''; return refresh(); }).catch(async (error) => { await refresh(); status(`${error.message} Sign in through Members to use account features.`, true); });
}());

