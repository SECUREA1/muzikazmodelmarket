import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('builder provides five illustrated playable driving, flying and hovering vehicles', async () => {
  const [builder, models, ...art] = await Promise.all([
    read('../environment-builder.js'), read('../public/js/builder-models-3d.js'),
    ...['street-car','dune-quad','sky-rescue-helicopter','corsair-aircraft','flux-hoverboard'].map(id=>read(`../public/images/builder-pack/${id}.svg`))
  ]);
  for (const id of ['street-car','dune-quad','sky-rescue-helicopter','corsair-aircraft','flux-hoverboard']) {
    assert.match(builder, new RegExp(`id:'${id}'`));
    assert.match(models, new RegExp(`'${id}'`));
  }
  assert.match(models, /vehicleWheel/);
  assert.match(models, /vehiclePropeller/);
  assert.match(models, /mode:'drive'/);
  assert.match(models, /mode:'fly'/);
  assert.equal(art.length, 5);
  assert.ok(art.every(svg=>/<title/.test(svg) && /<desc/.test(svg)));
  assert.match(models, /vehicleRotor/);
  assert.match(models, /vehicleThruster/);
  assert.match(models, /mode:'hover'/);
});

test('standard vehicle controller supports enter, movement, flight and exit', async () => {
  const [controller, game] = await Promise.all([
    read('../public/js/builder-vehicle-controller.js'), read('../public/js/house-explorer-glb.js')
  ]);
  for (const behavior of ['nearest', 'toggle', 'exit', 'update']) assert.match(controller, new RegExp(`${behavior}\\(`));
  assert.match(controller, /config\.mode === 'fly'/);
  assert.match(controller, /config\.mode === 'hover'/);
  assert.match(controller, /boostSpeed/);
  assert.match(controller, /keys\.has\('shift'\)/);
  assert.match(game, /new BuilderVehicleController/);
  assert.match(game, /key === 'f'/);
  assert.match(game, /vehicleController\.update\(delta\)/);
});

test('vehicles are categorized separately and expose a touch enter button', async () => {
  const [catalog, game, page] = await Promise.all([
    read('../public/models/backpack-assets.json'), read('../public/js/house-explorer-glb.js'), read('../model-explorer.html')
  ]);
  const assets=JSON.parse(catalog).assets;
  for (const id of ['builder-street-car','builder-corsair-aircraft','builder-sky-rescue-helicopter','builder-dune-quad','builder-flux-hoverboard']) assert.equal(assets.find(asset=>asset.id===id)?.type,'vehicles');
  assert.doesNotMatch(game, /builder-nearby-action/, 'the explorer does not render the obsolete floating action control');
  assert.match(game, /data-mobile-operation="interact"/);
  assert.match(page, /house-environment-scroll-list/);
});

test('mobile controls provide desktop-equivalent prop and vehicle operations', async () => {
  const game = await read('../public/js/house-explorer-glb.js');
  assert.match(game, /data-mobile-operation="interact"/);
  assert.match(game, /PICKUP \/ USE/);
  assert.match(game, /vehicleNearby\?\(vehicleController\.active\?'EXIT':'ENTER'\)/);
  assert.match(game, /data-vehicle-control="brake"/);
  assert.match(game, /data-vehicle-control="boost"/);
  assert.match(game, /thumbInput\.leftY<-/);
  assert.match(game, /thumbInput\.rightY<-/);
  assert.match(game, /thumbInput\.rightY>/);
  assert.match(game, /keys:vehicleInput/);
});
