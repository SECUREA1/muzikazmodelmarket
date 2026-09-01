import { access, readFile } from 'node:fs/promises';

const htmlPages = ['index.html', 'model-market.html', 'avatar-whitepaper.html', 'index0.html', 'index1.html', 'members.html', 'originals.html', 'legends.html', 'beasts.html', 'crew-market.html', 'chaos.html', 'brand-kit.html', 'new-legends.html', 'trait-avatars.html', 'online-events.html', 'checkout.html', 'model-explorer.html', 'token-mixer.html', 'voice-changer.html', 'quest-board.html'];
const requiredFiles = [
  ...htmlPages.map((page) => `dist/${page}`),
  'dist/styles.css',
  'dist/script.js',
  'dist/battle-theme.js',
  'dist/backpack-widget.js',
  'dist/backpack-widget.css',
  'dist/admin.html',
  'dist/admin.js',
  'dist/public/js/rad-tox-launcher.js',
  'dist/reference.png',
];

await Promise.all(requiredFiles.map((file) => access(file)));

const backpackPages = ['avatar-whitepaper.html', 'beasts.html', 'brand-kit.html', 'buy-mzk.html', 'chaines-ar-collectibles.html', 'chaos.html', 'checkout.html', 'crew-market.html', 'index.html', 'index0.html', 'index1.html', 'legends.html', 'login.html', 'members.html', 'model-explorer.html', 'model-market.html', 'new-legends.html', 'online-events.html', 'originals.html', 'quest-board.html', 'token-mixer.html', 'trait-avatars.html', 'voice-changer.html'];
for (const page of backpackPages) {
  const html = await readFile(`dist/${page}`, 'utf8');
  if (!html.includes('mzk-wallet.js') || !html.includes('backpack-widget.js')) throw new Error(`${page} must expose the Ethereum wallet and Backpack controls.`);
}
const backpackWidget = await readFile('dist/backpack-widget.js', 'utf8');
const serverSource = await readFile('server.mjs', 'utf8');

// The compact mobile header intentionally exposes every SVG destination without
// a second hamburger menu. Keep all participating pages in sync with that
// always-visible, keyboard- and screen-reader-accessible navigation contract.
const mobileHeaderPages = ['avatar-whitepaper.html', 'buy-mzk.html', 'checkout.html', 'index.html', 'members.html', 'model-market.html'];
for (const page of mobileHeaderPages) {
  const html = await readFile(`dist/${page}`, 'utf8');
  const navigation = html.match(/<nav class="nav global-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const navIconCount = (navigation.match(/<svg class="nav-icon"/g) || []).length;
  if (!navigation.includes('aria-hidden="false"')) throw new Error(`${page} must expose the complete mobile navigation to assistive technology.`);
  if (navIconCount !== 9) throw new Error(`${page} must show all 9 SVG mobile navigation destinations; found ${navIconCount}.`);
  if (html.includes('class="menu-toggle"')) throw new Error(`${page} must not hide its mobile SVG navigation behind a hamburger menu.`);
}

for (const feature of ['eth_chainId', 'X-Wallet-Address', '/api/wallet/state', 'data-open-backpack', 'Trade market', 'Buy / swap MZK']) {
  if (!backpackWidget.includes(feature)) throw new Error(`The global Ethereum Backpack is missing ${feature}.`);
}
for (const utilityFeature of ['Support', 'data-open-support-chat', 'Admin login', 'data-global-admin-form', '/api/admin/login']) {
  if (!backpackWidget.includes(utilityFeature)) throw new Error(`The global page utility bar is missing ${utilityFeature}.`);
}
for (const adminHandoffFeature of ["sessionStorage.getItem('muzikazAdminToken')", "window.location.href = 'admin.html'"]) {
  if (!backpackWidget.includes(adminHandoffFeature)) throw new Error(`The global admin control is missing its authenticated command-center handoff: ${adminHandoffFeature}.`);
}
if (!backpackWidget.includes("get('admin') === 'login'")) throw new Error('The global admin login must reopen when the command center redirects an unauthenticated visitor.');
const adminHtml = await readFile('dist/admin.html', 'utf8');
const adminScript = await readFile('dist/admin.js', 'utf8');
if (adminHtml.includes('Authorized personnel only') || adminHtml.includes('id="login-form"')) throw new Error('admin.html must not show a second administrator login.');
for (const handoffFeature of ["window.location.replace('index.html?admin=login')", 'token() ? showDashboard() : returnToLogin()']) {
  if (!adminScript.includes(handoffFeature)) throw new Error(`The command center is missing its single-login handoff: ${handoffFeature}.`);
}
const supportScript = await readFile('dist/script.js', 'utf8');
for (const supportFeature of ['https://muzikazmodelmarket.onrender.com', "new URL('/ws/support', supportServiceUrl)", "root.id = 'muzikaz-support-chat'"]) {
  if (!supportScript.includes(supportFeature)) throw new Error(`The support chat is missing its Render service connection: ${supportFeature}`);
}

const excludedBuildDirectories = ['scripts', 'node_modules', 'muzikaz_rust_render_app', 'muzikaz_github_website', 'uploads', 'data'];
for (const directory of excludedBuildDirectories) {
  try {
    await access(`dist/${directory}`);
    throw new Error(`dist/${directory} should not be copied into the optimized static build.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

for (const page of htmlPages) {
  const html = await readFile(`dist/${page}`, 'utf8');
  const requiredAssets = page === 'token-mixer.html' ? ['styles.css', 'audio-core.js', 'token-mixer.js', 'battle-theme.js'] : page === 'voice-changer.html' ? ['styles.css', 'audio-core.js', 'voice-changer.js', 'battle-theme.js'] : page === 'quest-board.html' ? ['styles.css', 'audio-core.js', 'quest-board.js', 'battle-theme.js'] : ['styles.css', 'script.js', 'battle-theme.js'];

  for (const asset of requiredAssets) {
    if (!html.includes(asset)) {
      throw new Error(`${page} does not reference ${asset}`);
    }
  }
}

const mainHtml = await readFile('dist/index.html', 'utf8');
for (const githubSetting of ['name="muzikaz-github-repository" content="SECUREA1/muzikazmodelmarket"', 'name="muzikaz-github-branch" content="main"']) {
  if (!mainHtml.includes(githubSetting)) {
    throw new Error(`index.html must configure repository GLB discovery: missing ${githubSetting}`);
  }
}
if (!mainHtml.includes('public/js/rad-tox-launcher.js')) {
  throw new Error('index.html must load the RAD-TOX 3D launcher.');
}
if (!mainHtml.includes('href="avatar-whitepaper.html"')) {
  throw new Error('The main page must link directly to the avatar whitepaper.');
}
for (const walletBrandMarker of ['id="wallet-connect"', 'muzikaz_bolt_logo_editable.svg', 'public/assets/muzikaz-world-logo.svg']) {
  if (!mainHtml.includes(walletBrandMarker)) throw new Error(`The app header is missing wallet or official-logo branding: ${walletBrandMarker}`);
}

for (const requiredGameMarkup of ['id="house-game-start"', 'data-house-start', 'Begin Game', 'game-loading-indicator']) {
  if (!mainHtml.includes(requiredGameMarkup)) {
    throw new Error(`index.html is missing RAD-TOX launch markup: ${requiredGameMarkup}`);
  }
}
for (const requiredToolsMarkup of ['id="house-tools"', 'data-house-tools', 'aria-controls="rad-tox-tools"', 'aria-haspopup="dialog"']) {
  if (!mainHtml.includes(requiredToolsMarkup)) {
    throw new Error(`index.html is missing the persistent RAD-TOX tools control: ${requiredToolsMarkup}`);
  }
}

const launcher = await readFile('dist/public/js/rad-tox-launcher.js', 'utf8');
for (const removed2dFeature of ['startCompatibility', 'rad-tox-compat-game', 'data-radtox-compat']) {
  if (launcher.includes(removed2dFeature)) {
    throw new Error(`RAD-TOX launcher must not populate the removed 2D game: ${removed2dFeature}`);
  }
}
if (!launcher.includes('if (requested) return') || !launcher.includes("{ once: true }")) throw new Error('RAD-TOX launcher must guard against duplicate initialization and listeners.');
if (launcher.includes('data-radtox-retry') || launcher.includes('supportsModern')) throw new Error('RAD-TOX launcher must not add recovery or compatibility gates.');

if (mainHtml.includes('<script type="module" src="public/js/house-explorer-glb.js"></script>')) {
  throw new Error('index.html must defer the large House Explorer module until the player starts RAD-TOX.');
}
if (!launcher.includes("module.src = 'public/js/house-explorer-glb.js'") || !launcher.includes('function begin()')) {
  throw new Error('RAD-TOX launcher must load the House Explorer module only after a start request.');
}

const backpackCatalog = JSON.parse(await readFile('dist/public/models/backpack-assets.json', 'utf8'));
const landSpaces = JSON.parse(await readFile('dist/public/models/land-spaces.json', 'utf8'));
if (backpackCatalog.correlation?.dropPolicy !== 'profile-backpack-space-pixel-required') throw new Error('Drop Backpack must declare the profile/space/pixel correlation policy.');
if (landSpaces.spaces?.length !== 8 || landSpaces.spaces.some((space) => !space.profileId || !space.backpackId || !Number.isFinite(space.pixel?.x) || !Number.isFinite(space.pixel?.y))) throw new Error('Every fixed map pin must expose a correlated profile, backpack, space, and pixel.');
if (!landSpaces.spaces.some((space) => space.homeBase && space.pinOrder === 0)) throw new Error('Pinned spaces must list the profile home base first.');
const backpackTypes = new Set((backpackCatalog.assets || []).map((asset) => asset.type));
for (const type of ['avatars', 'lands', 'props', 'wearables', 'pets', 'vehicles']) {
  if (!backpackTypes.has(type)) throw new Error(`Drop Backpack catalog is missing public ${type}.`);
  await access(`dist/public/models/backpack/${type}.json`);
}
if (!mainHtml.includes('<span>Backpack</span>')) throw new Error('The game must expose a Backpack button instead of the old Avatar button.');

const houseExplorer = await readFile('dist/public/js/house-explorer-glb.js', 'utf8');
if (houseExplorer.includes('backpack-asset-model') || /backpackAssetVisual[\s\S]{0,800}<model-viewer/.test(houseExplorer)) {
  throw new Error('Drop Backpack previews must not create model-viewer WebGL renderers inside the running game.');
}
for (const requiredBackpackFeature of ['backpackAssets', 'BACKPACK_CATEGORIES', 'designateAvatar', 'popBackpackAsset', 'data-backpack-category']) {
  if (!houseExplorer.includes(requiredBackpackFeature)) throw new Error(`GLB House Explorer is missing Drop Backpack behavior: ${requiredBackpackFeature}`);
}
for (const requiredCorrelationFeature of ['correlatedLandDrop', 'muzikazPermanentLandObjects', 'mapPixel', 'Drop blocked:']) {
  if (!houseExplorer.includes(requiredCorrelationFeature)) throw new Error(`Permanent game drops are missing correlation enforcement: ${requiredCorrelationFeature}`);
}
for (const requiredPetFeature of ['BACKPACK_ICONS', 'choosePetDestination', 'updateTravelingPet', 'petTravel', 'liveAvatarRoots.values()']) {
  if (!houseExplorer.includes(requiredPetFeature)) throw new Error(`Drop Backpack pets are missing icons or autonomous visits: ${requiredPetFeature}`);
}
for (const requiredLiveFeature of ['MUZIKAZ_LIVE_PLAYERS', 'syncLiveAvatars', 'pollLiveAvatars', 'Live_player_label']) {
  if (!houseExplorer.includes(requiredLiveFeature)) throw new Error(`GLB House Explorer is missing live cross-device avatars/chat: ${requiredLiveFeature}`);
}
for (const requiredAvatarIdentityFeature of ['liveAvatarIdentity', 'root.userData.avatarIdentity !== identity', 'hasAvatarIdentity', 'MUZIKAZ_SHARED_AVATAR_API']) {
  if (!houseExplorer.includes(requiredAvatarIdentityFeature)) throw new Error(`Live players must use and refresh their designated avatar: ${requiredAvatarIdentityFeature}`);
}
const cribMultiplayer = await readFile('dist/public/js/crib-multiplayer.js', 'utf8');
if (!cribMultiplayer.includes('avatarUrl: avatar.modelUrl') || !cribMultiplayer.includes('modelUrl: avatar.modelUrl')) {
  throw new Error('Crib presence must publish each designated GLB avatar URL.');
}
const server = await readFile('server.mjs', 'utf8');
if (!server.includes('avatarAssetId: asset.id, modelUrl: asset.modelUrl')) {
  throw new Error('The live presence server must publish its validated profile avatar instead of a client fallback.');
}
if (houseExplorer.includes('await this.initAudio()')) {
  throw new Error('RAD-TOX startup must not wait for iOS Web Audio resume permission.');
}
for (const requiredGameFeature of ["['toxic',toxicTarget]", "['ghost',ghostTarget]", 'this.spawnSnakes()', "controller.userData.handedness === 'left'", "Weapons','Laser · Paint gun · Baseball bat · Taser · Toxins Thrower (5 MZK/burst)", 'webXrAvailable', "isSessionSupported('immersive-vr')", 'createXRAimRay()', 'teleportFromController(controller)', 'camera.position.set(0, 0, 0)']) {
  if (!houseExplorer.includes(requiredGameFeature)) {
    throw new Error(`RAD-TOX is missing its required mixed-level or always-on controls feature: ${requiredGameFeature}`);
  }
}
for (const requiredToxinFeature of ["data-rad-tool=\"toxin\"", 'createToxinModel()', 'fireToxin(', 'toxinRange: 8.5', 'toxinCost: 5', 'wallet.spend']) {
  if (!houseExplorer.includes(requiredToxinFeature)) {
    throw new Error(`RAD-TOX is missing its illuminated MZK toxins thrower feature: ${requiredToxinFeature}`);
  }
}
for (const requiredBossFeature of ['AirborneHoneyBee', 'bossConfigForLevel()', 'spawnEndBoss()', 'completeLevelIfReady()', 'All other targets cleared', 'takeDamage(1)']) {
  if (!houseExplorer.includes(requiredBossFeature)) {
    throw new Error(`RAD-TOX is missing its required end-boss feature: ${requiredBossFeature}`);
  }
}

const bosses = await readFile('dist/public/js/enemies/airborne-honey-bee.js', 'utf8');
for (const requiredBossConfig of ["maxHealth:20", "id:'bee'", "id:'aape'", "id:'beeduck'"]) {
  if (!bosses.includes(requiredBossConfig)) {
    throw new Error(`RAD-TOX boss configuration is missing ${requiredBossConfig}`);
  }
}

if (houseExplorer.includes('data-rad-pause') || houseExplorer.includes('RAD_TOX_STATES.PAUSED')) {
  throw new Error('RAD-TOX must not expose or enter a paused state.');
}

for (const requiredHudFeature of ['data-rad-row-toggle', 'data-rad-tools-toggle', 'muzikazRadToxHiddenRows']) {
  if (!houseExplorer.includes(requiredHudFeature)) {
    throw new Error(`RAD-TOX must provide persistent, per-row HUD controls: missing ${requiredHudFeature}`);
  }
}

for (const requiredUpdateCheck of ['checkForHouseUpdates', 'Promise.allSettled([refreshLibrary(), refreshAvatarLibrary()])', 'checkForHouseUpdates({ startup: true })', 'fetchGitHubGlbFiles', 'mergeGitHubAvatarFiles']) {
  if (!houseExplorer.includes(requiredUpdateCheck)) {
    throw new Error(`House Explorer must check for new maps and avatars on startup: missing ${requiredUpdateCheck}`);
  }
}

const githubDiscovery = await readFile('dist/public/js/github-glb-discovery.js', 'utf8');
for (const requiredDiscoveryFeature of ['api.github.com', 'raw.githubusercontent.com', 'mergeGitHubEnvironmentFiles', 'public/models/environments/']) {
  if (!githubDiscovery.includes(requiredDiscoveryFeature)) {
    throw new Error(`GitHub GLB discovery module is missing ${requiredDiscoveryFeature}`);
  }
}

for (const id of ['model-detail', 'marketplace-preview', 'merch', 'bottle-login-preview']) {
  if (!mainHtml.includes(`id="${id}"`)) {
    throw new Error(`index.html is missing public section #${id}`);
  }
}

const modelMarketHtml = await readFile('dist/model-market.html', 'utf8');
const avatarWhitepaper = await readFile('dist/avatar-whitepaper.html', 'utf8');
for (const requiredWhitepaperSection of ['id="identity-model"', 'id="ownership"', 'id="gameplay-state"', 'id="creator-standard"', 'public/models/avatar-schema.json']) {
  if (!avatarWhitepaper.includes(requiredWhitepaperSection)) throw new Error(`avatar-whitepaper.html is missing architecture content: ${requiredWhitepaperSection}`);
}
if (!modelMarketHtml.includes('href="avatar-whitepaper.html"')) throw new Error('Model Market must link to the avatar whitepaper.');
for (const requiredStarterLandCopy of ['MUZIKAZ WORLD · starter land', 'Claim one of five spaces. Connect to the whole world.', 'Claim starter land</span><strong>4,000 <small>MZK</small>']) {
  if (!modelMarketHtml.includes(requiredStarterLandCopy)) throw new Error(`Model Market is missing connected starter-land branding: ${requiredStarterLandCopy}`);
}
for (const requiredGateMarkup of ['id="model-market-cover"', 'id="model-market-login-form"', 'model-market-gated']) {
  if (!modelMarketHtml.includes(requiredGateMarkup)) {
    throw new Error(`model-market.html is missing its Bottle member cover: ${requiredGateMarkup}`);
  }
}
const membersHtml = await readFile('dist/members.html', 'utf8');
const mzkWallet = await readFile('dist/mzk-wallet.js', 'utf8');
if (!mzkWallet.includes('const GAME_ENTRY_MZK = 4000')) throw new Error('Starter land and Builder Loadout must cost exactly 4,000 MZK.');
for (const page of ['index.html', 'model-market.html', 'model-explorer.html', 'buy-mzk.html']) {
  const html = await readFile(`dist/${page}`, 'utf8');
  if (!html.includes('4,000 MZK')) throw new Error(`${page} must display the 4,000 MZK starter-land price.`);
}
for (const id of ['bottle-login', 'designer', 'ar-viewer', 'admin', 'marketplace']) {
  if (!membersHtml.includes(`id="${id}"`)) {
    throw new Error(`members.html is missing subscriber section #${id}`);
  }
}
for (const requiredLoginGate of ['id="member-locked-content" data-locked="true" hidden', 'id="bottle-wallet-connect"', 'id="bottle-wallet-mint"', 'id="meknx-wallet-entry"', 'name="muzikaz-bottle-contract"']) {
  if (!membersHtml.includes(requiredLoginGate)) {
    throw new Error(`members.html is missing its Bottle-only login gate: ${requiredLoginGate}`);
  }
}
if (!membersHtml.includes('name="muzikaz-bottle-contract" content="0x0F1254772810EA4D06E5c61E3E4b54d740367Aa8"')) {
  throw new Error('members.html must use the approved MUZIKAZ Bottle access contract.');
}
for (const walletIdentityFeature of ['id="wallet-username"', 'id="wallet-json-download"', 'id="wallet-json-import"']) {
  if (!membersHtml.includes(walletIdentityFeature)) throw new Error(`members.html is missing wallet identity control: ${walletIdentityFeature}`);
}
for (const walletBindingFeature of ['connectIdentity', 'setUsername', 'exportWallet', 'importWallet']) {
  if (!mzkWallet.includes(walletBindingFeature)) throw new Error(`mzk-wallet.js is missing wallet binding feature: ${walletBindingFeature}`);
}
for (const walletConnectFeature of ['connectBrowserWallet', 'disconnectBrowserWallet', 'eth_requestAccounts', 'mzk:wallet-connection-changed']) {
  if (!mzkWallet.includes(walletConnectFeature)) throw new Error(`The app wallet control is missing ${walletConnectFeature}.`);
}

if (!membersHtml.includes('name="muzikaz-bottle-approved-contract" content="0xEf74118D5fB730E9B2729c7303DC29980b4771f0"')) {
  throw new Error('members.html must include the additional approved Bottle access-token contract.');
}
if (membersHtml.includes('public/js/avatar-selection.js')) {
  throw new Error('members.html must not require avatar selection before Bottle login.');
}

const checkoutHtml = await readFile('dist/checkout.html', 'utf8');
for (const id of ['payment-form', 'checkout-items', 'confirmation-panel']) {
  if (!checkoutHtml.includes(`id="${id}"`)) {
    throw new Error(`checkout.html is missing checkout section #${id}`);
  }
}
for (const requiredPaymentCheckout of ['muzikaz-payment-checkout', 'payment-config.js', 'wallet-payments.js', 'product-type="MARKETPLACE"']) {
  if (!checkoutHtml.includes(requiredPaymentCheckout)) throw new Error(`checkout.html is missing unified payment checkout marker ${requiredPaymentCheckout}`);
}
for (const requiredWalletClaimMarker of ['checkout-backpack-owner', 'checkout-wallet-owner', 'share-personal-information']) {
  if (!checkoutHtml.includes(requiredWalletClaimMarker)) throw new Error(`checkout.html is missing wallet-to-Backpack claim marker ${requiredWalletClaimMarker}`);
}
for (const prohibitedPersonalField of ['autocomplete="name"', 'autocomplete="street-address"', 'autocomplete="address-level2"', 'autocomplete="address-level1"', 'autocomplete="postal-code"']) {
  if (checkoutHtml.includes(prohibitedPersonalField)) throw new Error(`Crypto checkout must not collect personal field ${prohibitedPersonalField}`);
}
for (const removedCardField of ['autocomplete="cc-number"', 'autocomplete="cc-name"', 'autocomplete="cc-exp"', 'autocomplete="cc-csc"']) {
  if (checkoutHtml.includes(removedCardField)) throw new Error(`checkout.html must not collect removed credit-card field ${removedCardField}`);
}

const css = await readFile('dist/styles.css', 'utf8');
if (!css.includes("url('reference.png')")) {
  throw new Error('styles.css does not reference the hero artwork.');
}

console.log('Static build output contains all public and member pages with required references.');

for (const requiredAdminMarkup of ['id="admin-login-form"', 'name="username"', 'name="password"', 'data-asset-dashboard hidden']) {
  if (!membersHtml.includes(requiredAdminMarkup)) {
    throw new Error(`members.html is missing protected-admin markup: ${requiredAdminMarkup}`);
  }
}
const appScript = await readFile('dist/script.js', 'utf8');
if (!appScript.includes('initModelMarketGate') || !appScript.includes("sessionStorage.setItem('muzikazBottleMember', 'true')")) {
  throw new Error('The Model Market cover must share the verified members-area Bottle login session.');
}
for (const requiredBottleAccessFlow of ['eth_requestAccounts', 'eth_call', 'eth_sendTransaction', 'eth_getTransactionReceipt', 'validateBottleOwnership', 'BOTTLE_BALANCE_OF_SELECTOR']) {
  if (!appScript.includes(requiredBottleAccessFlow)) {
    throw new Error(`script.js is missing Bottle mint/validation access flow: ${requiredBottleAccessFlow}`);
  }
}
for (const requiredMarketPaymentFlow of ['MuzikazPaymentConfig', 'MARKET_ITEM_PRICE_WEI', 'marketPaymentConfig', 'wallet_revokePermissions']) {
  if (!appScript.includes(requiredMarketPaymentFlow)) throw new Error(`script.js is missing marketplace checkout behavior ${requiredMarketPaymentFlow}`);
}
for (const requiredModelDeliveryFlow of ['muzikazBackpackAssetsV1', 'normalizeDeliverable', 'Exact GLB delivered to Backpack', 'item.deliverable?.modelUrl']) {
  if (!appScript.includes(requiredModelDeliveryFlow)) throw new Error(`script.js is missing exact purchased-model delivery behavior ${requiredModelDeliveryFlow}`);
}
for (const requiredBackpackModelFlow of ['muzikazBackpackAssetsV1', 'localModelAssets', '<model-viewer']) {
  if (!backpackWidget.includes(requiredBackpackModelFlow)) throw new Error(`Backpack widget is missing purchased GLB rendering behavior ${requiredBackpackModelFlow}`);
}
for (const requiredMintReward of ['BACKPACK_LOADOUT_USD = 30', 'Unrevealed MUZIKAZ Land', 'Violet Wish Bottle', 'grantBottleMintBackpackAssets']) {
  if (!appScript.includes(requiredMintReward)) throw new Error(`Bottle mint activation is missing its required payment or Backpack reward: ${requiredMintReward}`);
}
for (const requiredLoadoutCopy of ['$30 USD · Live ETH quote', 'Minting is optional', 'Continue to Creator Tools', 'MZK Access Code', 'Open My Account', 'One account. One code. Any device.']) {
  if (!membersHtml.includes(requiredLoadoutCopy)) throw new Error(`members.html is missing $30 Loadout or Magic Bottle guidance: ${requiredLoadoutCopy}`);
}
for (const requiredLoadoutFlow of ['Builder drop · optional mint', 'Violet Wish Bottle', 'Unlock loadout &amp; pay with ETH', 'id="bottle-continue"', 'data-purchase-step="payment"']) {
  if (!membersHtml.includes(requiredLoadoutFlow)) throw new Error(`members.html is missing the ordered Purple Bottle loadout flow: ${requiredLoadoutFlow}`);
}
if (!appScript.includes('config.approvedContracts') || !appScript.includes('MUZIKAZ_BOTTLE_APPROVED_CONTRACTS')) {
  throw new Error('script.js must validate ownership across all approved Bottle contracts.');
}
for (const requiredAdminFlow of ["/api/admin/login", "muzikazAdminToken", "x-admin-token", "muzikaz:admin-authenticated"]) {
  if (!appScript.includes(requiredAdminFlow)) {
    throw new Error(`script.js is missing protected-admin flow: ${requiredAdminFlow}`);
  }
}
if (!serverSource.includes("process.env.MUZIKAZ_ADMIN_USERNAME || 'giraff'") || !serverSource.includes("process.env.MUZIKAZ_ADMIN_PASSWORD || 'boots'")) {
  throw new Error('The configured giraff administrator credentials are not connected to the server login.');
}

const apiConnection = await readFile('dist/public/js/api-connection.js', 'utf8');
for (const requiredCompatibilityFeature of ['MUZIKAZ_API_BASE', 'MUZIKAZ_SHARED_AVATAR_API', "request.mode = 'cors'", 'Promise.race', "data-api-connected"]) {
  if (!apiConnection.includes(requiredCompatibilityFeature)) {
    throw new Error(`Cross-browser API connection is missing ${requiredCompatibilityFeature}`);
  }
}
const modelExplorerHtml = await readFile('dist/model-explorer.html', 'utf8');
if (!mainHtml.includes('public/js/api-connection.js') || !modelExplorerHtml.includes('public/js/api-connection.js') || !membersHtml.includes('public/js/api-connection.js')) {
  throw new Error('Every game and avatar entry point must initialize its cross-browser API connection.');
}
for (const page of [['index.html', mainHtml], ['model-market.html', modelMarketHtml], ['model-explorer.html', modelExplorerHtml]]) {
  for (const gameControl of ['data-house-start', 'data-house-tools', 'aria-controls="rad-tox-tools"']) {
    if (!page[1].includes(gameControl)) throw new Error(`${page[0]} is missing the shared ${gameControl} game control.`);
  }
}
