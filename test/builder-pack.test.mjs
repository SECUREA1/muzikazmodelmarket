import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('Builders Pack provides a floor, three rooms, twenty core models, and its expanded SVG assets', async () => {
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
  assert.equal(modelFiles.filter((file) => file.endsWith('.svg')).length, 32);
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

test('Drop Backpack pets each have a custom refillable treat', async () => {
  const [game, manifest] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const pets = manifest.assets.filter((asset) => asset.type === 'pets');
  const treats = manifest.assets.filter((asset) => asset.petId);

  assert.equal(pets.length, 4);
  assert.equal(treats.length, 4);
  assert.ok(treats.every((treat) => pets.some((pet) => pet.id === treat.petId)));
  assert.ok(treats.every((treat) => treat.consumable && treat.refillCostMzk > 0 && treat.treatShape));
  assert.match(game, /function feedTreatToPet/);
  assert.match(game, /function buyPetTreat/);
  assert.match(game, /asset\.petId && asset\.consumable/);
});
