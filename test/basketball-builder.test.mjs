import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { compileBuilderScene } from '../public/js/builder-gameplay-pipeline.js';
import { isBasketballEnvironment } from '../public/js/basketball-rules.js';
import { createBuilderLand } from '../public/js/environments/builder-land.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

const manifest = JSON.parse(await readFile(new URL('../public/models/backpack-assets.json', import.meta.url)));
const items = manifest.assets || manifest.items || manifest;
const script = await readFile(new URL('../environment-builder.js', import.meta.url), 'utf8');
const definitions = script.slice(script.indexOf('const gameplayModels='), script.indexOf('// A broad, metre-scaled deployment library.'));
const starterModels = vm.runInNewContext(`${definitions}\ngameplayModels;`, {HOCKEY_ITEMS:[],ARCADE_PARTS:[]});

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

test('a saved basketball layout remains a regulation stadium and a shared basketball rules map', () => {
  const scene = { id: 'custom-basketball', layout: 'basketball-stadium', mapSize: 62, basketballCourt: true, gameplay: { multiplayer: true, basketball: true }, objects: [] };
  const environment = JSON.parse(JSON.stringify({ id: scene.id, proceduralLand: true, builderScene: scene }));
  assert.ok(isBasketballEnvironment(environment));
  const stadium = createBuilderLand(environment); stadium.updateMatrixWorld(true);
  const hoops = []; stadium.traverse(object => { if (object.name === 'BASKETBALL_RIM') hoops.push(object.getWorldPosition(new THREE.Vector3())); });
  assert.equal(hoops.length, 2);
  for (const hoop of hoops) { assert.ok(Math.abs(hoop.y - 3.05) < .00001); assert.equal(Math.abs(hoop.z), 12.75); }
  assert.equal(typeof stadium.userData.setBasketballState, 'function');
});
