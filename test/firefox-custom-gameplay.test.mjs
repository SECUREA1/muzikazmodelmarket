import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('custom SVG and GLB builds bridge into the playable 3D backpack', async () => {
  const [toolkit, game] = await Promise.all([
    readFile(new URL('../public/js/custom-item-toolkit.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);

  assert.match(toolkit, /muzikaz:game-assets-changed/);
  assert.match(toolkit, /deployable:true/);
  assert.match(game, /function deployCustomItem\(asset\)/);
  assert.match(game, /new THREE\.TextureLoader\(\)\.loadAsync/);
  assert.match(game, /await addAvatarToScene/);
  assert.match(game, /muzikazCustomGamePlacements/);
  assert.match(game, /customItem:true,type:'props'/);
});

test('adaptive WebGL quality keeps Firefox-compatible texture uploads current', async () => {
  const quality = await readFile(new URL('../public/js/environments/environment-quality.js', import.meta.url), 'utf8');
  assert.match(quality, /navigator\.hardwareConcurrency/);
  assert.match(quality, /renderer\?\.capabilities\?\.maxTextureSize/);
  assert.match(quality, /value\.needsUpdate = true/);
});

test('builder uses self-contained ESM dependencies and the completed cross-origin API bridge', async () => {
  const [html, builder, environments] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/environments/environment-api.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /public\/js\/api-connection\.js/);
  assert.doesNotMatch(html, /type="importmap"/);
  assert.equal((builder.match(/examples\/jsm\/[^'\"]+\/\+esm/g) || []).length, 3);
  assert.match(builder, /window\.MUZIKAZ_API\?\.fetch/);
  assert.match(builder, /apiFetch\('\/api\/custom-maps'/);
  assert.match(builder, /typeof structuredClone==='function'/);
  assert.match(environments, /apiFetch\('\/api\/environments'/);
});
