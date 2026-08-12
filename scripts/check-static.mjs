import { access, readFile } from 'node:fs/promises';

const htmlPages = ['index.html', 'model-market.html', 'index0.html', 'index1.html', 'members.html', 'originals.html', 'legends.html', 'beasts.html', 'crew-market.html', 'chaos.html', 'brand-kit.html', 'new-legends.html', 'trait-avatars.html', 'online-events.html', 'checkout.html', 'model-explorer.html', 'token-mixer.html', 'voice-changer.html', 'quest-board.html'];
const requiredFiles = [
  ...htmlPages.map((page) => `dist/${page}`),
  'dist/styles.css',
  'dist/script.js',
  'dist/battle-theme.js',
  'dist/public/js/rad-tox-launcher.js',
  'dist/reference.png',
];

await Promise.all(requiredFiles.map((file) => access(file)));

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
const explorerHtml = await readFile('dist/model-explorer.html', 'utf8');
for (const requiredArGloveMarkup of ['id="ar-glove-toggle"', 'id="ar-glove-layer"', 'id="ar-glove-frame"', 'public/js/ar-experience.js']) {
  if (!explorerHtml.includes(requiredArGloveMarkup)) throw new Error(`model-explorer.html is missing the AR glove integration: ${requiredArGloveMarkup}`);
}
const arExperience = await readFile('dist/public/js/ar-experience.js', 'utf8');
for (const requiredArBehavior of ['ioncore_radtox_mediapipe_ar_glove.html', 'xr-spatial-tracking', 'webxr scene-viewer quick-look', 'slot="ar-button"', 'muzikaz:open-ar-glove', 'MediaPipe glove and fire slime']) {
  if (!explorerHtml.includes(requiredArBehavior) && !arExperience.includes(requiredArBehavior)) throw new Error(`AR experience is missing required behavior: ${requiredArBehavior}`);
}
for (const githubSetting of ['name="muzikaz-github-repository" content="SECUREA1/muzikazmodelmarket"', 'name="muzikaz-github-branch" content="main"']) {
  if (!mainHtml.includes(githubSetting)) {
    throw new Error(`index.html must configure repository GLB discovery: missing ${githubSetting}`);
  }
}
if (!mainHtml.includes('public/js/rad-tox-launcher.js')) {
  throw new Error('index.html must load the RAD-TOX 3D launcher.');
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
for (const requiredGameFeature of ["['toxic',toxicTarget]", "['ghost',ghostTarget]", 'this.spawnSnakes()', "controller.userData.handedness === 'left'", "Weapons','Laser · Paint gun · Baseball bat · Taser · Toxins Thrower (5 MZK/burst)", 'webXrAvailable', "isSessionSupported('immersive-vr')", "isSessionSupported('immersive-ar')", 'ARButton.createButton', "environmentBlendMode !== 'opaque'", 'createXRAimRay()', 'teleportFromController(controller)', 'camera.position.set(0, 0, 0)']) {
  if (!houseExplorer.includes(requiredGameFeature)) {
    throw new Error(`RAD-TOX is missing its required mixed-level or always-on controls feature: ${requiredGameFeature}`);
  }
}
for (const requiredXrealFeature of ['renderer.xr.getHand(i)', "hand.joints?.['thumb-tip']", "hand.joints?.['index-finger-tip']", 'updateXRHandGestures()', "optionalFeatures: ['local-floor', 'bounded-floor', 'dom-overlay', 'hand-tracking']"]) {
  if (!houseExplorer.includes(requiredXrealFeature)) throw new Error(`XREAL browser hand controls are missing: ${requiredXrealFeature}`);
}
const xrealPlay = await readFile('dist/public/js/xreal-play.js', 'utf8');
for (const requiredLauncherFeature of ['browserGameUrl', 'https://www.xreal.com/app/', 'XREAL|Nebula', 'ioncore_radtox_multiplatform_ar.html?xreal=1&autostart=1', 'Start RAD-TOX']) {
  if (!xrealPlay.includes(requiredLauncherFeature)) throw new Error(`XREAL Play launcher is missing: ${requiredLauncherFeature}`);
}
const spatialGame = await readFile('dist/ioncore_radtox_multiplatform_ar.html', 'utf8');
for (const requiredNebulaFeature of ['optionalFeatures:["hit-test"', '"hand-tracking"', 'xrealAutostart', 'enterFullAR().catch', 'requestHitTestSource', 'startMobileFallback', 'renderer.xr.getHand(i)', 'inputsourceschange', 'pinchDistance < 0.045', 'updateXRHandGestures(time)', 'spawnARWave();']) {
  if (!spatialGame.includes(requiredNebulaFeature)) throw new Error(`Spatial game is missing Nebula takeover support: ${requiredNebulaFeature}`);
}
for (const forbiddenBrowserLauncher of ["isSessionSupported('immersive-ar')", 'beforeinstallprompt', 'model-explorer.html?xreal=1']) {
  if (xrealPlay.includes(forbiddenBrowserLauncher)) throw new Error(`XREAL Play must hand off to the glasses instead of browser play: ${forbiddenBrowserLauncher}`);
}
const xrealPages = await Promise.all(['index.html', 'members.html'].map((page) => readFile(`dist/${page}`, 'utf8')));
for (const page of xrealPages) {
  if (!page.includes('data-xreal-play') || !page.includes('public/js/xreal-play.js')) throw new Error('Index and members pages must both expose XREAL Play.');
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
for (const requiredGateMarkup of ['id="model-market-cover"', 'id="model-market-login-form"', 'model-market-gated']) {
  if (!modelMarketHtml.includes(requiredGateMarkup)) {
    throw new Error(`model-market.html is missing its Bottle member cover: ${requiredGateMarkup}`);
  }
}
const membersHtml = await readFile('dist/members.html', 'utf8');
for (const id of ['bottle-login', 'designer', 'ar-viewer', 'admin', 'marketplace']) {
  if (!membersHtml.includes(`id="${id}"`)) {
    throw new Error(`members.html is missing subscriber section #${id}`);
  }
}

const checkoutHtml = await readFile('dist/checkout.html', 'utf8');
for (const id of ['payment-form', 'checkout-items', 'confirmation-panel']) {
  if (!checkoutHtml.includes(`id="${id}"`)) {
    throw new Error(`checkout.html is missing checkout section #${id}`);
  }
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
if (!appScript.includes('initModelMarketGate') || !appScript.includes("localStorage.setItem('muzikazBottleMember', 'true')")) {
  throw new Error('The Model Market cover must share the members-area Bottle login state.');
}
for (const requiredAdminFlow of ["/api/admin/login", "muzikazAdminToken", "x-admin-token", "muzikaz:admin-authenticated"]) {
  if (!appScript.includes(requiredAdminFlow)) {
    throw new Error(`script.js is missing protected-admin flow: ${requiredAdminFlow}`);
  }
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
