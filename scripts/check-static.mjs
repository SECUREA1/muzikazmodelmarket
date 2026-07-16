import { access, readFile } from 'node:fs/promises';

const htmlPages = ['index.html', 'index0.html', 'index1.html', 'members.html', 'originals.html', 'legends.html', 'beasts.html', 'crew-market.html', 'chaos.html', 'brand-kit.html', 'new-legends.html', 'trait-avatars.html', 'online-events.html', 'checkout.html', 'model-explorer.html', 'token-mixer.html', 'voice-changer.html', 'quest-board.html'];
const requiredFiles = [
  ...htmlPages.map((page) => `dist/${page}`),
  'dist/styles.css',
  'dist/script.js',
  'dist/reference.png',
  'dist/public/models/environments/manifest.json',
  'dist/public/models/environments/thumbnails/default-house.svg',
  'dist/public/js/house-explorer-3d.js',
];

await Promise.all(requiredFiles.map((file) => access(file)));

for (const page of htmlPages) {
  const html = await readFile(`dist/${page}`, 'utf8');
  const requiredAssets = page === 'token-mixer.html' ? ['styles.css', 'audio-core.js', 'token-mixer.js'] : page === 'voice-changer.html' ? ['styles.css', 'audio-core.js', 'voice-changer.js'] : page === 'quest-board.html' ? ['styles.css', 'audio-core.js', 'quest-board.js'] : ['styles.css', 'script.js'];

  for (const asset of requiredAssets) {
    if (!html.includes(asset)) {
      throw new Error(`${page} does not reference ${asset}`);
    }
  }
}

const mainHtml = await readFile('dist/index.html', 'utf8');
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

const manifest = JSON.parse(await readFile('dist/public/models/environments/manifest.json', 'utf8'));
if (!Array.isArray(manifest.environments) || !manifest.environments.length) {
  throw new Error('environment manifest does not contain any model entries.');
}
for (const env of manifest.environments) {
  if (!env.id || !env.model || !Object.prototype.hasOwnProperty.call(env, 'enabled')) {
    throw new Error('environment manifest entries must include id, model, and enabled.');
  }
}
const explorerModule = await readFile('dist/public/js/house-explorer-3d.js', 'utf8');
for (const token of ['GLTFLoader', 'DRACOLoader', 'PerspectiveCamera', 'WebGLRenderer']) {
  if (!explorerModule.includes(token)) throw new Error(`house-explorer-3d.js is missing ${token}`);
}
const css = await readFile('dist/styles.css', 'utf8');
if (!css.includes("url('reference.png')")) {
  throw new Error('styles.css does not reference the hero artwork.');
}

console.log('Static build output contains all public and member pages with required references.');
