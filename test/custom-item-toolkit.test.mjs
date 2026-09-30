import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const starterNames = [
  'Neon Energy Blade',
  'Arcade Guardian Shield',
  'Cyber Loot Crate',
  'Pulse Health Potion',
  'Street Hover Board',
  'Pocket Portal Beacon',
  'Holo Quest Key',
  'Scout Companion Drone',
  'Nova Rocket Pack',
  'Bass Reactor Boom Box',
  'Turbo Impact Hammer',
  'Prism Crystal Pet'
];

test('custom item toolkit exposes pre-developed SVG 3D starters', async () => {
  const [html, script, manifest] = await Promise.all([
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/custom-item-toolkit.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/toolkit-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);

  assert.match(html, /<option value="starter">SVG 3D starters<\/option>/);
  assert.match(script, /const starterModels = \[/);
  assert.match(script, /function applyDefaults\(item\)/);
  assert.match(script, /function sanitiseSvg\(source\)/);

  const starters = manifest.assets.filter((asset) => asset.starter);
  assert.equal(starters.length, starterNames.length);
  assert.deepEqual(starters.map((asset) => asset.name), starterNames);
  for (const asset of starters) {
    assert.equal(asset.format, 'svg');
    assert.equal(asset.modelUrl, asset.thumbnailUrl);
    assert.match(asset.modelUrl, /^public\/images\/custom-item-models\/.+\.svg$/);
  }
});


test('customized models expose transform controls and a saved-model popup', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/custom-item-toolkit.js', import.meta.url), 'utf8')
  ]);

  for (const control of ['custom-svg-rotation', 'custom-svg-tilt', 'custom-svg-flip', 'custom-result-dialog']) {
    assert.match(html, new RegExp(`id=\"${control}\"`));
  }
  assert.match(script, /function showResult\(item\)/);
  assert.match(script, /showResult\(item\);setStep\(3\)/);
  assert.match(script, /mirrored:glb\?false/);
});

test('new SVG starters provide distinct accessible sandbox interactions', async () => {
  const [script, styles] = await Promise.all([
    readFile(new URL('../public/js/custom-item-toolkit.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/custom-item-toolkit.css', import.meta.url), 'utf8')
  ]);

  for (const effect of ['rocket', 'bass', 'hammer', 'prism']) {
    assert.match(script, new RegExp(`effect:'${effect}'`));
    assert.match(styles, new RegExp(`is-testing--${effect}`));
  }
  for (const action of ['Ignite thrusters', 'Drop the beat', 'Power smash', 'Call companion']) {
    assert.match(script, new RegExp(`action:'${action}'`));
  }
  assert.match(script, /function playProfile\(item\)/);
  assert.match(script, /testButton\.textContent=/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('ready-to-edit library supports categories, sorting, clear search, and one-click play', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/custom-item-toolkit.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/custom-item-toolkit.css', import.meta.url), 'utf8')
  ]);

  for (const control of ['custom-library-search', 'custom-library-filter', 'custom-library-sort', 'custom-library-categories']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  assert.match(script, /const categoryRules = \[/);
  assert.match(script, /function quickPlay\(item\)/);
  assert.match(script, /data-play-library-item/);
  assert.match(script, /muzikaz:game-assets-changed/);
  assert.match(styles, /\.custom-library-categories/);
  assert.match(styles, /\.custom-card-actions/);
});
