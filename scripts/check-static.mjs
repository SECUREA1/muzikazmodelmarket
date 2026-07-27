import { access, readFile } from 'node:fs/promises';

const htmlPages = ['index.html', 'index0.html', 'index1.html', 'members.html', 'originals.html', 'legends.html', 'beasts.html', 'crew-market.html', 'chaos.html', 'brand-kit.html', 'new-legends.html', 'trait-avatars.html', 'online-events.html', 'checkout.html', 'model-explorer.html', 'token-mixer.html', 'voice-changer.html', 'quest-board.html'];
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
for (const githubSetting of ['name="muzikaz-github-repository" content="SECUREA1/muzikazmodelmarket"', 'name="muzikaz-github-branch" content="main"']) {
  if (!mainHtml.includes(githubSetting)) {
    throw new Error(`index.html must configure repository GLB discovery: missing ${githubSetting}`);
  }
}
if (!mainHtml.includes('public/js/rad-tox-launcher.js')) {
  throw new Error('index.html must load the RAD-TOX 3D launcher.');
}

for (const requiredGameMarkup of ['id="house-game-start"', 'data-house-start', 'WebGL support']) {
  if (!mainHtml.includes(requiredGameMarkup)) {
    throw new Error(`index.html is missing RAD-TOX launch markup: ${requiredGameMarkup}`);
  }
}
for (const page of ['index.html', 'model-explorer.html']) {
  const html = await readFile(`dist/${page}`, 'utf8');
  if ((html.match(/data-house-start/g) || []).length !== 1) {
    throw new Error(`${page} must expose exactly one Begin control in the launch overlay.`);
  }
  if (html.includes('id="house-start-game"')) {
    throw new Error(`${page} must not expose a second game-start control.`);
  }
}

const launchScreenHtml = await readFile('dist/model-explorer.html', 'utf8');
for (const removedMobileControl of ['data-mobile-hold="strafe-right"', 'data-mobile-action="avatar"', 'data-mobile-action="environment"', 'data-mobile-zoom-toggle', 'data-mobile-hold="back"', 'data-mobile-action="jump"']) {
  if (launchScreenHtml.includes(removedMobileControl)) {
    throw new Error(`model-explorer.html must not render the legacy pre-game mobile control: ${removedMobileControl}`);
  }
}

const launcher = await readFile('dist/public/js/rad-tox-launcher.js', 'utf8');
if (!launcher.includes('muzikaz:rad-tox-app-update')) {
  throw new Error('RAD-TOX launcher must publish live 3D game updates.');
}
for (const removed2dFeature of ['startCompatibility', 'rad-tox-compat-game', 'data-radtox-compat']) {
  if (launcher.includes(removed2dFeature)) {
    throw new Error(`RAD-TOX launcher must not populate the removed 2D game: ${removed2dFeature}`);
  }
}
if (!launcher.includes("state==='loading-game'") || !launcher.includes('GAME_DEPLOY_TIMEOUT_MS')) {
  throw new Error('RAD-TOX launcher must recover if deployment stalls after the 3D scene loads.');
}
if (!launcher.includes('showLoading(true)') || !launcher.includes('GAME_DEPLOY_TIMEOUT_MS = 120000')) {
  throw new Error('RAD-TOX must show its loading screen immediately and allow mobile assets time to load.');
}
if (launcher.includes('data-radtox-retry') || launcher.includes('Retry 3D Game')) {
  throw new Error('RAD-TOX must not replace the standard loading flow with a retry screen.');
}

if (mainHtml.includes('<script type="module" src="public/js/house-explorer-glb.js"></script>')) {
  throw new Error('index.html must defer the large House Explorer module until the player starts RAD-TOX.');
}
if (!launcher.includes("module.src='public/js/house-explorer-glb.js'") || !launcher.includes('function startEngine()')) {
  throw new Error('RAD-TOX launcher must load the House Explorer module only after a start request.');
}

const houseExplorer = await readFile('dist/public/js/house-explorer-glb.js', 'utf8');
for (const requiredLiveFeature of ['MUZIKAZ_LIVE_PLAYERS', 'syncLiveAvatars', 'pollLiveAvatars', 'Live_player_label']) {
  if (!houseExplorer.includes(requiredLiveFeature)) throw new Error(`GLB House Explorer is missing live cross-device avatars/chat: ${requiredLiveFeature}`);
}
const cribMultiplayer = await readFile('dist/public/js/crib-multiplayer.js', 'utf8');
if (!cribMultiplayer.includes('avatarUrl: avatar.modelUrl') || !cribMultiplayer.includes('modelUrl: avatar.modelUrl')) {
  throw new Error('Crib presence must publish each designated GLB avatar URL.');
}
if (!cribMultiplayer.includes('MUZIKAZ_CRIB_MULTIPLAYER = { start }') || !houseExplorer.includes('MUZIKAZ_CRIB_MULTIPLAYER?.start?.().catch')) {
  throw new Error('The one-click launch must initialize multiplayer in the background without blocking gameplay.');
}
if (houseExplorer.includes('await this.initAudio()')) {
  throw new Error('RAD-TOX startup must not wait for iOS Web Audio resume permission.');
}
for (const requiredGameFeature of ["['toxic',toxicTarget]", "['ghost',ghostTarget]", 'this.spawnSnakes()', "controller.userData.handedness === 'left'", "Weapons','Laser · Paint gun · Baseball bat", 'webXrAvailable', "isSessionSupported('immersive-vr')", 'createXRAimRay()', 'teleportFromController(controller)', 'camera.position.set(0, 0, 0)']) {
  if (!houseExplorer.includes(requiredGameFeature)) {
    throw new Error(`RAD-TOX is missing its required mixed-level or always-on controls feature: ${requiredGameFeature}`);
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
const modelGalleryScript = await readFile('dist/public/js/model-gallery-core.js', 'utf8');
const modelUtilsScript = await readFile('dist/public/js/model-utils.js', 'utf8');
if (modelGalleryScript.includes("text:'Open Model'") || modelGalleryScript.includes("text:'Explore in 3D'")) {
  throw new Error('Published model cards must not expose direct model-opening actions.');
}
for (const requiredArAction of ["text:'View in AR'", "text:'Share AR link'", "text:'Copy AR link'"]) {
  if (!modelGalleryScript.includes(requiredArAction)) throw new Error(`Published model cards are missing ${requiredArAction}`);
}
for (const requiredArSharePart of ["['environment','house']", "url.searchParams.set('model',model.id)", "url.searchParams.set('view','ar')"]) {
  if (!modelUtilsScript.includes(requiredArSharePart)) throw new Error(`AR share links are missing ${requiredArSharePart}`);
}
