import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('play mode replaces every Builder Pack thumbnail with a described, scaled 3D model', async () => {
  const [models, game] = await Promise.all([
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  const ids = ['canopy-tree','pine-tree','flower-bed','hedge-corner','garden-rocks','pond','path-tile','hill','lamp-post','planter','sofa','armchair','coffee-table','bookshelf','floor-lamp','room-divider','kitchen-island','spiral-stairs','archway','art-wall'];
  ids.forEach((id) => assert.match(models, new RegExp(`['"]?${id}['"]?\\s*:`), `${id} has gameplay metadata`));
  assert.match(models, /dimensions/);
  assert.match(models, /MeshStandardMaterial/);
  assert.match(models, /castShadow=true/);
  assert.match(models, /updateBuilderModels/);
  assert.match(game, /createBuilderModel\(item\.modelId\)/);
  assert.match(game, /updateBuilderModels\(builderDecor, clock\.elapsedTime\)/);
  assert.doesNotMatch(game, /new THREE\.PlaneGeometry\(flat\?2\.4/);
});
