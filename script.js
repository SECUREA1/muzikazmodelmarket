const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const mobileLogoMenuButton = document.querySelector('.global-site-header .world-logo');
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
const BACKPACK_ASSETS_KEY = 'muzikazBackpackAssetsV1';
const BACKPACK_MARKET_KEY = 'muzikazBackpackMarket';
const BACKPACK_TRANSACTIONS_KEY = 'muzikazBackpackTransactions';
const BACKPACK_STARTING_TOKENS = 500;
const BOTTLE_ACCESS_KEY = 'muzikazBottleAccess';
const BOTTLE_BALANCE_OF_SELECTOR = '0x70a08231';
const BOTTLE_MINT_SELECTOR = '0x1249c58b';
const BACKPACK_LOADOUT_USD = 30;
const BACKPACK_LOADOUT_TIERS = Object.freeze({ 5: 'Black Bottle · 2,000 MZK', 30: 'Violet Bottle · 5,000 MZK', 100: '13,000 MZK', 200: 'Golden Bottle · 26,000 MZK + custom asset' });
const BOTTLE_MINT_REWARDS_KEY = 'muzikazBottleMintRewards';
const BOTTLE_MINT_BACKPACK_ASSETS = ['Unrevealed MUZIKAZ Land', 'Violet Wish Bottle'];
const MARKET_ITEM_PRICE_WEI = 100000000000000n; // 0.0001 ETH for every cart unit.

function initHeaderWalletConnect() {
  const button = document.querySelector('#wallet-connect');
  const label = button?.querySelector('span');
  const status = document.querySelector('#wallet-connect-status');
  if (!button || !label || !window.MZKWallet) return;
  let pending = false;
  const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
  const render = (message = '') => {
    const address = window.MZKWallet.connectedAddress();
    button.classList.toggle('is-connected', Boolean(address));
    button.setAttribute('aria-pressed', String(Boolean(address)));
    label.textContent = address ? shortAddress(address) : 'Connect wallet';
    if (status) status.textContent = message || (address ? `Ethereum wallet ${shortAddress(address)} connected.` : 'Wallet not connected.');
  };
  button.addEventListener('click', async () => {
    if (pending) return;
    if (window.MZKWallet.connectedAddress()) {
      window.MZKWallet.disconnectBrowserWallet();
      render('Wallet disconnected from this app.');
      return;
    }
    pending = true;
    button.disabled = true;
    label.textContent = 'Connecting…';
    try {
      await window.MZKWallet.connectBrowserWallet();
      render();
    } catch (error) {
      render(error?.message || 'Wallet connection was not completed.');
    } finally {
      pending = false;
      button.disabled = false;
    }
  });
  window.addEventListener('mzk:wallet-connection-changed', () => render());
  window.ethereum?.on?.('accountsChanged', (accounts) => {
    const address = String(accounts?.[0] || '').toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(address)) {
      localStorage.setItem('muzikazConnectedEthereumWalletV1', address);
      window.dispatchEvent(new CustomEvent('mzk:wallet-connection-changed', { detail: { address } }));
    } else {
      window.MZKWallet.disconnectBrowserWallet();
    }
  });
  render();
}

initHeaderWalletConnect();

function initHeroGateway() {
  const hero = document.querySelector('.hero[data-hero-mode]');
  const controls = [...(hero?.querySelectorAll('[data-hero-path]') || [])];
  const description = hero?.querySelector('#hero-description');
  const action = hero?.querySelector('.hero-primary-action');
  if (!hero || !description || !action || !controls.length) return;

  const paths = {
    explore: {
      description: 'Drop into living 3D districts, meet the crew, and discover a world that moves at your frequency.',
      label: 'Enter the world',
      href: '#world-map'
    },
    create: {
      description: 'Shape an avatar, claim your space, and turn your sound into a world the whole crew can experience.',
      label: 'Start creating',
      href: 'members.html'
    },
    collect: {
      description: 'Catch limited character drops, creator-built worlds, and rare gear before they disappear from the signal.',
      label: 'Shop the drops',
      href: '#marketplace-preview'
    }
  };

  const selectPath = (button) => {
    const key = button.dataset.heroPath;
    const path = paths[key];
    if (!path) return;
    hero.dataset.heroMode = key;
    description.textContent = path.description;
    action.href = path.href;
    action.innerHTML = `${path.label} <span aria-hidden="true">↗</span>`;
    controls.forEach((control) => {
      const active = control === button;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-selected', String(active));
      control.tabIndex = active ? 0 : -1;
    });
  };

  controls.forEach((button, index) => {
    button.addEventListener('click', () => selectPath(button));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = controls[(index + offset + controls.length) % controls.length];
      next.focus();
      selectPath(next);
    });
  });
}

initHeroGateway();

// One catalog drives both the world map and the marketplace. Coordinates belong
// to the asset, so a purchased world always resolves to the same map location.
const WORLD_ASSETS = [
  { id: 'volt-city', name: 'Volt City', kind: 'Land world', x: 23, y: 28, price: '$90.00', logo: 'logo_symbol_crop_2x.png', detail: 'The electric capital · live stages and creator towers' },
  { id: 'skyline-deck', name: 'Skyline Deck', kind: 'Land world', x: 49, y: 22, price: '$10.00', logo: 'available_online_events_banner_2x_transparent.png', detail: 'Rooftop events · tonight at 20:00' },
  { id: 'echo-gardens', name: 'Echo Gardens', kind: 'Land world', x: 74, y: 31, price: '$50.00', logo: 'dark_smoke_green_fx_2x.png', detail: 'Living sound biome · open for builders' },
  { id: 'crew-plaza', name: 'Crew Plaza', kind: 'Land world', x: 36, y: 49, price: '$25.00', logo: 'join_the_crew_banner_2x_transparent.png', detail: 'Social hub · crews gathering now' },
  { id: 'studio-ridge', name: 'Studio Ridge', kind: '3D Environment', x: 63, y: 53, price: '$40.00', logo: 'smoke_energy_background_large_2x_transparent.png', detail: 'MUZIKAZ Main Floor · complete walkable GLB stage', environmentId: 'muzikaz-main' },
  { id: 'neon-docks', name: 'Neon Docks', kind: 'Land world', x: 18, y: 70, price: '$65.00', logo: 'brand_name_tagline_panel_2x.png', detail: 'Drop port · new assets arriving' },
  { id: 'bassline-badlands', name: 'Bassline Badlands', kind: '3D Environment', x: 50, y: 76, price: '$75.00', logo: 'hero_banner_full_transparent.png', detail: 'MUZIKAZ Upper Floor · high-energy adventure environment', environmentId: 'muzikaz-upper' },
  { id: 'pixel-peaks', name: 'Pixel Peaks', kind: '3D Environment', x: 82, y: 72, price: '$100.00', logo: 'logo_panel_2x_transparent.png', detail: 'Sheep Base · panoramic walkable mountain build', environmentId: 'sheepbase' }
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
  window.dispatchEvent(new CustomEvent('mzk:cart-changed', { detail: { items } }));
  syncCartCount();
}

function syncCartCount() {
  cartItems = readCart().reduce((total, item) => total + (Number(item.quantity) || 1), 0);
  if (cartCount) {
    cartCount.textContent = String(cartItems);
    cartCount.closest('button')?.setAttribute('aria-label', `Open cart, ${cartItems} ${cartItems === 1 ? 'item' : 'items'}`);
  }
}

function normalizeDeliverable(deliverable) {
  if (!deliverable?.modelUrl || !/\.(?:glb|gltf)(?:[?#]|$)/i.test(deliverable.modelUrl)) return null;
  return {
    id: String(deliverable.id || deliverable.modelUrl),
    name: String(deliverable.name || '3D model'),
    modelUrl: String(deliverable.modelUrl),
    iosModelUrl: String(deliverable.iosModelUrl || ''),
    format: String(deliverable.format || deliverable.modelUrl.split('?')[0].split('.').pop() || 'glb').toLowerCase(),
    category: String(deliverable.category || '3D Model')
  };
}

function addCartLine(name, price, meta = '', deliverable = null, design = null) {
  if (!name) return;
  const items = readCart();
  const asset = normalizeDeliverable(deliverable);
  const key = `${name}|${meta}|${asset?.id || ''}|${asset?.modelUrl || ''}|${design?.savedAt||''}`;
  const existing = items.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ key, name, price: Number(price) || 0, meta, quantity: 1, deliverable: asset, ...(design?{design}:{} ) });
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
  menuButton?.setAttribute('aria-label', 'Open menu');
  if (window.matchMedia('(max-width: 720px)').matches) {
    mobileLogoMenuButton?.setAttribute('aria-expanded', 'false');
    mobileLogoMenuButton?.setAttribute('aria-label', 'Open menu');
  }
  if (nav && window.matchMedia('(max-width: 720px)').matches) {
    nav.setAttribute('aria-hidden', String(!nav.closest('.global-site-header')));
  }
}

function openMenu() {
  if (!nav) return;
  nav.classList.add('is-open');
  nav.setAttribute('aria-hidden', 'false');
  menuButton?.setAttribute('aria-expanded', 'true');
  menuButton?.setAttribute('aria-label', 'Close menu');
  mobileLogoMenuButton?.setAttribute('aria-expanded', 'true');
  mobileLogoMenuButton?.setAttribute('aria-label', 'Close menu');
}

function syncHeaderLayout() {
  if (!nav) return;
  if (window.matchMedia('(max-width: 720px)').matches) {
    mobileLogoMenuButton?.setAttribute('role', 'button');
    mobileLogoMenuButton?.setAttribute('aria-controls', 'primary-navigation');
    mobileLogoMenuButton?.setAttribute('aria-label', 'Open menu');
    mobileLogoMenuButton?.setAttribute('aria-expanded', String(nav.classList.contains('is-open')));
    nav.setAttribute('aria-hidden', String(!nav.closest('.global-site-header') && !nav.classList.contains('is-open')));
  } else {
    nav.classList.remove('is-open');
    nav.setAttribute('aria-hidden', 'false');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'Open menu');
    mobileLogoMenuButton?.removeAttribute('role');
    mobileLogoMenuButton?.removeAttribute('aria-controls');
    mobileLogoMenuButton?.removeAttribute('aria-expanded');
    mobileLogoMenuButton?.setAttribute('aria-label', 'MUZIKAZ WORLD home');
  }
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

function readBottleAccess() {
  try {
    const access = JSON.parse(window.localStorage.getItem(BOTTLE_ACCESS_KEY) || '{}');
    return access && typeof access === 'object' ? access : {};
  } catch (error) {
    return {};
  }
}

function grantBottleAccess(email, source, reference = '') {
  const memberEmail = normalizeMemberEmail(email);
  if (!memberEmail) return false;
  const access = readBottleAccess();
  access[memberEmail] = { source, reference, grantedAt: new Date().toISOString() };
  window.localStorage.setItem(BOTTLE_ACCESS_KEY, JSON.stringify(access));
  return true;
}

function hasBottleEntitlement(email) {
  return Boolean(readBottleAccess()[normalizeMemberEmail(email)]);
}

function bottleContractConfig() {
  const contract = String(window.MUZIKAZ_BOTTLE_CONTRACT_ADDRESS || document.querySelector('meta[name="muzikaz-bottle-contract"]')?.content || '').trim();
  const approvedContracts = [
    contract,
    ...String(window.MUZIKAZ_BOTTLE_APPROVED_CONTRACTS || '').split(','),
    ...Array.from(document.querySelectorAll('meta[name="muzikaz-bottle-approved-contract"]'), (meta) => meta.content)
  ].map((address) => String(address).trim()).filter(Boolean);
  const chainId = String(window.MUZIKAZ_BOTTLE_CHAIN_ID || document.querySelector('meta[name="muzikaz-bottle-chain-id"]')?.content || '').trim().toLowerCase();
  const mintData = String(window.MUZIKAZ_BOTTLE_MINT_DATA || BOTTLE_MINT_SELECTOR).trim();
  const mintValue = String(window.MUZIKAZ_BOTTLE_MINT_VALUE || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) throw new Error('The MUZIKAZ Bottle contract address is not configured.');
  if (approvedContracts.some((address) => !/^0x[a-fA-F0-9]{40}$/.test(address))) throw new Error('An approved MUZIKAZ Bottle contract address is invalid.');
  if (mintValue && !/^0x[a-fA-F0-9]+$/.test(mintValue)) throw new Error('The Bottle mint value must be hexadecimal wei.');
  return { contract, approvedContracts: [...new Set(approvedContracts.map((address) => address.toLowerCase()))], chainId, mintData, mintValue };
}

function requireEthereumWallet() {
  if (!window.ethereum?.request) throw new Error('Install or open an EIP-1193 Ethereum wallet such as MetaMask to continue.');
  return window.ethereum;
}

async function requestEthereumAccount(wallet, { chooseAccount = false } = {}) {
  if (chooseAccount) {
    try {
      await wallet.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch {
      // Revoking permissions is optional in EIP-1193, so continue to the account chooser.
    }
    try {
      await wallet.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    } catch (error) {
      // A rejected chooser must leave the site disconnected rather than silently
      // reconnecting the wallet account that was selected before.
      if (error?.code === 4001) throw error;
      // Wallets without wallet_requestPermissions can still use eth_requestAccounts.
    }
  }
  const accounts = await wallet.request({ method: 'eth_requestAccounts' });
  const address = String(accounts?.[0] || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error('No valid Ethereum account was returned by the wallet.');
  return address;
}

async function ensureBottleChain(wallet, chainId) {
  if (!chainId) return;
  const activeChain = String(await wallet.request({ method: 'eth_chainId' })).toLowerCase();
  if (activeChain === chainId) return;
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    throw new Error(`Switch your wallet to the required Ethereum network (${chainId}).`);
  }
}

async function validateBottleOwnership(address, requiredContract = '') {
  const wallet = requireEthereumWallet();
  const config = bottleContractConfig();
  await ensureBottleChain(wallet, config.chainId);
  if (!window.MuzikazContractOwnership?.verify) throw new Error('The secure contract ownership checker did not load. Refresh and try again.');
  const tokenIdsByContract = Object.fromEntries(Array.from(document.querySelectorAll('[data-contract][data-token-ids]'), (element) => [String(element.dataset.contract).toLowerCase(), String(element.dataset.tokenIds).split(',').map((id) => id.trim()).filter(Boolean)]));
  const ownership = await window.MuzikazContractOwnership.verify({ wallet, address, contracts: config.approvedContracts, requiredContract, tokenIdsByContract });
  return { ...ownership, config };
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

function grantBottleMintBackpackAssets(owner, mintTransactionHash) {
  const normalizedOwner = normalizeMemberEmail(owner);
  if (!normalizedOwner || !mintTransactionHash) return false;
  const rewards = readBackpackData(BOTTLE_MINT_REWARDS_KEY, {});
  const rewardId = String(mintTransactionHash).toLowerCase();
  if (rewards[rewardId]) return false;
  const profiles = readOwnedProfiles();
  profiles[normalizedOwner] ||= [];
  BOTTLE_MINT_BACKPACK_ASSETS.forEach((asset) => profiles[normalizedOwner].push(`${asset} · Backpack Loadout`));
  rewards[rewardId] = { owner: normalizedOwner, assets: BOTTLE_MINT_BACKPACK_ASSETS, grantedAt: new Date().toISOString() };
  writeOwnedProfiles(profiles);
  window.localStorage.setItem(BOTTLE_MINT_REWARDS_KEY, JSON.stringify(rewards));
  renderOwnedCollection(normalizedOwner);
  return true;
}

function backpackLandAsset(owner = currentMemberEmail) {
  const normalizedOwner = normalizeMemberEmail(owner || window.localStorage.getItem('muzikazBottleMemberEmail'));
  if (!normalizedOwner) return '';
  const assets = readOwnedProfiles()[normalizedOwner] || [];
  return assets.find((asset) => Boolean(findWorldAsset(asset)) || /\b(?:unrevealed\s+.*land|muzikaz\s+world|digital\s+land|world\s+plot|land\s+(?:asset|world|reservation|deed|claim))\b/i.test(asset)) || '';
}

window.MUZIKAZLandAccess = {
  ownedAsset: () => backpackLandAsset(),
  uploadHeaders: () => {
    const landAsset = backpackLandAsset();
    if (!landAsset) throw new Error('Land ownership required. Add a MUZIKAZ World land deed to your Drop Backpack before uploading avatars, assets, or games.');
    return { 'x-muzikaz-land-asset': landAsset };
  }
};

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

function claimOwnedAsset(assetName, source = 'Marketplace claim', targetOwner = currentMemberEmail) {
  const owner = normalizeMemberEmail(targetOwner);
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

function syncStarterLoadout(loadout) {
  if (!loadout?.owner) return;
  currentMemberEmail = normalizeMemberEmail(loadout.owner);
  window.localStorage.setItem('muzikazBottleMemberEmail', currentMemberEmail);
  claimOwnedAsset(`Avatar · ${loadout.avatar}`, 'First-time Builder Loadout');
  claimOwnedAsset(`MUZIKAZ World · ${loadout.land}`, 'Random public land starter plot');
  (loadout.assets || []).forEach((asset) => claimOwnedAsset(asset, 'First-time Builder Loadout'));
}

window.addEventListener('mzk:starter-loadout-claimed', (event) => syncStarterLoadout(event.detail));
if (window.MZKWallet?.starterLoadout()) syncStarterLoadout(window.MZKWallet.starterLoadout());

function ownedAssetDetail(assetName) {
  const worldAsset = findWorldAsset(assetName);
  if (worldAsset) return { title: assetName, type: worldAsset.kind, image: worldAsset.logo, copy: `${worldAsset.detail}. Located at X ${worldAsset.x}, Y ${worldAsset.y}.`, href: `index.html?world=${worldAsset.id}#world-map` };
  if (/\b(?:unrevealed\s+.*land|digital\s+land|world\s+plot|land\s+(?:asset|reservation|deed|claim))\b/i.test(assetName)) {
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

function initModelMarketGate() {
  const cover = document.querySelector('#model-market-cover');
  const form = document.querySelector('#model-market-login-form');
  const status = document.querySelector('#model-market-login-status');
  const connectButton = document.querySelector('#model-market-wallet-connect');
  const disconnectButton = document.querySelector('#model-market-wallet-disconnect');
  const addressLabel = document.querySelector('#model-market-wallet-address');
  if (!cover || !form) return;
  const accountApiFetch = (path, options = {}) => window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options);
  const setBusy = (busy) => { if (connectButton) connectButton.disabled = busy; if (disconnectButton) disconnectButton.disabled = busy; form.setAttribute('aria-busy', String(busy)); };
  const uncover = (account) => {
    currentMemberEmail = normalizeMemberEmail(account.primaryEthereumWallet || `account:${account.accountId}`);
    document.body.classList.remove('model-market-gated');
    cover.setAttribute('hidden', '');
    document.dispatchEvent(new CustomEvent('muzikaz:member-authenticated', { detail: { account } }));
  };
  const bootstrap = async () => {
    setBusy(true);
    if (status) status.textContent = 'Restoring your Loadout account…';
    try {
      const response = await accountApiFetch('/api/account/bootstrap');
      const result = await response.json().catch(() => ({ success: false, message: `The account service returned an unreadable response (${response.status}).` }));
      if (!response.ok || !result.success) throw new Error(result.message || 'Account bootstrap failed.');
      const state = result.data;
      window.MuzikazAccountSession = { csrfToken: state.csrfToken, account: state.account, backpack: state.backpack, permissions: state.permissions, expiresAt: state.expiresAt };
      if (state.account.loadoutAccess !== true || state.permissions.radTox !== true) throw new Error('This account does not have access to RAD-TOX.');
      if (addressLabel) { addressLabel.hidden = false; addressLabel.textContent = `Loadout account: ${state.account.username || state.account.accountId}`; }
      // A direct game URL is a supported entry path: establish its short-lived
      // server game contract only after canonical bootstrap authorizes it.
      const game = await accountApiFetch('/api/game/session', { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrfToken }, body: '{}' });
      const gameResult = await game.json().catch(() => ({ success: false, message: `The game service returned an unreadable response (${game.status}).` }));
      if (!game.ok || !gameResult.success) throw new Error(gameResult.message || 'RAD-TOX game-session creation failed.');
      window.MuzikazGameSessionToken = gameResult.data.gameSessionToken;
      window.sessionStorage.setItem('muzikazGameSessionToken', gameResult.data.gameSessionToken);
      const validation = await accountApiFetch('/api/game/session', { headers: { Accept: 'application/json', 'X-Game-Session': gameResult.data.gameSessionToken } });
      const validationResult = await validation.json().catch(() => ({ success: false, message: `The game validation response was unreadable (${validation.status}).` }));
      if (!validation.ok || !validationResult.success) throw new Error(validationResult.message || 'RAD-TOX game-session validation failed.');
      uncover(state.account);
    } catch (error) {
      if (status) status.textContent = error.message || 'RAD-TOX authorization failed.';
    } finally { setBusy(false); }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); window.location.href = 'members.html'; });
  connectButton?.addEventListener('click', () => { window.location.href = 'members.html'; });
  disconnectButton?.addEventListener('click', async () => {
    try { await window.MUZIKAZ_API?.logout?.(window.MuzikazAccountSession?.csrfToken); } finally {
      window.sessionStorage.removeItem('muzikazBottleMember');
      window.sessionStorage.removeItem('muzikazLoginRedirect');
      window.MuzikazAccountSession = null;
      window.MuzikazGameSessionToken = '';
      window.sessionStorage.removeItem('muzikazGameSessionToken');
      document.body.classList.add('model-market-gated');
      cover.removeAttribute('hidden');
      if (status) status.textContent = 'Disconnected. Open your account again to enter RAD-TOX.';
    }
  });
  bootstrap();
}
initModelMarketGate();

// The homepage live atlas is mounted by public/js/world-atlas.js.


function renderOwnedCollection(preferredOwner = currentMemberEmail) {
  if(document.body.classList.contains('members-page')){window.dispatchEvent(new Event('muzikaz:member-inventory-refresh'));return;}
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
      : listing.listed ? `<div class="backpack-buy"><strong>${listing.tokenValue.toLocaleString()} MZK / $${listing.tokenValue.toLocaleString()} crypto value</strong><button type="button" data-backpack-buy="${assetIndex}">Trade with MZK</button>${['ETH', 'POL', 'BNB', 'SOL', 'ADA', 'BTC', 'DOGE'].map((symbol) => `<button type="button" class="ghost" data-backpack-crypto="${symbol}" data-backpack-buy="${assetIndex}">${symbol}</button>`).join('')}</div>` : '<p class="backpack-not-listed">Not currently listed for trade</p>';
    const unrevealed = /unrevealed/i.test(asset);
    return `<article class="${unrevealed ? 'backpack-mystery-card' : ''}"><div class="backpack-asset-art ${unrevealed ? 'is-unrevealed' : ''}">${unrevealed ? '<span aria-hidden="true">?</span>' : `<img src="${escapeMarkup(detail.image)}" alt="${escapeMarkup(detail.title)}">`}</div><span class="pill">🎒 ${escapeMarkup(detail.type)}</span>${unrevealed ? '<strong class="unrevealed-label">Unrevealed</strong>' : ''}<h3>${escapeMarkup(detail.title)}</h3><p>${unrevealed ? 'Owned by this Backpack. Identity and hidden metadata remain sealed until the official reveal.' : escapeMarkup(detail.copy)}</p>${detail.href ? `<a class="card-link" href="${escapeMarkup(detail.href)}">View map claim</a>` : ''}${controls}</article>`;
  }).join('') || '<article><h3>Backpack empty</h3><p>Add marketplace drops, checkout character products, claim collectibles, or upload graphics to build this account pack.</p></article>';
  if (transactionList) {
    const transactions = readBackpackData(BACKPACK_TRANSACTIONS_KEY, []);
    transactionList.innerHTML = transactions.slice(-8).reverse().map((trade) => `<li><strong>${escapeMarkup(trade.asset)}</strong><span>${escapeMarkup(trade.seller)} → ${escapeMarkup(trade.buyer)}</span><b>${trade.cryptoPayment ? `${Number(trade.cryptoPayment.amount).toLocaleString()} ${escapeMarkup(trade.cryptoPayment.currency)}` : `${Number(trade.tokenValue).toLocaleString()} MZK`}</b><time datetime="${escapeMarkup(trade.createdAt)}">${new Date(trade.createdAt).toLocaleString()}</time></li>`).join('') || '<li>No trades yet.</li>';
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

document.querySelector('#owned-assets-grid')?.addEventListener('click', async (event) => {
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
  const cryptoCurrency = buy.dataset.backpackCrypto;
  const buyerTokens = backpackBalance(currentMemberEmail);
  backpackBalance(selectedOwner);
  if (!asset || !listing.listed || !Number.isFinite(price)) {
    if (status) status.textContent = 'That listing is no longer available.';
    return renderOwnedCollection(selectedOwner);
  }
  if (!cryptoCurrency && buyerTokens < price) {
    if (status) status.textContent = `You need ${(price - buyerTokens).toLocaleString()} more MZK to complete this trade.`;
    return;
  }
  const transferId = `backpack:${selectedOwner}:${currentMemberEmail}:${asset}:${Date.now()}`;
  let cryptoPayment;
  if (cryptoCurrency) {
    try { if (status) status.textContent = `Loading the live ${cryptoCurrency} quote for $${price.toFixed(2)}…`; cryptoPayment = await window.MuzikazWalletPayments.pay(price, cryptoCurrency); }
    catch (error) { if (status) status.textContent = error.message || `${cryptoCurrency} payment was not completed. The Backpack item has not moved.`; return renderOwnedCollection(selectedOwner); }
  } else {
    const payment = window.MZKWallet?.transfer(currentMemberEmail, selectedOwner, price, `Backpack trade: ${asset}`, transferId, { asset });
    if (!payment?.ok) { if (status) status.textContent = 'The MZK payment could not be completed.'; return renderOwnedCollection(selectedOwner); }
  }
  sellerAssets.splice(assetIndex, 1);
  profiles[currentMemberEmail] ||= [];
  profiles[currentMemberEmail].push(asset);
  writeOwnedProfiles(profiles);
  setBackpackListing(selectedOwner, asset, price, false);
  const transactions = readBackpackData(BACKPACK_TRANSACTIONS_KEY, []);
  transactions.push({ asset, seller: selectedOwner, buyer: currentMemberEmail, tokenValue: price, cryptoPayment, createdAt: new Date().toISOString() });
  window.localStorage.setItem(BACKPACK_TRANSACTIONS_KEY, JSON.stringify(transactions.slice(-100)));
  if (status) status.textContent = cryptoPayment ? `Trade complete: ${asset} moved to your Backpack after ${cryptoPayment.amount} ${cryptoPayment.currency}. Transaction ${cryptoPayment.transactionHash}.` : `Trade complete: ${asset} moved to your Backpack for ${price.toLocaleString()} MZK.`;
  renderOwnedCollection(currentMemberEmail);
});


menuButton?.addEventListener('click', () => nav?.classList.contains('is-open') ? closeMenu() : openMenu());

mobileLogoMenuButton?.addEventListener('click', (event) => {
  if (!window.matchMedia('(max-width: 720px)').matches) return;
  event.preventDefault();
  nav?.classList.contains('is-open') ? closeMenu() : openMenu();
});

nav?.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  if (link) {
    document.querySelectorAll('.nav a').forEach((link) => link.classList.remove('active'));
    link.classList.add('active');
    closeMenu();
  }
});

document.addEventListener('pointerdown', (event) => {
  if (!nav?.classList.contains('is-open')) return;
  if (!event.target.closest('.global-site-header')) closeMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !nav?.classList.contains('is-open')) return;
  closeMenu();
  (window.matchMedia('(max-width: 720px)').matches ? mobileLogoMenuButton : menuButton)?.focus();
});

window.addEventListener('resize', syncHeaderLayout, { passive: true });
syncHeaderLayout();

document.querySelector('[data-action="explorer"]')?.addEventListener('click', () => scrollToSection('publish-model'));
document.querySelector('[data-action="house"]')?.addEventListener('click', () => scrollToSection('house-explorer'));


addModelButton?.addEventListener('click', () => {
  if (!selectedModel) {
    if (modelStatus) modelStatus.textContent = 'Choose a model collection before adding it to cart.';
    scrollToSection('models');
    return;
  }
  const model = getModel(selectedModel);
  const deliverable = ownerGlbModels.find((item) => normalizeArModelKey(item.id) === normalizeArModelKey(model.glbModelId || model.id));
  if (!deliverable) {
    if (modelStatus) modelStatus.textContent = `${selectedModel} is still loading its exact GLB. Try again in a moment.`;
    loadOwnerGlbModels();
    return;
  }
  addCartLine(`${selectedModel} · ${model.character} 3D Model`, parsePrice(model.price), `${model.type} · Exact GLB delivered to Backpack`, deliverable);
  updateCart(addModelButton, 'Model added');
  if (modelStatus) modelStatus.textContent = `${selectedModel} model added to your cart.`;
});

document.addEventListener('muzikaz:add-model-to-cart', (event) => {
  const model = event.detail || {};
  if (!model.name) return;
  addCartLine(`${model.name} 3D Model`, model.price, `${model.category || '3D Model'} · Exact GLB delivered to Backpack`, model);
  const status = document.querySelector('#explorer-live-models-status') || modelStatus;
  if (status) status.textContent = `${model.name} added to your cart. Complete checkout to add it to your Backpack.`;
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
  const recipient = event.currentTarget.dataset.emailRecipient || 'jodelchad@chaines.io';
  const subject = encodeURIComponent('MUZIKAZ crew signup');
  const body = encodeURIComponent(`Please add ${input.value} to the MUZIKAZ crew mailing list.`);
  window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
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
    { id: 'originals', glbModelId: 'aape', page: 'originals.html', name: 'Originals', css: 'monkey', character: 'Ape', type: 'Character Models', file: 'reference.png', price: '$39.00', copy: 'Classic starter poses, mascot turnarounds, and brand-ready preview files.', merch: ['Neon Hoodie', 'Bolt Keychain'] },
    { id: 'legends', glbModelId: 'voltwolf', page: 'legends.html', name: 'Legends', css: 'robot', character: 'Cyber Wolf', type: '3D Model Packs', file: 'futuristic_armored_wolf_humanoid.png', price: '$64.00', copy: 'Armored future icon with dramatic neon render support and creator-safe styling.', merch: ['Crew Cap', 'Beat Bottle'] },
    { id: 'beasts', glbModelId: 'sharko', page: 'beasts.html', name: 'Beasts', css: 'beast', character: 'Red Beast', type: '3D Model Packs', file: 'fierce_demon_hybrid_in_action.png', price: '$58.00', copy: 'Monster-power render pack connected to safe fantasy presentation rules.', merch: ['Wristband', 'Lanyard'] },
    { id: 'crew', glbModelId: 'ioncduck', page: 'crew-market.html', name: 'Crew', css: 'penguin', character: 'Crew Penguin', type: 'Character Models', file: 'the_crew_banner_2x_transparent.png', price: '$44.00', copy: 'Street-smart mascot assets for friendly drops, banners, and fan pages.', merch: ['Crew Cap', 'Lanyard'] },
    { id: 'chaos', glbModelId: 'flaminglow', page: 'chaos.html', name: 'Chaos', css: 'chaos', character: 'Chaos Ape', type: '3D Model Packs', file: 'character_traits_overview_panel_2x.png', price: '$69.00', copy: 'High-energy hybrid concepts for the loudest MUZIKAZ creator collection.', merch: ['Neon Hoodie', 'Wristband'] },
    { id: 'new-legends', glbModelId: 'muzikaz', page: 'new-legends.html', name: 'New Legends', css: 'new-legends', character: 'Unlocked Crew', type: 'Character Models', file: 'new_legends_unlocked_2x_transparent.png', price: '$52.00', copy: 'Expanded platform collection art for fresh mascot launches and hero tiles.', merch: ['Hero Banner', 'Tagline Tee'] },
    { id: 'trait-avatars', glbModelId: 'pixella', page: 'trait-avatars.html', name: 'Trait Avatars', css: 'trait-avatars', character: 'Avatar Lineup', type: 'Character Models', file: 'trait_avatars_row_1_2x.png', price: '$46.00', copy: 'Row-ready mascot avatars built for picker graphics, social posts, and profile drops.', merch: ['Avatar Sticker Sheet', 'Crew Cap'] },
    { id: 'online-events', glbModelId: 'beedeere', page: 'online-events.html', name: 'Online Events', css: 'online-events', character: 'Event Crew', type: 'Event Model Packs', file: 'available_online_events_banner_2x_transparent.png', price: '$55.00', copy: 'Event-ready visual set for stream drops, ticket pages, and online campaigns.', merch: ['Event Pass', 'Lanyard'] },
  ],
  websitePackages: [
    { id: 'starter-site', page: 'index.html', name: 'Launch 3D Landing Page', category: 'Website Packages', price: '$299.00', asset: 'hero_banner_full_2x_transparent.png', copy: 'Responsive single-page build using an existing 3D model, branded layout, and one conversion CTA.' },
    { id: 'drop-page', page: 'new-legends.html', name: 'Campaign 3D Landing Page', category: 'Website Packages', price: '$599.00', asset: 'new_legends_unlocked_2x_transparent.png', copy: 'Focused product campaign with up to three sections, an interactive 3D viewer, analytics, and social metadata.' },
    { id: 'creator-vault', page: 'members.html', name: 'Immersive 3D Landing Page', category: 'Website Packages', price: '$999.00', asset: 'accessories_banner_2x_transparent.png', copy: 'Premium story page with custom interactions, motion, up to two optimized 3D scenes, and a performance pass.' },
    { id: 'event-landing', page: 'online-events.html', name: '3D Commerce Landing Page', category: 'Website Packages', price: '$1,499.00', asset: 'available_online_events_banner_2x_transparent.png', copy: 'Immersive campaign build with product or ticket checkout plus MUZIKAZ wallet and Backpack integration.' },
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
    { id: 'vehicle-garage', name: 'World Vehicle Garage', category: 'Vehicles', price: '$38.00', asset: 'hero_banner_full_2x_transparent.png', connectsTo: ['Crew', 'Chaos', 'Online Events'], copy: 'Ride-ready boards, bikes, carts, and world transport concepts for characters moving between MUZIKAZ districts.' },
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
  ...WORLD_ASSETS.map((asset) => ({ type: 'Land Worlds & Environments', category: asset.kind, quality: 'curated', name: asset.name, price: asset.price, copy: `${asset.detail}. Own a connected MUZIKAZ land deed for your avatar, GLB scene, drops, and creator station. Map location: X ${asset.x}, Y ${asset.y}.`, product: asset.name, page: `model-market.html?world=${asset.id}#muzikaz-world-plot`, worldId: asset.id, marketTopics: ['lands'] })),
  ...assetCatalog.models.map((model) => ({ type: model.type, category: model.name, quality: 'curated', name: `${model.name} 3D Model Pack`, price: model.price, copy: `${model.copy} Source: ${model.file}`, model: model.name, marketTopics: ['avatars'] })),
  ...assetCatalog.websitePackages.map((pack) => ({ type: 'Website Packages', category: pack.category, quality: 'curated', name: pack.name, price: pack.price, copy: `${pack.copy} Source: ${pack.asset}`, product: pack.name, page: pack.page })),
  ...assetCatalog.controlPackages.map((pack) => ({ type: 'Subscriber Creator Tools', category: pack.category, quality: 'curated', name: pack.name, price: pack.price, copy: pack.copy, product: pack.name })),
  ...assetCatalog.characterWorldAssets.map((asset) => ({ type: 'Character & World Assets', category: asset.category, quality: 'curated', name: asset.name, price: asset.price, copy: `${asset.copy} Compatible with ${asset.connectsTo.join(' + ')}. Source: ${asset.asset}`, product: asset.name, marketTopics: asset.category === 'Avatars' ? ['avatars'] : asset.category === 'Pets' ? ['pets'] : asset.category === 'Accessories' ? ['props', 'wearables'] : asset.category === '3D Environments' ? ['lands'] : asset.category === 'Vehicles' ? ['vehicles'] : ['props'] })),
  ...assetCatalog.retail.map((product) => ({ type: 'Retail Pages', category: product.category, quality: 'curated', name: product.name, price: product.price, copy: `${product.category} connected to ${product.connectsTo.join(' + ')} model data.`, product: product.name, marketTopics: ['Hoodies', 'Headwear', 'Tees'].includes(product.category) ? ['wearables'] : ['props'] })),
  { type: 'Custom Orders', category: 'Custom Builds', quality: 'curated', name: 'Team Sleeve Text Run', price: 'Quote request', copy: 'Custom name, number, logo style, sleeve text, product, and character selections flow from the same catalog.' },
  { type: 'Limited Drops', category: 'Drop Bundles', quality: 'review', name: 'Friday Connected Drop', price: 'Locks at sellout', copy: 'Bundles one model pack, one retail item, and one custom designer preset.' },
];

const requestedMarket = new URLSearchParams(window.location.search).get('market');
const requestedMarketTopic = ({ land: 'lands', lands: 'lands', avatars: 'avatars', props: 'props', wearables: 'wearables', pets: 'pets', vehicles: 'vehicles' })[requestedMarket] || '';
const marketplaceState = { type: 'All', category: 'All', topic: requestedMarketTopic, modelFocus: '', curatedOnly: true };
const matchesMarketplaceTopic = (listing) => !marketplaceState.topic || listing.marketTopics?.includes(marketplaceState.topic);

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
  const select = document.querySelector('#flex-category-select');
  const buttons = Array.from(document.querySelectorAll('[data-flex-category]'));
  const cards = document.querySelectorAll('#character-world-assets [data-flex-card]');
  const panel = document.querySelector('#flex-category-panel');
  if ((!select && !buttons.length) || !cards.length) return;
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
  const cardList = Array.from(cards);
  const categories = ['All', ...new Set(cardList.map((card) => card.dataset.flexCard))];
  if (select) {
    select.replaceChildren(...categories.map((category) => {
      const count = category === 'All' ? cardList.length : cardList.filter((card) => card.dataset.flexCard === category).length;
      return new Option(`${category === 'All' ? 'All categories' : category} (${count})`, category);
    }));
  }
  function selectCategory(requestedCategory, { focus = false } = {}) {
    const category = categories.includes(requestedCategory) && requestedCategory !== 'All' ? requestedCategory : categories.find((item) => item !== 'All') || 'All';
    if (select) select.value = category;
    buttons.forEach((button) => {
      const active = button.dataset.flexCategory === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    cards.forEach((card) => {
      const visible = category === 'All' || card.dataset.flexCard === category;
      card.hidden = !visible;
      card.classList.toggle('is-selected', visible && category !== 'All');
    });
    if (panel) panel.innerHTML = `<strong>${category === 'All' ? 'Full asset universe selected' : `${category} selected`}</strong><span>${summaries[category] || summaries.All}</span>`;
  }
  select?.addEventListener('change', () => selectCategory(select.value || 'All'));
  buttons.forEach((button, index) => {
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => selectCategory(button.dataset.flexCategory || 'All'));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      selectCategory(buttons[next].dataset.flexCategory || 'All', { focus: true });
    });
  });
  selectCategory(window.location.hash === '#character-world-avatars' ? 'Avatars' : 'All');
}

function initWorldPlot() {
  let landValues={};
  const plot = document.querySelector('#muzikaz-world-plot');
  const spaces = Array.from(document.querySelectorAll('[data-world-space]'));
  const consent = document.querySelector('#world-plot-consent');
  const agreement = document.querySelector('#world-plot-agreement');
  const reserveButton = agreement?.querySelector('button[type="submit"]');
  const selection = document.querySelector('#world-plot-selection');
  const ownedCount = document.querySelector('#world-plots-owned');
  const purchaseLink = document.querySelector('#world-plot-purchase');
  if (!plot || !spaces.length || !consent || !agreement || !reserveButton || !selection) return;

  const owner = normalizeMemberEmail(currentMemberEmail || window.localStorage.getItem('muzikazBottleMemberEmail'));
  const ownedPlotNames = () => {
    if (!owner) return [];
    const assets = readOwnedProfiles()[owner] || [];
    return spaces.map((space) => space.dataset.worldSpace).filter((name) => assets.some((asset) => asset.startsWith(`MUZIKAZ World · ${name}`)));
  };
  const updateOwnedCount = () => { if (ownedCount) ownedCount.textContent = String(ownedPlotNames().length); };
  const requestedWorldId = new URLSearchParams(window.location.search).get('world');
  const requestedWorld = WORLD_ASSETS.find((asset) => asset.id === requestedWorldId)?.name;
  let selectedSpace = spaces.some((space) => space.dataset.worldSpace === requestedWorld)
    ? requestedWorld
    : window.localStorage.getItem('muzikazWorldStarterSpace') || spaces[0].dataset.worldSpace;
  const selectSpace = (name) => {
    selectedSpace = name;
    window.localStorage.setItem('muzikazWorldStarterSpace', name);
    spaces.forEach((space) => {
      const active = space.dataset.worldSpace === name;
      space.classList.toggle('is-selected', active);
      space.setAttribute('aria-pressed', String(active));
    });
    const selectedIndex = spaces.findIndex((space) => space.dataset.worldSpace === name) + 1;
    const isOwned = ownedPlotNames().includes(name);
    const worldId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');const selectedPrice=landValues[worldId]?.priceMzk;const selectedUsd=selectedPrice/100;const priceBox=plot.querySelector('.world-plot__price');if(priceBox&&selectedPrice){priceBox.querySelector('strong').textContent='$'+selectedUsd.toFixed(2)+' USD';priceBox.querySelector('em').textContent=selectedPrice.toLocaleString()+' MZK · '+landValues[worldId].size+' m · '+landValues[worldId].type;}
    selection.innerHTML = `<span class="world-plot__selection-number">${String(selectedIndex).padStart(2, '0')}</span><span><strong>${name} selected.</strong> This public-area plot includes one free spot in its community.</span><small>Plot status <b>${isOwned ? 'Owned by you' : 'Available'}</b></small>`;
    reserveButton.textContent = isOwned ? `${name} owned` : `Claim ${name} · ${selectedPrice?.toLocaleString()||'Loading price…'} MZK`;
    reserveButton.disabled = isOwned || !consent.checked || !selectedPrice;
    if (purchaseLink) {
      purchaseLink.href = `buy-mzk.html?amount=${selectedUsd||40}&world=${encodeURIComponent(worldId)}&return=${encodeURIComponent(`model-market.html?world=${worldId}#muzikaz-world-plot`)}`;
      purchaseLink.querySelector('strong').textContent = isOwned ? `${name} already owned` : (selectedPrice?`Fund wallet for ${name} · $${selectedUsd.toFixed(2)}`:'Loading land price…');
      purchaseLink.classList.toggle('is-owned', isOwned);
      purchaseLink.setAttribute('aria-disabled', String(isOwned||!selectedPrice));if(!selectedPrice)purchaseLink.removeAttribute('href');
    }
  };

  spaces.forEach((space) => space.addEventListener('click', () => selectSpace(space.dataset.worldSpace)));
  consent.addEventListener('change', () => { const id=selectedSpace.toLowerCase().replace(/[^a-z0-9]+/g,'-');reserveButton.disabled = ownedPlotNames().includes(selectedSpace) || !consent.checked || !landValues[id]; });
  agreement.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!consent.checked) return;
    if (ownedPlotNames().includes(selectedSpace)) return;
    const walletId = window.MZKWallet?.connectedAddress?.() || owner;
    const worldId = selectedSpace.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const requestId = `starter-land:${walletId}:${worldId}`;
    reserveButton.disabled = true; reserveButton.textContent = 'Recording deed…';
    let deed;
    try {
      await window.MZKWallet.refreshShared();
      const session=window.MZKWallet.sharedSession();if(!session)throw new Error('Sign in through Members before buying a plot.');
      const response = await window.MUZIKAZ_API.fetch('/api/land/claims', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token':session.csrfToken }, body: JSON.stringify({ worldId, requestId, expectedPriceMzk:landValues[worldId]?.priceMzk }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || 'The live deed database rejected this claim.');
      deed = result.data || result;
    } catch (error) {
      reserveButton.disabled = false; reserveButton.textContent = `Claim ${selectedSpace} · ${landValues[worldId]?.priceMzk.toLocaleString()||'Loading price…'} MZK`;
      selection.innerHTML = `<span class="world-plot__selection-number">!</span><span><strong>Claim not recorded.</strong> ${escapeHtml(error.message)}</span><small>Your MZK was not spent locally. Reconnect to the live service and retry.</small>`;
      return;
    }
    await window.MZKWallet?.refreshShared?.();
    claimOwnedAsset(`MUZIKAZ World · ${selectedSpace}`, 'Public-area plot claim');
    window.dispatchEvent(new Event('muzikaz:member-plots-changed'));
    try{localStorage.setItem('muzikaz.memberPlots.signal',String(Date.now()));}catch{}
    updateOwnedCount();
    updateCart(reserveButton, 'Plot claimed');
    const selectedIndex = spaces.findIndex((space) => space.dataset.worldSpace === selectedSpace) + 1;
    selection.innerHTML = `<span class="world-plot__selection-number">${String(selectedIndex).padStart(2, '0')}</span><span><strong>${selectedSpace} claimed.</strong> Your deed is within this public area and its free community spot is included.</span><small>Plot status <b>Owned by you</b></small>`;
    reserveButton.disabled = true;
    const plotLink=document.createElement('a');plotLink.className='btn';plotLink.textContent='Open your hosted plot';plotLink.href=deed.playUrl||`model-explorer.html?environment=plot-${encodeURIComponent(deed.id)}&autoplay=1`;selection.append(plotLink);
    reserveButton.textContent = `${selectedSpace} owned`;
  });
  updateOwnedCount();
  selectSpace(selectedSpace);
  import('./public/js/game-item-pricing.js').then(({LAND_VALUES})=>{landValues=LAND_VALUES;selectSpace(selectedSpace);}).catch(()=>{reserveButton.disabled=true;reserveButton.textContent='Land prices unavailable · reload to retry';});
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
    <article data-retail-id="${product.id}">
      ${index < 3 ? `<i>${index === 0 ? 'Hot' : index === 1 ? 'New' : 'Drop'}</i>` : ''}
      <div class="product-img" style="--product-art:url('${product.asset}')" role="img" aria-label="${product.name} graphic"></div>
      <strong>${product.name}</strong><p>${product.price}</p><button type="button" data-product="${product.name}">Add</button>
    </article>`).join('');
  const fitLastProduct=()=>{const print=productGrid.querySelector('[data-retail-id="wordmark-print"]');if(!print)return;print.hidden=false;const top=print.getBoundingClientRect().top;const sharesRow=[...productGrid.children].some(card=>card!==print&&!card.hidden&&Math.abs(card.getBoundingClientRect().top-top)<3);print.hidden=!sharesRow;};
  requestAnimationFrame(fitLastProduct);
  if(window.ResizeObserver)new ResizeObserver(()=>requestAnimationFrame(fitLastProduct)).observe(productGrid);
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
    addCartLine(productName, parsePrice(product?.price), product?.category || product?.type || 'Store item', product?.modelUrl ? product : null);
    updateCart(productButton);
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
  if (previewValues) previewValues.innerHTML = values.map((value) => `<li>${escapeMarkup(value)}</li>`).join('');
  renderOrderSummary();
}

function renderOrderSummary() {
  const summary = document.querySelector('#designer-order-summary');
  if (!summary || !designerControls) return;
  const { data, product, character } = designerData();
  const quantity = Number(data.get('quantity') || 1);
  const total = product.price * quantity;
  const uploads = uploadState.layers.length ? uploadState.layers.map((layer) => layer.name).join(', ') : 'No custom upload yet';
  summary.innerHTML = `<strong>${escapeMarkup(product.name)} custom order</strong><span>${escapeMarkup(character.name)} · ${escapeMarkup(data.get('size'))} · Qty ${quantity} · $${total.toFixed(2)}</span><span>Text: ${escapeMarkup(data.get('name'))} / ${escapeMarkup(data.get('number'))} / ${escapeMarkup(data.get('sleeve'))}</span><span>Uploaded art: ${escapeMarkup(uploads)}</span><span>Notes: ${escapeMarkup(data.get('notes') || 'None')}</span>`;
  const stack=document.querySelector('#layer-stack');if(stack)stack.innerHTML='<li>Product template and print-safe guide</li><li>Character, logo and text layers · drag on the preview</li>'+uploadState.layers.map(layer=>`<li><button type="button" data-select-design-layer="${escapeMarkup(layer.id)}">${escapeMarkup(layer.name)}${layer.id===uploadState.activeId?' · Selected':''}</button></li>`).join('');
}

function renderMarketplace(type = marketplaceState.type, modelFocus = marketplaceState.modelFocus) {
  if (!marketTabs || !marketGrid) return;
  marketplaceState.type = type || 'All';
  marketplaceState.modelFocus = modelFocus || '';
  marketplaceState.curatedOnly = marketQualityToggle ? marketQualityToggle.checked : marketplaceState.curatedOnly;
  const types = ['All', ...new Set(marketplaceListings.filter(matchesMarketplaceTopic).map((listing) => listing.type))];
  const categories = ['All', ...new Set(marketplaceListings.filter(matchesMarketplaceTopic).map((listing) => listing.category))];
  const countListings = (nextType, nextCategory) => marketplaceListings.filter((listing) => {
    const typeMatch = nextType === 'All' || listing.type === nextType;
    const categoryMatch = nextCategory === 'All' || listing.category === nextCategory;
    const focusMatch = !marketplaceState.modelFocus || listing.model === marketplaceState.modelFocus || listing.copy.includes(marketplaceState.modelFocus);
    const qualityMatch = !marketplaceState.curatedOnly || listing.quality === 'curated';
    return typeMatch && categoryMatch && focusMatch && qualityMatch && matchesMarketplaceTopic(listing);
  }).length;
  marketTabs.replaceChildren(...types.map((tab) => new Option(`${tab} (${countListings(tab, marketplaceState.category)})`, tab, false, tab === marketplaceState.type)));
  if (marketCategories) marketCategories.replaceChildren(...categories.map((category) => new Option(`${category} (${countListings(marketplaceState.type, category)})`, category, false, category === marketplaceState.category)));
  const listings = marketplaceListings.filter((listing) => {
    const typeMatch = marketplaceState.type === 'All' || listing.type === marketplaceState.type;
    const categoryMatch = marketplaceState.category === 'All' || listing.category === marketplaceState.category;
    const focusMatch = !marketplaceState.modelFocus || listing.model === marketplaceState.modelFocus || listing.copy.includes(marketplaceState.modelFocus);
    const qualityMatch = !marketplaceState.curatedOnly || listing.quality === 'curated';
    return typeMatch && categoryMatch && focusMatch && qualityMatch && matchesMarketplaceTopic(listing);
  });
  marketGrid.innerHTML = listings.map((listing, index) => {
    const arIndex = Number.isInteger(listing.arCharacterIndex) ? listing.arCharacterIndex : characterForListing(listing);
    const canLaunchAr = Boolean(listing.modelUrl) || arIndex >= 0;
    return `<article><span class="pill">${listing.type}</span><span class="pill category-pill">${listing.category}</span><h3>${listing.name}</h3><p>${listing.copy}</p><p class="price">${listing.price}</p><button type="button" data-product="${listing.name}">Add</button>${listing.page ? `<a class="btn ghost" href="${listing.page}">Open product</a>` : ''}${listing.worldId ? `<a class="btn ghost" href="index.html?world=${listing.worldId}#world-map">View on map</a>` : ''}${canLaunchAr ? `<button type="button" class="ghost" data-market-ar="${index}">View in AR</button>` : ''}</article>`;
  }).join('') || '<article><h3>No matches</h3><p>Choose another category, type, or turn off curated quality only.</p></article>';
  marketGrid.querySelectorAll('[data-market-ar]').forEach((button) => button.addEventListener('click', () => activateMarketplaceAr(listings[Number(button.dataset.marketAr)])));
  if (marketStatus) {
    const focusCopy = marketplaceState.modelFocus ? ` for ${marketplaceState.modelFocus}` : '';
    const topicCopy = marketplaceState.topic ? ` Backpack topic: ${marketplaceState.topic}.` : '';
    marketStatus.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'} shown${focusCopy}. Category: ${marketplaceState.category}. Type: ${marketplaceState.type}.${topicCopy}`;
  }
  marketTabs.onchange = () => renderMarketplace(marketTabs.value, marketplaceState.modelFocus);
  if (marketCategories) marketCategories.onchange = () => {
    marketplaceState.category = marketCategories.value || 'All';
    marketplaceState.modelFocus = '';
    renderMarketplace(marketplaceState.type);
  };
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
    placements:Object.fromEntries(['preview-character','preview-name','preview-number','preview-sleeve'].map(id=>{const layer=document.getElementById(id);return [id,{left:layer.style.left||'',top:layer.style.top||''}];}).filter(([,value])=>value.left&&value.top)),
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
  ['preview-character','preview-name','preview-number','preview-sleeve'].forEach(id=>{const layer=document.getElementById(id);layer.style.removeProperty('left');layer.style.removeProperty('top');layer.style.removeProperty('right');layer.style.removeProperty('bottom');const placement=saved.placements?.[id];if(placement){layer.style.left=placement.left;layer.style.top=placement.top;layer.style.right='auto';layer.style.bottom='auto';}});
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
window.MUZIKAZ_DESIGNER={export:exportDesignerOrder,restore:restoreDesignerOrder,status:setDesignerStatus,products:()=>designerProducts};
document.querySelector('#layer-stack')?.addEventListener('click',event=>{const id=event.target.closest('[data-select-design-layer]')?.dataset.selectDesignLayer;if(id){const layer=[...document.querySelectorAll('.uploaded-design-layer')].find(layer=>layer.dataset.layerId===id);if(layer){selectUploadLayer(layer);renderOrderSummary();}}});
document.querySelector('#save-design')?.addEventListener('click', () => {
  if(window.MUZIKAZ_DESIGNER_STORE){window.MUZIKAZ_DESIGNER_STORE.save();return;}
  uploadState.saved = exportDesignerOrder();
  try {
    localStorage.setItem('muzikazSavedDesign', JSON.stringify(uploadState.saved));
    setDesignerStatus('Draft saved with product settings, text, notes, artwork layers, and placement controls.');
  } catch {
    setDesignerStatus('Draft could not be saved because the uploaded artwork exceeds local browser storage. Download the print spec instead.');
  }
});
document.querySelector('#load-design')?.addEventListener('click', () => {
  if(window.MUZIKAZ_DESIGNER_STORE){window.MUZIKAZ_DESIGNER_STORE.browse();return;}
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
  if(!designerControls.reportValidity())return;
  const order = exportDesignerOrder();
  const title = `${order.character} ${order.product} custom order`;
  const product = designerProducts.find((item) => item.name === order.product) || { price: 74.99 };
  try{addCartLine(title, product.price * order.quantity, `Custom merch designer · ${order.uploads.length} upload(s) · ${order.logoStyle}`,null,order);}catch{setDesignerStatus('The artwork is too large for this device cart. Save a member draft or download the print spec first.');return;}
  updateCart(event.currentTarget, 'Design added');
  setDesignerStatus('Design and complete print specification added to your cart. Complete checkout to place an order.');
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
  const deliverable = modelForCharacter(character);
  if (!deliverable?.modelUrl) {
    alert(`${character.name}'s displayed GLB is still loading. Try checkout again in a moment.`);
    loadOwnerGlbModels();
    return;
  }
  for (let index = 0; index < qty; index += 1) addCartLine(`${character.name} ${product.name}`, product.price, `${document.querySelector('#checkout-size-select')?.value || ''} · ${document.querySelector('#checkout-color-select')?.value || ''} · Includes displayed ${deliverable.name} GLB`, deliverable);
  updateCart(event.currentTarget, 'Checkout added');
  alert(`${character.name} ${product.name} is in your cart. Complete checkout to add the purchased asset to your Backpack.`);
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
  const form=document.querySelector('#bottle-login-form'),lockedContent=document.querySelector('#member-locked-content'),status=document.querySelector('#bottle-login-status');if(!form||!lockedContent)return;
  async function request(path,options={}){const response=await window.MUZIKAZ_API.fetch(path,{...options,retries:0,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})}});const result=await response.json();if(!response.ok||result.success===false)throw new Error(result.message||'Member login is unavailable.');return result.data;}
  let authVersion=0;
  function unlock(session){window.MuzikazAccountSession=session;currentMemberEmail=normalizeMemberEmail(session.account?.username||session.owner_id||'account:'+session.account.accountId);localStorage.setItem('muzikazBottleMember','true');localStorage.setItem('muzikazBottleMemberEmail',currentMemberEmail);lockedContent.dataset.locked='false';status.textContent='Signed in as '+currentMemberEmail+'. Designs and inventory use your member account.';window.dispatchEvent(new Event('muzikaz:member-ready'));}
  request('/api/market/session').then(session=>{if(!authVersion)unlock(session);}).catch(()=>{if(authVersion)return;lockedContent.dataset.locked='true';status.textContent='Sign in with your member username and password. New usernames create a member account.';});
  form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;authVersion++;const button=form.querySelector('button');button.disabled=true;status.textContent='Verifying member login…';try{const fields=new FormData(form);const session=await request('/api/access/free-play',{method:'POST',body:JSON.stringify({username:fields.get('username'),password:fields.get('password')})});window.MUZIKAZ_API.setSessionToken(session.sessionToken);unlock(session);form.elements.password.value='';const redirect=sessionStorage.getItem('muzikazLoginRedirect');if(redirect){sessionStorage.removeItem('muzikazLoginRedirect');location.href=redirect;return;}document.getElementById(location.hash.slice(1)||'member-locked-content')?.scrollIntoView({behavior:'smooth',block:'start'});}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
}

marketQualityToggle?.addEventListener('change', () => renderMarketplace());
renderMarketplace();
seedCharacterCheckout();
seedArViewer();
loadOwnerGlbModels().then(renderSubscriberGlbLibrary);
document.querySelector('#owned-profile-select')?.addEventListener('change', (event) => renderOwnedCollection(event.currentTarget.value));
renderOwnedCollection();
initBottleLogin();

function initMzkAccessAccount() {
  const accessCodeInput = document.querySelector('#loadout-access-code');
  const status = document.querySelector('#bottle-login-status');
  const output = document.querySelector('#mzk-access-manage-output');
  const sharedCode = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('access-code');
  if (accessCodeInput && sharedCode && /^MZK-(?:[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}|[A-Z0-9]{8}-[A-Z0-9]{8})$/i.test(sharedCode)) {
    accessCodeInput.value = sharedCode.toUpperCase();
    if (status) status.textContent = 'Opening your shared MZK Loadout Pass…';
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#bottle-login`);
    // Activated codes open immediately without a wallet prompt. A first-use
    // code follows the same submit path and asks for its permanent owner once.
    window.setTimeout(() => document.querySelector('#loadout-code-redeem')?.click(), 0);
  }
  async function manage(action) {
    const session = window.MuzikazAccountSession; if (!session?.csrfToken) throw new Error('Open your account again before managing its credential.');
    const apiFetch = window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch : fetch;
    const response = await apiFetch(`/api/account/access-code/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': session.csrfToken }, body: '{}' }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || `Access Code ${action} failed.`); return result.data;
  }
  document.querySelector('#mzk-access-rotate')?.addEventListener('click', async () => { try { const result = await manage('rotate'); output.textContent = `Save this new MZK Access Code now; it will not be shown again: ${result.code}`; } catch (error) { output.textContent = error.message; } });
  document.querySelector('#mzk-access-revoke')?.addEventListener('click', async () => { if (!confirm('Revoke wallet-free code access? Your account and wallet access will remain intact.')) return; try { await manage('revoke'); output.textContent = 'MZK Access Code revoked. Your account data and wallet bindings are unchanged.'; } catch (error) { output.textContent = error.message; } });
}
initMzkAccessAccount();

const checkoutItems = document.querySelector('#checkout-items');
const paymentForm = document.querySelector('#payment-form');

function checkoutOwner(method, paymentOwner = '') {
  if (method === 'MZK') return normalizeMemberEmail(window.MZKWallet?.walletId());
  return normalizeMemberEmail(paymentOwner);
}


function validateWalletCheckout() {
  if (!readCart().length) { document.querySelector('#payment-status').textContent = 'Your cart is empty.'; return false; }
  return true;
}

function renderCheckoutIdentity() {
  const backpack = normalizeMemberEmail(window.localStorage.getItem('muzikazBottleMemberEmail'));
  const wallet = normalizeMemberEmail(window.MZKWallet?.walletId());
  const backpackLabel = document.querySelector('#checkout-backpack-owner');
  const walletLabel = document.querySelector('#checkout-wallet-owner');
  const copy = document.querySelector('#checkout-owner-copy');
  if (!backpackLabel || !walletLabel || !copy) return;
  backpackLabel.textContent = backpack || 'Not signed in';
  walletLabel.textContent = wallet?.startsWith('guest-') ? 'Guest wallet' : (wallet || 'Not connected');
  const matched = Boolean(backpack && wallet && backpack === wallet);
  copy.textContent = matched
    ? 'Verified match: MZK purchases will be claimed to this same Backpack identity.'
    : 'Wallet payments are claimed only to the address that approves them. MZK claims go to the active MZK wallet shown here.';
  document.querySelector('.checkout-owner')?.classList.toggle('is-matched', matched);
}

function formatCheckoutMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function marketPaymentConfig() {
  const ethereum = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.ETH;
  const address = ethereum.address;
  const chainId = String(document.querySelector('meta[name="muzikaz-market-chain-id"]')?.content || '0x1').trim().toLowerCase();
  const configuredWei = String(document.querySelector('meta[name="muzikaz-market-item-price-wei"]')?.content || `0x${MARKET_ITEM_PRICE_WEI.toString(16)}`).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error('The marketplace payment wallet is not configured correctly.');
  if (!/^0x[a-fA-F0-9]+$/.test(configuredWei) || BigInt(configuredWei) <= 0n) throw new Error('The marketplace ETH item price is not configured correctly.');
  return { address, chainId, itemPriceWei: BigInt(configuredWei) };
}

function formatEth(wei) {
  const whole = wei / 1000000000000000000n;
  const fraction = (wei % 1000000000000000000n).toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole.toString()}${fraction ? `.${fraction}` : ''} ETH`;
}

async function waitForMarketTransaction(wallet, transactionHash) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = await wallet.request({ method: 'eth_getTransactionReceipt', params: [transactionHash] });
    if (receipt) {
      if (receipt.status && BigInt(receipt.status) !== 1n) throw new Error('The marketplace payment transaction failed. Your cart was not changed.');
      return receipt;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error('Payment is still pending. Keep your cart and return after the transaction confirms.');
}


function checkoutUsdTotal() {
  const items = readCart();
  const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  return subtotal + (subtotal > 0 && subtotal < 75 ? 8.95 : 0) + (subtotal * 0.0825);
}

async function completeCryptoOrder(items, payment) {
  if (!payment.orderId) throw new Error('A verified server order is required before delivery.');
  const response=await window.MUZIKAZ_API.fetch('/api/payments/orders/'+encodeURIComponent(payment.orderId));
  const payload=await response.json(),order=payload.data;
  if(!response.ok||!['PAID','FULFILLED'].includes(order?.paymentStatus)||order.purchaseType!=='MARKETPLACE'||!order.memberAccountId)throw new Error('Payment is still awaiting server verification. Your cart is unchanged.');
  const orderId=order.orderId;
  window.localStorage.setItem('muzikazLastReceipt', JSON.stringify({orderId,items:order.metadata.items,paidAt:order.confirmedAt,method:order.paymentAsset,transactionHash:order.transactionHash}));
  await window.MZKWallet?.refreshShared?.();
  window.dispatchEvent(new Event('muzikaz:inventory-changed'));window.dispatchEvent(new Event('muzikaz:game-assets-changed'));
  writeCart([]);renderCheckoutPage();
  document.querySelector('#confirmation-copy').textContent=`Order ${orderId} is verified. Purchased digital models are stored in your member Backpack for gameplay and trading.`;
  document.querySelector('#confirmation-panel').hidden=false;
  document.querySelector('#confirmation-panel').scrollIntoView({behavior:'smooth',block:'center'});
}

function initMzkCheckout() {
  const button = document.querySelector('#checkout-mzk-pay'), status = document.querySelector('#payment-status');
  if (!button || !window.MZKWallet) return;
  window.MZKWallet.mount('#checkout-mzk-balance');
  button.addEventListener('click', async () => {
    if(button.disabled)return;
    const items = readCart(), amount = Math.round(checkoutUsdTotal() * window.MZKWallet.MZK_PER_USD);
    if (!items.length) return;
    if (!validateWalletCheckout()) return;
    button.disabled=true;
    await window.MZKWallet.refreshShared().catch(()=>{});
    const owner = checkoutOwner('MZK');
    if (!owner || owner.startsWith('guest-')) { button.disabled=false; status.innerHTML = 'Sign in or connect your member wallet before paying with MZK so the claim reaches the correct Backpack. <a href="members.html#bottle-login">Connect account</a>.'; return; }
    button.disabled=true;
    const result = await window.MZKWallet.purchaseItems(items, amount, `mzk-order:${Date.now()}`);
    button.disabled=false;
    if (!result.ok) { status.textContent=result.error||'The token purchase could not be completed.'; return; }
    const orderId = `MZ-MZK-${Date.now().toString().slice(-6)}`;
    window.dispatchEvent(new Event('muzikaz:inventory-changed'));window.dispatchEvent(new Event('muzikaz:game-assets-changed'));
    window.localStorage.setItem('muzikazLastReceipt', JSON.stringify({ orderId, total: `${amount} MZK`, items, paidAt: new Date().toISOString(), method: 'MZK' }));
    writeCart([]); renderCheckoutPage(); status.textContent = `${amount.toLocaleString()} MZK paid. Receipt ${orderId} is ready.`;
    document.querySelector('#confirmation-copy').textContent = `Receipt ${orderId} is confirmed for ${amount.toLocaleString()} MZK. Every purchased asset is now in your Backpack.`;
    document.querySelector('#confirmation-panel').hidden = false;
  });
}

function initMultiChainCheckout() {
  const buttons = [...document.querySelectorAll('[data-crypto-pay]')];
  const refreshButton = document.querySelector('#refresh-crypto-quotes');
  const status = document.querySelector('#payment-status');
  const unifiedCheckout = document.querySelector('muzikaz-payment-checkout');
  unifiedCheckout?.addEventListener('muzikaz-payment-status', async (event) => {
    if (!['PAID', 'FULFILLED'].includes(event.detail.paymentStatus)) return;
    const receiptKey = `muzikazDeliveredPayment:${event.detail.orderId}`;
    if (localStorage.getItem(receiptKey)) return;
    const items = event.detail.fulfillment?.items || event.detail.metadata?.items || [];
    if (!items.length) return;
    try{await completeCryptoOrder(items,event.detail);localStorage.setItem(receiptKey,'true');}catch(error){if(status)status.textContent=error.message;return;}
    if (status) status.textContent = `${event.detail.currency} payment verified. Your receipt is ready and purchased products were delivered to your Backpack.`;
  });
  if (!buttons.length || !window.MuzikazWalletPayments) return;
  const refresh = async () => {
    const total = checkoutUsdTotal();
    buttons.forEach((button) => { button.disabled = !total; });
    if (!total) return;
    try {
      const [sol, ada] = await Promise.all([window.MuzikazWalletPayments.quote(total, 'SOL'), window.MuzikazWalletPayments.quote(total, 'ADA')]);
      document.querySelector('#sol-quote').textContent = `${sol.amount} SOL ≈ $${total.toFixed(2)}`;
      document.querySelector('#ada-quote').textContent = `${ada.amount} ADA ≈ $${total.toFixed(2)}`;
    } catch (error) { status.textContent = error.message; }
  };
  refreshButton?.addEventListener('click', refresh);
  buttons.forEach((button) => button.addEventListener('click', async () => {
    const items = readCart();
    if (!items.length) return;
    if (!validateWalletCheckout()) return;
    buttons.forEach((item) => { item.disabled = true; });
    try {
      status.textContent = `Connect ${button.dataset.cryptoPay === 'SOL' ? 'Phantom' : 'Lace'} and approve the exact recipient and value…`;
      const payment = await window.MuzikazWalletPayments.pay(checkoutUsdTotal(), button.dataset.cryptoPay,{productType:'MARKETPLACE',productId:'marketplace-cart',metadata:{items}});
      await completeCryptoOrder(items, payment);
      status.textContent = `${payment.currency} payment submitted successfully. Your receipt and Backpack assets are ready.`;
    } catch (error) { status.textContent = error.message || 'Wallet payment was not completed. Your cart is unchanged.'; }
    finally { refresh(); }
  }));
  refresh();
}

function initEthereumCheckout() {
  const connectButton = document.querySelector('#ethereum-wallet-connect');
  const payButton = document.querySelector('#ethereum-wallet-pay');
  const addressLabel = document.querySelector('#ethereum-wallet-address');
  const totalLabel = document.querySelector('#ethereum-wallet-total');
  const recipientLabel = document.querySelector('#ethereum-payment-recipient');
  const status = document.querySelector('#payment-status');
  if (!connectButton || !payButton) return;
  let connectedAddress = '';
  const config = marketPaymentConfig();
  recipientLabel.textContent = config.address;
  const refresh = () => {
    const quantity = readCart().reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    totalLabel.textContent = `${formatCheckoutMoney(checkoutUsdTotal())} USD · live ETH quote at payment`;
    payButton.disabled = !connectedAddress || !quantity;
  };
  const connect = async ({ switchWallet = false } = {}) => {
    const wallet = requireEthereumWallet();
    if (switchWallet) {
      connectedAddress = '';
      addressLabel.textContent = 'No Ethereum wallet connected.';
      connectButton.textContent = 'Connect Ethereum wallet';
      refresh();
    }
    await ensureBottleChain(wallet, config.chainId);
    const address = await requestEthereumAccount(wallet, { chooseAccount: switchWallet });
    connectedAddress = address;
    addressLabel.textContent = `Connected wallet: ${address}`;
    connectButton.textContent = 'Disconnect & choose wallet';
    refresh();
    return wallet;
  };
  connectButton.addEventListener('click', async () => {
    connectButton.disabled = true;
    try { await connect({ switchWallet: Boolean(connectedAddress) }); status.textContent = 'Wallet connected. Review the cart ETH total, recipient, and network before buying.'; } catch (error) { connectedAddress = ''; addressLabel.textContent = 'No Ethereum wallet connected.'; status.textContent = error.message || 'Ethereum wallet connection failed.'; refresh(); } finally { connectButton.disabled = false; }
  });
  payButton.addEventListener('click', async () => {
    const items = readCart();
    if (!items.length) return;
    if (!validateWalletCheckout()) return;
    payButton.disabled = true;
    connectButton.disabled = true;
    try {
      await connect();
      status.textContent='Creating your member order and requesting the exact verified ETH payment…';
      const payment=await window.MuzikazWalletPayments.pay(checkoutUsdTotal(),'ETH',{productType:'MARKETPLACE',productId:'marketplace-cart',metadata:{items}});
      await completeCryptoOrder(items,payment);
      status.textContent='Ethereum payment verified. Purchased models are in your server Backpack.';
    } catch (error) { status.textContent = error.message || 'Ethereum payment was not completed. Your cart is unchanged.'; } finally { connectButton.disabled = false; refresh(); }
  });
  window.ethereum?.on?.('accountsChanged', (accounts) => { connectedAddress = String(accounts?.[0] || ''); addressLabel.textContent = connectedAddress ? `Connected wallet: ${connectedAddress}` : 'No Ethereum wallet connected.'; connectButton.textContent = connectedAddress ? 'Disconnect & choose wallet' : 'Connect Ethereum wallet'; refresh(); });
  refresh();
}

function renderCheckoutPage() {
  if (!checkoutItems) return;
  const items = readCart();
  if (!items.length) {
    checkoutItems.innerHTML = '<article class="empty-cart"><strong>Your cart is empty.</strong><span>Add models or merch before processing checkout.</span></article>';
  } else {
    checkoutItems.innerHTML = items.map((item) => `
      <article class="checkout-item">
        <div><strong>${item.name}</strong><span>${item.meta || 'MUZIKAZ store item'} · Qty ${item.quantity}${item.deliverable?.modelUrl ? ` · Delivers ${item.deliverable.name} (${item.deliverable.format.toUpperCase()})` : ''}</span></div>
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
  const mzkTotal = document.querySelector('#summary-mzk-total');
  if (mzkTotal) mzkTotal.textContent = `${Math.round(total * 100).toLocaleString()} MZK`;
  const unifiedCheckout = document.querySelector('muzikaz-payment-checkout');
  if (unifiedCheckout) {
    const sharing = Boolean(paymentForm?.elements.sharePersonalInformation?.checked);
    unifiedCheckout.checkoutProduct = { productId: 'marketplace-cart', productType: 'MARKETPLACE', quantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0), userId: window.MZKWallet?.connectedAddress?.() || checkoutOwner('MZK'), wallet: window.MZKWallet?.connectedAddress?.() || '', metadata: { receiptEmail: sharing ? (paymentForm?.elements.email?.value || '') : '', items } };
    unifiedCheckout.checkoutValidator = () => { unifiedCheckout.checkoutProduct.metadata.receiptEmail = paymentForm?.elements.sharePersonalInformation?.checked ? (paymentForm?.elements.email?.value || '') : ''; return validateWalletCheckout(); };
    if (total > 0 && unifiedCheckout.getAttribute('base-price') !== String(total)) { unifiedCheckout.setAttribute('base-price', String(total)); unifiedCheckout.refresh?.(); }
  }
  const ethereumTotal = document.querySelector('#ethereum-wallet-total');
  if (ethereumTotal) ethereumTotal.textContent = formatEth(MARKET_ITEM_PRICE_WEI * BigInt(items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)));
  const ethereumPay = document.querySelector('#ethereum-wallet-pay');
  if (ethereumPay && !items.length) ethereumPay.disabled = true;
}

document.querySelector('#checkout-clear-cart')?.addEventListener('click', () => {
  writeCart([]);
  renderCheckoutPage();
  document.querySelector('#payment-status').textContent = 'Cart cleared. Add products to process a new payment.';
});

paymentForm?.addEventListener('submit', (event) => event.preventDefault());
paymentForm?.elements.sharePersonalInformation?.addEventListener('change', (event) => {
  document.querySelector('#optional-personal-information').hidden = !event.currentTarget.checked;
  const copy = event.currentTarget.nextElementSibling?.querySelector('small');
  if (copy) copy.textContent = event.currentTarget.checked ? 'ON — optional receipt information will be shared.' : 'OFF — declined by default. This never affects wallet payments or delivery.';
  if (!event.currentTarget.checked && paymentForm.elements.email) paymentForm.elements.email.value = '';
});

renderCheckoutPage();
renderCheckoutIdentity();
window.addEventListener('mzk:identity-changed', renderCheckoutIdentity);
window.addEventListener('mzk:wallet-connection-changed', renderCheckoutIdentity);
window.addEventListener('storage', renderCheckoutIdentity);
initMzkCheckout();

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

// Vibe Crib uses the native GLB runtime and its shared on-screen controller.


function initAdminLogin() {
  const form = document.querySelector('#admin-login-form');
  const card = document.querySelector('#admin-login');
  const dashboard = document.querySelector('[data-asset-dashboard]');
  const status = document.querySelector('#admin-login-status');
  if (!form || !card || !dashboard) return;
  const tokenKey = 'muzikazAdminToken';
  const storedAdminToken = () => localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || '';
  const adminApiFetch = (path, options = {}) => window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options);
  const rememberAdminToken = (token) => { localStorage.setItem(tokenKey, token); sessionStorage.setItem(tokenKey, token); };
  const forgetAdminToken = () => { localStorage.removeItem(tokenKey); sessionStorage.removeItem(tokenKey); };
  const conceal = (message = 'Administrator authentication is required.') => {
    dashboard.hidden = true;
    card.hidden = false;
    status.textContent = message;
  };
  const reveal = () => {
    card.hidden = true;
    dashboard.hidden = false;
    document.dispatchEvent(new Event('muzikaz:admin-authenticated'));
  };
  const openAdminCenter = () => window.location.replace('admin.html');
  const validateStoredSession = async () => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token) return conceal();
    openAdminCenter();
  };
  validateStoredSession();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); status.textContent = 'Authenticating administrator…';
    const credentials = Object.fromEntries(new FormData(form));
    try {
      const response = await adminApiFetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(credentials) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.token) throw new Error(result.message || 'Authentication failed');
      rememberAdminToken(result.data.token); form.reset(); openAdminCenter();
    } catch (error) { status.textContent = error.message || 'Authentication failed.'; }
  });
  document.querySelector('#admin-logout')?.addEventListener('click', async () => { try { await adminApiFetch('/api/admin/logout', { method: 'POST', headers: { ...(storedAdminToken() ? { 'x-admin-token': storedAdminToken() } : {}), Accept: 'application/json' } }); } finally { forgetAdminToken(); conceal('Signed out. Administrator authentication is required.'); } });
  const codeForm = document.querySelector('#loadout-code-generator-form');
  const codeOutput = document.querySelector('#loadout-code-output');
  const codeStatus = document.querySelector('#loadout-code-admin-status');
  const copyButton = document.querySelector('#loadout-code-copy');
  const codeTable = document.querySelector('#mzk-access-admin-table');
  let currentCode = '';
  const loadAccessCodes = async () => {
    if (!codeTable) return;
    const response = await adminApiFetch('/api/admin/access-codes', { headers: { 'x-admin-token': storedAdminToken(), Accept: 'application/json' } }); const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Credentials could not be loaded.');
    codeTable.innerHTML = result.data.length ? result.data.map((item) => `<tr><td>${escapeHtml(item.maskedCode)}</td><td>${escapeHtml(item.label)}<small>${escapeHtml(item.campaign || '')}</small></td><td>${escapeHtml(item.status)}</td><td>${new Date(item.createdAt).toLocaleDateString()}<small>${item.activatedAt ? new Date(item.activatedAt).toLocaleDateString() : 'Not activated'}</small></td><td>${escapeHtml(item.boundWallet ? shortAddress(item.boundWallet) : '—')}<small>${escapeHtml(item.accountUsername || '')}</small></td><td>${item.loadoutRedeemed ? 'Yes' : 'No'}</td><td>${item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '—'}</td><td><button type="button" data-access-revoke="${item.id}" ${item.status === 'revoked' ? 'disabled' : ''}>Revoke</button></td></tr>`).join('') : '<tr><td colspan="8">No credentials issued.</td></tr>';
  };
  document.addEventListener('muzikaz:admin-authenticated', () => loadAccessCodes().catch((error) => { if (codeStatus) codeStatus.textContent = error.message; }));
  codeTable?.addEventListener('click', async (event) => { const id = event.target.closest('[data-access-revoke]')?.dataset.accessRevoke; if (!id) return; try { const response = await adminApiFetch(`/api/admin/access-codes/${id}/revoke`, { method: 'POST', headers: { 'x-admin-token': storedAdminToken(), Accept: 'application/json' } }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message); await loadAccessCodes(); } catch (error) { codeStatus.textContent = error.message || 'Revoke failed.'; } });
  codeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (codeStatus) codeStatus.textContent = 'Generating a cryptographically random MZK Access Code…';
    try {
      const fields = Object.fromEntries(new FormData(codeForm)); for (const name of ['waiveLoadout', 'violetBottle', 'starterLand', 'creatorVault']) fields[name] = codeForm.elements[name].checked;
      const response = await adminApiFetch('/api/admin/loadout-codes', { method: 'POST', headers: { 'x-admin-token': storedAdminToken(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(fields) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Code generation failed.');
      currentCode = result.data.code;
      codeOutput.textContent = currentCode;
      copyButton.hidden = false;
      codeStatus.textContent = `Issued until ${new Date(result.data.expiresAt).toLocaleString()}. Entitlements redeem once; the activated credential remains the account login.`;
      await loadAccessCodes();
    } catch (error) { if (codeStatus) codeStatus.textContent = error.message || 'Code generation failed.'; }
  });
  copyButton?.addEventListener('click', async () => {
    if (!currentCode) return;
    try { await navigator.clipboard.writeText(currentCode); codeStatus.textContent = 'Secret copied. Share privately; its included entitlements redeem once and the credential remains active afterward.'; }
    catch { codeStatus.textContent = `Copy is unavailable. Select the displayed code manually: ${currentCode}`; }
  });
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
  function renderTabs(list=cachedAssets){tabBox.replaceChildren(...tabs.map(t=>new Option(`${t} (${filtered(list,t).length})`,t,false,t===current)));tabBox.onchange=()=>{current=tabBox.value;loadAssets();};}
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
  async function submitUpload(form,isModel,e){e.preventDefault(); const submit=e.submitter; let landHeaders; try { landHeaders=window.MUZIKAZLandAccess.uploadHeaders(); } catch (error) { status.textContent=error.message; return; } Object.assign(auth,landHeaders); const progress=document.getElementById(isModel?'model-upload-progress':'graphic-upload-progress'); progress&&(progress.value=15); const fd=new FormData(), fields={}; [...form.querySelectorAll('input,textarea,select')].forEach(el=>{ if(el.type==='file'){[...(el.files||[])].forEach(f=>fd.append('file',f));} else if(el.type==='checkbox'){fd.append(el.name,el.checked?'true':'false');fields[el.name]=el.checked?'true':'false';} else if(el.name){fd.append(el.name,el.value);fields[el.name]=el.value;} }); fd.set('status',submit?.value||'draft'); fields.status=submit?.value||'draft'; status.textContent=isModel?'Processing model':'Uploading files…'; try{lastGraphic=await api(isModel?'/api/models/upload':'/api/assets/upload',{method:'POST',body:fd,headers:{}}); progress&&(progress.value=100); status.textContent= isModel?'Processing model complete. Submitted for approval.':'Upload complete. Thumbnail generated.'; await loadAssets();}catch(err){const files=[...form.querySelectorAll('input[type=file]')].flatMap(el=>[...(el.files||[])]); if(files.length){const local=await Promise.all(files.map(f=>fileToAsset(f,fields,isModel))); const list=[...local,...localAssets()]; saveLocalAssets(list); lastGraphic=local[0]; progress&&(progress.value=100); status.textContent='Server unavailable, so the upload was saved as a browser draft and all dashboard actions remain usable.'; await loadAssets();}else{progress&&(progress.value=0);status.textContent=err.message||'Upload failed';}}}
  document.getElementById('graphic-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,false,e));
  document.getElementById('model-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,true,e));
  document.getElementById('preview-model-upload')?.addEventListener('click',()=>{const f=document.querySelector('#model-upload-form input[type=file]')?.files[0], mv=document.getElementById('model-upload-preview'); if(f&&mv){mv.src=URL.createObjectURL(f);mv.hidden=false;status.textContent='Preview ready';}});
  document.getElementById('cancel-graphic-upload')?.addEventListener('click',()=>status.textContent='Upload canceled.');
  document.getElementById('retry-graphic-upload')?.addEventListener('click',()=>document.getElementById('graphic-upload-form')?.requestSubmit());
  document.getElementById('regenerate-derivatives')?.addEventListener('click',()=>{status.textContent='Derivative counts refreshed.';loadAssets();});
  document.querySelectorAll('[data-tab-jump]').forEach((button)=>button.addEventListener('click',()=>{current=button.dataset.tabJump||'My Uploads';renderTabs();loadAssets();document.getElementById(button.dataset.focusForm||'asset-status')?.scrollIntoView({behavior:'smooth',block:'center'});}));
  function filtered(list,label=current){return list.filter(a=> label==='My Uploads'||label==='Public Assets'&&a.visibility==='public'||label==='Pending Approval'&&a.status==='pending_review'||label==='Approved'&&['approved','published'].includes(a.status)||label==='Rejected'&&a.status==='rejected'||label==='Drafts'&&a.status==='draft'||label==='3D Models'&&a.fileType==='model'||label==='Images'&&a.fileType==='image'||label==='Thumbnails'&&a.intendedUse==='Model thumbnail'||label==='Store Tiles'&&a.intendedUse==='Marketplace tile'||label==='Product Previews'&&a.intendedUse==='Product preview'||label==='Archived'&&a.status==='archived');}
  async function loadAssets(){try{status.textContent='Loading assets…'; const list=[...(await api(current==='Public Assets'?'/api/assets/public':'/api/assets/mine')),...localAssets()]; cachedAssets=list; const view=filtered(list); renderTabs(list); grid.replaceChildren(...(view.length?view.map(card):[emptyCard(current)])); status.textContent=`${view.length} assets loaded for ${current}.`; updateAssetMetrics(list); renderAssignmentOptions(); }catch(e){const list=localAssets(); cachedAssets=list; const view=filtered(list); renderTabs(list); grid.replaceChildren(...(view.length?view.map(card):[emptyCard(current)])); status.textContent=list.length?`${view.length} browser draft assets loaded for ${current}. Start the server to sync.`:e.message; updateAssetMetrics(list); renderAssignmentOptions();}}
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
  const saleBody=document.getElementById('sales-table-body'), saleStatus=document.getElementById('sales-status');
  async function loadSales(){if(!saleBody)return; saleStatus.textContent='Loading sales from the payment database…';try{const orders=await api('/api/admin/sales');saleBody.replaceChildren(...orders.map(order=>{const row=document.createElement('tr');const items=order.fulfillment?.items||order.metadata?.items||[];const cells=[`${order.orderId}\n${new Date(order.createdAt).toLocaleString()}`,`${order.wallet||order.userId||'Not supplied'}\n${order.metadata?.receiptEmail||''}`,items.length?items.map(item=>`${item.name} × ${item.quantity}`).join('\n'):'No item snapshot',`${order.expectedAmount} ${order.paymentAsset}\n$${Number(order.basePrice).toFixed(2)} USD`,order.paymentStatus,order.transactionHash||'Awaiting transaction'];cells.forEach((value,index)=>{const cell=document.createElement('td');String(value).split('\n').forEach((line,lineIndex)=>{const element=document.createElement(lineIndex?'small':index===4?'strong':'span');element.textContent=line;if(index===4)element.className=`sale-status ${order.paymentStatus==='FULFILLED'?'is-fulfilled':''}`;cell.append(element);});row.append(cell);});return row;}));saleStatus.textContent=`${orders.length} payment record${orders.length===1?'':'s'} loaded. Fulfilled rows include the exact delivered item snapshot.`;}catch(error){saleStatus.textContent=error.message||'Sales could not be loaded.';}}
  document.getElementById('sales-refresh')?.addEventListener('click',loadSales);
  loadAssets(); metrics(); loadSales();
}
document.addEventListener('muzikaz:admin-authenticated', initAssetDashboard);

function initSupportChat() {
  if (document.querySelector('.support-chat')) return;
  const supportServiceUrl = 'https://muzikazmodelmarket.onrender.com';
  const userIdKey = 'muzikazSupportUserId';
  const userId = localStorage.getItem(userIdKey) || (crypto.randomUUID?.() || `guest-${Date.now()}`);
  localStorage.setItem(userIdKey, userId);
  const adminToken = sessionStorage.getItem('muzikazAdminToken') || '';
  const isAdmin = Boolean(adminToken);
  const name = localStorage.getItem('muzikazSupportName') || (isAdmin ? 'MUZIKAZ Support' : 'Guest');
  const root = document.createElement('aside');
  root.className = `support-chat${document.querySelector('[data-open-support-chat]') ? ' is-utility-linked' : ''}`;
  root.id = 'muzikaz-support-chat';
  root.innerHTML = `<button class="support-chat-toggle" type="button" aria-label="Open support chat" aria-expanded="false"><span aria-hidden="true">💬</span><b>Support</b><i hidden>0</i></button><section class="support-chat-panel" hidden aria-label="Live support chat"><header><div><strong>${isAdmin ? 'Support inbox' : 'MUZIKAZ Support'}</strong><small><span class="support-presence"></span><span class="support-connection">Connecting…</span></small></div><button class="support-chat-close" type="button" aria-label="Close support chat">×</button></header><label class="support-thread-picker" ${isAdmin ? '' : 'hidden'}>Conversation<select aria-label="Customer conversation"><option value="">Choose a customer</option></select></label><div class="support-messages" role="log" aria-live="polite" aria-relevant="additions"></div><p class="support-empty">${isAdmin ? 'New customer conversations will appear here.' : 'Hi! Send us a message and a logged-in admin will reply here.'}</p><form><label class="sr-only" for="support-message-input">Message</label><textarea id="support-message-input" maxlength="1000" rows="2" placeholder="Type your message…" required></textarea><button type="submit">Send</button></form></section>`;
  document.body.append(root);
  const toggle = root.querySelector('.support-chat-toggle'); const panel = root.querySelector('.support-chat-panel'); const close = root.querySelector('.support-chat-close');
  const log = root.querySelector('.support-messages'); const empty = root.querySelector('.support-empty'); const status = root.querySelector('.support-connection');
  const unread = toggle.querySelector('i'); const picker = root.querySelector('select'); const input = root.querySelector('textarea');
  let socket; let reconnectTimer; let unreadCount = 0; let selectedThread = ''; const messages = [];
  function setOpen(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); root.classList.toggle('is-open', open); if (open) { unreadCount = 0; unread.hidden = true; input.focus(); } }
  toggle.addEventListener('click', () => setOpen(panel.hidden)); close.addEventListener('click', () => setOpen(false));
  function visibleMessages() { return isAdmin ? messages.filter((item) => item.threadId === selectedThread) : messages; }
  function render() {
    const view = visibleMessages(); empty.hidden = view.length > 0; log.replaceChildren(...view.map((item) => { const article = document.createElement('article'); article.className = `support-message ${item.sender === (isAdmin ? 'admin' : 'user') ? 'is-mine' : ''}`; const meta = document.createElement('small'); meta.textContent = `${item.name} · ${new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; const copy = document.createElement('p'); copy.textContent = item.message; article.append(meta, copy); return article; })); log.scrollTop = log.scrollHeight;
  }
  function syncThreads() { if (!isAdmin) return; const current = picker.value; const threads = [...new Map(messages.map((item) => [item.threadId, item.sender === 'user' ? item.name : item.threadId])).entries()]; picker.replaceChildren(new Option('Choose a customer', ''), ...threads.map(([id, label]) => new Option(label || id, id))); picker.value = current || threads.at(-1)?.[0] || ''; selectedThread = picker.value; }
  picker.addEventListener('change', () => { selectedThread = picker.value; render(); });
  function connect() {
    const endpoint = new URL('/ws/support', supportServiceUrl); endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'; const query = new URLSearchParams({ userId, name }); if (adminToken) query.set('adminToken', adminToken); endpoint.search = query;
    socket = new WebSocket(endpoint);
    socket.addEventListener('open', () => { status.textContent = isAdmin ? 'Online as admin' : 'Support online'; root.classList.add('is-online'); });
    socket.addEventListener('message', ({ data }) => { const payload = JSON.parse(data); if (payload.type === 'history') messages.splice(0, messages.length, ...payload.messages); if (payload.type === 'message' && !messages.some((item) => item.id === payload.message.id)) { messages.push(payload.message); if (panel.hidden && payload.message.sender !== (isAdmin ? 'admin' : 'user')) { unreadCount += 1; unread.textContent = unreadCount; unread.hidden = false; } } syncThreads(); render(); });
    socket.addEventListener('close', () => { root.classList.remove('is-online'); status.textContent = 'Reconnecting…'; clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 2500); });
    socket.addEventListener('error', () => socket.close());
  }
  root.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); const message = input.value.trim(); if (!message || socket?.readyState !== WebSocket.OPEN) return; socket.send(JSON.stringify({ type: 'message', threadId: selectedThread, message })); input.value = ''; });
  connect();
}

initSupportChat();

function initSpaceBuilder() {
  const root = document.querySelector('#space-builder');
  if (!root) return;
  const catalog = [
    { id: 'neon-district', name: 'Neon District Full Map', type: 'Map', icon: '🗺️', cost: 80 },
    { id: 'haunted-studio', name: 'Haunted Studio Full Map', type: 'Map', icon: '🏚️', cost: 75 },
    { id: 'chaos-ape', name: 'Chaos Ape Avatar', type: 'Avatar', icon: '🐵', cost: 25 },
    { id: 'volt-runner', name: 'Volt Runner Avatar', type: 'Avatar', icon: '⚡', cost: 25 },
    { id: 'echo-ghost', name: 'Echo Ghost', type: 'Ghost', icon: '👻', cost: 18 },
    { id: 'bassline-phantom', name: 'Bassline Phantom', type: 'Ghost', icon: '👻', cost: 22 },
    { id: 'toxic-guard', name: 'Toxic Guard', type: 'Enemy', icon: '☣️', cost: 20 },
    { id: 'neon-drone', name: 'Neon Drone', type: 'Enemy', icon: '🤖', cost: 16 },
    { id: 'mzk-cache', name: 'MZK Reward Cache', type: 'Reward', icon: '💰', cost: 10 },
    { id: 'violet-bottle', name: 'Violet Bottle Reward', type: 'Reward', icon: '🧪', cost: 12 },
    { id: 'volt-blaster', name: 'Volt Blaster', type: 'Weapon', icon: '🔫', cost: 15 },
    { id: 'bass-sword', name: 'Bass Sword', type: 'Weapon', icon: '⚔️', cost: 15 },
    { id: 'health-pack', name: 'Health Pack', type: 'Item', icon: '❤️', cost: 6 },
    { id: 'builder-key', name: 'Builder Key', type: 'Item', icon: '🗝️', cost: 8 }
  ];
  const colors = { Map: '#9cff00', Avatar: '#69d8ff', Ghost: '#c895ff', Enemy: '#ff5d65', Reward: '#ffd24c', Weapon: '#ff8a3d', Item: '#f5f5f5' };
  const types = [...new Set(catalog.map((asset) => asset.type))];
  const owner = () => window.MZKWallet?.connectedAddress?.() || window.MZKWallet?.walletId?.() || 'guest-builder';
  const draftKey = () => `muzikaz.spaceBuilder.draft.${owner()}`;
  const publishedKey = 'muzikaz.spaceBuilder.published';
  const coinKey = () => `muzikaz.spaceBuilder.coins.${owner()}`;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let state = read(draftKey(), { id: crypto.randomUUID?.() || `space-${Date.now()}`, name: 'My MUZIKAZ Arena', enabledTypes: types, objects: [], spentMzk: 0, version: 0 });
  let coins = Number(localStorage.getItem(coinKey()) ?? 500);
  const toggles = root.querySelector('#space-type-toggles'); const select = root.querySelector('#space-asset-select'); const status = root.querySelector('#space-builder-status'); const name = root.querySelector('#space-builder-name');
  const save = () => { state.name = name.value.trim() || 'Untitled MUZIKAZ Space'; localStorage.setItem(draftKey(), JSON.stringify(state)); };
  const balance = () => Number(window.MZKWallet?.balance?.() || 0);
  function enabled() { return new Set([...toggles.querySelectorAll('input:checked')].map((input) => input.value)); }
  function renderCatalog() { const active = enabled(); state.enabledTypes = [...active]; const prior = select.value; select.replaceChildren(...catalog.filter((asset) => active.has(asset.type)).map((asset) => new Option(`${asset.icon} ${asset.name} · ${asset.cost} MZK`, asset.id))); if ([...select.options].some((option) => option.value === prior)) select.value = prior; save(); }
  function renderPublished() { const box = root.querySelector('#space-published-list'); const maps = read(publishedKey, []).filter((map) => map.owner === owner()); box.replaceChildren(...(maps.length ? maps.slice().reverse().map((map) => { const card = document.createElement('article'); card.className = 'published-space-card'; const title = document.createElement('h4'); title.textContent = map.name; const copy = document.createElement('p'); copy.textContent = `v${map.version} · ${map.objects.length} objects · ${map.publishCostCoins} Coins · ${new Date(map.publishedAt).toLocaleString()}`; const detail = document.createElement('small'); detail.textContent = [...new Set(map.objects.map((object) => object.type))].join(' · '); card.append(title, copy, detail); return card; }) : [Object.assign(document.createElement('p'), { textContent: 'No maps published from this browser yet.' })])); }
  function render() {
    name.value = state.name; root.querySelector('#space-builder-mzk').textContent = `${balance().toLocaleString()} MZK`; root.querySelector('#space-builder-coins').textContent = `${coins.toLocaleString()} Coins`;
    root.querySelector('#space-object-count').textContent = state.objects.length; root.querySelector('#space-build-cost').textContent = Number(state.spentMzk || 0).toLocaleString();
    const stage = root.querySelector('#space-map-stage'); stage.replaceChildren(...(state.objects.length ? state.objects.map((object) => { const tile = document.createElement('article'); tile.className = 'space-map-object'; tile.style.setProperty('--asset-color', colors[object.type]); const icon = document.createElement('i'); icon.textContent = object.icon; const label = document.createElement('strong'); label.textContent = object.name; const kind = document.createElement('small'); kind.textContent = `${object.type} · spawn ${object.spawnOrder}`; tile.append(icon, label, kind); return tile; }) : [Object.assign(document.createElement('span'), { className: 'space-map-empty', textContent: 'Your map is ready for its first spawn.' })]));
    const list = root.querySelector('#space-loadout-list'); list.replaceChildren(...(state.objects.length ? state.objects.map((object) => { const row = document.createElement('li'); const label = document.createElement('span'); label.textContent = `${object.icon} ${object.name}`; const meta = document.createElement('small'); meta.textContent = `${object.type} · ${object.cost} MZK`; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ghost'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${object.name}`); remove.onclick = () => { state.objects = state.objects.filter((item) => item.instanceId !== object.instanceId).map((item, index) => ({ ...item, spawnOrder: index + 1 })); save(); render(); status.textContent = `${object.name} removed from this layout. Its settled MZK addition remains in the wallet ledger.`; }; row.append(label, meta, remove); return row; }) : [Object.assign(document.createElement('li'), { textContent: 'No assets added yet.' })])); renderPublished();
  }
  toggles.replaceChildren(...types.map((type) => { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = type; input.checked = state.enabledTypes?.includes(type) !== false; input.addEventListener('change', renderCatalog); label.append(input, document.createTextNode(type)); return label; }));
  renderCatalog(); render();
  root.querySelector('#space-add-asset').addEventListener('click', async () => { const asset = catalog.find((item) => item.id === select.value); if (!asset) return; const requestId = `space-add:${state.id}:${crypto.randomUUID?.() || Date.now()}`; const payment = await window.MZKWallet?.spendAsync?.(asset.cost, `Game space addition · ${asset.name}`, requestId, { spaceId: state.id, assetId: asset.id, assetType: asset.type }); if (!payment?.ok) { status.textContent = `You need ${Math.max(0, asset.cost - balance())} more MZK to add ${asset.name}. Connect or fund your wallet, then retry.`; return render(); } state.objects.push({ ...asset, instanceId: requestId, spawnOrder: state.objects.length + 1, addedAt: new Date().toISOString() }); state.spentMzk = Number(state.spentMzk || 0) + asset.cost; save(); render(); status.textContent = `${asset.name} added to the gameplay loadout for ${asset.cost} MZK.`; });
  name.addEventListener('change', save);
  root.querySelector('#space-save-draft').addEventListener('click', () => { save(); status.textContent = 'Draft saved to this wallet profile. No additional tokens or coins were used.'; });
  function manifest(published = false) { save(); return { schema: 'muzikaz-game-space-v1', id: state.id, owner: owner(), name: state.name, version: state.version + (published ? 1 : 0), status: published ? 'published' : 'draft', enabledTypes: state.enabledTypes, spentMzk: state.spentMzk, publishCostCoins: published ? 100 : 0, objects: state.objects, updatedAt: new Date().toISOString() }; }
  root.querySelector('#space-export-map').addEventListener('click', () => { const data = manifest(); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); link.download = `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'muzikaz-space'}.json`; link.click(); URL.revokeObjectURL(link.href); status.textContent = 'Versioned game manifest exported for engine loadout use.'; });
  root.querySelector('#space-publish-map').addEventListener('click', () => { if (!state.objects.length) { status.textContent = 'Add at least one gameplay asset before publishing.'; return; } if (coins < 100) { status.textContent = `You need ${100 - coins} more Builder Coins to publish this map.`; return; } const map = manifest(true); coins -= 100; localStorage.setItem(coinKey(), String(coins)); localStorage.setItem(publishedKey, JSON.stringify([...read(publishedKey, []), { ...map, publishedAt: new Date().toISOString() }])); state.version = map.version; save(); render(); status.textContent = `${map.name} v${map.version} published. 100 Builder Coins settled; ${map.objects.length} objects are ready for gameplay.`; });
  window.addEventListener('mzk:wallet-updated', render);
}

initSpaceBuilder();
