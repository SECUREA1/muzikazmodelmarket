import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('Builders Pack provides a floor, three rooms, and twenty labelled SVG models', async () => {
  const [html, script, modelFiles] = await Promise.all([
    readFile(new URL('../builder-market.html', import.meta.url), 'utf8'),
    readFile(new URL('../builder-market.js', import.meta.url), 'utf8'),
    readdir(new URL('../public/images/builder-pack/', import.meta.url))
  ]);

  assert.match(html, /Grand Build Floor/);
  assert.match(html, /40 × 40/);
  assert.match(html, /3 layouts/);
  assert.match(html, /20 models/);
  assert.equal((script.match(/name:'(?:Open Studio|Connected Suite|Garden Courtyard)'/g) || []).length, 3);
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)'\]/g) || []).length, 20);
  assert.equal(modelFiles.filter((file) => file.endsWith('.svg')).length, 20);
});

test('in-game Tools and Drop Backpack expose the complete map-building pack', async () => {
  const [game, manifest] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const buildAssets = manifest.assets.filter((asset) => asset.buildAssetId);

  assert.match(game, /data-rad-build-toggle/);
  assert.match(game, /Build map & game/);
  assert.match(game, /muzikaz\.builder\.buildTray/);
  assert.match(game, /\.\.\.readBuildTray\(\)\.map\(item=>\['Build asset'/);
  assert.equal(buildAssets.length, 24);
  assert.equal(buildAssets.filter((asset) => asset.builderCategory === 'landscape').length, 10);
  assert.equal(buildAssets.filter((asset) => asset.builderCategory === 'interior').length, 10);
  assert.ok(buildAssets.every((asset) => asset.type === 'props' && asset.thumbnailUrl));
});
