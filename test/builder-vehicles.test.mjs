import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('builder provides illustrated rideable quad and Corsair aircraft assets', async () => {
  const [builder, models, quad, corsair] = await Promise.all([
    read('../environment-builder.js'), read('../public/js/builder-models-3d.js'),
    read('../public/images/builder-pack/dune-quad.svg'), read('../public/images/builder-pack/corsair-aircraft.svg')
  ]);
  for (const id of ['dune-quad', 'corsair-aircraft']) {
    assert.match(builder, new RegExp(`id:'${id}'`));
    assert.match(models, new RegExp(`'${id}'`));
  }
  assert.match(models, /vehicleWheel/);
  assert.match(models, /vehiclePropeller/);
  assert.match(models, /mode:'drive'/);
  assert.match(models, /mode:'fly'/);
  assert.match(quad, /NO BODY/);
  assert.match(corsair, /BLACKWING CORSAIR/);
});

test('standard vehicle controller supports enter, movement, flight and exit', async () => {
  const [controller, game] = await Promise.all([
    read('../public/js/builder-vehicle-controller.js'), read('../public/js/house-explorer-glb.js')
  ]);
  for (const behavior of ['nearest', 'toggle', 'exit', 'update']) assert.match(controller, new RegExp(`${behavior}\\(`));
  assert.match(controller, /config\.mode === 'fly'/);
  assert.match(controller, /keys\.has\('shift'\)/);
  assert.match(game, /new BuilderVehicleController/);
  assert.match(game, /key === 'f'/);
  assert.match(game, /vehicleController\.update\(delta\)/);
});

test('regular RAD-TOX gameplay activates authored objects, avatars, and animations', async () => {
  const [runtime, game] = await Promise.all([
    read('../public/js/builder-gameplay-controller.js'), read('../public/js/house-explorer-glb.js')
  ]);
  for (const behavior of ['pickup', 'heal', 'door', 'hostile', 'quest', 'talk', 'patrol']) {
    assert.match(runtime, new RegExp(`behavior === '${behavior}'`));
  }
  assert.match(game, /new BuilderGameplayController/);
  assert.match(game, /builderGameplay\.interact\(\)/);
  assert.match(game, /builderGameplay\.update\(delta\)/);
  assert.match(game, /new THREE\.AnimationMixer\(object\)/);
  assert.match(game, /prepareAuthoredBuilderModel\(gltf\.scene,definition\)/);
  assert.match(game, /object\.userData\.vehicle=\{mode:/);
});
