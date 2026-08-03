const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const cartCount = document.querySelector('#cart-count');
const modelStatus = document.querySelector('#model-status');
const modelDetail = document.querySelector('#model-detail');
const modelDetailArt = document.querySelector('#model-detail-art');
const modelDetailTitle = document.querySelector('#model-detail-title');
const modelDetailCopy = document.querySelector('#model-detail-copy');
const addModelButton = document.querySelector('[data-add-model]');
const modelPageLink = document.querySelector('#model-page-link');
let cartItems = 0;
const CART_KEY = 'muzikazCheckoutCart';
const BACKPACK_MARKET_KEY = 'muzikazBackpackMarket';
const BACKPACK_TRANSACTIONS_KEY = 'muzikazBackpackTransactions';
const BACKPACK_STARTING_TOKENS = 500;

// One catalog drives both the world map and the marketplace. Coordinates belong
// to the asset, so a purchased world always resolves to the same map location.
const WORLD_ASSETS = [
  { id: 'volt-city', name: 'Volt City', kind: 'Land world', x: 23, y: 28, price: '$35.00', logo: 'logo_symbol_crop_2x.png', detail: 'The electric capital · live stages and creator towers' },
  { id: 'skyline-deck', name: 'Skyline Deck', kind: 'Land world', x: 49, y: 22, price: '$25.00', logo: 'available_online_events_banner_2x_transparent.png', detail: 'Rooftop events · tonight at 20:00' },
  { id: 'echo-gardens', name: 'Echo Gardens', kind: 'Land world', x: 74, y: 31, price: '$25.00', logo: 'dark_smoke_green_fx_2x.png', detail: 'Living sound biome · open for builders' },
  { id: 'crew-plaza', name: 'Crew Plaza', kind: 'Land world', x: 36, y: 49, price: '$25.00', logo: 'join_the_crew_banner_2x_transparent.png', detail: 'Social hub · crews gathering now' },
  { id: 'studio-ridge', name: 'Studio Ridge', kind: '3D Environment', x: 63, y: 53, price: '$48.00', logo: 'smoke_energy_background_large_2x_transparent.png', detail: 'MUZIKAZ Main Floor · complete walkable GLB stage', environmentId: 'muzikaz-main' },
  { id: 'neon-docks', name: 'Neon Docks', kind: 'Land world', x: 18, y: 70, price: '$25.00', logo: 'brand_name_tagline_panel_2x.png', detail: 'Drop port · new assets arriving' },
  { id: 'bassline-badlands', name: 'Bassline Badlands', kind: '3D Environment', x: 50, y: 76, price: '$52.00', logo: 'hero_banner_full_transparent.png', detail: 'MUZIKAZ Upper Floor · high-energy adventure environment', environmentId: 'muzikaz-upper' },
  { id: 'pixel-peaks', name: 'Pixel Peaks', kind: '3D Environment', x: 82, y: 72, price: '$58.00', logo: 'logo_panel_2x_transparent.png', detail: 'Sheep Base · panoramic walkable mountain build', environmentId: 'sheepbase' }
];

function findWorldAsset(value) {
  return WORLD_ASSETS.find((asset) => String(value || '').includes(asset.name));
}

function parsePrice(value) {
  return Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;
}

function readCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function writeCart(items) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  syncCartCount();
}

function syncCartCount() {
  cartItems = readCart().reduce((total, item) => total + (Number(item.quantity) || 1), 0);
  if (cartCount) cartCount.textContent = String(cartItems);
}

function addCartLine(name, price, meta = '') {
  if (!name) return;
  const items = readCart();
  const key = `${name}|${meta}`;
  const existing = items.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ key, name, price: Number(price) || 0, meta, quantity: 1 });
  }
  writeCart(items);
}
let selectedModel = '';
const ownedProfilesSeed = {
  'crew@muzikaz.example': ['Originals 3D Model Pack', 'Neon Hoodie', 'Beat Bottle'],
  'collector@muzikaz.example': ['Legends 3D Model Pack', 'Crew Cap', 'Hero Banner'],
};
let currentMemberEmail = window.localStorage.getItem('muzikazBottleMemberEmail') || '';


function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function closeMenu() {
  nav?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}

function updateCart(button, label = 'Added') {
  syncCartCount();
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = originalText; }, 1200);
}

function normalizeMemberEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function readOwnedProfiles() {
  const saved = window.localStorage.getItem('muzikazOwnedProfiles');
  if (saved) {
    try {
      return { ...ownedProfilesSeed, ...JSON.parse(saved) };
    } catch (error) {
      return { ...ownedProfilesSeed };
    }
  }
  return { ...ownedProfilesSeed };
}

function writeOwnedProfiles(profiles) {
  window.localStorage.setItem('muzikazOwnedProfiles', JSON.stringify(profiles));
}

function readBackpackData(key, fallback) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    return saved && typeof saved === 'object' ? saved : fallback;
  } catch (error) { return fallback; }
}

function backpackBalance(owner) {
  return window.MZKWallet ? window.MZKWallet.ensureWallet(owner) : 0;
}

function backpackListing(owner, asset) {
  return readBackpackData(BACKPACK_MARKET_KEY, {})[owner]?.[asset] || { tokenValue: 25, listed: false };
}

function setBackpackListing(owner, asset, value, listed) {
  const market = readBackpackData(BACKPACK_MARKET_KEY, {});
  market[owner] ||= {};
  market[owner][asset] = { tokenValue: value, listed };
  window.localStorage.setItem(BACKPACK_MARKET_KEY, JSON.stringify(market));
}

function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function claimOwnedAsset(assetName, source = 'Marketplace claim') {
  const owner = normalizeMemberEmail(currentMemberEmail);
  if (!owner || !assetName) return;
  const profiles = readOwnedProfiles();
  const owned = profiles[owner] || [];
  const item = `${assetName} · ${source}`;
  if (!owned.some((entry) => entry.startsWith(assetName))) {
    owned.push(item);
    profiles[owner] = owned;
    writeOwnedProfiles(profiles);
  }
  renderOwnedCollection(owner);
}

function ownedAssetDetail(assetName) {
  const worldAsset = findWorldAsset(assetName);
  if (worldAsset) return { title: assetName, type: worldAsset.kind, image: worldAsset.logo, copy: `${worldAsset.detail}. Located at X ${worldAsset.x}, Y ${worldAsset.y}.`, href: `index.html?world=${worldAsset.id}#world-map` };
  if (/\b(?:digital\s+land|world\s+plot|land\s+(?:asset|reservation|deed|claim))\b/i.test(assetName)) {
    const owner = normalizeMemberEmail(currentMemberEmail);
    let claim = null;
    try { claim = JSON.parse(window.localStorage.getItem('muzikazLandClaims') || '{}')[owner] || null; } catch (error) { /* Render the deed without optional map metadata. */ }
    const location = claim ? ` Staked at ${claim.place} (X ${claim.x}, Y ${claim.y}).` : ' Open the World Map to stake this deed.';
    return { title: assetName, type: 'Digital land', image: 'public/assets/muzikaz-world-map.svg', copy: `A MUZIKAZ World deed tied to this member profile.${location}`, href: 'index.html#world-map' };
  }
  const model = assetCatalog.models.find((item) => assetName.includes(item.name));
  if (model) return { title: assetName, type: model.type, image: model.file, copy: model.copy };
  const product = assetCatalog.retail.find((item) => assetName.includes(item.name));
  if (product) return { title: assetName, type: product.category, image: product.asset, copy: `Connected to ${product.connectsTo.join(' + ')} and tied to the owner's account.` };
  const characterWorld = assetCatalog.characterWorldAssets.find((item) => assetName.includes(item.name));
  if (characterWorld) return { title: assetName, type: characterWorld.category, image: characterWorld.asset, copy: `Character & World Asset compatible with ${characterWorld.connectsTo.join(' + ')} and tied to the owner's account.` };
  return { title: assetName, type: 'Uploaded asset', image: 'logo_panel_2x_transparent.png', copy: 'Member-uploaded file saved to this account collection.' };
}

function hasBottleLogin() {
  return window.localStorage.getItem('muzikazBottleMember') === 'true' && Boolean(normalizeMemberEmail(window.localStorage.getItem('muzikazBottleMemberEmail') || currentMemberEmail));
}

function protectMemberOnlyPages() {
  const protectedPages = ['model-explorer.html', 'token-mixer.html', 'voice-changer.html', 'quest-board.html'];
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  if (!protectedPages.includes(pageName) || hasBottleLogin()) return;
  window.sessionStorage.setItem('muzikazLoginRedirect', `${pageName}${window.location.search || ''}${window.location.hash || ''}`);
  window.location.replace(`members.html?login=required&redirect=${encodeURIComponent(pageName)}`);
}

protectMemberOnlyPages();

function initModelMarketGate() {
  const cover = document.querySelector('#model-market-cover');
  const form = document.querySelector('#model-market-login-form');
  const status = document.querySelector('#model-market-login-status');
  if (!cover || !form) return;

  const uncover = () => {
    document.body.classList.remove('model-market-gated');
    cover.setAttribute('hidden', '');
  };

  if (hasBottleLogin()) {
    uncover();
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = normalizeMemberEmail(data.get('email'));
    const passcode = String(data.get('passcode') || '').trim();
    if (!email || !passcode) {
      if (status) status.textContent = 'Enter both your member email and passcode.';
      return;
    }
    currentMemberEmail = email;
    window.localStorage.setItem('muzikazBottleMember', 'true');
    window.localStorage.setItem('muzikazBottleMemberEmail', email);
    uncover();
  });
}

initModelMarketGate();

function initWorldAtlas() {
  const atlas = document.querySelector('#world-map');
  const viewport = document.querySelector('#world-map-viewport');
  const marker = document.querySelector('#world-map-you');
  const form = document.querySelector('#world-position-form');
  const name = document.querySelector('#world-place-name');
  const detail = document.querySelector('#world-place-detail');
  const readout = document.querySelector('#world-position-readout');
  const status = document.querySelector('#world-map-status');
  const enter = document.querySelector('#world-enter-button');
  const claimButton = document.querySelector('#world-claim-button');
  const ownership = document.querySelector('#world-map-ownership');
  if (!atlas || !viewport || !marker || !form || !name || !detail || !readout || !status || !enter || !claimButton || !ownership) return;

  const markers = atlas.querySelector('.world-atlas__markers');
  const assetLogo = document.querySelector('#world-asset-logo');
  const assetType = document.querySelector('#world-asset-type');
  const assetAction = document.querySelector('#world-asset-action');
  const routes = atlas.querySelector('.world-atlas__routes');
  const districtButtons = [...atlas.querySelectorAll('[data-atlas-district]')];
  const modeButtons = [...atlas.querySelectorAll('[data-atlas-mode]')];
  const owner = normalizeMemberEmail(window.localStorage.getItem('muzikazBottleMemberEmail'));
  const ownedAssets = ownerWorldNames();
  if (markers) markers.innerHTML = WORLD_ASSETS.map((asset) => `<button type="button" style="--x:${asset.x}%;--y:${asset.y}%" data-map-place="${asset.name}" data-map-x="${asset.x}" data-map-y="${asset.y}" data-map-detail="${asset.detail}" data-world-id="${asset.id}" class="${ownedAssets.has(asset.name) ? 'is-owned' : ''}"><i></i><span>${asset.name}<small>X ${asset.x} · Y ${asset.y}</small></span><em>${ownedAssets.has(asset.name) ? 'OWNED' : `${asset.price} · FOR SALE`}</em></button>`).join('');
  if (routes) {
    routes.setAttribute('viewBox', '0 0 100 100');
    routes.innerHTML = WORLD_ASSETS.slice(1).map((asset, index) => {
      const previous = WORLD_ASSETS[index];
      const bendX = (previous.x + asset.x) / 2 + (index % 2 ? 5 : -5);
      const bendY = (previous.y + asset.y) / 2;
      return `<path d="M ${previous.x} ${previous.y} Q ${bendX} ${bendY} ${asset.x} ${asset.y}" pathLength="1"/>`;
    }).join('');
  }
  const places = [...atlas.querySelectorAll('[data-map-place]')];
  const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  let position = { x: 36, y: 49, place: 'Crew Plaza', detail: 'Social hub · crews gathering now' };
  const isLandAsset = (asset) => /\b(?:digital\s+land|world\s+plot|land\s+(?:asset|reservation|deed|claim))\b/i.test(asset);
  const ownedLand = owner ? (readOwnedProfiles()[owner] || []).find(isLandAsset) : '';
  let claims = {};
  try { claims = JSON.parse(window.localStorage.getItem('muzikazLandClaims') || '{}') || {}; } catch (error) { claims = {}; }
  const savedClaim = owner ? claims[owner] : null;

  function ownerWorldNames() {
    const entries = owner ? (readOwnedProfiles()[owner] || []) : [];
    return new Set(WORLD_ASSETS.filter((asset) => entries.some((entry) => entry.includes(asset.name))).map((asset) => asset.name));
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem('muzikazWorldPosition') || 'null');
    if (saved && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))) position = { ...position, ...saved };
  } catch (error) { /* A fresh map position is safe when browser storage is unavailable. */ }

  function render(next, announce = true) {
    position = { ...position, ...next, x: clamp(next.x), y: clamp(next.y) };
    marker.style.setProperty('--x', `${position.x}%`);
    marker.style.setProperty('--y', `${position.y}%`);
    form.elements.x.value = position.x;
    form.elements.y.value = position.y;
    name.textContent = position.place;
    detail.textContent = position.detail;
    readout.textContent = `X ${position.x} · Y ${position.y}`;
    const asset = WORLD_ASSETS.find((item) => item.name === position.place);
    if (asset && assetLogo && assetType && assetAction) {
      assetLogo.src = asset.logo;
      assetLogo.alt = `${asset.name} logo`;
      assetType.textContent = `${asset.kind} · ${ownerWorldNames().has(asset.name) ? 'Owned' : `${asset.price} · For sale`}`;
      assetAction.href = ownerWorldNames().has(asset.name) && asset.environmentId ? `index.html?environment=${asset.environmentId}#house-explorer` : `model-market.html?world=${asset.id}#marketplace-preview`;
      assetAction.textContent = ownerWorldNames().has(asset.name) && asset.environmentId ? 'Enter owned environment' : ownerWorldNames().has(asset.name) ? 'View owned asset' : 'View in market';
    } else if (assetLogo) {
      assetLogo.removeAttribute('src');
      assetLogo.alt = '';
      assetType.textContent = 'Custom map position';
      assetAction.href = 'model-market.html#marketplace-preview';
      assetAction.textContent = 'Browse world market';
    }
    enter.firstChild.textContent = `Enter ${position.place} `;
    places.forEach((place) => place.classList.toggle('is-active', place.dataset.mapPlace === position.place));
    districtButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.atlasDistrict === position.place));
    if (announce) status.textContent = `${position.place} selected. Your spawn is set to X ${position.x}, Y ${position.y}.`;
    window.localStorage.setItem('muzikazWorldPosition', JSON.stringify(position));
  }

  function renderClaim() {
    atlas.querySelector('[data-member-land-claim]')?.remove();
    const claim = owner ? claims[owner] : null;
    if (claim) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.dataset.memberLandClaim = owner;
      pin.className = 'world-atlas__claim-pin';
      pin.style.setProperty('--x', `${claim.x}%`);
      pin.style.setProperty('--y', `${claim.y}%`);
      pin.innerHTML = `<i>⚑</i><span>${owner}'s land</span>`;
      pin.setAttribute('aria-label', `${owner}'s claimed land at ${claim.place}, X ${claim.x}, Y ${claim.y}`);
      pin.addEventListener('click', (event) => { event.stopPropagation(); render({ ...claim, detail: `Owned land tied to ${owner}'s Backpack and member profile.` }); });
      viewport.append(pin);
      ownership.innerHTML = `<strong>Claim active:</strong> ${claim.place} · X ${claim.x}, Y ${claim.y} · tied to <a href="members.html#owned-collection">${owner}'s profile</a>.`;
      claimButton.textContent = 'Move my land claim ⚑';
    } else if (ownedLand) {
      ownership.innerHTML = `<strong>Deed ready:</strong> ${ownedLand}. Pick an open map point, then stake it to your profile.`;
      claimButton.textContent = 'Stake land claim ⚑';
    } else if (!owner) {
      ownership.innerHTML = 'Sign in through <a href="members.html">Bottle Login</a>, then claim or purchase digital land for your Backpack.';
      claimButton.textContent = 'Login to stake a claim';
    } else {
      ownership.innerHTML = `No land deed found in ${owner}'s Backpack. <a href="model-market.html#muzikaz-world-plot">Claim or purchase digital land</a> first.`;
      claimButton.textContent = 'Land deed required';
    }
    claimButton.disabled = !ownedLand;
  }

  places.forEach((place) => place.addEventListener('click', (event) => {
    event.stopPropagation();
    render({ x: place.dataset.mapX, y: place.dataset.mapY, place: place.dataset.mapPlace, detail: place.dataset.mapDetail });
  }));
  districtButtons.forEach((button) => button.addEventListener('click', () => {
    const asset = WORLD_ASSETS.find((item) => item.name === button.dataset.atlasDistrict);
    if (!asset) return;
    render({ x: asset.x, y: asset.y, place: asset.name, detail: asset.detail });
    viewport.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    atlas.dataset.mode = button.dataset.atlasMode;
    modeButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    status.textContent = `${button.textContent} atmosphere engaged. World beacons and routes are still interactive.`;
  }));
  viewport.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const bounds = viewport.getBoundingClientRect();
    viewport.style.setProperty('--tilt-x', `${((event.clientY - bounds.top) / bounds.height - .5) * -3}deg`);
    viewport.style.setProperty('--tilt-y', `${((event.clientX - bounds.left) / bounds.width - .5) * 3}deg`);
  });
  viewport.addEventListener('pointerleave', () => {
    viewport.style.setProperty('--tilt-x', '0deg');
    viewport.style.setProperty('--tilt-y', '0deg');
  });
  viewport.addEventListener('click', (event) => {
    const bounds = viewport.getBoundingClientRect();
    render({ x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100, place: 'My Build Point', detail: 'A custom spawn point ready for your avatar and next world build.' });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(form);
    render({ x: values.get('x'), y: values.get('y'), place: 'My Build Point', detail: 'Your exact custom coordinates are saved on this device.' });
  });
  claimButton.addEventListener('click', () => {
    if (!owner || !ownedLand) return;
    claims[owner] = { owner, asset: ownedLand, x: position.x, y: position.y, place: position.place, claimedAt: new Date().toISOString() };
    window.localStorage.setItem('muzikazLandClaims', JSON.stringify(claims));
    window.localStorage.setItem('muzikazWorldPosition', JSON.stringify(position));
    status.textContent = `Land claimed! ${position.place} at X ${position.x}, Y ${position.y} is now tied to your deed, Backpack, map, and profile.`;
    window.dispatchEvent(new CustomEvent('muzikaz-land-claimed', { detail: claims[owner] }));
    renderClaim();
  });
  enter.addEventListener('click', () => {
    atlas.classList.remove('is-entering');
    void atlas.offsetWidth;
    atlas.classList.add('is-entering');
    status.textContent = `Welcome to ${position.place}! Spawn confirmed at X ${position.x}, Y ${position.y}. Start exploring or build from here.`;
    window.setTimeout(() => atlas.classList.remove('is-entering'), 900);
  });
  const requestedWorld = new URLSearchParams(window.location.search).get('world');
  const requestedAsset = WORLD_ASSETS.find((asset) => asset.id === requestedWorld);
  if (requestedAsset) position = { x: requestedAsset.x, y: requestedAsset.y, place: requestedAsset.name, detail: requestedAsset.detail };
  render(position, false);
  if (savedClaim) render({ ...savedClaim, detail: `Owned land tied to ${owner}'s Backpack and member profile.` }, false);
  renderClaim();
}

initWorldAtlas();

function renderOwnedCollection(preferredOwner = currentMemberEmail) {
  const current = document.querySelector('#owned-current-user');
  const copy = document.querySelector('#owned-current-copy');
  const select = document.querySelector('#owned-profile-select');
  const summary = document.querySelector('#owned-assets-summary');
  const grid = document.querySelector('#owned-assets-grid');
  const balance = document.querySelector('#backpack-token-balance');
  const transactionList = document.querySelector('#backpack-transaction-list');
  if (!current || !copy || !select || !summary || !grid) return;
  const profiles = readOwnedProfiles();
  const owner = normalizeMemberEmail(preferredOwner || currentMemberEmail);
  if (!currentMemberEmail) {
    current.textContent = 'Login required';
    copy.textContent = 'Log in above to keep purchased packs, uploaded files, and claimed collectibles inside your private Drop Backpack.';
    summary.innerHTML = '<article><strong>Locked</strong><span>Drop Backpacks unlock after login.</span></article>';
    grid.innerHTML = '';
    if (balance) balance.textContent = '— MZK';
    return;
  }
  if (!profiles[currentMemberEmail]) {
    profiles[currentMemberEmail] = ['VibeVerse Starter Pack · Backpack starter asset'];
    writeOwnedProfiles(profiles);
  }
  const owners = Object.keys(profiles).sort((a, b) => (a === currentMemberEmail ? -1 : b === currentMemberEmail ? 1 : a.localeCompare(b)));
  select.disabled = false;
  select.innerHTML = owners.map((profile) => `<option value="${escapeMarkup(profile)}" ${profile === owner ? 'selected' : ''}>${escapeMarkup(profile)}${profile === currentMemberEmail ? ' (you)' : ''}</option>`).join('');
  current.textContent = currentMemberEmail;
  copy.textContent = owner === currentMemberEmail ? 'Set token values, list assets, and manage trades from your profile Backpack.' : `Viewing ${owner}'s shared Backpack while logged in as ${currentMemberEmail}.`;
  const assets = profiles[owner] || [];
  const availableTokens = backpackBalance(currentMemberEmail);
  if (balance) balance.textContent = `${availableTokens.toLocaleString()} MZK`;
  const listedCount = assets.filter((asset) => backpackListing(owner, asset).listed).length;
  summary.innerHTML = `<article><strong>${assets.length}</strong><span>Backpack items</span></article><article><strong>${listedCount}</strong><span>Listed for profile trade</span></article><article><strong>${owner === currentMemberEmail ? availableTokens.toLocaleString() + ' MZK' : 'Market view'}</strong><span>${escapeMarkup(owner)}</span></article>`;
  grid.innerHTML = assets.map((asset, assetIndex) => {
    const detail = ownedAssetDetail(asset);
    const listing = backpackListing(owner, asset);
    const controls = owner === currentMemberEmail
      ? `<form class="backpack-price-form" data-backpack-price="${assetIndex}"><label>Token value <span><input name="tokenValue" type="number" min="1" max="1000000" step="1" value="${listing.tokenValue}" aria-label="Token value for ${escapeMarkup(detail.title)}"><b>MZK</b></span></label><button type="submit">${listing.listed ? 'Update price' : 'List for trade'}</button>${listing.listed ? `<button type="button" class="ghost" data-backpack-unlist="${assetIndex}">Unlist</button>` : ''}</form>`
      : listing.listed ? `<div class="backpack-buy"><strong>${listing.tokenValue.toLocaleString()} MZK</strong><button type="button" data-backpack-buy="${assetIndex}">Trade now</button></div>` : '<p class="backpack-not-listed">Not currently listed for trade</p>';
    return `<article><img src="${escapeMarkup(detail.image)}" alt="${escapeMarkup(detail.title)}"><span class="pill">🎒 ${escapeMarkup(detail.type)}</span><h3>${escapeMarkup(detail.title)}</h3><p>${escapeMarkup(detail.copy)}</p>${detail.href ? `<a class="card-link" href="${escapeMarkup(detail.href)}">View map claim</a>` : ''}${controls}</article>`;
  }).join('') || '<article><h3>Backpack empty</h3><p>Add marketplace drops, checkout character products, claim collectibles, or upload graphics to build this account pack.</p></article>';
  if (transactionList) {
    const transactions = readBackpackData(BACKPACK_TRANSACTIONS_KEY, []);
    transactionList.innerHTML = transactions.slice(-8).reverse().map((trade) => `<li><strong>${escapeMarkup(trade.asset)}</strong><span>${escapeMarkup(trade.seller)} → ${escapeMarkup(trade.buyer)}</span><b>${Number(trade.tokenValue).toLocaleString()} MZK</b><time datetime="${escapeMarkup(trade.createdAt)}">${new Date(trade.createdAt).toLocaleString()}</time></li>`).join('') || '<li>No trades yet.</li>';
  }
}

document.querySelector('#owned-assets-grid')?.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-backpack-price]');
  if (!form) return;
  event.preventDefault();
  const assets = readOwnedProfiles()[currentMemberEmail] || [];
  const asset = assets[Number(form.dataset.backpackPrice)];
  const value = Math.floor(Number(new FormData(form).get('tokenValue')));
  const status = document.querySelector('#backpack-trade-status');
  if (!asset || !Number.isFinite(value) || value < 1 || value > 1000000) {
    if (status) status.textContent = 'Enter a whole token value from 1 to 1,000,000 MZK.';
    return;
  }
  setBackpackListing(currentMemberEmail, asset, value, true);
  if (status) status.textContent = `${asset} is listed for ${value.toLocaleString()} MZK.`;
  renderOwnedCollection(currentMemberEmail);
});

document.querySelector('#owned-assets-grid')?.addEventListener('click', (event) => {
  const unlist = event.target.closest('[data-backpack-unlist]');
  const buy = event.target.closest('[data-backpack-buy]');
  const selectedOwner = normalizeMemberEmail(document.querySelector('#owned-profile-select')?.value);
  const profiles = readOwnedProfiles();
  const status = document.querySelector('#backpack-trade-status');
  if (unlist) {
    const asset = (profiles[currentMemberEmail] || [])[Number(unlist.dataset.backpackUnlist)];
    if (!asset) return;
    setBackpackListing(currentMemberEmail, asset, backpackListing(currentMemberEmail, asset).tokenValue, false);
    if (status) status.textContent = `${asset} was removed from the profile market.`;
    renderOwnedCollection(currentMemberEmail);
    return;
  }
  if (!buy || !selectedOwner || selectedOwner === currentMemberEmail) return;
  const sellerAssets = profiles[selectedOwner] || [];
  const assetIndex = Number(buy.dataset.backpackBuy);
  const asset = sellerAssets[assetIndex];
  const listing = backpackListing(selectedOwner, asset);
  const price = Number(listing.tokenValue);
  const buyerTokens = backpackBalance(currentMemberEmail);
  backpackBalance(selectedOwner);
  if (!asset || !listing.listed || !Number.isFinite(price)) {
    if (status) status.textContent = 'That listing is no longer available.';
    return renderOwnedCollection(selectedOwner);
  }
  if (buyerTokens < price) {
    if (status) status.textContent = `You need ${(price - buyerTokens).toLocaleString()} more MZK to complete this trade.`;
    return;
  }
  const transferId = `backpack:${selectedOwner}:${currentMemberEmail}:${asset}:${Date.now()}`;
  const payment = window.MZKWallet?.transfer(currentMemberEmail, selectedOwner, price, `Backpack trade: ${asset}`, transferId, { asset });
  if (!payment?.ok) {
    if (status) status.textContent = 'The MZK payment could not be completed.';
    return renderOwnedCollection(selectedOwner);
  }
  sellerAssets.splice(assetIndex, 1);
  profiles[currentMemberEmail] ||= [];
  profiles[currentMemberEmail].push(asset);
  writeOwnedProfiles(profiles);
  setBackpackListing(selectedOwner, asset, price, false);
  const transactions = readBackpackData(BACKPACK_TRANSACTIONS_KEY, []);
  transactions.push({ asset, seller: selectedOwner, buyer: currentMemberEmail, tokenValue: price, createdAt: new Date().toISOString() });
  window.localStorage.setItem(BACKPACK_TRANSACTIONS_KEY, JSON.stringify(transactions.slice(-100)));
  if (status) status.textContent = `Trade complete: ${asset} moved to your Backpack for ${price.toLocaleString()} MZK.`;
  renderOwnedCollection(currentMemberEmail);
});


menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    document.querySelectorAll('.nav a').forEach((link) => link.classList.remove('active'));
    event.target.classList.add('active');
    closeMenu();
  }
});

document.querySelector('[data-action="explorer"]')?.addEventListener('click', () => scrollToSection('publish-model'));
document.querySelector('[data-action="house"]')?.addEventListener('click', () => scrollToSection('house-explorer'));


addModelButton?.addEventListener('click', () => {
  if (!selectedModel) {
    if (modelStatus) modelStatus.textContent = 'Choose a model collection before adding it to cart.';
    scrollToSection('models');
    return;
  }
  const model = getModel(selectedModel);
  addCartLine(`${selectedModel} 3D Model Pack`, parsePrice(model.price), model.type);
  updateCart(addModelButton, 'Model added');
  if (modelStatus) modelStatus.textContent = `${selectedModel} model added to your cart.`;
});

document.querySelector('[data-show-all]')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (modelDetail) modelDetail.hidden = true;
  if (modelStatus) modelStatus.textContent = 'All MUZIKAZ model collections are visible.';
  scrollToSection('models');
});


document.querySelector('#model-linked-data')?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLElement && selectedModel) focusMarketplaceForModel(selectedModel);
});


document.querySelector('[data-action="cart"]')?.addEventListener('click', () => {
  if (cartItems) {
    window.location.href = 'checkout.html';
  } else {
    alert('Your MUZIKAZ cart is empty. Add merch or models to begin.');
  }
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});


document.querySelectorAll('.choice-btn[data-target]').forEach((button) => {
  button.addEventListener('click', () => {
    scrollToSection(button.dataset.target);
    closeMenu();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
  const card = event.target instanceof HTMLElement ? event.target.closest('[data-preview-model]') : null;
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    selectModel(card.dataset.previewModel);
  }
});


const siteTwoCharacters = [
  {name:'Sparky', role:'The Inventor', file:'sparky', group:'New Legends', arModelId:'muzikaz', bio:'Brilliant, chaotic, and unstoppable for inventor-themed merch drops.'},
  {name:'Nexus', role:'The Sentinel', file:'nexus', group:'New Legends', arModelId:'voltwolf', bio:'Future-forward sentinel for premium apparel and high-tech product presentation.'},
  {name:'Inferno', role:'The Unleashed', file:'inferno', group:'New Legends', arModelId:'flaminglow', bio:'Raw heat and chaos for aggressive campaign art and darker merch designs.'},
  {name:'Rumble', role:'The Brute', file:'rumble', group:'New Legends', arModelId:'aape', bio:'Big strength and big attitude for statement hoodies and event banners.'},
  {name:'Chillz', role:'The Strategist', file:'chillz', group:'New Legends', arModelId:'318bb72e-99a3-4258-9684-8db3b35cc753-2', bio:'Cool, calm, and three steps ahead for caps, stickers, and confidence gear.'},
  {name:'Bax', role:'The Rebel', file:'bax', group:'The Crew', arModelId:'dax', bio:'A red-hot rebel mascot for loud streetwear and underground promo drops.'},
  {name:'Ion Wolf', role:'The Night Runner', file:'ion-wolf', group:'The Crew', arModelId:'wolfie', bio:'A neon wolf with night-runner style for jackets, hats, and limited drops.'},
  {name:'Flick', role:'The Spark', file:'flick', group:'The Crew', arModelId:'ioncduck', bio:'Bright and fan-friendly for youth gear, stickers, and family events.'},
  {name:'Byte', role:'The Signal', file:'byte', group:'The Crew', arModelId:'byte', bio:'Tech duck mascot for audio culture, digital promos, and signal-themed merch.'},
  {name:'Luna', role:'The Soft Power', file:'luna', group:'The Crew', arModelId:'mousey', bio:'A softer mascot for cozy hoodies, plush ideas, and lifestyle products.'},
  {name:'Muz Cat', role:'The Producer', file:'muz-cat', group:'The Crew', arModelId:'muzkat', bio:'Studio cat built for creator merch, desk mats, posters, and music drops.'},
  {name:'Grump', role:'The Enforcer', file:'grump', group:'The Crew', arModelId:'rebel-black-sheep', bio:'A serious heavy-hitter for classic tees and no-nonsense campaigns.'},
  {name:'Sharko', role:'The Finisher', file:'sharko', group:'The Crew', arModelId:'sharko', bio:'Sharp mascot for performance gear, bold posters, and aggressive launches.'},
  {name:'Buzz', role:'The Hype Bee', file:'buzz', group:'The Crew', arModelId:'beedeere', bio:'Bright bee mascot for stickers, kid-friendly merch, and social campaigns.'},
  {name:'Wild', role:'The Pilot Pug', file:'wild', group:'The Crew', arModelId:'ronaldo', bio:'Adventure dog for hats, keychains, pins, and travel-themed event mascots.'},
  {name:'Grok', role:'The Survivor', file:'grok', group:'New Additions', arModelId:'drone-engine', bio:'Rugged mascot for outdoor-style apparel, patches, and tough accessories.'},
  {name:'Buzz Jr.', role:'The Mini Hype', file:'buzz-jr', group:'New Additions', arModelId:'beeduck', bio:'Mini hype mascot for stickers, small accessories, and family bundles.'}
];

const siteTwoProducts = [
  {id:'tee', name:'Graphic Tee', price:29.99, desc:'Front print tee with character art and optional back hit.', sizes:['XS','S','M','L','XL','2XL','3XL'], colors:['Black','Acid Green','White','Stone Grey']},
  {id:'hoodie', name:'Premium Hoodie', price:59.99, desc:'Heavy fleece hoodie with oversized artwork and sleeve logo detailing.', sizes:['S','M','L','XL','2XL','3XL'], colors:['Black','Shadow Purple','Army Green','Ash Grey']},
  {id:'poster', name:'Poster Print', price:19.99, desc:'Promotional art poster for booths, launches, and room decor.', sizes:['11x17','18x24','24x36'], colors:['Full Color','Monochrome Green','Blackout Edition']},
  {id:'hat', name:'Snapback Cap', price:27.99, desc:'Structured cap with mascot logo, icon mark, or side detail.', sizes:['One Size'], colors:['Black','Charcoal','Neon Green','Cream']},
  {id:'bottle', name:'Water Bottle', price:24.99, desc:'Matte bottle with vertical graphic and slogan placement.', sizes:['20 oz','24 oz'], colors:['Black','Lime Fade','Steel Grey','Purple Haze']},
  {id:'lanyard', name:'Lanyard', price:12.99, desc:'Event-ready woven lanyard with repeat logos and mascot color cues.', sizes:['Standard'], colors:['Black / Green','Purple / Lime','Grey / Green']},
  {id:'pin', name:'Enamel Pin', price:9.99, desc:'Collectible character icon pin for jackets, hats, and accessories.', sizes:['1.25 in','1.5 in'], colors:['Signature Colors','Blackout Metal','Glow Green']},
  {id:'sticker', name:'Sticker Pack', price:7.99, desc:'Mascot sticker bundle with logo hits, slogans, and collectible extras.', sizes:['5-Pack','8-Pack','12-Pack'], colors:['Mixed Set','Green Monochrome','Character Palette']}
];

const assetCatalog = {
  models: [
    { id: 'originals', page: 'originals.html', name: 'Originals', css: 'monkey', character: 'Ape', type: 'Character Models', file: 'reference.png', price: '$39.00', copy: 'Classic starter poses, mascot turnarounds, and brand-ready preview files.', merch: ['Neon Hoodie', 'Bolt Keychain'] },
    { id: 'legends', page: 'legends.html', name: 'Legends', css: 'robot', character: 'Cyber Wolf', type: '3D Model Packs', file: 'futuristic_armored_wolf_humanoid.png', price: '$64.00', copy: 'Armored future icon with dramatic neon render support and creator-safe styling.', merch: ['Crew Cap', 'Beat Bottle'] },
    { id: 'beasts', page: 'beasts.html', name: 'Beasts', css: 'beast', character: 'Red Beast', type: '3D Model Packs', file: 'fierce_demon_hybrid_in_action.png', price: '$58.00', copy: 'Monster-power render pack connected to safe fantasy presentation rules.', merch: ['Wristband', 'Lanyard'] },
    { id: 'crew', page: 'crew-market.html', name: 'Crew', css: 'penguin', character: 'Crew Penguin', type: 'Character Models', file: 'the_crew_banner_2x_transparent.png', price: '$44.00', copy: 'Street-smart mascot assets for friendly drops, banners, and fan pages.', merch: ['Crew Cap', 'Lanyard'] },
    { id: 'chaos', page: 'chaos.html', name: 'Chaos', css: 'chaos', character: 'Chaos Ape', type: '3D Model Packs', file: 'character_traits_overview_panel_2x.png', price: '$69.00', copy: 'High-energy hybrid concepts for the loudest MUZIKAZ creator collection.', merch: ['Neon Hoodie', 'Wristband'] },
    { id: 'new-legends', page: 'new-legends.html', name: 'New Legends', css: 'new-legends', character: 'Unlocked Crew', type: 'Character Models', file: 'new_legends_unlocked_2x_transparent.png', price: '$52.00', copy: 'Expanded platform collection art for fresh mascot launches and hero tiles.', merch: ['Hero Banner', 'Tagline Tee'] },
    { id: 'trait-avatars', page: 'trait-avatars.html', name: 'Trait Avatars', css: 'trait-avatars', character: 'Avatar Lineup', type: 'Character Models', file: 'trait_avatars_row_1_2x.png', price: '$46.00', copy: 'Row-ready mascot avatars built for picker graphics, social posts, and profile drops.', merch: ['Avatar Sticker Sheet', 'Crew Cap'] },
    { id: 'online-events', page: 'online-events.html', name: 'Online Events', css: 'online-events', character: 'Event Crew', type: 'Event Model Packs', file: 'available_online_events_banner_2x_transparent.png', price: '$55.00', copy: 'Event-ready visual set for stream drops, ticket pages, and online campaigns.', merch: ['Event Pass', 'Lanyard'] },
  ],
  websitePackages: [
    { id: 'brand-kit', page: 'brand-kit.html', name: 'Brand Kit Website Slot', category: 'Website Packages', price: '$20.00', asset: 'logo_panel_2x_transparent.png', copy: 'Moved out of the model package area and unified with the website bundle slots for logo panels, badges, and web-ready brand graphics.' },
    { id: 'starter-site', page: 'index.html', name: 'Starter Website Bundle', category: 'Website Packages', price: '$20.00', asset: 'hero_banner_full_2x_transparent.png', copy: 'One-page starter layout with hero, product callouts, and connected checkout buttons.' },
    { id: 'drop-page', page: 'new-legends.html', name: 'Drop Page Bundle', category: 'Website Packages', price: '$20.00', asset: 'new_legends_unlocked_2x_transparent.png', copy: 'Launch page bundle for a mascot drop, limited offer, and subscriber call-to-action.' },
    { id: 'creator-vault', page: 'members.html', name: 'Creator Vault Bundle', category: 'Website Packages', price: '$20.00', asset: 'accessories_banner_2x_transparent.png', copy: 'Subscriber-style vault bundle with locked creator tools, owned collection copy, and upgrade slots.' },
    { id: 'event-landing', page: 'online-events.html', name: 'Event Landing Bundle', category: 'Website Packages', price: '$20.00', asset: 'available_online_events_banner_2x_transparent.png', copy: 'Online event landing bundle for tickets, stream promos, and merch-connected campaign pages.' },
  ],
  controlPackages: [
    { id: 'omconsole', name: 'OMConsole Package', category: 'Control Systems', price: '$49.00', copy: 'Integrate OMConsole gesture, facial tone, muscle, and EEG controls into a custom website experience with editable design hooks.' },
  ],
  characterWorldAssets: [
    { id: 'avatar-loadout', name: 'Avatar Loadout Shelf', category: 'Avatars', price: '$26.00', asset: 'trait_avatars_row_1_2x.png', connectsTo: ['Trait Avatars', 'New Legends'], copy: 'Base bodies, alternate skins, expressions, profile poses, and trait-ready avatar slots for character-specific MUZIKAZ loadouts.' },
    { id: 'pet-companions', name: 'Pet Companion Pack', category: 'Pets', price: '$24.00', asset: 'trait_avatars_row_2_2x.png', connectsTo: ['Crew', 'New Legends'], copy: 'Matching companion pets that follow a selected character through lore pages, market cards, and game-side follower ideas.' },
    { id: 'accessory-crate', name: 'Accessory Crate', category: 'Accessories', price: '$18.00', asset: 'accessories_banner_2x_transparent.png', connectsTo: ['Originals', 'Chaos', 'Trait Avatars'], copy: 'Hats, goggles, chains, bags, instruments, and collectible add-ons assigned per character so the market only shows compatible gear.' },
    { id: 'furniture-room-set', name: 'Furniture Room Set', category: 'Furniture', price: '$34.00', asset: 'section_banners_panel_2x_transparent.png', connectsTo: ['Crew', 'Legends'], copy: 'Studio desks, chairs, display shelves, booth builds, and themed furniture for avatar rooms and creator showcase pages.' },
    { id: 'environment-stage-kit', name: '3D Environment Stage Kit', category: '3D Environments', price: '$48.00', asset: 'smoke_energy_background_large_2x_transparent.png', connectsTo: ['Legends', 'Beasts', 'Online Events'], copy: 'Bedrooms, music studios, stages, stores, arenas, and house-explorer rooms that turn character assets into full 3D environments.' },
    { id: 'gaming-studio-props', name: 'Gaming Studio Prop Bundle', category: 'Gaming Studio', price: '$42.00', asset: 'available_online_events_banner_2x_transparent.png', connectsTo: ['Chaos', 'Online Events'], copy: 'Game-ready prop ideas, level themes, loadout shelves, and studio hooks for playable character worlds.' },
  ],
  retail: [
    { id: 'hoodie', name: 'Neon Hoodie', category: 'Hoodies', price: '$64.00', asset: 'muzikaz_high_level_image_pack1/05_merch/hoodie_tile_2x.png', connectsTo: ['Originals', 'Chaos'] },
    { id: 'cap', name: 'Crew Cap', category: 'Headwear', price: '$28.00', asset: 'muzikaz_high_level_image_pack1/05_merch/cap_tile_2x.png', connectsTo: ['Legends', 'Crew'] },
    { id: 'bottle', name: 'Beat Bottle', category: 'Drinkware', price: '$22.00', asset: 'muzikaz_high_level_image_pack1/05_merch/bottle_tile_2x.png', connectsTo: ['Legends'] },
    { id: 'keychain', name: 'Bolt Keychain', category: 'Accessories', price: '$12.00', asset: 'muzikaz_high_level_image_pack1/05_merch/keychain_tile_2x.png', connectsTo: ['Originals'] },
    { id: 'wristband', name: 'Wristband', category: 'Accessories', price: '$16.00', asset: 'muzikaz_high_level_image_pack1/05_merch/wristband_tile_2x.png', connectsTo: ['Beasts', 'Chaos'] },
    { id: 'lanyard', name: 'Lanyard', category: 'Accessories', price: '$14.00', asset: 'muzikaz_high_level_image_pack1/05_merch/lanyard_tile_2x.png', connectsTo: ['Beasts', 'Crew', 'Online Events'] },
    { id: 'hero-banner', name: 'Hero Banner', category: 'Wall Art', price: '$34.00', asset: 'hero_banner_full_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'tagline-tee', name: 'Tagline Tee', category: 'Tees', price: '$32.00', asset: 'tagline_crop_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'avatar-stickers', name: 'Avatar Sticker Sheet', category: 'Stickers', price: '$18.00', asset: 'trait_avatars_row_2_2x.png', connectsTo: ['Trait Avatars', 'Chaos'] },
    { id: 'event-pass', name: 'Event Pass', category: 'Collectibles', price: '$20.00', asset: 'available_online_events_banner_transparent.png', connectsTo: ['Online Events'] },
    { id: 'logo-patch', name: 'Logo Patch', category: 'Patches', price: '$15.00', asset: 'logo_symbol_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
    { id: 'wordmark-print', name: 'Wordmark Print', category: 'Wall Art', price: '$24.00', asset: 'muzikaz_wordmark_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
  ],
};

const designerCharacters = assetCatalog.models.map((model) => ({ id: model.id, name: model.character, traits: [model.name, model.type], art: model.file }));
const designerProducts = assetCatalog.retail.map((product) => ({ id: product.id, name: product.name, category: product.category, price: Number(product.price.replace(/[^0-9.]/g, '')), asset: product.asset }));
const productPrintTemplates = {
  'avatar-stickers': { shape: 'sheet', label: 'Sticker sheet cutlines · drag art onto any sticker' },
  hoodie: { shape: 'front', label: 'Hoodie front print zone · chest-safe placement' },
  cap: { shape: 'patch', label: 'Cap badge / patch print zone' },
  bottle: { shape: 'wrap', label: 'Bottle wrap label print zone' },
  keychain: { shape: 'patch', label: 'Keychain charm print zone' },
  wristband: { shape: 'wrap', label: 'Wristband repeat print zone' },
  lanyard: { shape: 'wrap', label: 'Lanyard repeat print zone' },
  'hero-banner': { shape: 'poster', label: 'Banner safe area · edge bleed visible' },
  'tagline-tee': { shape: 'front', label: 'Tee front print zone' },
  'event-pass': { shape: 'poster', label: 'Event pass safe area' },
  'logo-patch': { shape: 'patch', label: 'Patch embroidery / print shape' },
  'wordmark-print': { shape: 'poster', label: 'Wall art safe area' }
};
const marketplaceListings = [
  ...WORLD_ASSETS.map((asset) => ({ type: 'Land Worlds & Environments', category: asset.kind, quality: 'curated', name: asset.name, price: asset.price, copy: `${asset.detail}. Map location: X ${asset.x}, Y ${asset.y}.`, product: asset.name, worldId: asset.id })),
  ...assetCatalog.models.map((model) => ({ type: model.type, category: model.name, quality: 'curated', name: `${model.name} 3D Model Pack`, price: model.price, copy: `${model.copy} Source: ${model.file}`, model: model.name })),
  ...assetCatalog.websitePackages.map((pack) => ({ type: 'Website Packages', category: pack.category, quality: 'curated', name: pack.name, price: pack.price, copy: `${pack.copy} Source: ${pack.asset}`, product: pack.name })),
  ...assetCatalog.controlPackages.map((pack) => ({ type: 'Subscriber Creator Tools', category: pack.category, quality: 'curated', name: pack.name, price: pack.price, copy: pack.copy, product: pack.name })),
  ...assetCatalog.characterWorldAssets.map((asset) => ({ type: 'Character & World Assets', category: asset.category, quality: 'curated', name: asset.name, price: asset.price, copy: `${asset.copy} Compatible with ${asset.connectsTo.join(' + ')}. Source: ${asset.asset}`, product: asset.name })),
  ...assetCatalog.retail.map((product) => ({ type: 'Retail Pages', category: product.category, quality: 'curated', name: product.name, price: product.price, copy: `${product.category} connected to ${product.connectsTo.join(' + ')} model data.`, product: product.name })),
  { type: 'Custom Orders', category: 'Custom Builds', quality: 'curated', name: 'Team Sleeve Text Run', price: 'Quote request', copy: 'Custom name, number, logo style, sleeve text, product, and character selections flow from the same catalog.' },
  { type: 'Limited Drops', category: 'Drop Bundles', quality: 'review', name: 'Friday Connected Drop', price: 'Locks at sellout', copy: 'Bundles one model pack, one retail item, and one custom designer preset.' },
];

const marketplaceState = { type: 'All', category: 'All', modelFocus: '', curatedOnly: true };

function initMarketSectionToggle() {
  const shell = document.querySelector('.market-toggle-shell');
  const buttons = Array.from(document.querySelectorAll('[data-market-toggle]'));
  const panels = Array.from(document.querySelectorAll('[data-market-panel]'));
  if (!shell || !buttons.length || !panels.length) return;

  const panelIds = new Set(panels.map((panel) => panel.id));
  function selectPanel(id, { focus = false } = {}) {
    const selectedId = panelIds.has(id) ? id : 'models';
    buttons.forEach((button) => {
      const active = button.dataset.marketToggle === selectedId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== selectedId; });
  }
  function selectFromHash() { selectPanel(window.location.hash.slice(1)); }

  shell.classList.add('is-enhanced');
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      selectPanel(button.dataset.marketToggle, { focus: true });
      history.replaceState(null, '', '#' + button.dataset.marketToggle);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click();
    });
  });
  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
}

function initFlexLabCategories() {
  const buttons = document.querySelectorAll('[data-flex-category]');
  const cards = document.querySelectorAll('[data-flex-card]');
  const panel = document.querySelector('#flex-category-panel');
  if (!buttons.length || !cards.length) return;
  const summaries = {
    All: 'Showing every character and world asset category in one connected MUZIKAZ collection.',
    Avatars: '3D character drops, skins, traits, poses, and profile-ready avatar variants.',
    Pets: 'Mascot-matched sidekicks with color stories, lore hooks, and follower energy.',
    Wearables: 'Wearables, collectibles, instruments, bags, and signature power-up add-ons.',
    Rooms: 'Studio sets, bedroom kits, booths, display walls, and hangout hubs.',
    Props: 'Stage gear, interaction pieces, collectibles, and gameplay-ready set dressing.',
    Vehicles: 'Mascot-matched boards, rides, transport concepts, and movement upgrades.',
    'World Packs': 'Bedrooms, stages, shops, arenas, hideouts, and explorable mascot worlds.'
  };
  function selectCategory(category) {
    buttons.forEach((button) => {
      const active = button.dataset.flexCategory === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    cards.forEach((card) => {
      const visible = category === 'All' || card.dataset.flexCard === category;
      card.hidden = !visible;
      card.classList.toggle('is-selected', visible && category !== 'All');
    });
    if (panel) {
      panel.innerHTML = `<strong>${category === 'All' ? 'Full loadout selected' : `${category} shelf selected`}</strong><span>${summaries[category] || summaries.All}</span>`;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => selectCategory(button.dataset.flexCategory || 'All')));
  selectCategory('All');
}

function initWorldPlot() {
  const plot = document.querySelector('#muzikaz-world-plot');
  const spaces = Array.from(document.querySelectorAll('[data-world-space]'));
  const consent = document.querySelector('#world-plot-consent');
  const agreement = document.querySelector('#world-plot-agreement');
  const reserveButton = agreement?.querySelector('button[type="submit"]');
  const selection = document.querySelector('#world-plot-selection');
  if (!plot || !spaces.length || !consent || !agreement || !reserveButton || !selection) return;

  let selectedSpace = window.localStorage.getItem('muzikazWorldStarterSpace') || spaces[0].dataset.worldSpace;
  const selectSpace = (name) => {
    selectedSpace = name;
    window.localStorage.setItem('muzikazWorldStarterSpace', name);
    spaces.forEach((space) => {
      const active = space.dataset.worldSpace === name;
      space.classList.toggle('is-selected', active);
      space.setAttribute('aria-pressed', String(active));
    });
    const selectedIndex = spaces.findIndex((space) => space.dataset.worldSpace === name) + 1;
    selection.innerHTML = `<span class="world-plot__selection-number">${String(selectedIndex).padStart(2, '0')}</span><span><strong>${name} selected.</strong> GLB stage, avatar spawn, and marketplace link are ready.</span><small>Plot status <b>Available</b></small>`;
    reserveButton.textContent = `Reserve ${name}`;
  };

  spaces.forEach((space) => space.addEventListener('click', () => selectSpace(space.dataset.worldSpace)));
  consent.addEventListener('change', () => { reserveButton.disabled = !consent.checked; });
  agreement.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!consent.checked) return;
    addCartLine(`MUZIKAZ World · ${selectedSpace}`, 25, 'Five-space connected digital land plot');
    claimOwnedAsset(`MUZIKAZ World · ${selectedSpace}`, 'Connected land reservation');
    updateCart(reserveButton, 'Plot reserved');
    const selectedIndex = spaces.findIndex((space) => space.dataset.worldSpace === selectedSpace) + 1;
    selection.innerHTML = `<span class="world-plot__selection-number">${String(selectedIndex).padStart(2, '0')}</span><span><strong>${selectedSpace} reserved.</strong> Your plot is linked to the GLB library, avatar shelf, and marketplace.</span><small>Plot status <b>Reserved</b></small>`;
  });
  selectSpace(selectedSpace);
}


function renderModelCards() {
  const collectionGrid = document.querySelector('.collection-grid');
  if (!collectionGrid) return;
  const visibleModels = document.body.classList.contains('members-page') ? assetCatalog.models : assetCatalog.models.filter((model) => !['new-legends', 'trait-avatars', 'online-events'].includes(model.id));
  collectionGrid.innerHTML = visibleModels.map((model) => `
    <article class="card ${model.css}" style="--card-art:url('${model.file}')" data-preview-model="${model.name}" tabindex="0" aria-label="Preview ${model.name} collection">
      <div class="card-model-stage" data-connected-model="${model.id}" role="img" aria-label="${model.character}"></div>
      <div><h3>${model.name}</h3><p>${model.character}</p><a class="card-link" href="${model.page}">View</a></div>
    </article>`).join('');
}

function renderMerchOptions() {
  const productGrid = document.querySelector('.products');
  if (!productGrid) return;
  const gatedProductIds = new Set(['hero-banner', 'tagline-tee', 'event-pass']);
  const visibleProducts = document.body.classList.contains('members-page')
    ? assetCatalog.retail
    : assetCatalog.retail.filter((product) => !gatedProductIds.has(product.id));
  productGrid.innerHTML = visibleProducts.map((product, index) => `
    <article>
      ${index < 3 ? `<i>${index === 0 ? 'Hot' : index === 1 ? 'New' : 'Drop'}</i>` : ''}
      <div class="product-img" style="--product-art:url('${product.asset}')" role="img" aria-label="${product.name} graphic"></div>
      <strong>${product.name}</strong><p>${product.price}</p><button type="button" data-product="${product.name}">Add</button>
    </article>`).join('');
}

function selectModel(modelName) {
  selectedModel = modelName;
  const model = getModel(selectedModel);
  if (modelStatus) modelStatus.textContent = `${selectedModel} collection selected. 3D page, retail matches, and marketplace listings are connected.`;
  if (modelDetailTitle) modelDetailTitle.textContent = `${selectedModel} · ${model.character}`;
  if (modelDetailCopy) modelDetailCopy.textContent = model.copy;
  if (modelPageLink) modelPageLink.href = model.page;
  if (modelDetailArt) {
    modelDetailArt.className = `model-detail-art ${model.css}`;
    modelDetailArt.style.setProperty('--model-art', `url('${model.file}')`);
    modelDetailArt.dataset.connectedModel = model.id;
    modelDetailArt.removeAttribute('data-connected-model-ready');
  }
  renderLinkedData(model);
  renderMarketplace('All', selectedModel);
  if (modelDetail) modelDetail.hidden = false;
  scrollToSection('model-detail');
}

document.addEventListener('click', (event) => {
  const modelButton = event.target.closest('[data-model]');
  const modelCard = event.target.closest('[data-preview-model]');
  if (modelButton || (modelCard && !(event.target instanceof HTMLAnchorElement))) {
    const modelName = modelButton?.dataset.model || modelCard?.dataset.previewModel;
    if (modelName) selectModel(modelName);
    return;
  }
  const productButton = event.target.closest('[data-product]');
  if (productButton) {
    const productName = productButton.dataset.product;
    const product = assetCatalog.retail.find((item) => item.name === productName) || marketplaceListings.find((item) => item.name === productName);
    addCartLine(productName, parsePrice(product?.price), product?.category || product?.type || 'Store item');
    updateCart(productButton);
    claimOwnedAsset(productName, 'Added from storefront');
  }
});

const productSelect = document.querySelector('#design-product');
const characterSelect = document.querySelector('#design-character');
const designerControls = document.querySelector('#designer-controls');
const marketTabs = document.querySelector('#market-tabs');
const marketCategories = document.querySelector('#market-categories');
const marketQualityToggle = document.querySelector('#market-quality-toggle');
const marketStatus = document.querySelector('#market-status');
const marketGrid = document.querySelector('#market-grid');
const linkedData = document.querySelector('#model-linked-data');

function getModel(name) {
  return assetCatalog.models.find((model) => model.name === name) || assetCatalog.models[0];
}

function renderLinkedData(model) {
  if (!linkedData) return;
  const relatedMerch = assetCatalog.retail.filter((product) => product.connectsTo.includes(model.name));
  linkedData.innerHTML = `<strong>Connected repo data</strong><ul>${relatedMerch.map((product) => `<li>${product.name} · ${product.category} · ${product.price}</li>`).join('')}</ul>`;
}

function focusMarketplaceForModel(modelName) {
  marketplaceState.type = 'All';
  marketplaceState.category = 'All';
  marketplaceState.modelFocus = modelName;
  renderMarketplace();
  scrollToSection('marketplace');
}

const uploadState = { layers: [], activeId: null, saved: null };
const allowedDesignTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];

function seedDesigner() {
  if (!productSelect || !characterSelect) return;
  productSelect.innerHTML = designerProducts.map((product) => `<option value="${product.id}">${product.name}</option>`).join('');
  characterSelect.innerHTML = designerCharacters.map((character) => `<option value="${character.id}">${character.name}</option>`).join('');
  productSelect.value = 'avatar-stickers';
  characterSelect.value = 'chaos';
  updatePreview();
}

function designerData() {
  const data = new FormData(designerControls);
  const product = designerProducts.find((item) => item.id === data.get('product')) || designerProducts.find((item) => item.id === 'avatar-stickers') || designerProducts[0];
  const character = designerCharacters.find((item) => item.id === data.get('character')) || designerCharacters.find((item) => item.id === 'chaos') || designerCharacters[0];
  return { data, product, character };
}

function updatePreview() {
  if (!designerControls) return;
  const { data, product, character } = designerData();
  const mockup = document.querySelector('#designer-mockup');
  mockup?.style.setProperty('--design-color', data.get('color'));
  const selectedShape = data.get('printShape') === 'auto' ? (productPrintTemplates[product.id]?.shape || 'front') : data.get('printShape');
  mockup?.setAttribute('data-product-template', product.id);
  mockup?.setAttribute('data-print-shape', selectedShape);
  document.querySelector('#print-template-label').textContent = productPrintTemplates[product.id]?.label || `${product.name} print zone`;
  document.querySelector('#sticker-stage')?.setAttribute('data-print-shape', selectedShape);
  const productArt = document.querySelector('#product-template-art');
  if (productArt) {
    productArt.src = product.asset;
    productArt.alt = `${product.name} product template`;
  }
  const characterArt = document.querySelector('#character-art-layer');
  if (characterArt) {
    characterArt.src = character.art;
    characterArt.alt = `${character.name} artwork`;
  }
  document.querySelector('#preview-character').textContent = character.name;
  const logo = document.querySelector('#preview-name');
  const logoStyle = data.get('logo') || 'Wordmark';
  if (logo) {
    logo.dataset.logoStyle = logoStyle;
    logo.textContent = logoStyle === 'Lightning Crest' ? 'ϟ' : logoStyle === 'Badge Patch' ? 'MZ' : (data.get('name') || 'MUZIKAZ');
  }
  document.querySelector('#preview-number').textContent = data.get('number') || '88';
  document.querySelector('#preview-sleeve').textContent = data.get('sleeve') || 'LIVE THE BEAT';
  const isSticker = product.id === 'avatar-stickers';
  document.querySelector('#preview-title').textContent = isSticker ? `${character.name} custom stickers drop` : `${character.name} custom ${product.category.toLowerCase()} drop`;
  document.querySelector('#preview-meta').textContent = `${product.name} · ${data.get('size')} · ${data.get('logo')} · ${data.get('layout') || character.traits.join(' / ')}`;
  const values = [character.name, data.get('name') || 'MUZIKAZ', data.get('number') || '88', data.get('sleeve') || 'LIVE THE BEAT', `${product.name} · ${data.get('size')} · ${data.get('logo')} · ${data.get('layout') || character.traits.join(' / ')}`];
  const previewValues = document.querySelector('#preview-values');
  if (previewValues) previewValues.innerHTML = values.map((value) => `<li>${value}</li>`).join('');
  renderOrderSummary();
}

function renderOrderSummary() {
  const summary = document.querySelector('#designer-order-summary');
  if (!summary || !designerControls) return;
  const { data, product, character } = designerData();
  const quantity = Number(data.get('quantity') || 1);
  const total = product.price * quantity;
  const uploads = uploadState.layers.length ? uploadState.layers.map((layer) => layer.name).join(', ') : 'No custom upload yet';
  summary.innerHTML = `<strong>${product.name} custom order</strong><span>${character.name} · ${data.get('size')} · Qty ${quantity} · $${total.toFixed(2)}</span><span>Text: ${data.get('name')} / ${data.get('number')} / ${data.get('sleeve')}</span><span>Uploaded art: ${uploads}</span><span>Notes: ${data.get('notes') || 'None'}</span>`;
}

function renderMarketplace(type = marketplaceState.type, modelFocus = marketplaceState.modelFocus) {
  if (!marketTabs || !marketGrid) return;
  marketplaceState.type = type || 'All';
  marketplaceState.modelFocus = modelFocus || '';
  marketplaceState.curatedOnly = marketQualityToggle ? marketQualityToggle.checked : marketplaceState.curatedOnly;
  const types = ['All', ...new Set(marketplaceListings.map((listing) => listing.type))];
  const categories = ['All', ...new Set(marketplaceListings.map((listing) => listing.category))];
  marketTabs.innerHTML = types.map((tab) => `<button type="button" class="${tab === marketplaceState.type ? 'active' : ''}" aria-pressed="${tab === marketplaceState.type}" data-market-filter="${tab}">${tab}</button>`).join('');
  if (marketCategories) {
    marketCategories.innerHTML = categories.map((category) => `<button type="button" class="${category === marketplaceState.category ? 'active' : ''}" aria-pressed="${category === marketplaceState.category}" data-market-category="${category}">${category}</button>`).join('');
  }
  const listings = marketplaceListings.filter((listing) => {
    const typeMatch = marketplaceState.type === 'All' || listing.type === marketplaceState.type;
    const categoryMatch = marketplaceState.category === 'All' || listing.category === marketplaceState.category;
    const focusMatch = !marketplaceState.modelFocus || listing.model === marketplaceState.modelFocus || listing.copy.includes(marketplaceState.modelFocus);
    const qualityMatch = !marketplaceState.curatedOnly || listing.quality === 'curated';
    return typeMatch && categoryMatch && focusMatch && qualityMatch;
  });
  marketGrid.innerHTML = listings.map((listing, index) => {
    const arIndex = Number.isInteger(listing.arCharacterIndex) ? listing.arCharacterIndex : characterForListing(listing);
    const canLaunchAr = Boolean(listing.modelUrl) || arIndex >= 0;
    return `<article><span class="pill">${listing.type}</span><span class="pill category-pill">${listing.category}</span><h3>${listing.name}</h3><p>${listing.copy}</p><p class="price">${listing.price}</p><button type="button" data-product="${listing.name}">Add</button>${listing.worldId ? `<a class="btn ghost" href="index.html?world=${listing.worldId}#world-map">View on map</a>` : ''}${canLaunchAr ? `<button type="button" class="ghost" data-market-ar="${index}">View in AR</button>` : ''}</article>`;
  }).join('') || '<article><h3>No matches</h3><p>Choose another category, type, or turn off curated quality only.</p></article>';
  marketGrid.querySelectorAll('[data-market-ar]').forEach((button) => button.addEventListener('click', () => activateMarketplaceAr(listings[Number(button.dataset.marketAr)])));
  if (marketStatus) {
    const focusCopy = marketplaceState.modelFocus ? ` for ${marketplaceState.modelFocus}` : '';
    marketStatus.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'} shown${focusCopy}. Category: ${marketplaceState.category}. Type: ${marketplaceState.type}.`;
  }
  marketTabs.querySelectorAll('[data-market-filter]').forEach((button) => button.addEventListener('click', () => renderMarketplace(button.dataset.marketFilter, marketplaceState.modelFocus)));
  marketCategories?.querySelectorAll('[data-market-category]').forEach((button) => button.addEventListener('click', () => {
    marketplaceState.category = button.dataset.marketCategory || 'All';
    marketplaceState.modelFocus = '';
    renderMarketplace(marketplaceState.type);
  }));
}

document.addEventListener('click', (event) => {
  const jump = event.target.closest('[data-market-jump]');
  if (!jump) return;
  const targetType = jump.dataset.marketJump === 'Website Packages' ? 'Website Packages' : jump.dataset.marketJump === 'Character & World Assets' ? 'Character & World Assets' : 'Subscriber Creator Tools';
  marketplaceState.category = 'All';
  renderMarketplace(targetType);
});


function setDesignerStatus(message) {
  const status = document.querySelector('#designer-status');
  if (status) status.textContent = message;
}

function activeUploadLayer() {
  return document.querySelector(`.uploaded-design-layer[data-layer-id="${uploadState.activeId}"]`) || document.querySelector('.uploaded-design-layer');
}

function applyLayerTransform(layer) {
  if (!layer) return;
  const scale = Number(layer.dataset.scale || 1);
  const rotate = Number(layer.dataset.rotate || 0);
  const flipX = layer.dataset.flipX === 'true' ? -1 : 1;
  const flipY = layer.dataset.flipY === 'true' ? -1 : 1;
  layer.style.transform = `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale * flipX}, ${scale * flipY})`;
}

function selectUploadLayer(layer) {
  document.querySelectorAll('.uploaded-design-layer').forEach((item) => item.classList.remove('active'));
  if (!layer) return;
  layer.classList.add('active');
  uploadState.activeId = layer.dataset.layerId;
  document.querySelector('#upload-scale').value = Math.round(Number(layer.dataset.scale || 1) * 100);
  document.querySelector('#upload-rotate').value = Number(layer.dataset.rotate || 0);
}

function makeUploadLayer(src, name) {
  const zone = document.querySelector('#upload-layer-zone');
  if (!zone) return;
  const id = `upload-${Date.now()}-${uploadState.layers.length}`;
  const layer = document.createElement('img');
  layer.className = 'uploaded-design-layer sticker-cutline';
  layer.dataset.layerId = id;
  layer.dataset.scale = '1';
  layer.dataset.rotate = '0';
  layer.dataset.flipX = 'false';
  layer.dataset.flipY = 'false';
  layer.alt = `${name} custom uploaded design`;
  layer.src = src;
  layer.style.left = '50%';
  layer.style.top = '50%';
  layer.draggable = false;
  zone.appendChild(layer);
  uploadState.layers.push({ id, name, src });
  selectUploadLayer(layer);
  applyLayerTransform(layer);
  renderOrderSummary();
  setDesignerStatus(`${name} added. Drag it, resize it, rotate it, flip it, duplicate it, or include it in the custom order.`);
}

function handleDesignUpload(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  if (!allowedDesignTypes.includes(file.type)) {
    setDesignerStatus('Upload failed: use PNG, JPG, JPEG, or SVG artwork. Transparent PNG is preferred.');
    event.currentTarget.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setDesignerStatus('Upload failed: keep custom design files under 5 MB for this live preview.');
    event.currentTarget.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => makeUploadLayer(reader.result, file.name);
  reader.readAsDataURL(file);
}

function handleLayerAction(action) {
  const layer = activeUploadLayer();
  if (!layer) {
    setDesignerStatus('Upload a custom design before using layer controls.');
    return;
  }
  if (action === 'center') { layer.style.left = '50%'; layer.style.top = '50%'; }
  if (action === 'front') layer.style.zIndex = String((Number(layer.style.zIndex) || 10) + 1);
  if (action === 'back') layer.style.zIndex = String(Math.max(1, (Number(layer.style.zIndex) || 10) - 1));
  if (action === 'flip-x') layer.dataset.flipX = layer.dataset.flipX === 'true' ? 'false' : 'true';
  if (action === 'flip-y') layer.dataset.flipY = layer.dataset.flipY === 'true' ? 'false' : 'true';
  if (action === 'delete') {
    uploadState.layers = uploadState.layers.filter((item) => item.id !== layer.dataset.layerId);
    layer.remove();
    uploadState.activeId = null;
    renderOrderSummary();
    setDesignerStatus('Custom design layer deleted from the preview.');
    return;
  }
  if (action === 'duplicate') makeUploadLayer(layer.src, `${layer.alt.replace(' custom uploaded design', '')} copy`);
  applyLayerTransform(layer);
  renderOrderSummary();
}

function exportDesignerOrder() {
  const { data, product, character } = designerData();
  const layers = [...document.querySelectorAll('.uploaded-design-layer')].map((layer) => ({
    id: layer.dataset.layerId,
    name: uploadState.layers.find((item) => item.id === layer.dataset.layerId)?.name || layer.alt.replace(' custom uploaded design', ''),
    src: layer.src,
    left: layer.style.left || '50%',
    top: layer.style.top || '50%',
    zIndex: layer.style.zIndex || '10',
    scale: layer.dataset.scale || '1',
    rotate: layer.dataset.rotate || '0',
    flipX: layer.dataset.flipX || 'false',
    flipY: layer.dataset.flipY || 'false'
  }));
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    fields: Object.fromEntries(data.entries()),
    product: product.name,
    character: character.name,
    color: data.get('color'),
    size: data.get('size'),
    name: data.get('name'),
    number: data.get('number'),
    logoStyle: data.get('logo'),
    sleeveText: data.get('sleeve'),
    layout: data.get('layout'),
    printShape: data.get('printShape'),
    quantity: Number(data.get('quantity') || 1),
    notes: data.get('notes') || '',
    uploads: layers,
    preview: 'Live product-specific print template with draggable layers and a print-safe area guide'
  };
}

function restoreDesignerOrder(saved) {
  if (!saved || !designerControls) return false;
  const fields = saved.fields || {};
  Object.entries(fields).forEach(([name, value]) => {
    const field = designerControls.elements.namedItem(name);
    if (field && typeof value === 'string') field.value = value;
  });
  document.querySelector('#upload-layer-zone').replaceChildren();
  uploadState.layers = [];
  uploadState.activeId = null;
  (saved.uploads || []).forEach((savedLayer) => {
    if (!savedLayer.src) return;
    makeUploadLayer(savedLayer.src, savedLayer.name || 'Saved custom art');
    const layer = activeUploadLayer();
    if (!layer) return;
    layer.style.left = savedLayer.left || '50%';
    layer.style.top = savedLayer.top || '50%';
    layer.style.zIndex = savedLayer.zIndex || '10';
    layer.dataset.scale = savedLayer.scale || '1';
    layer.dataset.rotate = savedLayer.rotate || '0';
    layer.dataset.flipX = savedLayer.flipX || 'false';
    layer.dataset.flipY = savedLayer.flipY || 'false';
    applyLayerTransform(layer);
  });
  updatePreview();
  return true;
}

function downloadDesignerSpec() {
  const order = exportDesignerOrder();
  const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `muzikaz-${order.product.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-print-spec.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setDesignerStatus('Print specification downloaded. Attach it to a fulfillment workflow or keep it with this custom order.');
}

designerControls?.addEventListener('input', updatePreview);
designerControls?.addEventListener('change', updatePreview);
document.querySelector('#design-upload')?.addEventListener('change', handleDesignUpload);
document.querySelector('#upload-scale')?.addEventListener('input', (event) => {
  const layer = activeUploadLayer();
  if (!layer) return;
  layer.dataset.scale = String(Number(event.currentTarget.value) / 100);
  applyLayerTransform(layer);
});
document.querySelector('#upload-rotate')?.addEventListener('input', (event) => {
  const layer = activeUploadLayer();
  if (!layer) return;
  layer.dataset.rotate = event.currentTarget.value;
  applyLayerTransform(layer);
});
document.querySelectorAll('[data-layer-action]').forEach((button) => button.addEventListener('click', () => handleLayerAction(button.dataset.layerAction)));
document.querySelectorAll('[data-studio-jump]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.studioJump)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
function stagePercentPosition(pointerEvent, stage, dragStart, snap) {
  const stageRect = stage.getBoundingClientRect();
  const targetX = pointerEvent.clientX - dragStart.offsetX + dragStart.anchorX;
  const targetY = pointerEvent.clientY - dragStart.offsetY + dragStart.anchorY;
  const rawX = ((targetX - stageRect.left) / stageRect.width) * 100;
  const rawY = ((targetY - stageRect.top) / stageRect.height) * 100;
  return {
    x: Math.round(rawX / snap) * snap,
    y: Math.round(rawY / snap) * snap
  };
}

function enableStickerStageDragging() {
  const stage = document.querySelector('#sticker-stage');
  if (!stage) return;
  stage.addEventListener('pointerdown', (event) => {
    const layer = event.target.closest('.sticker-cutline');
    if (!layer || !stage.contains(layer)) return;
    event.preventDefault();
    const isUploadedLayer = layer.classList.contains('uploaded-design-layer');
    if (isUploadedLayer) selectUploadLayer(layer);
    layer.classList.add('active');
    layer.setPointerCapture?.(event.pointerId);
    layer.style.right = 'auto';
    layer.style.bottom = 'auto';
    const layerRect = layer.getBoundingClientRect();
    const dragStart = {
      offsetX: event.clientX - layerRect.left,
      offsetY: event.clientY - layerRect.top,
      anchorX: isUploadedLayer ? layerRect.width / 2 : 0,
      anchorY: isUploadedLayer ? layerRect.height / 2 : 0
    };
    const move = (moveEvent) => {
      const snap = moveEvent.shiftKey ? 10 : 1;
      const { x, y } = stagePercentPosition(moveEvent, stage, dragStart, snap);
      layer.style.left = `${Math.max(0, Math.min(94, x))}%`;
      layer.style.top = `${Math.max(0, Math.min(94, y))}%`;
    };
    const stop = () => {
      layer.releasePointerCapture?.(event.pointerId);
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', stop);
      layer.removeEventListener('pointercancel', stop);
      if (!layer.classList.contains('uploaded-design-layer')) layer.classList.remove('active');
      setDesignerStatus('Sticker placement updated. Drag any sticker or upload again; hold Shift to snap to 10% zones.');
    };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', stop);
    layer.addEventListener('pointercancel', stop);
  });
}

enableStickerStageDragging();
document.querySelector('#save-design')?.addEventListener('click', () => {
  uploadState.saved = exportDesignerOrder();
  try {
    localStorage.setItem('muzikazSavedDesign', JSON.stringify(uploadState.saved));
    setDesignerStatus('Draft saved with product settings, text, notes, artwork layers, and placement controls.');
  } catch {
    setDesignerStatus('Draft could not be saved because the uploaded artwork exceeds local browser storage. Download the print spec instead.');
  }
});
document.querySelector('#load-design')?.addEventListener('click', () => {
  try {
    uploadState.saved = JSON.parse(localStorage.getItem('muzikazSavedDesign') || 'null');
    setDesignerStatus(restoreDesignerOrder(uploadState.saved) ? `Loaded saved ${uploadState.saved.product} draft with its placement settings.` : 'No saved design draft found yet.');
  } catch {
    setDesignerStatus('Saved draft could not be read. Start a fresh design and save it again.');
  }
});
document.querySelector('#duplicate-design')?.addEventListener('click', () => {
  const layer = activeUploadLayer();
  if (layer) handleLayerAction('duplicate');
  setDesignerStatus('Design duplicated for reuse on another product template.');
});
document.querySelector('#edit-design')?.addEventListener('click', () => {
  document.querySelector('#product')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setDesignerStatus('Correction mode open: choose a product, print shape, text, uploads, and drag layers directly on the selected item template before finalizing.');
});
document.querySelector('#download-design-spec')?.addEventListener('click', downloadDesignerSpec);
document.querySelector('[data-add-custom]')?.addEventListener('click', (event) => {
  const order = exportDesignerOrder();
  const title = `${order.character} ${order.product} custom order`;
  const product = designerProducts.find((item) => item.name === order.product) || { price: 74.99 };
  addCartLine(title, product.price * order.quantity, `Custom merch designer · ${order.uploads.length} upload(s) · ${order.logoStyle}`);
  updateCart(event.currentTarget, 'Design added');
  claimOwnedAsset(title, 'Designer save');
  setDesignerStatus('Checkout-ready custom order added with final summary, text, upload references, quantity, and notes.');
});
document.querySelector('#asset-upload')?.addEventListener('change', (event) => {
  const files = [...event.currentTarget.files].map((file) => `<li>${file.name} → thumbnails, tiles, cards, previews queued</li>`).join('');
  document.querySelector('#asset-list').innerHTML = files || '<li>No files selected</li>';
  [...event.currentTarget.files].forEach((file) => claimOwnedAsset(file.name, 'Uploaded graphic'));
});


function characterImage(character) {
  return `muzikaz_site 2/assets/characters/${character.file}.jpg`;
}

function money(amount) {
  return `$${amount.toFixed(2)}`;
}

async function seedCharacterCheckout() {
  const characterSelect = document.querySelector('#checkout-character-select');
  const productSelect = document.querySelector('#checkout-product-select');
  const catalog = document.querySelector('#character-catalog');
  const productCatalog = document.querySelector('#checkout-product-catalog');
  if (!characterSelect || !productSelect || !catalog || !productCatalog) return;
  await loadOwnerGlbModels();
  characterSelect.innerHTML = siteTwoCharacters.map((character, index) => `<option value="${index}">${character.name}</option>`).join('');
  productSelect.innerHTML = siteTwoProducts.map((product, index) => `<option value="${index}">${product.name}</option>`).join('');
  catalog.innerHTML = siteTwoCharacters.map((character, index) => `
    <button class="character-tile" type="button" data-checkout-character="${index}">
      ${characterModelMarkup(character, `${character.name} selectable 3D model`, 'character-tile-model')}
      <span>${character.group}</span><strong>${character.name}</strong><small>${character.role}</small>
    </button>`).join('');
  productCatalog.innerHTML = siteTwoProducts.map((product, index) => `
    <button class="checkout-product-tile" type="button" data-checkout-product="${index}">
      <span>${product.name}</span><strong>${money(product.price)}</strong><small>${product.desc}</small>
    </button>`).join('');
  updateCharacterCheckout();
}

function updateCharacterCheckout() {
  const characterSelect = document.querySelector('#checkout-character-select');
  const productSelect = document.querySelector('#checkout-product-select');
  if (!characterSelect || !productSelect) return;
  const character = siteTwoCharacters[Number(characterSelect.value)] || siteTwoCharacters[0];
  const product = siteTwoProducts[Number(productSelect.value)] || siteTwoProducts[0];
  document.querySelector('#checkout-character-name').textContent = `${character.name} · ${product.name}`;
  document.querySelector('#checkout-character-copy').textContent = `${character.bio} Choose a ${product.name.toLowerCase()}, colorway, format, and quantity, then add the exact character-product combo to checkout.`;
  const viewer = document.querySelector('#checkout-character-model');
  const characterModel = modelForCharacter(character);
  if (viewer && characterModel?.modelUrl) {
    viewer.src = characterModel.modelUrl;
    viewer.poster = characterImage(character);
    viewer.setAttribute('alt', `${character.name} interactive 3D model`);
    if (characterModel.iosModelUrl) viewer.setAttribute('ios-src', characterModel.iosModelUrl); else viewer.removeAttribute('ios-src');
    enhanceModelViewerForAr(viewer, `${character.name} 3D model`);
  }
  const sizeSelect = document.querySelector('#checkout-size-select');
  const colorSelect = document.querySelector('#checkout-color-select');
  if (sizeSelect) sizeSelect.innerHTML = product.sizes.map((size) => `<option>${size}</option>`).join('');
  if (colorSelect) colorSelect.innerHTML = product.colors.map((color) => `<option>${color}</option>`).join('');
  updateCheckoutTotal();
  document.querySelectorAll('[data-checkout-character]').forEach((button) => button.classList.toggle('active', button.dataset.checkoutCharacter === characterSelect.value));
  document.querySelectorAll('[data-checkout-product]').forEach((button) => button.classList.toggle('active', button.dataset.checkoutProduct === productSelect.value));
}

function updateCheckoutTotal() {
  const product = siteTwoProducts[Number(document.querySelector('#checkout-product-select')?.value)] || siteTwoProducts[0];
  const qty = Math.max(1, Number(document.querySelector('#checkout-qty')?.value) || 1);
  document.querySelector('#checkout-total').textContent = money(product.price * qty);
}

document.querySelector('#checkout-character-select')?.addEventListener('change', updateCharacterCheckout);
document.querySelector('#checkout-product-select')?.addEventListener('change', updateCharacterCheckout);
document.querySelector('#checkout-qty')?.addEventListener('input', updateCheckoutTotal);
document.querySelector('#checkout-add')?.addEventListener('click', (event) => {
  const character = siteTwoCharacters[Number(document.querySelector('#checkout-character-select')?.value)] || siteTwoCharacters[0];
  const product = siteTwoProducts[Number(document.querySelector('#checkout-product-select')?.value)] || siteTwoProducts[0];
  const qty = Math.max(1, Number(document.querySelector('#checkout-qty')?.value) || 1);
  for (let index = 0; index < qty; index += 1) addCartLine(`${character.name} ${product.name}`, product.price, `${document.querySelector('#checkout-size-select')?.value || ''} · ${document.querySelector('#checkout-color-select')?.value || ''}`);
  updateCart(event.currentTarget, 'Checkout added');
  claimOwnedAsset(`${character.name} ${product.name}`, 'Character checkout');
  alert(`${character.name} ${product.name} is in your cart and saved to ${currentMemberEmail || 'the active'} owned collection. Connect this demo checkout to Shopify, Stripe, WooCommerce, or your preferred product checkout.`);
});
document.addEventListener('click', (event) => {
  const characterButton = event.target.closest('[data-checkout-character]');
  if (characterButton) {
    document.querySelector('#checkout-character-select').value = characterButton.dataset.checkoutCharacter;
    updateCharacterCheckout();
  }
  const productButton = event.target.closest('[data-checkout-product]');
  if (productButton) {
    document.querySelector('#checkout-product-select').value = productButton.dataset.checkoutProduct;
    updateCharacterCheckout();
  }
});

renderModelCards();
renderMerchOptions();
syncCartCount();
initMarketSectionToggle();
initFlexLabCategories();
initWorldPlot();
seedDesigner();


function enhanceModelViewerForAr(viewer, label = 'MUZIKAZ model') {
  if (!viewer || viewer.dataset.arEnhanced === 'true') return;
  viewer.dataset.arEnhanced = 'true';
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('touch-action', 'pan-y');
  viewer.setAttribute('ar', '');
  viewer.setAttribute('ar-modes', viewer.getAttribute('ar-modes') || 'webxr scene-viewer quick-look');
  viewer.setAttribute('ar-placement', viewer.getAttribute('ar-placement') || 'floor');
  viewer.setAttribute('ar-scale', viewer.getAttribute('ar-scale') || 'auto');
  viewer.setAttribute('shadow-intensity', viewer.getAttribute('shadow-intensity') || '1');
  viewer.setAttribute('interaction-prompt', viewer.getAttribute('interaction-prompt') || 'auto');
  if (!viewer.querySelector('[slot="ar-button"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.slot = 'ar-button';
    button.className = 'ar-button';
    button.textContent = `Place ${label} in AR`;
    viewer.append(button);
  }
}

function enhancePageArViewers(root = document) {
  root.querySelectorAll?.('model-viewer').forEach((viewer) => enhanceModelViewerForAr(viewer, viewer.getAttribute('alt') || viewer.getAttribute('aria-label') || 'MUZIKAZ model'));
}

enhancePageArViewers();
new MutationObserver((mutations) => {
  mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('model-viewer')) enhanceModelViewerForAr(node, node.getAttribute('alt') || 'MUZIKAZ model');
    enhancePageArViewers(node);
  }));
}).observe(document.documentElement, { childList: true, subtree: true });

const arCharacterSelect = document.querySelector('#ar-character-select');
const arCharacterStrip = document.querySelector('#ar-character-strip');
const arPreviewImg = document.querySelector('#ar-preview-img');
const arModelViewer = document.querySelector('#ar-model-viewer');
const arFileInput = document.querySelector('#ar-file-input');
const arFileMeta = document.querySelector('#ar-file-meta');
const arPopoutButton = document.querySelector('#ar-popout-button');
let customArFileUrl = '';
let ownerGlbModels = [];
let ownerGlbModelsPromise;
async function loadOwnerGlbModels() {
  if (ownerGlbModelsPromise) return ownerGlbModelsPromise;
  ownerGlbModelsPromise = (async () => {
    try {
      const response = await fetch('public/models/glb-models.json', { cache: 'no-store' });
      if (!response.ok) return [];
      const catalog = await response.json();
      const records = Array.isArray(catalog) ? catalog : (Array.isArray(catalog.models) ? catalog.models : []);
      ownerGlbModels = records.filter((model) => model.visibility !== 'private' && model.modelUrl);
      const known = new Set(marketplaceListings.map((item) => item.modelUrl).filter(Boolean));
      ownerGlbModels.forEach((model) => {
        if (known.has(model.modelUrl)) return;
        marketplaceListings.push({ type: 'Owner GLB Library', category: model.category || 'Owner GLB Library', quality: 'curated', name: `${model.name} AR Model`, price: 'Available in AR', copy: `${model.description || 'Owner-deposited GLB model.'} Source: ${model.modelUrl}`, model: model.name, modelUrl: model.modelUrl, iosModelUrl: model.iosModelUrl || '', arCharacterIndex: siteTwoCharacters.findIndex((character) => normalizeArModelKey(character.arModelId) === normalizeArModelKey(model.id)) });
        known.add(model.modelUrl);
      });
      renderMarketplace();
      return ownerGlbModels;
    } catch (error) {
      console.warn('[Members AR] Owner GLB catalog unavailable', error);
      return [];
    }
  })();
  return ownerGlbModelsPromise;
}
function resolvedModelUrl(value) {
  try { return new URL(value, document.baseURI).href; } catch { return value; }
}
function renderSubscriberGlbLibrary() {
  const grid = document.querySelector('#subscriber-glb-grid');
  if (!grid) return;
  if (!ownerGlbModels.length) {
    grid.innerHTML = '<p class="model-library-status">No published GLB models are available right now.</p>';
    return;
  }
  grid.replaceChildren(...ownerGlbModels.map((model) => {
    const card = document.createElement('article');
    card.className = 'subscriber-glb-card';
    const viewer = document.createElement('model-viewer');
    viewer.src = resolvedModelUrl(model.modelUrl);
    viewer.setAttribute('alt', `${model.name} interactive 3D model`);
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('auto-rotate', '');
    viewer.setAttribute('touch-action', 'pan-y');
    viewer.setAttribute('shadow-intensity', '1');
    viewer.setAttribute('loading', 'lazy');
    viewer.setAttribute('reveal', 'auto');
    if (model.thumbnailUrl) viewer.setAttribute('poster', resolvedModelUrl(model.thumbnailUrl));
    if (model.iosModelUrl) viewer.setAttribute('ios-src', resolvedModelUrl(model.iosModelUrl));
    enhanceModelViewerForAr(viewer, model.name);
    viewer.addEventListener('error', () => {
      const message = document.createElement('p');
      message.className = 'model-library-error';
      message.textContent = `${model.name} could not be loaded. Please try again.`;
      viewer.replaceWith(message);
    }, { once: true });
    const heading = document.createElement('h3');
    heading.textContent = model.name;
    const copy = document.createElement('p');
    copy.textContent = model.description || 'Published MUZIKAZ owner model.';
    card.append(viewer, heading, copy);
    return card;
  }));
}
const arModelAliases = {
  sparky: ['sparky'], nexus: ['nexus'], inferno: ['inferno'], rumble: ['rumble'], chillz: ['chillz'], bax: ['bax'],
  'ion-wolf': ['ionwolf', 'voltwolf', 'wolfie'], flick: ['flick'], byte: ['byte'], luna: ['luna'],
  'muz-cat': ['muzcat', 'muzkat'], grump: ['grump'], sharko: ['sharko'], buzz: ['buzz', 'beedeere'],
  wild: ['wild'], grok: ['grok'], 'buzz-jr': ['buzzjr', 'beeduck']
};
function normalizeArModelKey(value){return String(value||'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
function modelSearchText(model){return [model.id, model.name, model.modelUrl, model.character, model.category].map(normalizeArModelKey).join(' ');}
function modelForCharacter(character){
  const exactId = normalizeArModelKey(character.arModelId);
  if (exactId) {
    const exactModel = ownerGlbModels.find(model => normalizeArModelKey(model.id) === exactId);
    if (exactModel) return exactModel;
  }
  const key = normalizeArModelKey(character.file);
  const aliases = [key, normalizeArModelKey(character.name), ...(arModelAliases[character.file] || [])].filter(Boolean);
  return ownerGlbModels.find(model => aliases.some(alias => modelSearchText(model).includes(alias)));
}
function characterModelMarkup(character, label, className = '') {
  const model = modelForCharacter(character);
  if (!model?.modelUrl) return `<img src="${characterImage(character)}" alt="${label}">`;
  return `<model-viewer class="${className}" src="${model.modelUrl}" poster="${characterImage(character)}" ${model.iosModelUrl ? `ios-src="${model.iosModelUrl}"` : ''} camera-controls touch-action="pan-y" auto-rotate ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" ar-scale="auto" shadow-intensity="1" loading="lazy" reveal="auto" alt="${label}"></model-viewer>`;
}
function characterForListing(listing){
  return siteTwoCharacters.findIndex((character) => listing.model === character.name || listing.model === character.group || listing.copy?.includes(character.group) || listing.copy?.includes(character.name));
}
function activateMarketplaceAr(listing){
  const characterIndex = Number.isInteger(listing.arCharacterIndex) ? listing.arCharacterIndex : characterForListing(listing);
  if (characterIndex >= 0 && arCharacterSelect) {
    arCharacterSelect.value = String(characterIndex);
    customArFileUrl = '';
    updateArViewer(false);
    scrollToSection('ar-viewer');
    arPopoutButton?.click();
    return;
  }
  if (listing.modelUrl) window.open(listing.modelUrl, '_blank', 'noopener');
}

function selectedArCharacter() {
  return siteTwoCharacters[Number(arCharacterSelect?.value)] || siteTwoCharacters[0];
}

function isArModelFile(source, format = '') {
  const normalizedFormat = String(format).replace(/^\./, '').toLowerCase();
  if (['glb', 'gltf', 'usdz', 'reality'].includes(normalizedFormat)) return true;
  try {
    return /\.(glb|gltf|usdz|reality)$/i.test(new URL(source, document.baseURI).pathname);
  } catch {
    return /\.(glb|gltf|usdz|reality)(?:[?#]|$)/i.test(String(source));
  }
}

function showArArtworkFallback(characterSrc) {
  if (arModelViewer) arModelViewer.hidden = true;
  if (arPreviewImg) {
    arPreviewImg.src = characterSrc;
    arPreviewImg.hidden = false;
  }
}

function updateArViewer(useCustomFile = Boolean(customArFileUrl)) {
  if (!arCharacterSelect) return;
  const character = selectedArCharacter();
  const characterSrc = characterImage(character);
  document.querySelector('#ar-character-name').textContent = `${character.name} AR viewer`;
  document.querySelector('#ar-character-copy').textContent = `${character.bio} Open the highlighted pop-out button to launch this character preview on iPhone Quick Look or Android Scene Viewer when a GLB/USDZ AR file is available.`;
  if (arPreviewImg) {
    arPreviewImg.src = characterSrc;
    arPreviewImg.hidden = useCustomFile && /\.(glb|gltf|usdz|reality)$/i.test(customArFileUrl);
  }
  if (arModelViewer) {
    const catalogModel = modelForCharacter(character);
    const activeModelUrl = useCustomFile ? customArFileUrl : catalogModel?.modelUrl;
    const activeIosUrl = !useCustomFile ? catalogModel?.iosModelUrl : '';
    const isModelFile = isArModelFile(activeModelUrl || '', useCustomFile ? '' : catalogModel?.format);
    arModelViewer.hidden = !isModelFile;
    if (isModelFile) {
      arPreviewImg.hidden = true;
      if (/\.usdz$/i.test(activeModelUrl) || /\.reality$/i.test(activeModelUrl)) {
        arModelViewer.setAttribute('ios-src', activeModelUrl);
        arModelViewer.removeAttribute('src');
      } else {
        arModelViewer.src = activeModelUrl;
        if (activeIosUrl) arModelViewer.setAttribute('ios-src', activeIosUrl); else arModelViewer.removeAttribute('ios-src');
      }
      arModelViewer.poster = characterSrc;
      arModelViewer.setAttribute('alt', `${character.name} selected 3D character`);
      enhanceModelViewerForAr(arModelViewer, `${character.name} AR model`);
    } else {
      showArArtworkFallback(characterSrc);
    }
  }
  document.querySelectorAll('[data-ar-character]').forEach((button) => button.classList.toggle('active', button.dataset.arCharacter === arCharacterSelect.value));
  if (arFileMeta && !customArFileUrl) { const catalogModel = modelForCharacter(character); arFileMeta.textContent = catalogModel ? `${catalogModel.name} GLB loaded from the owner model catalog for inline 3D and AR.` : `Previewing ${character.name} from the built-in collection artwork.`; }
}

async function seedArViewer() {
  if (!arCharacterSelect || !arCharacterStrip) return;
  await loadOwnerGlbModels();
  arCharacterSelect.innerHTML = siteTwoCharacters.map((character, index) => `<option value="${index}">${character.name}</option>`).join('');
  arCharacterStrip.innerHTML = siteTwoCharacters.map((character, index) => `
    <button class="ar-character-chip" type="button" data-ar-character="${index}">
      ${characterModelMarkup(character, `${character.name} 3D picker model`, 'ar-character-chip-model')}<span>${character.name}</span>
    </button>`).join('');
  arModelViewer?.addEventListener('error', () => showArArtworkFallback(characterImage(selectedArCharacter())));
  updateArViewer(false);
}

arCharacterSelect?.addEventListener('change', () => {
  customArFileUrl = '';
  updateArViewer(false);
});
arCharacterStrip?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-ar-character]');
  if (!button || !arCharacterSelect) return;
  arCharacterSelect.value = button.dataset.arCharacter;
  customArFileUrl = '';
  updateArViewer(false);
});
arFileInput?.addEventListener('change', (event) => {
  const [file] = event.currentTarget.files;
  if (!file) return;
  if (customArFileUrl) URL.revokeObjectURL(customArFileUrl);
  customArFileUrl = URL.createObjectURL(file);
  if (arFileMeta) arFileMeta.textContent = `${file.name} loaded for ${selectedArCharacter().name}.`;
  if (/^image\//.test(file.type)) {
    if (arPreviewImg) {
      arPreviewImg.hidden = false;
      arPreviewImg.src = customArFileUrl;
    }
    if (arModelViewer) arModelViewer.hidden = true;
  } else {
    updateArViewer(true);
  }
});
function escapeArPopupText(value) {
  return String(value ?? '').replace(/[&<>'\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[char]));
}

arPopoutButton?.addEventListener('click', () => {
  const character = selectedArCharacter();
  const popup = window.open('', `muzikaz-ar-${character.file}`, 'popup,width=430,height=740');
  if (!popup) {
    alert('Allow pop-ups to open the AR viewer window. Upload a GLB or USDZ file for native AR launch on mobile.');
    return;
  }
  const catalogModel = modelForCharacter(character);
  const modelUrl = customArFileUrl || catalogModel?.modelUrl || '';
  const iosModelUrl = !customArFileUrl ? catalogModel?.iosModelUrl || '' : '';
  const previewUrl = arPreviewImg?.src || characterImage(character);
  const safeCharacterName = escapeArPopupText(character.name);
  const safeModelUrl = escapeArPopupText(modelUrl);
  const safeIosModelUrl = escapeArPopupText(iosModelUrl);
  const safePreviewUrl = escapeArPopupText(previewUrl);
  const viewerMarkup = modelUrl && /\.(glb|gltf|usdz|reality)$/i.test(modelUrl)
    ? `<model-viewer src="${safeModelUrl}" ${iosModelUrl ? `ios-src="${safeIosModelUrl}"` : ''} poster="${safePreviewUrl}" camera-controls touch-action="pan-y" auto-rotate ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" ar-scale="auto" interaction-prompt="auto" shadow-intensity="1" alt="${safeCharacterName} AR model"><button slot="ar-button" type="button">Place ${safeCharacterName} in AR</button></model-viewer>`
    : `<img src="${safePreviewUrl}" alt="${safeCharacterName}"><p>No matching GLB/USDZ filing is connected yet; upload a model file on the main page to launch native AR.</p>`;
  const sourceCopy = catalogModel ? `${escapeArPopupText(catalogModel.name)} is connected from the AR model filing: ${escapeArPopupText(catalogModel.modelUrl)}.` : 'Select another character or upload a GLB, GLTF, USDZ, or Reality file for native AR on iPhone or Android.';
  popup.document.write(`<!doctype html><title>${safeCharacterName} AR Preview</title><script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"><\/script><style>body{margin:0;background:#020302;color:#9cff00;font-family:system-ui;text-align:center;text-transform:uppercase}main{min-height:100vh;display:grid;place-items:center;padding:18px}model-viewer,img{width:100%;height:72vh;max-height:72vh;object-fit:contain;filter:drop-shadow(0 20px 30px #000)}button{border:1px solid #9cff00;border-radius:999px;background:#9cff00;color:#030403;padding:12px 18px;font-weight:900;text-transform:uppercase}p{text-transform:none;color:#fff}</style><main><div><h1>${safeCharacterName}</h1>${viewerMarkup}<p>${sourceCopy}</p></div></main>`);
  popup.document.close();
});

function initBottleLogin() {
  const form = document.querySelector('#bottle-login-form');
  const lockedContent = document.querySelector('#member-locked-content');
  const status = document.querySelector('#bottle-login-status');
  if (!form || !lockedContent) return;
  const unlock = async (message) => {
    if (window.MUZIKAZ_AVATAR_GATE) await window.MUZIKAZ_AVATAR_GATE.ensure();
    lockedContent.dataset.locked = 'false';
    if (status) status.textContent = message;
  };
  if (hasBottleLogin()) {
    currentMemberEmail = normalizeMemberEmail(window.localStorage.getItem('muzikazBottleMemberEmail') || currentMemberEmail || 'crew@muzikaz.example');
    unlock(`Bottle member access is active for ${currentMemberEmail}. Subscriber tools are unlocked.`);
    renderOwnedCollection(currentMemberEmail);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    currentMemberEmail = normalizeMemberEmail(data.get('email'));
    window.localStorage.setItem('muzikazBottleMember', 'true');
    window.localStorage.setItem('muzikazBottleMemberEmail', currentMemberEmail);
    renderOwnedCollection(currentMemberEmail);
    await unlock(`${currentMemberEmail} is logged in. Your designated avatar and Drop Backpack are retained across visits.`);
    const redirect = window.sessionStorage.getItem('muzikazLoginRedirect');
    if (redirect) {
      window.sessionStorage.removeItem('muzikazLoginRedirect');
      window.location.href = redirect;
      return;
    }
    scrollToSection('member-locked-content');
  });
}

marketQualityToggle?.addEventListener('change', () => renderMarketplace());
renderMarketplace();
seedCharacterCheckout();
seedArViewer();
loadOwnerGlbModels().then(renderSubscriberGlbLibrary);
document.querySelector('#owned-profile-select')?.addEventListener('change', (event) => renderOwnedCollection(event.currentTarget.value));
renderOwnedCollection();
initBottleLogin();

const checkoutItems = document.querySelector('#checkout-items');
const paymentForm = document.querySelector('#payment-form');

function formatCheckoutMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function renderCheckoutPage() {
  if (!checkoutItems) return;
  const items = readCart();
  if (!items.length) {
    checkoutItems.innerHTML = '<article class="empty-cart"><strong>Your cart is empty.</strong><span>Add models or merch before processing checkout.</span></article>';
  } else {
    checkoutItems.innerHTML = items.map((item) => `
      <article class="checkout-item">
        <div><strong>${item.name}</strong><span>${item.meta || 'MUZIKAZ store item'} · Qty ${item.quantity}</span></div>
        <b>${formatCheckoutMoney(item.price * item.quantity)}</b>
      </article>`).join('');
  }
  const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  const shipping = subtotal > 0 && subtotal < 75 ? 8.95 : 0;
  const tax = subtotal * 0.0825;
  const total = subtotal + shipping + tax;
  document.querySelector('#summary-subtotal').textContent = formatCheckoutMoney(subtotal);
  document.querySelector('#summary-shipping').textContent = subtotal ? (shipping ? formatCheckoutMoney(shipping) : 'Free') : '$0.00';
  document.querySelector('#summary-tax').textContent = formatCheckoutMoney(tax);
  document.querySelector('#summary-total').textContent = formatCheckoutMoney(total);
  document.querySelector('#pay-button-total').textContent = formatCheckoutMoney(total);
  document.querySelector('#pay-button').disabled = !items.length;
}

document.querySelector('#checkout-clear-cart')?.addEventListener('click', () => {
  writeCart([]);
  renderCheckoutPage();
  document.querySelector('#payment-status').textContent = 'Cart cleared. Add products to process a new payment.';
});

paymentForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const items = readCart();
  const status = document.querySelector('#payment-status');
  if (!items.length) {
    status.textContent = 'Add at least one item before processing payment.';
    return;
  }
  if (!paymentForm.reportValidity()) return;
  const data = new FormData(paymentForm);
  const orderId = `MZ-${Date.now().toString().slice(-6)}`;
  const total = document.querySelector('#summary-total').textContent;
  const receipt = { orderId, total, email: data.get('email'), items, paidAt: new Date().toISOString(), method: data.get('method') };
  window.localStorage.setItem('muzikazLastReceipt', JSON.stringify(receipt));
  currentMemberEmail = normalizeMemberEmail(data.get('email'));
  window.localStorage.setItem('muzikazBottleMemberEmail', currentMemberEmail);
  items.forEach((item) => claimOwnedAsset(item.name, `Paid order ${orderId}`));
  writeCart([]);
  renderCheckoutPage();
  status.textContent = `Payment processed for ${total}. Receipt ${orderId} sent to ${data.get('email')}.`;
  document.querySelector('#confirmation-copy').textContent = `Receipt ${orderId} is confirmed for ${total} by ${data.get('method')}. Your ${items.length} cart line${items.length === 1 ? '' : 's'} are ready for fulfillment.`;
  document.querySelector('#confirmation-panel').hidden = false;
  document.querySelector('#confirmation-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  paymentForm.reset();
});

renderCheckoutPage();

function initPublicModelExplorer() {
  const viewer = document.querySelector('#public-model-viewer');
  const fileInput = document.querySelector('#public-model-file');
  const status = document.querySelector('#public-model-status');
  const lockButton = document.querySelector('#lock-model-button');
  const unlockButton = document.querySelector('#unlock-model-button');
  const resetButton = document.querySelector('#reset-view-button');
  const centerButton = document.querySelector('#center-cursor-button');
  const summary = document.querySelector('#locked-model-summary');
  const environmentSelect = document.querySelector('#environment-select');
  const zoomRange = document.querySelector('#zoom-range');
  const scaleRange = document.querySelector('#scale-range');
  const scaleOutput = document.querySelector('#scale-output');
  const cursorSelect = document.querySelector('#cursor-select');
  const cursorModel = document.querySelector('#cursor-model');
  const floorGrid = document.querySelector('#floor-grid');
  const floorTarget = document.querySelector('#floor-target');
  if (!viewer || !floorGrid || !cursorModel) return;

  const lockKey = 'muzikazPublicLockedModel';
  const state = {
    name: 'Default Astronaut GLB/USDZ demo',
    source: viewer.getAttribute('src') || '',
    iosSource: viewer.getAttribute('ios-src') || '',
    zoom: 105,
    scale: 100,
    cursor: cursorModel.textContent || '🐺',
    cursorLabel: 'Legends wolf',
    cursorX: 50,
    cursorY: 64,
    environment: 'neutral',
  };

  function updateScaleZoom() {
    const scaleValue = Number(scaleRange?.value || state.scale);
    const zoomValue = Number(zoomRange?.value || state.zoom);
    state.scale = scaleValue;
    state.zoom = zoomValue;
    const modelScale = scaleValue / 100;
    viewer.setAttribute('scale', `${modelScale} ${modelScale} ${modelScale}`);
    viewer.setAttribute('camera-orbit', `0deg 75deg ${zoomValue}%`);
    cursorModel.style.setProperty('--cursor-scale', String(Math.max(.7, Math.min(1.5, modelScale))));
    if (scaleOutput) scaleOutput.textContent = `Scale ${scaleValue}% · Zoom ${zoomValue}%`;
  }

  function setCursorPosition(x, y) {
    state.cursorX = Math.max(4, Math.min(96, x));
    state.cursorY = Math.max(12, Math.min(88, y));
    cursorModel.style.setProperty('--cursor-x', `${state.cursorX}%`);
    cursorModel.style.setProperty('--cursor-y', `${state.cursorY}%`);
    floorTarget?.style.setProperty('--target-x', `${state.cursorX}%`);
    floorTarget?.style.setProperty('--target-y', `${state.cursorY}%`);
    if (status) status.textContent = `${state.cursorLabel} cursor moved to floor position ${Math.round(state.cursorX)}%, ${Math.round(state.cursorY)}%.`;
  }

  function setEnvironment(value) {
    state.environment = value;
    const maps = { neutral: 'neutral', legacy: 'legacy', moon: 'moon_1k' };
    viewer.setAttribute('environment-image', maps[value] || 'neutral');
    viewer.setAttribute('skybox-image', value === 'moon' ? 'moon_1k' : '');
    if (status) status.textContent = `${value} stage lighting selected.`;
  }

  function renderLockedSummary() {
    const locked = JSON.parse(window.localStorage.getItem(lockKey) || 'null');
    if (!summary) return;
    summary.textContent = locked ? `Locked: ${locked.name} with ${locked.cursorLabel} cursor, ${locked.scale}% scale, ${locked.zoom}% zoom, floor ${Math.round(locked.cursorX)}% / ${Math.round(locked.cursorY)}%.` : 'No public model is locked yet.';
  }

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state.name = file.name;
    if (file.name.toLowerCase().endsWith('.usdz') || file.name.toLowerCase().endsWith('.reality')) {
      viewer.setAttribute('ios-src', url);
      state.iosSource = url;
      if (status) status.textContent = `${file.name} is loaded as an iOS AR file. Add a GLB too for full browser preview.`;
    } else {
      viewer.setAttribute('src', url);
      state.source = url;
      if (status) status.textContent = `${file.name} is loaded. Rotate, zoom, scale, walk the cursor, then lock it in.`;
    }
  });

  floorGrid.addEventListener('pointerdown', (event) => {
    const rect = floorGrid.getBoundingClientRect();
    setCursorPosition(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  });

  cursorSelect?.addEventListener('change', () => {
    const selected = cursorSelect.selectedOptions[0];
    state.cursor = cursorSelect.value;
    state.cursorLabel = selected?.dataset.label || selected?.textContent || 'Selected model';
    cursorModel.textContent = state.cursor;
    if (status) status.textContent = `${state.cursorLabel} is now the floor cursor model.`;
  });

  scaleRange?.addEventListener('input', updateScaleZoom);
  zoomRange?.addEventListener('input', updateScaleZoom);
  environmentSelect?.addEventListener('change', () => setEnvironment(environmentSelect.value));
  centerButton?.addEventListener('click', () => setCursorPosition(50, 64));
  resetButton?.addEventListener('click', () => {
    if (scaleRange) scaleRange.value = '100';
    if (zoomRange) zoomRange.value = '105';
    updateScaleZoom();
    setCursorPosition(50, 64);
    viewer.cameraOrbit = '0deg 75deg 105%';
    viewer.jumpCameraToGoal?.();
  });
  lockButton?.addEventListener('click', () => {
    updateScaleZoom();
    window.localStorage.setItem(lockKey, JSON.stringify({ ...state, lockedAt: new Date().toISOString() }));
    renderLockedSummary();
    if (status) status.textContent = `${state.name} is locked in with ${state.cursorLabel} as the move cursor.`;
  });
  unlockButton?.addEventListener('click', () => {
    window.localStorage.removeItem(lockKey);
    renderLockedSummary();
    if (status) status.textContent = 'Public model selection unlocked. Pick or upload another model.';
  });

  updateScaleZoom();
  setCursorPosition(state.cursorX, state.cursorY);
  renderLockedSummary();
}

initPublicModelExplorer();

function initHouseExplorer() {
  if (document.querySelector('script[src$="public/js/model-gallery.js"]')) return;
  const canvas = document.querySelector('#house-explorer-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  const status = document.querySelector('#house-status');
  const startGameButton = document.querySelector('#house-start-game');
  const gameStartScreen = document.querySelector('#house-game-start');
  const gameLoadStatus = document.querySelector('#house-game-load-status');
  const worldButton = document.querySelector('#house-world-button');
  const worldMenu = document.querySelector('#house-world-menu');
  const fullscreenButton = document.querySelector('#house-fullscreen');
  const resetButton = document.querySelector('#house-reset');
  const placePersonButton = document.querySelector('#house-place-person');
  const avatarButton = document.querySelector('#add-avatar');
  const handButton = document.querySelector('#hand-toggle');
  const preview = document.querySelector('#hand-preview');
  const handStatus = document.querySelector('#hand-status');
  const environmentSelect = document.querySelector('#house-environment-select');
  const presenceCount = document.querySelector('#house-presence-count');
  const keys = new Set();
  const HOUSE_ID = 'ioncore-house';
  const API_BASE = window.MUZIKAZ_SHARED_AVATAR_API || '';
  const defaultEnvironment = { id: HOUSE_ID, name: 'IonCore House Gallery', bounds: { minX: -5, maxX: 5, minZ: 0, maxZ: 9 }, camera: { x: 0, y: 1.55, z: -6.2, yaw: 0, pitch: -0.03, fov: 520 }, floorColor: 'rgba(12,24,16,.94)', ceilingColor: 'rgba(4,12,10,.72)', wallColor: 'rgba(14,35,27,.82)', accentColor: 'rgba(156,255,0,.45)', gridColor: 'rgba(156,255,0,.13)', rooms: [{ id: 'front-west', bounds: { minX: -5, maxX: -1.6, minZ: 0, maxZ: 3.2 } }, { id: 'front-hall', bounds: { minX: -1.6, maxX: 5, minZ: 0, maxZ: 3.2 } }, { id: 'middle-gallery', bounds: { minX: -5, maxX: 5, minZ: 3.2, maxZ: 5.9 } }, { id: 'back-lounge', bounds: { minX: -5, maxX: 1.1, minZ: 5.9, maxZ: 9 } }, { id: 'back-east', bounds: { minX: 1.1, maxX: 5, minZ: 5.9, maxZ: 9 } }], walls: [[[-5, 0], [5, 0]], [[5, 0], [5, 9]], [[5, 9], [-5, 9]], [[-5, 9], [-5, 0]], [[-1.6, 0], [-1.6, 3.2]], [[1.8, 3.2], [5, 3.2]], [[-5, 5.9], [1.1, 5.9]], [[1.1, 5.9], [1.1, 9]]], demoAvatars: [{ x: 2.2, z: 1.4, hue: 92 }, { x: -2.7, z: 5.8, hue: 175 }] };
  let activeEnvironment = typeof structuredClone === 'function' ? structuredClone(defaultEnvironment) : JSON.parse(JSON.stringify(defaultEnvironment));
  let defaultCamera = { ...activeEnvironment.camera };
  const camera = { ...defaultCamera };
  let demoAvatars = activeEnvironment.demoAvatars;
  let walls = activeEnvironment.walls;
  const mapFit = 1;
  const sharedAvatarObjects = new Map();
  const livePlayerObjects = new Map();
  const toxicBubbles = [];
  let toxicBubbleAudio = null, lastBubbleSoundAt = 0, gameStarted = false;
  const avatarPlacementState = { active: false, previewObject: null, selectedAvatar: null, position: { x: 0, y: 0, z: 2.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const avatarAssetChoices = [
    { id: 'muzikaz-bolt', name: 'MUZIKAZ Bolt', url: 'logo_symbol_crop_2x_transparent.png', type: 'image-sprite' },
    ...assetCatalog.models.map((model) => ({ id: model.id, name: model.name + ' · ' + model.character, url: model.file, type: model.type, page: model.page }))
  ];
  window.sharedAvatarObjects = sharedAvatarObjects;
  let dragging = false, draggedAvatar = null, lastPointer = null, handEnabled = false, handStream = null, handController = null, lastPresenceAt = 0;
  const sessionId = getSessionId();

  function getSessionId() { const key = 'muzikazHouseSessionId'; let id = window.localStorage.getItem(key); if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || 'session-' + Date.now() + '-' + Math.random().toString(16).slice(2); window.localStorage.setItem(key, id); } return id; }
  function setStatus(message) { if (status) status.textContent = message; }
  function showAvatarStatus(message) { setStatus(message); }
  function hideAvatarStatus() { setStatus('Ready: drag to look around, then move through the rooms.'); }
  function safeText(value, fallback = '') { return String(value || fallback).replace(/[<>]/g, '').slice(0, 140); }
  function calculateRoomId(position) { const room = (activeEnvironment.rooms || []).find((item) => position.x >= item.bounds.minX && position.x < item.bounds.maxX && position.z >= item.bounds.minZ && position.z < item.bounds.maxZ); return room?.id || 'gallery-floor'; }
  function clampPosition(position) { const b = activeEnvironment.bounds || defaultEnvironment.bounds; return { x: Math.max(b.minX + .35, Math.min(b.maxX - .35, Number(position.x) || 0)), y: Math.max(-.6, Math.min(2, Number(position.y) || 0)), z: Math.max(b.minZ + .35, Math.min(b.maxZ - .35, Number(position.z) || 0)) }; }
  function normalizeEnvironment(raw) { const env = { ...defaultEnvironment, ...(raw || {}) }; env.bounds = { ...defaultEnvironment.bounds, ...(raw?.bounds || {}) }; env.camera = { ...defaultEnvironment.camera, ...(raw?.camera || {}) }; env.rooms = Array.isArray(raw?.rooms) ? raw.rooms.filter((room) => room?.id && room?.bounds).slice(0, 24) : defaultEnvironment.rooms; env.walls = Array.isArray(raw?.walls) ? raw.walls.filter((wall) => Array.isArray(wall) && wall.length === 2).slice(0, 80) : defaultEnvironment.walls; env.demoAvatars = Array.isArray(raw?.demoAvatars) ? raw.demoAvatars.slice(0, 12) : defaultEnvironment.demoAvatars; return env; }
  function toxicBubbleMemoryKey() { return 'muzikazToxicBubbleHealth:' + safeText(activeEnvironment.id || activeEnvironment.name || HOUSE_ID, HOUSE_ID); }
  function readToxicBubbleMemory() { try { return JSON.parse(window.localStorage.getItem(toxicBubbleMemoryKey()) || '{}') || {}; } catch (error) { return {}; } }
  function writeToxicBubbleMemory() { const memory = {}; toxicBubbles.forEach((bubble) => { memory[bubble.id] = Math.max(0, Math.round(bubble.health)); }); window.localStorage.setItem(toxicBubbleMemoryKey(), JSON.stringify(memory)); }
  function randomInRange(min, max) { return min + Math.random() * (max - min); }
  function spawnToxicBubbles() { const b = activeEnvironment.bounds || defaultEnvironment.bounds; const memory = readToxicBubbleMemory(); const count = Math.max(5, Math.min(10, Number(activeEnvironment.toxicBubbleCount) || (5 + Math.floor(Math.random() * 6)))); toxicBubbles.splice(0, toxicBubbles.length); for (let i = 0; i < count; i += 1) { const id = 'toxic-bubble-' + i; const angle = randomInRange(0, Math.PI * 2); toxicBubbles.push({ id, x: randomInRange(b.minX + .75, b.maxX - .75), y: randomInRange(.65, 1.85), z: randomInRange(b.minZ + .75, b.maxZ - .75), radius: randomInRange(.22, .42), phase: randomInRange(0, Math.PI * 2), vx: Math.cos(angle) * randomInRange(.006, .018), vz: Math.sin(angle) * randomInRange(.006, .018), health: Math.max(0, Math.min(100, Number(memory[id] ?? 100))) }); } writeToxicBubbleMemory(); }
  function applyEnvironment(raw, source = 'environment file') { activeEnvironment = normalizeEnvironment(raw); walls = activeEnvironment.walls; demoAvatars = activeEnvironment.demoAvatars; defaultCamera = { ...activeEnvironment.camera }; Object.assign(camera, defaultCamera); spawnToxicBubbles(); setStatus(activeEnvironment.name + ' loaded from ' + source + ' with ' + toxicBubbles.length + ' toxic bubbles floating around.'); }
  async function loadEnvironmentCatalog() { if (!environmentSelect) return; try { const response = await fetch('public/models/house-environments.json', { cache: 'no-store' }); if (!response.ok) throw new Error('catalog unavailable'); const catalog = await response.json(); const environments = Array.isArray(catalog.environments) ? catalog.environments.filter((item) => item.visibility !== 'private' && item.environmentUrl) : []; environmentSelect.replaceChildren(...environments.map((item) => { const option = document.createElement('option'); option.value = item.environmentUrl; option.textContent = item.name || item.id || 'House environment'; return option; })); if (environments[0]) await loadEnvironmentFile(environments[0].environmentUrl, environments[0].name || 'catalog'); } catch (error) { environmentSelect.replaceChildren(new Option('Default IonCore house', '')); setStatus('Environment catalog unavailable; using the built-in controlled house map.'); } }
  async function loadEnvironmentFile(url, label = url) { if (!url) { applyEnvironment(defaultEnvironment, 'built-in default'); return; } const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error('environment unavailable'); applyEnvironment(await response.json(), label); }
  function setDropInLocation(position) { const p = clampPosition(position || { x: camera.x, y: 0, z: Math.max((activeEnvironment.bounds?.minZ || 0) + .7, camera.z + 1.8) }); avatarPlacementState.position = p; if (!avatarPlacementState.active) startAvatarPlacement(); updateAvatarPreviewPosition(p); setStatus('Person drop-in location set. Choose a model, then publish or drag to refine placement.'); }
  function sanitizeAvatarRecord(record) { if (!record || record.houseId !== HOUSE_ID) return null; const position = clampPosition(record.position || {}); const scaleValue = Math.max(.35, Math.min(2.4, Number(record.scale?.x) || 1)); const url = String(record.avatarUrl || ''); if (/^javascript:/i.test(url)) return null; return { id: safeText(record.id, (crypto.randomUUID && crypto.randomUUID()) || String(Date.now())), houseId: HOUSE_ID, ownerId: safeText(record.ownerId, sessionId), username: safeText(record.username, 'Guest'), avatarName: safeText(record.avatarName, 'Shared avatar'), avatarType: safeText(record.avatarType, 'image-sprite'), avatarUrl: url, thumbnailUrl: String(record.thumbnailUrl || ''), message: safeText(record.message, ''), position, rotation: { x: 0, y: 0, z: Number(record.rotation?.z) || 0 }, scale: { x: scaleValue, y: scaleValue, z: scaleValue }, roomId: safeText(record.roomId, calculateRoomId(position)), visibility: 'public', createdAt: record.createdAt || new Date().toISOString(), updatedAt: record.updatedAt || new Date().toISOString() }; }
  function validateAvatarPlacement() { const p = clampPosition(avatarPlacementState.position); avatarPlacementState.position = p; return Number.isFinite(p.x) && Number.isFinite(p.z); }
  function loadImage(url) { if (!url) return null; const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; return img; }
  function createAvatarSceneObject(record) { return { record, image: loadImage(record.avatarUrl), selected: false, kind: 'shared-avatar' }; }
  function renderSharedAvatar(record) { const safe = sanitizeAvatarRecord(record); if (!safe) return; if (sharedAvatarObjects.has(safe.id)) { updateSharedAvatar(safe); return; } sharedAvatarObjects.set(safe.id, createAvatarSceneObject(safe)); }
  function updateSharedAvatar(record) { const safe = sanitizeAvatarRecord(record); if (!safe) return; const existing = sharedAvatarObjects.get(safe.id); if (!existing) { renderSharedAvatar(safe); return; } existing.record = safe; if (existing.image?.src !== safe.avatarUrl) existing.image = loadImage(safe.avatarUrl); }
  function removeSharedAvatar(avatarId) { sharedAvatarObjects.delete(avatarId); closeAvatarInfoPanel(); }
  function focusCameraOnAvatar(avatarId) { const object = sharedAvatarObjects.get(avatarId); if (!object) return; camera.x = object.record.position.x; camera.z = Math.max(-.2, object.record.position.z - 2.2); camera.yaw = 0; camera.pitch = -.06; setStatus('Focused on ' + object.record.avatarName + '.'); }
  function drawAvatarObject(object, isPreview = false) { const record = object.record; const feet = project({ x: record.position.x, y: record.position.y || 0, z: record.position.z }); const head = project({ x: record.position.x, y: (record.position.y || 0) + 1.85 * record.scale.y, z: record.position.z }); if (!feet || !head) return null; const height = Math.max(26, Math.abs(feet.y - head.y)); const width = height * .58; ctx.save(); ctx.translate(feet.x, feet.y); ctx.rotate(record.rotation.z || 0); ctx.globalAlpha = isPreview ? .72 : 1; ctx.shadowBlur = object.selected || isPreview ? 22 : 10; ctx.shadowColor = isPreview ? '#9cff00' : 'rgba(156,255,0,.65)'; if (object.image?.complete && object.image.naturalWidth) ctx.drawImage(object.image, -width / 2, -height, width, height); else { ctx.fillStyle = isPreview ? 'rgba(156,255,0,.9)' : '#9cff00'; ctx.beginPath(); ctx.arc(0, -height * .78, width * .24, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-width * .28, -height * .62, width * .56, height * .58); } ctx.restore(); if (object.selected || isPreview) { ctx.strokeStyle = '#9cff00'; ctx.lineWidth = 2; ctx.strokeRect(feet.x - width / 2, feet.y - height, width, height); } return { x: feet.x, y: feet.y - height / 2, width, height, depth: feet.d }; }
  function roundRect(x, y, width, height, radius) { ctx.beginPath(); ctx.roundRect?.(x, y, width, height, radius); if (!ctx.roundRect) { ctx.rect(x, y, width, height); } }
  function drawLivePlayer(player) {
    const position = clampPosition(player.position || {});
    const feet = project(position);
    const head = project({ ...position, y: position.y + 1.7 });
    if (!feet || !head) return;
    const height = Math.max(30, Math.abs(feet.y - head.y));
    const width = height * .54;
    ctx.save();
    ctx.shadowBlur = 16; ctx.shadowColor = player.color || '#9cff00';
    if (player.image?.complete && player.image.naturalWidth) ctx.drawImage(player.image, feet.x - width / 2, feet.y - height, width, height);
    else { ctx.fillStyle = player.color || '#9cff00'; ctx.beginPath(); ctx.arc(feet.x, feet.y - height * .78, width * .25, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(feet.x - width * .27, feet.y - height * .58, width * .54, height * .58); }
    ctx.shadowBlur = 0;
    const username = safeText(player.username, 'Player');
    const coordinates = `X ${position.x.toFixed(1)} · Y ${position.y.toFixed(1)} · Z ${position.z.toFixed(1)}`;
    ctx.font = '700 11px system-ui';
    const labelWidth = Math.max(92, ctx.measureText(username).width + 20, ctx.measureText(coordinates).width + 20);
    const labelX = feet.x - labelWidth / 2, labelY = feet.y - height - 39;
    ctx.fillStyle = 'rgba(2,8,5,.9)'; roundRect(labelX, labelY, labelWidth, 34, 9); ctx.fill();
    ctx.strokeStyle = player.color || '#9cff00'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(username + (player.sessionId === sessionId ? ' (you)' : ''), feet.x, labelY + 14);
    ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = '#bffb77'; ctx.fillText(coordinates, feet.x, labelY + 27);
    if (player.message) {
      ctx.font = '12px system-ui';
      const message = safeText(player.message).slice(0, 54), bubbleWidth = Math.min(230, Math.max(70, ctx.measureText(message).width + 24));
      const bubbleX = feet.x - bubbleWidth / 2, bubbleY = labelY - 35;
      ctx.fillStyle = '#fff'; roundRect(bubbleX, bubbleY, bubbleWidth, 27, 13); ctx.fill();
      ctx.fillStyle = '#071006'; ctx.fillText(message, feet.x, bubbleY + 18);
      ctx.beginPath(); ctx.moveTo(feet.x - 6, bubbleY + 27); ctx.lineTo(feet.x, bubbleY + 34); ctx.lineTo(feet.x + 6, bubbleY + 27); ctx.fill();
    }
    ctx.restore();
  }
  function syncLivePlayers(data = {}) {
    const users = Array.isArray(data.users) ? data.users : [];
    const activeIds = new Set(users.map((user) => user.sessionId));
    livePlayerObjects.forEach((_, id) => { if (!activeIds.has(id)) livePlayerObjects.delete(id); });
    users.forEach((user) => { const existing = livePlayerObjects.get(user.sessionId); const avatarUrl = user.avatarUrl || 'logo_symbol_crop_2x_transparent.png'; livePlayerObjects.set(user.sessionId, { ...existing, ...user, position: clampPosition(user.position || existing?.position || {}), image: existing?.avatarUrl === avatarUrl ? existing.image : loadImage(avatarUrl), avatarUrl }); });
  }
  function screenToFloor(clientX, clientY) { const rect = canvas.getBoundingClientRect(); const sx = clientX - rect.left - rect.width / 2, screenY = rect.height / 2 - (clientY - rect.top); const cy = Math.cos(camera.yaw), syaw = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch); const camX = sx / camera.fov, camY = screenY / camera.fov, camZ = 1; const ry = camY * cp + camZ * sp, rzPitch = -camY * sp + camZ * cp; const rx = camX * cy + rzPitch * syaw, rz = -camX * syaw + rzPitch * cy; if (Math.abs(ry) < .0001) return null; const t = -camera.y / ry; if (t <= 0) return null; return clampPosition({ x: camera.x + rx * t, y: 0, z: camera.z + rz * t }); }
  function openAvatarPlacementPanel() { ensureAvatarPanel(); document.querySelector('#avatar-placement-panel').hidden = false; setStatus('Choose a 3D model/avatar, drag it onto the house floor, or tap a valid floor location.'); }
  function selectAvatarAsset(asset, announce = true) { avatarPlacementState.selectedAvatar = asset || avatarAssetChoices[0]; createAvatarPreview(); if (announce) setStatus((avatarPlacementState.selectedAvatar.name || 'Avatar') + ' selected. Drag it into the scene or tap the floor to place it.'); }
  function createAvatarPreview() { const selected = avatarPlacementState.selectedAvatar || avatarAssetChoices[0]; const record = sanitizeAvatarRecord({ id: 'preview-avatar', houseId: HOUSE_ID, ownerId: sessionId, username: 'You', avatarName: selected.name || 'Preview avatar', avatarType: selected.type || 'image-sprite', avatarUrl: selected.url || 'logo_symbol_crop_2x_transparent.png', position: avatarPlacementState.position, rotation: avatarPlacementState.rotation, scale: avatarPlacementState.scale }); avatarPlacementState.previewObject = createAvatarSceneObject(record); }
  function startAvatarPlacement() { avatarPlacementState.active = true; avatarPlacementState.selectedAvatar ||= avatarAssetChoices[0]; createAvatarPreview(); setStatus('Placement mode active: drag any 3D model chip into the scene or click the house floor to position it.'); }
  function updateAvatarPreviewPosition(position) { if (!avatarPlacementState.active) return; avatarPlacementState.position = clampPosition(position); if (avatarPlacementState.previewObject) { avatarPlacementState.previewObject.record.position = avatarPlacementState.position; avatarPlacementState.previewObject.record.roomId = calculateRoomId(avatarPlacementState.position); } }
  async function publishPlacedAvatar() { if (!validateAvatarPlacement()) { setStatus('Choose a floor location inside the house before publishing.'); return; } const payload = sanitizeAvatarRecord({ id: (crypto.randomUUID && crypto.randomUUID()) || 'avatar-' + Date.now(), houseId: HOUSE_ID, ownerId: sessionId, username: window.localStorage.getItem('muzikazBottleMemberEmail') || 'Guest', avatarName: avatarPlacementState.selectedAvatar?.name || 'Shared avatar', avatarType: avatarPlacementState.selectedAvatar?.type || 'image-sprite', avatarUrl: avatarPlacementState.selectedAvatar?.url || 'logo_symbol_crop_2x_transparent.png', message: document.querySelector('#avatar-caption')?.value || '', position: avatarPlacementState.position, rotation: avatarPlacementState.rotation, scale: avatarPlacementState.scale, roomId: calculateRoomId(avatarPlacementState.position) }); try { const response = await fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error('publish failed'); const result = await response.json(); renderSharedAvatar(result?.data ?? result); setStatus('Avatar published and activated in the shared 3D House Explorer on the main page. Viewers can watch it live now.'); cancelAvatarPlacement(false); } catch (error) { setStatus('Shared avatars are temporarily offline. The house remains available.'); } }
  async function loadSharedAvatars(houseId) { const response = await fetch(API_BASE + '/api/houses/' + houseId + '/avatars', { headers: { 'X-MUZIKAZ-Session': sessionId }, cache: 'no-store' }); if (!response.ok) throw new Error('load failed'); const result = await response.json(); return result?.data ?? result; }
  function subscribeToAvatarEvents(houseId) { try { const eventSource = new EventSource(API_BASE + '/api/houses/' + houseId + '/events?sessionId=' + encodeURIComponent(sessionId)); ['avatar-created', 'avatar-updated'].forEach((type) => eventSource.addEventListener(type, (event) => renderSharedAvatar(JSON.parse(event.data)))); eventSource.addEventListener('avatar-deleted', (event) => removeSharedAvatar(JSON.parse(event.data).id)); eventSource.addEventListener('house-presence-updated', (event) => { const data = JSON.parse(event.data); syncLivePlayers(data); if (presenceCount) presenceCount.textContent = 'Live in the house: ' + (data.count || 1); }); eventSource.addEventListener('house-chat-message', (event) => { const message = JSON.parse(event.data); const player = livePlayerObjects.get(message.sessionId); if (player) player.message = message.message; }); eventSource.onerror = () => setStatus('Shared avatars are temporarily offline.'); } catch (error) { setStatus('Shared avatars are temporarily offline.'); } }
  async function initializeSharedHouseAvatars() { try { showAvatarStatus('Loading shared avatars…'); (await loadSharedAvatars(HOUSE_ID)).map(sanitizeAvatarRecord).filter(Boolean).forEach(renderSharedAvatar); subscribeToAvatarEvents(HOUSE_ID); initializeHousePresence(); hideAvatarStatus(); } catch (error) { setStatus('Shared avatars are temporarily offline.'); } }
  function initializeHousePresence() { const send = () => { const now = Date.now(); if (now - lastPresenceAt < 800) return; lastPresenceAt = now; const memberEmail = window.localStorage.getItem('muzikazBottleMemberEmail') || ''; const designated = window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(window.localStorage.getItem('muzikazDesignatedAvatar') || 'null'); if (!memberEmail || !designated) return; const position = clampPosition({ x: camera.x, y: 0, z: camera.z }); const tracking = { position, roomId: calculateRoomId(position), avatarUrl: designated.modelUrl, modelUrl: designated.modelUrl, avatarName: designated.displayName || designated.name || 'Player avatar', rotation: { y: camera.yaw }, movementState: 'walk', animationState: designated.animation || 'auto', message: window.MUZIKAZ_HOUSE_TRACKING?.message || '' }; window.MUZIKAZ_HOUSE_TRACKING = tracking; fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/presence', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': memberEmail.toLowerCase(), 'X-User-Name': memberEmail.split('@')[0] }, body: JSON.stringify(tracking) }).then((response) => response.ok ? response.json() : null).then((result) => { const data = result?.data ?? result; if (data) syncLivePlayers(data); }).catch(() => {}); }; send(); window.addEventListener('muzikaz-avatar-ready', send); window.setInterval(send, 1000); window.addEventListener('muzikaz-house-chat', (event) => { const player = livePlayerObjects.get(event.detail?.sessionId); if (player) player.message = event.detail.message; }); window.addEventListener('beforeunload', () => navigator.sendBeacon?.(API_BASE + '/api/houses/' + HOUSE_ID + '/presence/leave?sessionId=' + encodeURIComponent(sessionId))); }
  async function saveSharedAvatarTransform(object) { if (!object?.record) return; object.record.roomId = calculateRoomId(object.record.position); object.record.updatedAt = new Date().toISOString(); try { const response = await fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/avatars/' + encodeURIComponent(object.record.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId }, body: JSON.stringify({ position: object.record.position, rotation: object.record.rotation, scale: object.record.scale }) }); if (response.ok) updateSharedAvatar(await response.json()); } catch (error) {} }
  function adjustSharedAvatarTransform(avatarId, action, amount) { const object = sharedAvatarObjects.get(avatarId); if (!object) return; if (action === 'scale') { const next = Math.max(.35, Math.min(2.4, object.record.scale.x + amount)); object.record.scale = { x: next, y: next, z: next }; } if (action === 'rotate') object.record.rotation.z += amount; if (action === 'height') object.record.position = clampPosition({ ...object.record.position, y: object.record.position.y + amount }); saveSharedAvatarTransform(object); }
  function selectSharedAvatar(avatarId) { sharedAvatarObjects.forEach((object) => { object.selected = object.record.id === avatarId; }); const object = sharedAvatarObjects.get(avatarId); if (object) openAvatarInfoPanel(object.record); }
  function cancelAvatarPlacement(hide = true) { avatarPlacementState.active = false; avatarPlacementState.previewObject = null; if (hide) document.querySelector('#avatar-placement-panel')?.setAttribute('hidden', ''); setStatus('Avatar placement closed. Normal explorer controls restored.'); }
  function ensureAvatarPanel() { if (document.querySelector('#avatar-placement-panel')) return; const panel = document.createElement('div'); panel.id = 'avatar-placement-panel'; panel.className = 'avatar-placement-panel'; panel.hidden = true; const options = avatarAssetChoices.map((asset, index) => '<option value="' + index + '">' + asset.name + '</option>').join(''); const chips = avatarAssetChoices.map((asset, index) => '<button type="button" class="avatar-model-chip" draggable="true" data-avatar-choice="' + index + '"><span>' + asset.name + '</span><small>' + (asset.type || 'Model asset') + '</small></button>').join(''); panel.innerHTML = '<strong>Place shared avatar</strong><span>Select any MUZIKAZ 3D model pack, then drag and drop it directly onto the house floor.</span><label>3D model/avatar asset <select id="avatar-choice">' + options + '</select></label><div class="avatar-model-tray" aria-label="Draggable 3D model choices">' + chips + '</div><label>Upload image <input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"></label><label>Caption <input id="avatar-caption" maxlength="120" placeholder="Optional caption"></label><div class="avatar-placement-buttons"><button type="button" data-avatar-nudge="forward">Move Avatar</button><button type="button" data-avatar-rotate="-1">Rotate Left</button><button type="button" data-avatar-rotate="1">Rotate Right</button><button type="button" data-avatar-scale="1">Increase Size</button><button type="button" data-avatar-scale="-1">Decrease Size</button><button type="button" id="publish-avatar">Publish Live to Main Page</button><button type="button" id="cancel-avatar">Cancel Placement</button></div>'; canvas.closest('.house-stage')?.append(panel); panel.querySelector('#avatar-choice').addEventListener('change', (event) => selectAvatarAsset(avatarAssetChoices[Number(event.target.value)])); panel.querySelectorAll('[data-avatar-choice]').forEach((chip) => { chip.addEventListener('click', () => { panel.querySelector('#avatar-choice').value = chip.dataset.avatarChoice; selectAvatarAsset(avatarAssetChoices[Number(chip.dataset.avatarChoice)]); }); chip.addEventListener('dragstart', (event) => { selectAvatarAsset(avatarAssetChoices[Number(chip.dataset.avatarChoice)], false); event.dataTransfer?.setData('text/plain', chip.dataset.avatarChoice); event.dataTransfer.effectAllowed = 'copy'; setStatus('Drop ' + avatarPlacementState.selectedAvatar.name + ' onto the scene floor.'); }); }); panel.querySelector('#avatar-upload').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 3000000) { setStatus('Upload rejected. Use PNG, JPG, or WebP up to 3 MB.'); return; } const form = new FormData(); form.append('avatar', file); try { const response = await fetch(API_BASE + '/api/uploads/avatar', { method: 'POST', headers: { 'X-MUZIKAZ-Session': sessionId }, body: form }); if (!response.ok) throw new Error('upload failed'); const result = await response.json(); const data = result?.data ?? result; avatarPlacementState.selectedAvatar = { name: file.name.replace(/\.[^.]+$/, ''), url: data.avatarUrl }; createAvatarPreview(); } catch { const reader = new FileReader(); reader.onload = () => { avatarPlacementState.selectedAvatar = { name: file.name.replace(/\.[^.]+$/, ''), url: reader.result }; createAvatarPreview(); setStatus('Upload service offline; preview is local and cannot be published until backend returns.'); }; reader.readAsDataURL(file); } }); panel.addEventListener('click', (event) => { const target = event.target; if (!(target instanceof HTMLElement)) return; if (target.dataset.avatarRotate) { avatarPlacementState.rotation.z += Number(target.dataset.avatarRotate) * .18; createAvatarPreview(); } if (target.dataset.avatarScale) { const next = Math.max(.35, Math.min(2.4, avatarPlacementState.scale.x + Number(target.dataset.avatarScale) * .12)); avatarPlacementState.scale = { x: next, y: next, z: next }; createAvatarPreview(); } if (target.id === 'publish-avatar') publishPlacedAvatar(); if (target.id === 'cancel-avatar') cancelAvatarPlacement(); if (target.dataset.avatarNudge) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z + .25 }); }); }
  function openAvatarInfoPanel(record) { let panel = document.querySelector('#avatar-info-panel'); if (!panel) { panel = document.createElement('div'); panel.id = 'avatar-info-panel'; panel.className = 'avatar-info-panel'; canvas.closest('.house-stage')?.append(panel); } const own = record.ownerId === sessionId; panel.innerHTML = '<strong>' + record.avatarName + '</strong><span>Double-click menu: size, rotate, raise, or lower. Click and hold the avatar itself to drag and drop it.</span><span>Posted by ' + record.username + '</span><span>' + (record.message || 'No caption') + '</span><span>' + new Date(record.createdAt).toLocaleString() + '</span><div class="avatar-transform-grid"><button type="button" data-transform="scale" data-amount="0.12">Bigger</button><button type="button" data-transform="scale" data-amount="-0.12">Smaller</button><button type="button" data-transform="rotate" data-amount="-0.18">Rotate Left</button><button type="button" data-transform="rotate" data-amount="0.18">Rotate Right</button><button type="button" data-transform="height" data-amount="0.15">Raise</button><button type="button" data-transform="height" data-amount="-0.15">Lower</button></div><button type="button" data-focus="' + record.id + '">Focus camera</button>' + (own ? '<button type="button" data-remove="' + record.id + '">Remove avatar</button>' : '') + '<button type="button" data-close-avatar-menu>Close menu</button>'; panel.hidden = false; panel.onclick = async (event) => { const target = event.target; if (!(target instanceof HTMLElement)) return; if (target.dataset.transform) adjustSharedAvatarTransform(record.id, target.dataset.transform, Number(target.dataset.amount) || 0); if (target.dataset.focus) focusCameraOnAvatar(target.dataset.focus); if (target.hasAttribute('data-close-avatar-menu')) closeAvatarInfoPanel(); if (target.dataset.remove) { await fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/avatars/' + target.dataset.remove, { method: 'DELETE', headers: { 'X-MUZIKAZ-Session': sessionId } }).catch(() => {}); removeSharedAvatar(target.dataset.remove); } }; }
  function closeAvatarInfoPanel() { const panel = document.querySelector('#avatar-info-panel'); if (panel) panel.hidden = true; }
  Object.assign(window, { initializeSharedHouseAvatars, openAvatarPlacementPanel, startAvatarPlacement, createAvatarPreview, updateAvatarPreviewPosition, validateAvatarPlacement, publishPlacedAvatar, loadSharedAvatars, subscribeToAvatarEvents, renderSharedAvatar, updateSharedAvatar, removeSharedAvatar, selectSharedAvatar, focusCameraOnAvatar, cancelAvatarPlacement, initializeHousePresence, sanitizeAvatarRecord, spawnToxicBubbles, damageToxicBubble });
  function loadScriptOnce(src) { return new Promise((resolve, reject) => { const existing = document.querySelector('script[src="' + src + '"]'); if (existing) { resolve(); return; } const script = document.createElement('script'); script.src = src; script.async = true; script.onload = resolve; script.onerror = reject; document.head.append(script); }); }
  async function startMediaPipeHands() { await Promise.all([loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'), loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')]); if (!window.Hands || !window.Camera || !preview) return false; const hands = new window.Hands({ locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file }); hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .65, minTrackingConfidence: .55 }); hands.onResults((results) => { const tip = results.multiHandLandmarks?.[0]?.[8]; if (!tip) return; camera.yaw += (tip.x - .5) * .035; camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (tip.y - .5) * .025)); if (tip.y < .34) move('forward', .08); if (tip.y > .72) move('back', .08); }); handController = new window.Camera(preview, { onFrame: async () => hands.send({ image: preview }), width: 320, height: 180 }); handController.start(); return true; }
  function resizeCanvas() { const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(320, Math.floor(rect.width * ratio)); canvas.height = Math.max(240, Math.floor(rect.height * ratio)); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  function project(point) { const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z; const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch); const x = dx * cy - dz * sy, z = dx * sy + dz * cy, y = dy * cp - z * sp, depth = dy * sp + z * cp; if (depth <= 0.12) return null; const rect = canvas.getBoundingClientRect(); const fitFov = camera.fov * mapFit; return { x: rect.width / 2 + (x * fitFov) / depth, y: rect.height / 2 - (y * fitFov) / depth, d: depth }; }
  function drawPolygon(points, fill, stroke = 'rgba(156,255,0,.22)') { const projected = points.map(project); if (projected.some((p) => !p)) return; ctx.beginPath(); projected.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); }
  function drawLine(a, b, color, width = 2) { const pa = project(a), pb = project(b); if (!pa || !pb) return; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }
  function ensureToxicBubbleAudio() { if (toxicBubbleAudio) return toxicBubbleAudio; const AudioContextCtor = window.AudioContext || window.webkitAudioContext; if (!AudioContextCtor) return null; toxicBubbleAudio = new AudioContextCtor(); return toxicBubbleAudio; }
  function playToxicBubbleSound(pop = false) { const audio = ensureToxicBubbleAudio(); if (!audio) return; if (audio.state === 'suspended') audio.resume?.(); const now = audio.currentTime; const osc = audio.createOscillator(), gain = audio.createGain(), filter = audio.createBiquadFilter(); osc.type = pop ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(pop ? 150 : randomInRange(58, 92), now); osc.frequency.exponentialRampToValueAtTime(pop ? 38 : randomInRange(22, 44), now + (pop ? .18 : .34)); filter.type = 'lowpass'; filter.frequency.value = pop ? 520 : 310; gain.gain.setValueAtTime(pop ? .06 : .025, now); gain.gain.exponentialRampToValueAtTime(.0001, now + (pop ? .22 : .42)); osc.connect(filter).connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + (pop ? .24 : .46)); }
  function updateToxicBubbles() { if (!gameStarted) return; const b = activeEnvironment.bounds || defaultEnvironment.bounds; toxicBubbles.forEach((bubble) => { bubble.phase += .024; bubble.x += bubble.vx; bubble.z += bubble.vz; bubble.y += Math.sin(bubble.phase) * .0025; if (bubble.x < b.minX + .6 || bubble.x > b.maxX - .6) bubble.vx *= -1; if (bubble.z < b.minZ + .6 || bubble.z > b.maxZ - .6) bubble.vz *= -1; bubble.x = Math.max(b.minX + .6, Math.min(b.maxX - .6, bubble.x)); bubble.z = Math.max(b.minZ + .6, Math.min(b.maxZ - .6, bubble.z)); bubble.y = Math.max(.55, Math.min(2.1, bubble.y)); }); if (Date.now() - lastBubbleSoundAt > 2600 && toxicBubbles.some((bubble) => bubble.health > 0)) { lastBubbleSoundAt = Date.now(); playToxicBubbleSound(false); } }
  function drawToxicBubble(bubble) { if (bubble.health <= 0) return null; const p = project({ x: bubble.x, y: bubble.y, z: bubble.z }); if (!p) return null; const size = Math.max(18, (bubble.radius * 520) / p.d); ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = .86; ctx.shadowBlur = 24; ctx.shadowColor = 'rgba(88,255,0,.75)'; const ooze = ctx.createRadialGradient(-size * .28, -size * .32, size * .08, 0, 0, size); ooze.addColorStop(0, 'rgba(225,255,116,.95)'); ooze.addColorStop(.42, 'rgba(86,255,0,.72)'); ooze.addColorStop(1, 'rgba(21,82,18,.42)'); ctx.fillStyle = ooze; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.beginPath(); ctx.arc(-size * .32, -size * .34, size * .18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(45,8,55,.48)'; for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(Math.sin(bubble.phase + i) * size * .45, Math.cos(bubble.phase * .7 + i) * size * .36, size * .08, 0, Math.PI * 2); ctx.fill(); } const barWidth = size * 1.7, barHeight = Math.max(4, size * .12); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(-barWidth / 2, -size - 13, barWidth, barHeight); ctx.fillStyle = bubble.health > 55 ? '#9cff00' : bubble.health > 25 ? '#ffda3a' : '#ff2e2e'; ctx.fillRect(-barWidth / 2, -size - 13, barWidth * (bubble.health / 100), barHeight); ctx.strokeStyle = 'rgba(255,255,255,.64)'; ctx.strokeRect(-barWidth / 2, -size - 13, barWidth, barHeight); ctx.restore(); return { id: bubble.id, x: p.x, y: p.y, width: size * 2, height: size * 2, depth: p.d, kind: 'toxic-bubble' }; }
  function startHouseGame() {
    if (gameStarted) return;
    gameStartScreen?.classList.add('is-loading');
    if (gameLoadStatus) gameLoadStatus.textContent = 'Loading toxic bubbles into the IonCore interior…';
    if (startGameButton) { const label = startGameButton.querySelector('span'); if (label) label.textContent = 'Loading'; else startGameButton.textContent = 'Loading toxins…'; }
    window.setTimeout(() => {
      spawnToxicBubbles();
      gameStarted = true;
      document.querySelector('.house-explorer')?.classList.add('is-game-active');
      if (gameLoadStatus) gameLoadStatus.textContent = `${toxicBubbles.length} toxic bubbles loaded. Clear the floor!`;
      setStatus(`${toxicBubbles.length} toxic bubbles loaded. Click them to damage and clear the house.`);
      gameStartScreen?.classList.add('is-hidden');
      if (startGameButton) { const label = startGameButton.querySelector('span'); if (label) label.textContent = 'Playing'; else startGameButton.textContent = 'Playing'; startGameButton.disabled = true; startGameButton.setAttribute('aria-label', 'RAD-TOX has started'); }
      canvas.focus?.();
    }, 500);
  }
  function damageToxicBubble(id) { const bubble = toxicBubbles.find((item) => item.id === id); if (!bubble || bubble.health <= 0) return; bubble.health = Math.max(0, bubble.health - 25); writeToxicBubbleMemory(); playToxicBubbleSound(true); setStatus(bubble.health ? 'Toxic bubble hit! Health memory saved at ' + bubble.health + ' HP.' : 'Toxic bubble popped! Health memory saved for this map.'); }
  function render() { updateToxicBubbles(); const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); const gradient = ctx.createLinearGradient(0, 0, 0, rect.height); gradient.addColorStop(0, '#06110c'); gradient.addColorStop(1, '#010201'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, rect.width, rect.height); { const b = activeEnvironment.bounds; drawPolygon([{x:b.minX,y:0,z:b.minZ},{x:b.maxX,y:0,z:b.minZ},{x:b.maxX,y:0,z:b.maxZ},{x:b.minX,y:0,z:b.maxZ}], activeEnvironment.floorColor); drawPolygon([{x:b.minX,y:3,z:b.minZ},{x:b.minX,y:3,z:b.maxZ},{x:b.maxX,y:3,z:b.maxZ},{x:b.maxX,y:3,z:b.minZ}], activeEnvironment.ceilingColor); for (let i = Math.ceil(b.minX); i <= b.maxX; i += 1) drawLine({x:i,y:.01,z:b.minZ},{x:i,y:.01,z:b.maxZ}, activeEnvironment.gridColor, 1); for (let z = Math.ceil(b.minZ); z <= b.maxZ; z += 1) drawLine({x:b.minX,y:.01,z},{x:b.maxX,y:.01,z}, activeEnvironment.gridColor, 1); walls.forEach(([a, c]) => drawPolygon([{x:a[0],y:0,z:a[1]},{x:c[0],y:0,z:c[1]},{x:c[0],y:2.7,z:c[1]},{x:a[0],y:2.7,z:a[1]}], activeEnvironment.wallColor, activeEnvironment.accentColor)); } const hitboxes = []; demoAvatars.forEach((avatar) => { const p = project({ x: avatar.x, y: .95, z: avatar.z }); if (!p) return; const size = Math.max(10, 240 / p.d); ctx.fillStyle = 'hsl(' + avatar.hue + ' 100% 58%)'; ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(p.x, p.y - size * .6, size * .28, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(p.x - size * .22, p.y - size * .35, size * .44, size * .85); ctx.shadowBlur = 0; }); if (gameStarted) toxicBubbles.sort((a,b)=> (project({x:b.x,y:b.y,z:b.z})?.d || 0) - (project({x:a.x,y:a.y,z:a.z})?.d || 0)).forEach((bubble) => { const box = drawToxicBubble(bubble); if (box) hitboxes.push(box); }); [...sharedAvatarObjects.values()].sort((a,b)=> (project(b.record.position)?.d || 0) - (project(a.record.position)?.d || 0)).forEach((object) => { const box = drawAvatarObject(object); if (box) hitboxes.push({ ...box, id: object.record.id }); }); [...livePlayerObjects.values()].sort((a,b)=> (project(b.position)?.d || 0) - (project(a.position)?.d || 0)).forEach(drawLivePlayer); if (avatarPlacementState.active && avatarPlacementState.previewObject) drawAvatarObject(avatarPlacementState.previewObject, true); canvas._avatarHitboxes = hitboxes; requestAnimationFrame(render); }
  function move(direction, amount) { const forwardX = Math.sin(camera.yaw), forwardZ = Math.cos(camera.yaw), rightX = Math.cos(camera.yaw), rightZ = -Math.sin(camera.yaw); if (direction === 'forward') { camera.x += forwardX * amount; camera.z += forwardZ * amount; } if (direction === 'back') { camera.x -= forwardX * amount; camera.z -= forwardZ * amount; } if (direction === 'right') { camera.x += rightX * amount; camera.z += rightZ * amount; } if (direction === 'left') { camera.x -= rightX * amount; camera.z -= rightZ * amount; } const b = activeEnvironment.bounds || defaultEnvironment.bounds; camera.x = Math.max(b.minX + .5, Math.min(b.maxX - .5, camera.x)); camera.z = Math.max(b.minZ - .4, Math.min(b.maxZ - .5, camera.z)); }
  function tickMovement() { const speed = .065; if (avatarPlacementState.active) { if (keys.has('w') || keys.has('arrowup')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z + speed }); if (keys.has('s') || keys.has('arrowdown')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z - speed }); if (keys.has('a') || keys.has('arrowleft')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, x: avatarPlacementState.position.x - speed }); if (keys.has('d') || keys.has('arrowright')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, x: avatarPlacementState.position.x + speed }); if (keys.has('q')) avatarPlacementState.rotation.z -= .025; if (keys.has('e')) avatarPlacementState.rotation.z += .025; } else { if (keys.has('w') || keys.has('arrowup')) move('forward', speed); if (keys.has('s') || keys.has('arrowdown')) move('back', speed); if (keys.has('a') || keys.has('arrowleft')) move('left', speed); if (keys.has('d') || keys.has('arrowright')) move('right', speed); if (keys.has('q')) camera.y = Math.max(.8, camera.y - .025); if (keys.has('e')) camera.y = Math.min(2.4, camera.y + .025); } requestAnimationFrame(tickMovement); }
  canvas.addEventListener('dragover', (event) => { if (!avatarPlacementState.active) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; const floor = screenToFloor(event.clientX, event.clientY); if (floor) updateAvatarPreviewPosition(floor); });
  canvas.addEventListener('drop', (event) => { if (!avatarPlacementState.active) return; event.preventDefault(); const choiceIndex = Number(event.dataTransfer?.getData('text/plain')); if (Number.isInteger(choiceIndex) && avatarAssetChoices[choiceIndex]) selectAvatarAsset(avatarAssetChoices[choiceIndex], false); const floor = screenToFloor(event.clientX, event.clientY); if (floor) { updateAvatarPreviewPosition(floor); setStatus((avatarPlacementState.selectedAvatar?.name || 'Avatar') + ' dropped into the scene. Adjust it, then publish live.'); } });
  canvas.addEventListener('pointerdown', (event) => { const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const hit = [...(canvas._avatarHitboxes || [])].reverse().find((box) => x >= box.x - box.width / 2 && x <= box.x + box.width / 2 && y >= box.y - box.height / 2 && y <= box.y + box.height / 2); if (hit?.kind === 'toxic-bubble' && !avatarPlacementState.active) { damageToxicBubble(hit.id); return; } if (hit && !avatarPlacementState.active) { sharedAvatarObjects.forEach((object) => { object.selected = object.record.id === hit.id; }); draggedAvatar = sharedAvatarObjects.get(hit.id) || null; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); setStatus('Hold and drag ' + (draggedAvatar?.record.avatarName || 'avatar') + ' to a new floor spot. Double-click it to toggle sizing and rotation controls.'); return; } if (avatarPlacementState.active) { const floor = screenToFloor(event.clientX, event.clientY); if (floor) updateAvatarPreviewPosition(floor); return; } dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => { if (draggedAvatar && !avatarPlacementState.active) { const floor = screenToFloor(event.clientX, event.clientY); if (floor) draggedAvatar.record.position = clampPosition({ ...floor, y: draggedAvatar.record.position.y || 0 }); return; } if (!dragging || !lastPointer || avatarPlacementState.active) return; camera.yaw += (event.clientX - lastPointer.x) * .005; camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (event.clientY - lastPointer.y) * .004)); lastPointer = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', () => { if (draggedAvatar) { saveSharedAvatarTransform(draggedAvatar); draggedAvatar = null; } dragging = false; lastPointer = null; });
  canvas.addEventListener('dblclick', (event) => { const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const hit = [...(canvas._avatarHitboxes || [])].reverse().find((box) => x >= box.x - box.width / 2 && x <= box.x + box.width / 2 && y >= box.y - box.height / 2 && y <= box.y + box.height / 2); if (hit && hit.kind !== 'toxic-bubble') selectSharedAvatar(hit.id); }); canvas.addEventListener('wheel', (event) => { event.preventDefault(); camera.fov = Math.max(320, Math.min(760, camera.fov - event.deltaY * .25)); }, { passive: false });
  document.addEventListener('keydown', (event) => { if (avatarPlacementState.active && ['+','='].includes(event.key)) { const n = Math.min(2.4, avatarPlacementState.scale.x + .1); avatarPlacementState.scale = { x:n, y:n, z:n }; createAvatarPreview(); } if (avatarPlacementState.active && ['-','_'].includes(event.key)) { const n = Math.max(.35, avatarPlacementState.scale.x - .1); avatarPlacementState.scale = { x:n, y:n, z:n }; createAvatarPreview(); } if (avatarPlacementState.active && event.key === 'Enter') publishPlacedAvatar(); if (avatarPlacementState.active && event.key === 'Escape') cancelAvatarPlacement(); keys.add(event.key.toLowerCase()); }); document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  const mobileControlState = new Set();
  let mobileJumping = false;
  function jumpCamera() {
    if (mobileJumping) return;
    mobileJumping = true;
    const baseY = camera.y;
    camera.y = Math.min(2.4, camera.y + .36);
    window.setTimeout(() => { camera.y = Math.max(.8, baseY); mobileJumping = false; }, 190);
  }
  function applyMobileControl(action, amount = 1) {
    const moveAmount = .055 * amount;
    if (action === 'forward') move('forward', moveAmount);
    if (action === 'back') move('back', moveAmount);
    if (action === 'strafe-left') move('left', moveAmount);
    if (action === 'strafe-right') move('right', moveAmount);
    if (action === 'turn-left') camera.yaw -= .035 * amount;
    if (action === 'turn-right') camera.yaw += .035 * amount;
    if (action === 'look-up') camera.pitch = Math.max(-.8, camera.pitch - .018 * amount);
    if (action === 'look-down') camera.pitch = Math.min(.55, camera.pitch + .018 * amount);
  }
  function tickMobileControls() {
    mobileControlState.forEach((action) => applyMobileControl(action));
    requestAnimationFrame(tickMobileControls);
  }
  function triggerMobileZoom(direction) {
    camera.fov = Math.max(320, Math.min(760, camera.fov + (direction === 'in' ? -55 : 55)));
  }
  document.querySelectorAll('[data-mobile-hold]').forEach((button) => {
    const action = button.dataset.mobileHold;
    const start = (event) => { event.preventDefault(); mobileControlState.add(action); button.classList.add('is-active'); applyMobileControl(action, 1.6); };
    const stop = () => { mobileControlState.delete(action); button.classList.remove('is-active'); };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', stop);
  });
  document.querySelectorAll('[data-mobile-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.mobileAction === 'jump') jumpCamera();
    if (button.dataset.mobileAction === 'reset') { Object.assign(camera, defaultCamera); setStatus('Explorer reset to the default inside-camera view.'); } if (button.dataset.mobileAction === 'avatar') { openAvatarPlacementPanel(); startAvatarPlacement(); } if (button.dataset.mobileAction === 'environment') { environmentSelect?.focus(); environmentSelect?.closest('.house-environment-picker')?.classList.toggle('is-open'); setStatus('Environment selector ready. Choose an environment file from the list.'); }
  }));
  document.querySelectorAll('[data-mobile-zoom]').forEach((button) => button.addEventListener('click', () => triggerMobileZoom(button.dataset.mobileZoom))); document.querySelectorAll('[data-mobile-zoom-toggle]').forEach((button) => { let zoomHold = 0; const setDirection = (direction) => { button.dataset.mobileZoomToggle = direction; button.setAttribute('aria-pressed', String(direction === 'in')); button.querySelector('b').textContent = direction === 'in' ? '+' : '−'; button.querySelector('span').textContent = direction === 'in' ? 'Zoom in' : 'Zoom out'; button.setAttribute('aria-label', direction === 'in' ? 'Zoom in' : 'Zoom out'); }; const step = () => triggerMobileZoom(button.dataset.mobileZoomToggle || 'out'); const stop = () => { clearInterval(zoomHold); zoomHold = 0; button.classList.remove('is-active'); }; button.addEventListener('pointerdown', (event) => { event.preventDefault(); step(); button.classList.add('is-active'); zoomHold = window.setInterval(step, 120); }); button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('pointerleave', stop); button.addEventListener('dblclick', (event) => { event.preventDefault(); setDirection(button.dataset.mobileZoomToggle === 'in' ? 'out' : 'in'); setStatus(button.getAttribute('aria-label') + ' selected. Hold to continue zooming.'); }); setDirection(button.dataset.mobileZoomToggle || 'out'); }); tickMobileControls();  placePersonButton?.addEventListener('click', () => setDropInLocation());  resetButton?.addEventListener('click', () => { Object.assign(camera, defaultCamera); setStatus('Explorer reset to the default inside-camera view.'); }); avatarButton?.addEventListener('click', () => { openAvatarPlacementPanel(); startAvatarPlacement(); });
  function toggleWorldMenu(force) {
    if (!worldMenu || !worldButton) return;
    const open = force ?? worldMenu.hidden;
    worldMenu.hidden = !open;
    worldButton.setAttribute('aria-expanded', String(open));
    if (open) { environmentSelect?.focus(); setStatus('World list opened. Choose a world to load it into the game view.'); }
  }
  worldButton?.addEventListener('click', () => toggleWorldMenu());
  environmentSelect?.addEventListener('change', () => { toggleWorldMenu(false); loadEnvironmentFile(environmentSelect.value, environmentSelect.selectedOptions[0]?.textContent || 'selected world').catch(() => setStatus('Selected world could not be loaded.')); });
  fullscreenButton?.addEventListener('click', async () => {
    const stage = canvas.closest('.house-stage');
    try { if (document.fullscreenElement) await document.exitFullscreen?.(); else await stage?.requestFullscreen?.(); }
    catch { setStatus('Fullscreen is unavailable in this browser. The game remains ready to play.'); }
  });
  startGameButton?.addEventListener('click', startHouseGame);
  handButton?.addEventListener('click', async () => { handEnabled = !handEnabled; handButton.setAttribute('aria-pressed', String(handEnabled)); handButton.textContent = handEnabled ? 'Disable hand control' : 'Enable hand control'; if (!handEnabled) { handController?.stop?.(); handStream?.getTracks().forEach((track) => track.stop()); handStream = null; if (handStatus) handStatus.textContent = 'Camera preview inactive. MediaPipe Hands loads only when enabled.'; return; } try { handStream = await navigator.mediaDevices.getUserMedia({ video: true }); if (preview) { preview.srcObject = handStream; await preview.play(); } const mediaPipeReady = await startMediaPipeHands(); if (handStatus) handStatus.textContent = mediaPipeReady ? 'MediaPipe Hands active: move your index finger to steer the camera.' : 'Camera preview enabled; MediaPipe Hands could not be loaded, so manual controls remain active.'; } catch (error) { handEnabled = false; handButton.setAttribute('aria-pressed', 'false'); if (handStatus) handStatus.textContent = 'Camera or MediaPipe unavailable; keyboard, mouse, and mobile controls still work.'; } });
  window.addEventListener('resize', resizeCanvas); resizeCanvas(); render(); tickMovement(); loadEnvironmentCatalog(); window.setTimeout(initializeSharedHouseAvatars, 0);
}

initHouseExplorer();

function initAdminLogin() {
  const form = document.querySelector('#admin-login-form');
  const card = document.querySelector('#admin-login');
  const dashboard = document.querySelector('[data-asset-dashboard]');
  const status = document.querySelector('#admin-login-status');
  if (!form || !card || !dashboard) return;
  const tokenKey = 'muzikazAdminToken';
  const conceal = (message = 'Administrator authentication is required.') => {
    sessionStorage.removeItem(tokenKey);
    dashboard.hidden = true;
    card.hidden = false;
    status.textContent = message;
  };
  const reveal = () => {
    card.hidden = true;
    dashboard.hidden = false;
    document.dispatchEvent(new Event('muzikaz:admin-authenticated'));
  };
  const validateStoredSession = async () => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token) return conceal();
    status.textContent = 'Checking administrator session…';
    try {
      const response = await fetch('/api/admin/analytics', { headers: { 'x-admin-token': token, Accept: 'application/json' } });
      if (!response.ok) throw new Error('Your administrator session has expired.');
      reveal();
    } catch (error) {
      conceal(error.message || 'Administrator authentication is required.');
    }
  };
  validateStoredSession();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); status.textContent = 'Authenticating administrator…';
    const credentials = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(credentials) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.token) throw new Error(result.message || 'Authentication failed');
      sessionStorage.setItem(tokenKey, result.data.token); form.reset(); reveal();
    } catch (error) { status.textContent = error.message || 'Authentication failed.'; }
  });
  document.querySelector('#admin-logout')?.addEventListener('click', () => conceal('Signed out. Administrator authentication is required.'));
}
initAdminLogin();

function initAssetDashboard(){
  const dashboard=document.querySelector('[data-asset-dashboard]'); if(!dashboard || dashboard.hidden || dashboard.dataset.initialized==='true') return;
  dashboard.dataset.initialized='true';
  const userId=localStorage.getItem('muzikazUserId')||'demo-user'; localStorage.setItem('muzikazUserId',userId);
  const auth={'x-user-id':userId,'x-user-name':'jodel','x-admin-token':sessionStorage.getItem('muzikazAdminToken')||'','Accept':'application/json'};
  const tabs=['My Uploads','Public Assets','Pending Approval','Approved','Rejected','Drafts','3D Models','Images','Thumbnails','Store Tiles','Product Previews','Archived'];
  const localKey='muzikaz.assetLibraryFallback';
  let current='My Uploads', lastGraphic=null, cachedAssets=[];
  const status=document.getElementById('asset-status'), grid=document.getElementById('asset-card-grid'), tabBox=document.getElementById('asset-tabs');
  function renderTabs(){tabBox.replaceChildren(...tabs.map(t=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.className=t===current?'active':'';b.setAttribute('aria-pressed',String(t===current));b.onclick=()=>{current=t;renderTabs();loadAssets();};return b;}));}
  renderTabs();
  function localAssets(){try{return JSON.parse(localStorage.getItem(localKey)||'[]');}catch{return [];}}
  function saveLocalAssets(list){localStorage.setItem(localKey,JSON.stringify(list));}
  async function fileToAsset(file, fields, isModel){
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file);});
    const now=new Date().toISOString(), id=(crypto.randomUUID&&crypto.randomUUID())||'asset-'+Date.now()+'-'+Math.random().toString(16).slice(2);
    return {id,title:fields.title||file.name.replace(/\.[^.]+$/,''),description:fields.description||'',creator:fields.creator||auth['x-user-name'],ownerId:userId,ownerDisplayName:auth['x-user-name'],originalFilename:file.name,storedFilename:file.name,publicUrl:dataUrl,thumbnailUrl:isModel?'':dataUrl,fileType:isModel?'model':'image',fileSize:file.size,mimeType:file.type,category:fields.category||'',tags:fields.tags||'',status:fields.status||'draft',visibility:fields.visibility||'private',intendedUse:fields.intendedUse||(isModel?'3D model':'3D model texture'),relatedModelId:fields.relatedModelId||'',productAssignment:fields.productAssignment||'',collectionAssignment:fields.collectionAssignment||'',publishLocation:fields.publishLocation||'',createdAt:now,updatedAt:now,approvedAt:'',publishedAt:'',moderatorNote:'Local browser draft'};
  }
  async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{...auth,...(opts.headers||{})}});let j={};try{j=await r.json();}catch{throw new Error('Asset service returned an invalid response. Using browser fallback until the MUZIKAZ server is available.');}if(!r.ok||j.success===false)throw new Error(j.message||j.error||'Request failed');return j.data ?? j;}
  function fileMeta(f){return `${f.name} · ${(f.size/1024).toFixed(1)} KB · ${f.type||f.name.split('.').pop()}`;}
  document.getElementById('asset-upload')?.addEventListener('change',e=>{const box=document.getElementById('graphic-preview');box.replaceChildren(...[...e.target.files].map(f=>{const d=document.createElement('div');d.className='asset-mini-preview';d.textContent=fileMeta(f); if(f.type.startsWith('image/')){const img=new Image();img.src=URL.createObjectURL(f);img.alt=f.name;d.prepend(img)} return d;}));});
  async function submitUpload(form,isModel,e){e.preventDefault(); const submit=e.submitter; const progress=document.getElementById(isModel?'model-upload-progress':'graphic-upload-progress'); progress&&(progress.value=15); const fd=new FormData(), fields={}; [...form.querySelectorAll('input,textarea,select')].forEach(el=>{ if(el.type==='file'){[...(el.files||[])].forEach(f=>fd.append('file',f));} else if(el.type==='checkbox'){fd.append(el.name,el.checked?'true':'false');fields[el.name]=el.checked?'true':'false';} else if(el.name){fd.append(el.name,el.value);fields[el.name]=el.value;} }); fd.set('status',submit?.value||'draft'); fields.status=submit?.value||'draft'; status.textContent=isModel?'Processing model':'Uploading files…'; try{lastGraphic=await api(isModel?'/api/models/upload':'/api/assets/upload',{method:'POST',body:fd,headers:{}}); progress&&(progress.value=100); status.textContent= isModel?'Processing model complete. Submitted for approval.':'Upload complete. Thumbnail generated.'; await loadAssets();}catch(err){const files=[...form.querySelectorAll('input[type=file]')].flatMap(el=>[...(el.files||[])]); if(files.length){const local=await Promise.all(files.map(f=>fileToAsset(f,fields,isModel))); const list=[...local,...localAssets()]; saveLocalAssets(list); lastGraphic=local[0]; progress&&(progress.value=100); status.textContent='Server unavailable, so the upload was saved as a browser draft and all dashboard actions remain usable.'; await loadAssets();}else{progress&&(progress.value=0);status.textContent=err.message||'Upload failed';}}}
  document.getElementById('graphic-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,false,e));
  document.getElementById('model-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,true,e));
  document.getElementById('preview-model-upload')?.addEventListener('click',()=>{const f=document.querySelector('#model-upload-form input[type=file]')?.files[0], mv=document.getElementById('model-upload-preview'); if(f&&mv){mv.src=URL.createObjectURL(f);mv.hidden=false;status.textContent='Preview ready';}});
  document.getElementById('cancel-graphic-upload')?.addEventListener('click',()=>status.textContent='Upload canceled.');
  document.getElementById('retry-graphic-upload')?.addEventListener('click',()=>document.getElementById('graphic-upload-form')?.requestSubmit());
  document.getElementById('regenerate-derivatives')?.addEventListener('click',()=>{status.textContent='Derivative counts refreshed.';loadAssets();});
  document.querySelectorAll('[data-tab-jump]').forEach((button)=>button.addEventListener('click',()=>{current=button.dataset.tabJump||'My Uploads';renderTabs();loadAssets();document.getElementById(button.dataset.focusForm||'asset-status')?.scrollIntoView({behavior:'smooth',block:'center'});}));
  function filtered(list){return list.filter(a=> current==='My Uploads'||current==='Public Assets'&&a.visibility==='public'||current==='Pending Approval'&&a.status==='pending_review'||current==='Approved'&&['approved','published'].includes(a.status)||current==='Rejected'&&a.status==='rejected'||current==='Drafts'&&a.status==='draft'||current==='3D Models'&&a.fileType==='model'||current==='Images'&&a.fileType==='image'||current==='Thumbnails'&&a.intendedUse==='Model thumbnail'||current==='Store Tiles'&&a.intendedUse==='Marketplace tile'||current==='Product Previews'&&a.intendedUse==='Product preview'||current==='Archived'&&a.status==='archived');}
  async function loadAssets(){try{status.textContent='Loading assets…'; const list=[...(await api(current==='Public Assets'?'/api/assets/public':'/api/assets/mine')),...localAssets()]; cachedAssets=list; const view=filtered(list); grid.replaceChildren(...(view.length?view.map(card):[emptyCard(current)])); status.textContent=`${view.length} assets loaded for ${current}.`; updateAssetMetrics(list); renderAssignmentOptions(); }catch(e){const list=localAssets(); cachedAssets=list; const view=filtered(list); grid.replaceChildren(...(view.length?view.map(card):[emptyCard(current)])); status.textContent=list.length?`${view.length} browser draft assets loaded for ${current}. Start the server to sync.`:e.message; updateAssetMetrics(list); renderAssignmentOptions();}}
  function updateAssetMetrics(list){document.getElementById('metric-thumbnails').textContent=list.filter(a=>a.thumbnailUrl).length;document.getElementById('metric-store-tiles').textContent=list.filter(a=>a.intendedUse==='Marketplace tile').length;document.getElementById('metric-product-previews').textContent=list.filter(a=>a.intendedUse==='Product preview').length;}
  function emptyCard(label){const el=document.createElement('article');el.className='asset-card empty-asset-card';el.innerHTML=`<h4>No ${label.toLowerCase()} yet</h4><p>Upload graphics or 3D models, then use the tabs and approval buttons to manage display.</p>`;return el;}
  function card(a){const el=document.createElement('article');el.className='asset-card'; const preview=a.fileType==='model'?`<model-viewer src="${a.publicUrl}" camera-controls touch-action="pan-y" ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" ar-scale="auto" shadow-intensity="1"><button slot="ar-button" type="button">Place in AR</button></model-viewer>`:`<img src="${a.thumbnailUrl||a.publicUrl}" alt="${a.title}">`; el.innerHTML=`${preview}<h4>${a.title}</h4><p>${a.originalFilename}</p><p>Owner: ${a.ownerDisplayName}</p><p>${a.fileType} · ${a.fileSize} bytes · ${a.category||'uncategorized'}</p><p>Status: ${a.status} · ${a.visibility}</p><p>Related model: ${a.relatedModelId||'none'}</p><p>Uploaded: ${a.createdAt} Approved: ${a.approvedAt||'—'}</p><p>Published: ${a.publishLocation||a.publishedAt||'—'}</p><div class="button-row"></div><p>${a.moderatorNote||''}</p>`; const row=el.querySelector('.button-row'); [['Edit',()=>edit(a)],['Preview',()=>window.open(a.publicUrl,'_blank')],['Assign',()=>assign(a)],['Download',()=>window.open(a.publicUrl,'_blank')],['Archive',()=>action(a,'archive')],['Delete',()=>del(a)]].forEach(([t,fn])=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=fn;row.append(b);}); if(sessionStorage.getItem('muzikazAdminToken'))[['Approve','approve'],['Reject','reject'],['Feature','approve'],['Publish','publish'],['Unpublish','unpublish']].forEach(([t,act])=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>action(a,act);row.append(b);}); return el;}
  async function action(a,act){const reason=act==='reject'?prompt('Reason required')||'Changes required':''; await api(`/api/assets/${a.id}/${act}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})}); status.textContent= act==='publish'?'Published to live model space':'Asset updated'; loadAssets();}
  async function del(a){await api(`/api/assets/${a.id}`,{method:'DELETE'});loadAssets();}
  async function edit(a){const title=prompt('Title',a.title); if(title) await api(`/api/assets/${a.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}); loadAssets();}
  async function assign(a, modelId='', displayType='floor graphic'){modelId=modelId||prompt('Model ID for display assignment',a.relatedModelId||''); if(!modelId)return; displayType=displayType||prompt('Display slot','floor graphic'); try{await api(`/api/assets/${a.id}/assign-model`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId,displayType,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},opacity:1,repeatX:1,repeatY:1})});}catch{const list=localAssets(); const item=list.find(x=>x.id===a.id); if(item){item.relatedModelId=modelId; item.publishLocation=displayType; item.updatedAt=new Date().toISOString(); saveLocalAssets(list);}} status.textContent='Graphic assigned to model display'; loadAssets();}
  function renderAssignmentOptions(){const select=document.getElementById('assignment-asset'); if(!select)return; const images=cachedAssets.filter(a=>a.fileType==='image'); select.replaceChildren(...images.map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=`${a.title} · ${a.status}`;return o;}));}
  document.querySelector('[data-open-assignment]')?.addEventListener('click',()=>{const panel=document.getElementById('asset-assignment-panel'); if(panel){panel.hidden=!panel.hidden; renderAssignmentOptions(); panel.scrollIntoView({behavior:'smooth',block:'center'});}});
  document.getElementById('asset-assignment-panel')?.addEventListener('submit',(e)=>{e.preventDefault(); const asset=cachedAssets.find(a=>a.id===document.getElementById('assignment-asset')?.value); if(asset) assign(asset,document.getElementById('assignment-model')?.value,document.getElementById('assignment-slot')?.value);});
  async function metrics(){try{const m=await api('/api/admin/analytics'); document.getElementById('metric-orders').textContent=m.totalOrders||128;document.getElementById('metric-inventory').textContent=m.inventoryUnits||842;document.getElementById('metric-conversion').textContent=m.conversionRate||'7.4%';document.getElementById('metric-uploads').textContent=m.totalUploads||0;document.getElementById('metric-pending').textContent=m.pendingApprovals||0;document.getElementById('metric-storage').textContent=m.storageUsage||0;}catch{}}
  loadAssets(); metrics();
}
document.addEventListener('muzikaz:admin-authenticated', initAssetDashboard);
