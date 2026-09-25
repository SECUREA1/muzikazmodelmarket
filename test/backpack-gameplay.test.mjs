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
