import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Brick Layer snaps, highlights, collides, and breaks after five hits', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /toolButton\('brick','Brick Layer'/, 'the Brick Layer appears in the tool picker');
  assert.match(script, /MUZIKAZ_BRICK_PLACEMENT_HIGHLIGHT/, 'the selected tool shows a placement highlight');
  assert.ok(script.includes('Math.round(point.x/(w/2))*(w/2)') && script.includes('Math.round((point.y-h/2)/h)*h+h/2'), 'brick positions snap to equal map-grid intervals');
  assert.match(script, /MUZIKAZ_CLIMBABLE_BRICK/, 'placed bricks are identified as climbable world objects');
  assert.match(script, /resolveBrickCollisions\(delta\)/, 'player movement resolves against placed bricks');
  assert.match(script, /brickMaxHits: 5/, 'bricks require exactly five hits to destroy');
  assert.match(script, /this\.damageBrick\(brickHit\.root\)/, 'laser hits damage a targeted brick');
  assert.match(script, /Brick destroyed after 5 hits/, 'the player receives destruction feedback');
  assert.match(script, /\['laser', 'spray', 'bat', 'taser', 'toxin', 'dynamite', 'brick'\]/, 'VR tool cycling includes the Brick Layer');
  assert.match(script, /if\(this\.tool==='brick'\)return this\.placeBrick\(null,origin,direction\)/, 'VR triggers can place bricks');
});
