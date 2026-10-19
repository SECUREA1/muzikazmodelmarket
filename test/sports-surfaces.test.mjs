import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SPORTS_SURFACES, sportsSurfaceResolution, applySportsSurfaces} from '../public/js/sports-surfaces.js';
import {createArcadePark} from '../public/js/arcade-park.js';
import {createHockeyArena} from '../public/js/hockey-models.js';

test('every sports surface has a high resolution scalable SVG master with accessible metadata', async () => {
  for (const surface of Object.values(SPORTS_SURFACES)) {
    const svg = await readFile(new URL(surface.url), 'utf8');
    assert.match(svg, /width="2048" height="2048" viewBox="0 0 2048 2048"/);
    assert.match(svg, /<title/); assert.match(svg, /<desc/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:/i);
    assert.ok(surface.roughness >= 0 && surface.roughness <= 1);
  }
});

test('GPU uploads are bounded independently of vector master resolution', () => {
  assert.equal(sportsSurfaceResolution(8192), 2048);
  assert.equal(sportsSurfaceResolution(2048, {mobile: true}), 1024);
  assert.equal(sportsSurfaceResolution(2048, {maxTextureSize: 512}), 512);
  assert.equal(sportsSurfaceResolution(1024), 1024);
});

test('hockey and all park sports surfaces are tagged without changing geometry or official rules', async () => {
  const park = createArcadePark(), arena = createHockeyArena(), kinds = new Set();
  park.root.traverse(node => { if (node.userData.sportsSurface) kinds.add(node.userData.sportsSurface); });
  assert.deepEqual([...kinds].sort(), ['court', 'felt', 'ice', 'metal', 'paving', 'wood']);
  let ice = false; arena.traverse(node => { if (node.userData.sportsSurface === 'ice') ice = true; });
  assert.equal(ice, true);
  assert.deepEqual(await applySportsSurfaces(park.root), {applied: 0, failed: []}, 'Node scene tests retain procedural fallback without browser globals');
});
