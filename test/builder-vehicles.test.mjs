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
  assert.match(controller, /this\.onEnter\(vehicle\)/);
  assert.match(controller, /input\.throttle/);
  assert.match(controller, /input\.steering/);
  assert.match(controller, /input\.lift/);
  assert.match(game, /new BuilderVehicleController/);
  assert.match(game, /key === 'f'/);
  assert.match(game, /vehicleController\.update\(delta\)/);
  assert.match(game, /setPlayerAvatarVisible\(false\)/);
  assert.match(game, /setPlayerAvatarVisible\(true\)/);
});

test('vehicles are categorized separately and expose a touch enter button', async () => {
  const [catalog, game, page] = await Promise.all([
    read('../public/models/backpack-assets.json'), read('../public/js/house-explorer-glb.js'), read('../model-explorer.html')
  ]);
  const assets=JSON.parse(catalog).assets;
  for (const id of ['builder-corsair-aircraft','builder-dune-quad']) assert.equal(assets.find(asset=>asset.id===id)?.type,'vehicles');
  assert.match(game, /builder-nearby-action/);
  assert.match(game, /ENTER VEHICLE/);
  assert.match(game, /EXIT VEHICLE/);
  assert.match(game, /data-vehicle-active/);
  assert.match(page, /house-environment-scroll-list/);
});
