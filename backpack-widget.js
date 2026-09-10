(function () {
  'use strict';

  const API_PATH = '/api/wallet/state';
  const MARKET_KEY = 'muzikazBackpackMarket';
  const TRANSACTIONS_KEY = 'muzikazBackpackTransactions';
  const PROFILE_ASSETS_KEY = 'muzikazOwnedProfiles';
  const MODEL_ASSETS_KEY = 'muzikazBackpackAssetsV1';
  const previewSlots = ['Avatar', 'Companion', 'Head', 'Neck', 'Torso', 'Tool', 'Collectible', 'Land', 'Bottle', 'Environment'];
  const builderCategories = [
    ['Enemies & NPCs', 'NPC', '☠'], ['Environments', 'WORLD', '◈'], ['Buildings', 'BUILDINGS', '⌂'],
    ['Terrain', 'TERRAIN', '▲'], ['Props & assets', 'PROPS', '▣'], ['Vehicles', 'VEHICLES', '▷'],
    ['Game systems', 'GAME SYSTEMS', '⌘'], ['AI & functions', 'AI', '✹'], ['Audio & effects', 'EFFECTS', '✷']
  ];

  const icon = (className = '') => `<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true"><path d="M15 18v-3a9 9 0 0 1 18 0v3"/><path d="M12 18h24a4 4 0 0 1 4 4v19H8V22a4 4 0 0 1 4-4Z"/><path d="M16 28h16v13H16z"/><path d="M8 25H5v11h3M40 25h3v11h-3"/><path d="M19 14h10M12 25h28M20 32h8"/></svg>`;
  const walletIcon = () => '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 13h28a5 5 0 0 1 5 5v22H8a4 4 0 0 1-4-4V13a5 5 0 0 1 5-5h25"/><path d="M31 23h12v10H31a5 5 0 0 1 0-10Z"/><circle cx="33" cy="28" r="1"/></svg>';
  const adminIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.3c0 4.7 3.2 8.2 7.5 9.7 4.3-1.5 7.5-5 7.5-9.7V6L12 3Z"/><path d="M9.5 11.5V10a2.5 2.5 0 0 1 5 0v1.5M9 11.5h6v4H9z"/></svg>';
  const supportIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 9 9 0 0 1-3.2-.7L4 20l1.6-4.1A7.4 7.4 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg>';
  const activityIcon = (kind) => {
    const paths = {
      hidden: '<path d="M12 20h24v24H12zM17 20v-3a7 7 0 0 1 14 0v3"/><path d="M21 30a3 3 0 1 1 5 2.2V36"/><circle cx="23.5" cy="39" r="1"/>',
      land: '<path d="m5 34 10-17 9 12 6-8 13 18H5z"/><path d="m15 17 5-9 8 14M8 39h32"/>',
      avatar: '<circle cx="24" cy="15" r="8"/><path d="M9 42c1-11 6-17 15-17s14 6 15 17"/>',
      item: '<path d="M9 15h30v27H9zM9 23h30M18 15a6 6 0 0 1 12 0"/><path d="M20 31h8"/>'
    };
    return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind] || paths.item}</svg>`;
  };
  const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected';
  const safeJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

  function localItems(address) {
    const profiles = safeJson(PROFILE_ASSETS_KEY, {});
    const loadouts = safeJson('muzikazStarterLoadoutsV1', {});
    const values = [];
    const add = (value) => { if (value && !values.includes(value)) values.push(value); };
    (profiles[address] || []).forEach(add);
    const loadout = loadouts[address];
    if (loadout) {
      add(loadout.avatar && `${loadout.avatar} · Avatar`);
      add(loadout.land && `${loadout.land} · Land deed`);
      (loadout.assets || []).forEach(add);
    }
    return values;
  }

  function localModelAssets(address) {
    return safeJson(MODEL_ASSETS_KEY, {})[String(address || '').toLowerCase()] || [];
  }

  function ensureStyles() {
    if (document.querySelector('link[data-backpack-widget-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'backpack-widget.css';
    link.dataset.backpackWidgetStyles = '';
    document.head.appendChild(link);
  }

  async function createWidget() {
    if (document.querySelector('[data-global-backpack]') || !window.MZKWallet) return;
    ensureStyles();
    const existingWalletButton = document.querySelector('#wallet-connect');
    const headerMount = document.querySelector('.global-site-header .icons, .site-header .icons, .site-header .header-actions');
    const dock = document.createElement('div');
    dock.className = existingWalletButton || headerMount ? 'mzk-backpack-dock is-inline' : 'mzk-backpack-dock';
    dock.dataset.globalBackpack = '';
    dock.innerHTML = `${existingWalletButton ? '' : `<button class="mzk-wallet-button" type="button" data-widget-connect>${walletIcon()}<span>Connect Ethereum</span></button>`}<button class="mzk-backpack-button" type="button" data-open-backpack aria-haspopup="dialog" aria-expanded="false">${icon()}<span>Backpack</span><small data-backpack-address>Connect wallet</small></button>`;
    if (existingWalletButton) existingWalletButton.insertAdjacentElement('afterend', dock);
    else if (headerMount) headerMount.prepend(dock);
    else document.body.appendChild(dock);

    const drawer = document.createElement('section');
    drawer.className = 'mzk-backpack-drawer';
    drawer.dataset.backpackDrawer = '';
    drawer.hidden = true;
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'global-backpack-title');
    drawer.innerHTML = `<div class="mzk-backpack-scrim" data-close-backpack></div><div class="mzk-backpack-panel"><header>${icon()}<div><p>PLAYER + CREATOR INVENTORY</p><h2 id="global-backpack-title">My Backpack</h2><small data-drawer-address>Connect an Ethereum wallet to open your account.</small></div><button type="button" data-close-backpack aria-label="Close Backpack">×</button></header><div class="mzk-backpack-switch" role="tablist" aria-label="Choose backpack"><button type="button" role="tab" aria-selected="true" data-backpack-view="game"><span>In-game Backpack</span><small>Original play-ready items</small></button><button type="button" role="tab" aria-selected="false" data-backpack-view="builder"><span>Builder Backpack</span><small>Creator-owned assets</small></button></div><div data-backpack-view-panel="game"><div class="mzk-backpack-account"><div><span>Wallet</span><strong data-account-address>Not connected</strong></div><div><span>Network</span><strong data-account-network>—</strong></div><div><span>MZK balance</span><strong data-account-balance>0 MZK</strong></div></div><p class="mzk-backpack-status" data-backpack-status role="status" aria-live="polite"></p><div class="mzk-backpack-items" data-backpack-items></div><nav aria-label="Backpack network"><a href="model-market.html">Game market <b>↗</b></a><a href="buy-mzk.html">Buy / swap MZK <b>↗</b></a><a href="members.html#owned-collection">Full account <b>↗</b></a></nav><div class="mzk-backpack-trades"><h3>Recent market activity</h3><ol data-backpack-trades></ol></div></div><div class="mzk-builder-view" data-backpack-view-panel="builder" hidden><div class="mzk-builder-intro"><p>OWNED CREATOR INVENTORY</p><h3>Your Builder Backpack</h3><span>Builder assets are kept separate from the original game Backpack so creators can edit, configure and place them into owned worlds.</span><p class="mzk-builder-status" data-builder-backpack-status role="status">Open this tab to load your Builder Backpack.</p><div class="mzk-builder-owned" data-builder-backpack-items></div><div><a href="builder-market.html#backpack">Manage Builder Backpack</a><a href="builder-market.html#backpack" class="is-secondary">Import / create asset</a></div></div><h3 class="mzk-builder-market-title">Add from Builder Market</h3><div class="mzk-builder-category-grid">${builderCategories.map(([label, category, glyph]) => `<a href="builder-market.html?category=${encodeURIComponent(category)}#market"><i aria-hidden="true">${glyph}</i><strong>${label}</strong><small>Browse &amp; add</small></a>`).join('')}</div><div class="mzk-builder-workflow"><strong>Build with existing creator logic</strong><ol><li><b>1</b><span>Buy or import reusable game assets</span></li><li><b>2</b><span>Configure behavior per placed instance</span></li><li><b>3</b><span>Place into owned land and expand your world</span></li></ol><a href="builder-market.html#worlds">Manage my land / worlds ↗</a></div></div></div>`;
    document.body.appendChild(drawer);

    const utilityBar = document.createElement('aside');
    utilityBar.className = `mzk-site-utility${headerMount ? ' is-header-utility' : ''}`;
    utilityBar.setAttribute('aria-label', 'Support and administration');
    utilityBar.innerHTML = `<button type="button" data-open-admin-login aria-label="Admin login" aria-haspopup="dialog">${adminIcon()}<span>Admin</span></button><button type="button" data-open-support-chat aria-haspopup="dialog" aria-controls="muzikaz-support-chat">${supportIcon()}<span>Support</span></button>`;
    const headerNavigation = document.querySelector('.global-site-header .global-nav, .site-header .nav');
    // Put the staff controls at the top of the phone toggle list. Keeping them
    // inside the existing navigation also preserves the SVG header introduced
    // by df3b8c6 instead of replacing it with a second mobile-only masthead.
    if (headerNavigation) headerNavigation.prepend(utilityBar);
    else (headerMount || document.body).appendChild(utilityBar);

    const supportChat = document.querySelector('.support-chat');
    supportChat?.classList.add('is-utility-linked');
    utilityBar.querySelector('[data-open-support-chat]').addEventListener('click', () => {
      document.querySelector('.support-chat-toggle')?.click();
    });

    const adminDialog = document.createElement('section');
    adminDialog.className = 'mzk-admin-dialog';
    adminDialog.hidden = true;
    adminDialog.setAttribute('role', 'dialog');
    adminDialog.setAttribute('aria-modal', 'true');
    adminDialog.setAttribute('aria-labelledby', 'global-admin-login-title');
    adminDialog.innerHTML = `<div class="mzk-admin-scrim" data-close-admin-login></div><div class="mzk-admin-card"><button class="mzk-admin-close" type="button" data-close-admin-login aria-label="Close administrator login">×</button><p>Restricted access</p><h2 id="global-admin-login-title">Administrator sign in</h2><form data-global-admin-form><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form><small data-global-admin-status role="status" aria-live="polite">Enter your administrator credentials.</small></div>`;
    document.body.appendChild(adminDialog);

    const adminForm = adminDialog.querySelector('[data-global-admin-form]');
    const adminStatus = adminDialog.querySelector('[data-global-admin-status]');
    const openAdminButton = utilityBar.querySelector('[data-open-admin-login]');
    const adminToken = () => localStorage.getItem('muzikazAdminToken') || sessionStorage.getItem('muzikazAdminToken') || '';
    const rememberAdmin = (token) => { localStorage.setItem('muzikazAdminToken', token); sessionStorage.setItem('muzikazAdminToken', token); };
    const hasAdminSession = async () => {
      const token = adminToken();
      const response = await fetch('/api/admin/session', { headers: { ...(token ? { 'x-admin-token': token } : {}), Accept: 'application/json' }, cache: 'no-store' });
      return response.ok;
    };
    const closeAdmin = () => { adminDialog.hidden = true; document.documentElement.classList.remove('mzk-admin-open'); openAdminButton.focus(); };
    openAdminButton.addEventListener('click', async () => {
      // A successful login is shared with the standalone command center for the
      // lifetime of this tab. Do not put an already authenticated administrator
      // through the utility login dialog a second time.
      try { if (await hasAdminSession()) {
        window.location.href = 'admin.html';
        return;
      } } catch { /* Show the sign-in surface only when the session cannot be verified. */ }
      adminDialog.hidden = false;
      document.documentElement.classList.add('mzk-admin-open');
      adminForm.querySelector('input').focus();
    });
    if (new URLSearchParams(window.location.search).get('admin') === 'login') openAdminButton.click();
    adminDialog.addEventListener('click', (event) => { if (event.target.closest('[data-close-admin-login]')) closeAdmin(); });
    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      adminStatus.textContent = 'Authenticating administrator…';
      try {
        const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(adminForm))) });
        const result = await response.json();
        if (!response.ok || !result.success || !result.data?.token) throw new Error(result.message || 'Authentication failed.');
        rememberAdmin(result.data.token);
        adminForm.reset();
        adminStatus.textContent = 'Access granted. Opening the command center…';
        window.setTimeout(() => { window.location.href = 'admin.html'; }, 350);
      } catch (error) { adminStatus.textContent = error.message || 'Authentication failed.'; }
    });

    const button = dock.querySelector('[data-open-backpack]');
    const connectButton = dock.querySelector('[data-widget-connect]');
    const mobileBackpackButtons = [...document.querySelectorAll('.mobile-header-action[aria-label="View backpack"], .mobile-header-action[aria-label="View Builder Backpack"]')];
    let lastFocused = null;
    let builderBackpackLoaded = false;

    async function loadBuilderBackpack() {
      if (builderBackpackLoaded) return;
      const status = drawer.querySelector('[data-builder-backpack-status]');
      const items = drawer.querySelector('[data-builder-backpack-items]');
      status.textContent = 'Loading your authenticated Builder Backpack…';
      try {
        const request = window.MUZIKAZ_API?.fetch?.bind(window.MUZIKAZ_API) || window.fetch.bind(window);
        const response = await request('/api/builder/backpack', { headers: { Accept: 'application/json' }, credentials: 'include' });
        const payload = await response.json();
        if (!response.ok || payload.success === false) throw new Error(payload.message || 'Builder account access is required.');
        const assets = Array.isArray(payload.data?.assets) ? payload.data.assets : [];
        items.innerHTML = assets.length ? assets.slice(0, 6).map((asset) => `<a href="builder-market.html#backpack"><i aria-hidden="true">${builderCategories.find((category) => category[1] === asset.builder_category)?.[2] || '▣'}</i><span><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.builder_category)} · v${escapeHtml(asset.version || '1.0.0')}</small></span><b>EDIT ↗</b></a>`).join('') : '<p>Your Builder Backpack is ready. Import an asset or add one from the Builder Market.</p>';
        status.textContent = `${assets.length} owned builder ${assets.length === 1 ? 'asset' : 'assets'} · server verified`;
        builderBackpackLoaded = true;
      } catch (error) {
        items.innerHTML = '<a href="members.html"><span><strong>Open account access</strong><small>Sign in to load server-owned builder assets.</small></span><b>SIGN IN ↗</b></a>';
        status.textContent = error.message || 'Sign in to load your Builder Backpack.';
      }
    }

    function selectView(view) {
      const selected = view === 'builder' ? 'builder' : 'game';
      drawer.querySelectorAll('[data-backpack-view]').forEach((tab) => {
        const active = tab.dataset.backpackView === selected;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      drawer.querySelectorAll('[data-backpack-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.backpackViewPanel !== selected; });
      drawer.querySelector('#global-backpack-title').textContent = selected === 'builder' ? 'Builder Backpack' : 'My Backpack';
      if (selected === 'builder') loadBuilderBackpack();
    }
    drawer.querySelector('.mzk-backpack-switch').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-backpack-view]');
      if (tab) selectView(tab.dataset.backpackView);
    });
    drawer.querySelector('.mzk-backpack-switch').addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = drawer.querySelector(`[data-backpack-view="${event.key === 'ArrowRight' ? 'builder' : 'game'}"]`);
      selectView(next.dataset.backpackView);
      next.focus();
    });
    selectView('game');

    async function connect() {
      connectButton?.setAttribute('disabled', '');
      try { await window.MZKWallet.connectBrowserWallet(); }
      catch (error) { drawer.querySelector('[data-backpack-status]').textContent = error?.message || 'Wallet connection was not completed.'; }
      finally { connectButton?.removeAttribute('disabled'); renderButton(); }
    }

    function renderButton() {
      const address = window.MZKWallet.connectedAddress();
      dock.classList.toggle('is-connected', Boolean(address));
      dock.querySelector('[data-backpack-address]').textContent = address ? short(address) : 'Connect wallet';
      if (connectButton) connectButton.querySelector('span').textContent = address ? short(address) : 'Connect Ethereum';
    }

    function renderGuestBackpack(message = 'Connect or sign in to load your MUZIKAZ items.') {
      drawer.querySelector('[data-drawer-address]').textContent = 'Preview — no items shown here are owned.';
      drawer.querySelector('[data-account-address]').textContent = 'Not connected';
      drawer.querySelector('[data-account-network]').textContent = 'Preview';
      drawer.querySelector('[data-account-balance]').textContent = '—';
      drawer.querySelector('[data-backpack-status]').textContent = message;
      drawer.querySelector('[data-backpack-items]').innerHTML = `<div class="mzk-backpack-preview"><div class="mzk-backpack-preview-copy"><strong>Backpack template</strong><span>Empty slots preview the supported inventory layout. They are not assets, NFTs, or a balance.</span><button type="button" data-preview-connect>Connect wallet</button></div><div class="mzk-backpack-slot-grid">${previewSlots.map((slot) => `<div class="mzk-backpack-slot">${icon()}<strong>${slot}</strong><small>Empty slot</small></div>`).join('')}</div></div>`;
      drawer.querySelector('[data-preview-connect]')?.addEventListener('click', connect);
      drawer.querySelector('[data-backpack-trades]').innerHTML = `<li class="mzk-activity-card is-locked">${activityIcon('hidden')}<div class="mzk-activity-copy"><strong>Private account activity</strong><span>Connect to reveal purchases, sales, and payment methods.</span></div><span class="mzk-payment-badge is-locked">${activityIcon('hidden')}<b>Hidden</b></span></li><li class="mzk-activity-help"><span>Every completed trade records its payment here.</span><a href="members.html">Member access</a></li>`;
    }

    async function loadBackpack() {
      const address = window.MZKWallet.connectedAddress();
      if (!address) { renderGuestBackpack(); return false; }
      const activeAddress = window.MZKWallet.connectedAddress();
      const status = drawer.querySelector('[data-backpack-status]');
      status.textContent = 'Syncing this wallet’s Backpack…';
      let remoteItems = [];
      let remoteState = null;
      try {
        const response = await fetch(API_PATH, { headers: { 'X-Wallet-Address': activeAddress, Accept: 'application/json' } });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Backpack sync failed.');
        remoteState = payload.data;
        remoteItems = Array.isArray(remoteState?.items) ? remoteState.items : [];
        status.textContent = 'Backpack synced with the MUZIKAZ market network.';
      } catch (_) {
        status.textContent = 'Showing this device’s Backpack. Network sync is temporarily unavailable.';
      }
      const modelAssets = localModelAssets(activeAddress);
      const items = [...new Set([...remoteItems.map((item) => typeof item === 'string' ? item : item?.name), ...localItems(activeAddress), ...modelAssets.map((asset) => asset.name)].filter(Boolean))];
      if (remoteState && items.length !== remoteItems.length) {
        try {
          await fetch(API_PATH, { method: 'PUT', headers: { 'X-Wallet-Address': activeAddress, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items, tokens: { ...(remoteState.tokens || {}), MZK: window.MZKWallet.balance(activeAddress) }, memory: remoteState.memory || {} }) });
        } catch (_) { /* Local inventory is still available when durable sync cannot be written. */ }
      }
      let network = 'Ethereum';
      try { const chain = await window.ethereum?.request?.({ method: 'eth_chainId' }); network = chain ? `Ethereum · ${chain}` : network; } catch (_) { /* The connected account remains usable if chain lookup is denied. */ }
      drawer.querySelector('[data-drawer-address]').textContent = `Registered account ${activeAddress}`;
      drawer.querySelector('[data-account-address]').textContent = short(activeAddress);
      drawer.querySelector('[data-account-address]').title = activeAddress;
      drawer.querySelector('[data-account-network]').textContent = network;
      drawer.querySelector('[data-account-balance]').textContent = `${window.MZKWallet.balance(activeAddress).toLocaleString()} MZK`;
      const modelCards = modelAssets.map((asset) => `<article class="mzk-backpack-model"><model-viewer src="${escapeHtml(asset.modelUrl)}" ${asset.iosModelUrl ? `ios-src="${escapeHtml(asset.iosModelUrl)}"` : ''} camera-controls auto-rotate shadow-intensity="1" alt="${escapeHtml(asset.name)} purchased 3D model"></model-viewer><div><strong>${escapeHtml(asset.name)}</strong><small>Purchased GLB · Connected to ${short(activeAddress)}</small></div></article>`);
      const modelNames = new Set(modelAssets.map((asset) => asset.name));
      const bottleArt = (item) => /Black Genie Bottle/i.test(item) ? 'public/assets/black-genie-bottle.svg' : /Golden Genie Bottle/i.test(item) ? 'public/assets/golden-genie-bottle.svg' : '';
      const itemCards = items.filter((item) => !modelNames.has(item)).map((item) => `<article>${bottleArt(item) ? `<img src="${bottleArt(item)}" alt="${escapeHtml(item)} Backpack artwork" loading="lazy">` : icon()}<div><strong>${escapeHtml(item)}</strong><small>Connected to ${short(activeAddress)}</small></div></article>`);
      drawer.querySelector('[data-backpack-items]').innerHTML = modelCards.length || itemCards.length ? [...modelCards, ...itemCards].join('') : `<div class="mzk-backpack-empty">${icon()}<strong>Your Backpack is ready</strong><p>Collect a model, land deed, avatar, wearable, or market drop and it will appear under this Ethereum account.</p></div>`;
      const transactions = safeJson(TRANSACTIONS_KEY, []).filter((tx) => [tx.buyer, tx.seller, tx.owner].map(String).map((value) => value.toLowerCase()).includes(activeAddress)).slice(-4).reverse();
      drawer.querySelector('[data-backpack-trades]').innerHTML = transactions.length ? transactions.map((tx) => {
        const rawAsset = tx.asset || tx.reason || 'Backpack trade';
        const unrevealed = /unrevealed|mystery|sealed/i.test(rawAsset);
        const asset = unrevealed ? 'Unrevealed drop' : rawAsset;
        const category = unrevealed ? 'hidden' : /land|world|environment/i.test(rawAsset) ? 'land' : /avatar|character|companion/i.test(rawAsset) ? 'avatar' : 'item';
        const isSeller = String(tx.seller || tx.owner || '').toLowerCase() === activeAddress;
        const payment = tx.cryptoPayment;
        const amount = Number(payment?.amount ?? tx.tokenValue ?? tx.amount ?? 0);
        const currency = payment?.currency || 'MZK';
        const validDate = tx.createdAt && !Number.isNaN(new Date(tx.createdAt).getTime());
        return `<li class="mzk-activity-card${unrevealed ? ' is-unrevealed' : ''}">${activityIcon(category)}<div class="mzk-activity-copy"><span>${isSeller ? 'Sold' : 'Purchased'} · ${unrevealed ? 'Identity hidden until reveal' : 'Completed trade'}</span><strong>${escapeHtml(asset)}</strong>${validDate ? `<time datetime="${escapeHtml(tx.createdAt)}">${new Date(tx.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>` : ''}</div><span class="mzk-payment-badge${currency === 'MZK' ? ' is-mzk' : ''}">${currency === 'MZK' ? '<i aria-hidden="true">M</i>' : walletIcon()}<span><small>${isSeller ? 'Received' : 'Paid'}</small><b>${Number.isFinite(amount) ? amount.toLocaleString() : '0'} ${escapeHtml(currency)}</b></span></span></li>`;
      }).join('') : `<li class="mzk-activity-card is-empty">${activityIcon('item')}<div class="mzk-activity-copy"><strong>No market activity yet</strong><span>Purchases, swaps, and sales will appear here with their payment method.</span></div><a href="model-market.html">Explore market</a></li>`;
      return true;
    }

    async function open(view = 'game') {
      lastFocused = document.activeElement;
      selectView(view);
      drawer.hidden = false;
      document.documentElement.classList.add('mzk-backpack-open');
      button.setAttribute('aria-expanded', 'true');
      drawer.querySelector('[data-close-backpack]').focus?.();
      await loadBackpack();
    }
    function close() { drawer.hidden = true; document.documentElement.classList.remove('mzk-backpack-open'); button.setAttribute('aria-expanded', 'false'); lastFocused?.focus?.(); }
    button.addEventListener('click', () => open('game'));
    mobileBackpackButtons.forEach((mobileButton) => {
      mobileButton.setAttribute('aria-haspopup', 'dialog');
      mobileButton.setAttribute('aria-controls', 'global-backpack-title');
      mobileButton.addEventListener('click', (event) => {
        event.preventDefault();
        open(mobileButton.getAttribute('aria-label') === 'View Builder Backpack' ? 'builder' : 'game');
      });
    });
    connectButton?.addEventListener('click', connect);
    drawer.addEventListener('click', (event) => { if (event.target.closest('[data-close-backpack]')) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !drawer.hidden) close(); else if (event.key === 'Escape' && !adminDialog.hidden) closeAdmin(); else if (event.key === 'Escape' && !menu.hidden) { toggleMenu(false); menuButton.focus(); } });
    window.addEventListener('mzk:wallet-connection-changed', renderButton);
    window.addEventListener('mzk:balance-changed', renderButton);
    renderButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createWidget, { once: true });
  else createWidget();
})();
