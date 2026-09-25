import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('every Backpack category has a safe, animated gameplay action', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  for (const category of ['avatars','lands','props','wearables','pets','vehicles']) assert.match(game, new RegExp(`['\"]${category}['\"]`));
  assert.match(game, /rememberActiveBackpackItem\(asset\)/);
  assert.match(game, /asset\.type==='wearables'/);
  assert.match(game, /root\.userData\.gameMixer/);
  assert.match(game, /finally\{if\(button\.isConnected\)/);
  assert.match(game, /modelUrl:modelUrl\?new URL\(modelUrl/);
});

test('Builder Backpack cards pop playable models into the current game', async () => {
  const [game, models] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8')
  ]);
  assert.match(game, /function deployPlayableBuilderAsset\(asset\)/);
  assert.match(game, /asset\.buildAssetId\) \{ closeBackpack\(\); deployPlayableBuilderAsset\(asset\)/);
  assert.doesNotMatch(game, /asset\.buildAssetId\).*toggleBuildMenu\(true\)/);
  for (const id of ['grand-floor','open-studio','connected-suite','garden-courtyard']) assert.match(models, new RegExp(`'${id}'`));
});

test('Backpack lands and the SVG-backed item collection deploy inside gameplay', async () => {
  const [game, manifest] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  assert.match(game, /function deployPlayableLandLayout\(asset\)/);
  assert.match(game, /deployPlayableLandLayout\(asset\)/);
  assert.doesNotMatch(game, /window\.location\.assign\(asset\.builderUrl/);
  const dimensionalItems = manifest.assets.filter((asset) => asset.format === 'procedural-3d' && /\.svg$/.test(asset.thumbnailUrl || ''));
  assert.ok(dimensionalItems.length >= 6, 'offers a useful list instead of a single SVG-backed 3D item');
  for (const item of dimensionalItems) assert.ok(item.buildAssetId, `${item.name} has an in-world procedural model`);
});
