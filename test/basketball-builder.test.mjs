import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeCatalogModel } from '../public/js/builder-catalog.js';
import { compileBuilderScene } from '../public/js/builder-gameplay-pipeline.js';
import { isBasketballEnvironment } from '../public/js/basketball-rules.js';
import { layoutHeight } from '../public/js/environments/layout-terrain.js';
import { createBuilderLand } from '../public/js/environments/builder-land.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

const manifest = JSON.parse(await readFile(new URL('../public/models/backpack-assets.json', import.meta.url)));
const items = manifest.assets || manifest.items || manifest;
const script = await readFile(new URL('../environment-builder.js', import.meta.url), 'utf8');
const definitions = script.slice(script.indexOf('const gameplayModels='), script.indexOf('// A broad, metre-scaled deployment library.'));
const starterModels = vm.runInNewContext(`${definitions}\ngameplayModels;`);

test('the map builder offers free functional basketball items before any catalog request', () => {
  for (const id of ['basketball', 'basketball-hoop', 'basketball-jersey-home', 'basketball-jersey-away']) {
    const model = starterModels.find(item => item.id === id);
    assert.ok(model, id);
    assert.equal(model.buildAssetId, id);
    assert.equal(model.priceMzk, 0);
    assert.equal(model.procedural, true);
  }
  assert.equal(starterModels.find(item => item.id === 'basketball').behavior, 'pickup');
  assert.equal(starterModels.find(item => item.id === 'basketball-hoop').behavior, 'decor');
  for (const team of ['home', 'away']) {
    const jersey = starterModels.find(item => item.id === `basketball-jersey-${team}`);
    assert.equal(jersey.behavior, 'interact');
    assert.equal(jersey.basketballTeam, team);
    assert.equal(jersey.attachment.socket, 'torso');
  }
});

test('catalog basketball objects keep canonical physics and wearable IDs in published manifests', () => {
  const ids = ['basketball', 'basketball-hoop', 'basketball-jersey-home', 'basketball-jersey-away'];
  const models = ids.map(id => normalizeCatalogModel(items.find(item => item.id === id), 0));
  const objects = models.map(model => ({ id: `placed-${model.sourceId}`, modelId: model.id, objectType: model.type, asset: { buildAssetId: model.buildAssetId, basketballTeam: model.basketballTeam, attachment: model.attachment }, functionalSettings: { behavior: model.behavior }, position: { x: 0, y: 0, z: 0 } }));
  const compiled = compileBuilderScene({ id: 'custom-basketball', layout: 'basketball-stadium', objects });
  assert.equal(compiled.objects.length, 4);
  for (const [index, object] of compiled.objects.entries()) {
    assert.equal(object.modelId, `catalog-${ids[index]}`);
    assert.equal(object.asset.buildAssetId, ids[index]);
    assert.ok(models[index].procedural);
  }
  assert.equal(compiled.actors.find(actor => actor.asset.buildAssetId === 'basketball').gameplay.behavior, 'pickup');
  assert.equal(compiled.actors.find(actor => actor.asset.buildAssetId === 'basketball-jersey-home').asset.basketballTeam, 'home');
});

test('a saved basketball layout remains a regulation stadium and a shared basketball rules map', () => {
  const scene = { id: 'custom-basketball', layout: 'basketball-stadium', mapSize: 62, basketballCourt: true, gameplay: { multiplayer: true, basketball: true }, objects: [] };
  const environment = JSON.parse(JSON.stringify({ id: scene.id, proceduralLand: true, builderScene: scene }));
  assert.ok(isBasketballEnvironment(environment));
  for (const [x, z] of [[0, 0], [7, 12], [-7, -12]]) assert.equal(layoutHeight(scene.layout, x, z), 0);
  const stadium = createBuilderLand(environment); stadium.updateMatrixWorld(true);
  const hoops = []; stadium.traverse(object => { if (object.name === 'BASKETBALL_RIM') hoops.push(object.getWorldPosition(new THREE.Vector3())); });
  assert.equal(hoops.length, 2);
  for (const hoop of hoops) { assert.ok(Math.abs(hoop.y - 3.05) < .00001); assert.equal(Math.abs(hoop.z), 12.75); }
  assert.equal(typeof stadium.userData.setBasketballState, 'function');
  assert.match(script, /option\.value='basketball-stadium'/);
  assert.match(script, /basketballPreview\?\.userData\.updateBasketballEffects/);
});
