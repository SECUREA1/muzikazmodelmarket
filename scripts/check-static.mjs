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
  throw new Error('index.html must load the ES5 RAD-TOX compatibility launcher.');
}

for (const requiredGameMarkup of ['id="house-game-start"', 'data-house-start', 'WebGL support']) {
  if (!mainHtml.includes(requiredGameMarkup)) {
    throw new Error(`index.html is missing RAD-TOX launch markup: ${requiredGameMarkup}`);
  }
}

const launcher = await readFile('dist/public/js/rad-tox-launcher.js', 'utf8');
if (!launcher.includes('startCompatibility') || !launcher.includes('muzikaz:rad-tox-app-update')) {
  throw new Error('RAD-TOX launcher must provide a compatibility fallback and publish live game updates.');
}

if (mainHtml.includes('<script type="module" src="public/js/house-explorer-glb.js"></script>')) {
  throw new Error('index.html must defer the large House Explorer module until the player starts RAD-TOX.');
}
if (!launcher.includes("module.src='public/js/house-explorer-glb.js'") || !launcher.includes('function startEngine()')) {
  throw new Error('RAD-TOX launcher must load the House Explorer module only after a start request.');
}

const houseExplorer = await readFile('dist/public/js/house-explorer-glb.js', 'utf8');
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
