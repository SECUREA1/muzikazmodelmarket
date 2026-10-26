import {ENTERABLE_BUILDINGS} from '../public/js/building-districts.js';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {BUILTIN_BUILDER_ITEMS,EXPANDED_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {IN_GAME_BUILDING_ITEMS,BUILDING_CATALOG_CATEGORIES,matchesBuildingCatalogItem} from '../public/js/in-game-building-catalog.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('Builders Pack provides a floor, three rooms, twenty-one core models, and its expanded SVG assets', async () => {
  const [html, script, modelFiles] = await Promise.all([
    readFile(new URL('../builder-market.html', import.meta.url), 'utf8'),
    readFile(new URL('../builder-market.js', import.meta.url), 'utf8'),
    readdir(new URL('../public/images/builder-pack/', import.meta.url))
  ]);

  assert.match(html, /Grand Build Floor/);
  assert.match(script, /Pillow Ring Seat/);
  assert.match(html, /40 × 40/);
  assert.match(html, /3 layouts/);
  assert.match(html, /21 models/);
  assert.equal((script.match(/name:'(?:Open Studio|Connected Suite|Garden Courtyard)'/g) || []).length, 3);
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)'\]/g) || []).length, 21);
  for(const id of [...BUILTIN_BUILDER_ITEMS.map(item=>item.id),'dune-quad','corsair-aircraft','reusable-item'])assert.ok(modelFiles.includes(id+'.svg'),id+' has its SVG artwork');
});

test('in-game Tools and Drop Backpack expose the complete map-building pack', async () => {
  const [game, manifest, browser] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/js/build-asset-browser.js', import.meta.url), 'utf8')
  ]);
  const buildAssets = manifest.assets.filter((asset) => asset.buildAssetId);

  assert.match(game, /data-rad-build-toggle/);
  assert.match(game, /data-rad-seats-toggle/);
  assert.match(game, /mountBuildAssetBrowser\(buildMenu\.querySelector\('\[data-build-browser\]'\),\{assets,tray,previous\}\)/);
  assert.match(browser, /assets\.filter\(asset=>matchesBuildingCatalogItem\(asset,categorySelect\.value,search\.value/);
  assert.ok(IN_GAME_BUILDING_ITEMS.filter(item=>matchesBuildingCatalogItem(item,'seats')).length>=3);
  assert.match(game, /<h2>World Builder<\/h2>/);
  assert.match(game, /muzikaz\.builder\.buildTray/);
  assert.match(game, /deployPlayableBuilderAsset\(asset\)/);
  assert.match(game, /Browse all Builder items/);
  assert.match(game, /data-rad-pack-builder/);
  assert.match(game, /\.\.\.tray\.map\(item=>\['Build asset'/);
  for(const id of [...BUILTIN_BUILDER_ITEMS.map(item=>item.id),...EXPANDED_BUILDER_ITEMS.map(item=>item.id),...Object.keys(INTERACTIVE_DEVICES),...Object.keys(ENTERABLE_BUILDINGS)])assert.ok(buildAssets.some(asset=>asset.buildAssetId===id),id+' is in the Backpack catalog');
  assert.equal(buildAssets.filter((asset) => asset.builderCategory === 'landscape').length, 13);
  assert.equal(buildAssets.filter((asset) => asset.builderCategory === 'interior').length, 14);
  assert.ok(buildAssets.every((asset) => normalizeCatalogModel(asset) && asset.thumbnailUrl));
  for (const category of ['terrain','plants','buildings','props','weapons','characters','creatures','avatar','enemy','interactive','vehicles']) {
    assert.ok(buildAssets.some((asset) => asset.builderCategory === category), `${category} items are available in game`);
    const nativeCategory=({avatar:'characters',enemy:'creatures'})[category]||category;
    assert.ok(BUILDING_CATALOG_CATEGORIES.some(item=>item.id===nativeCategory&&item.count>0),`${category} has an in-game filter`);
  }
  for (const id of ['pillow-ring','sofa','armchair','corsair-aircraft','hero-spawn','rad-tox','terrain-cliff','plasma-sword','forest-ranger','emerald-slime','teleport-pad']) {
    assert.ok(buildAssets.some((asset) => asset.buildAssetId === id), `${id} is included in the Drop Backpack`);
    assert.ok(IN_GAME_BUILDING_ITEMS.some(item=>item.id===id),`${id} is included in the Tools picker`);
  }
});

test('every Environment Builder layout is a land in the in-game Backpack', async () => {
  const [builder, game, manifest] = await Promise.all([
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const layoutBlock = builder.match(/const layouts=\{([\s\S]+?)\n\};/)?.[1] || '';
  const layoutIds = [...layoutBlock.matchAll(/(?:'([^']+)'|\b([a-z][a-z-]*)):\{name:/g)].map((match) => match[1] || match[2]);
  const builderLands = manifest.assets.filter((asset) => asset.type === 'lands' && asset.builderLayoutId);

  assert.equal(builderLands.length, layoutIds.length);
  assert.deepEqual(new Set(builderLands.map((asset) => asset.builderLayoutId)), new Set(layoutIds));
  assert.ok(builderLands.every((asset) => asset.builderUrl === `/environment-builder.html?layout=${asset.builderLayoutId}`));
  assert.ok(builderLands.every((asset) => !asset.buildAssetId), 'lands must not be represented as placeable props');
  assert.match(game, /asset\.builderLayoutId/);
  assert.match(game, /deployPlayableLandLayout\(asset\)/);
  assert.doesNotMatch(game, /window\.location\.assign\(asset\.builderUrl/);
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
