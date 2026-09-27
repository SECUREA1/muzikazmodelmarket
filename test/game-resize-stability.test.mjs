import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');

test('browser pinch resize storms do not repeatedly reallocate the WebGL buffer', () => {
  assert.match(game, /if \(width === renderedWidth && height === renderedHeight && pixelRatio === renderedPixelRatio\) return;/);
  assert.match(game, /if \(!resizeFrame\) resizeFrame = window\.requestAnimationFrame/);
  assert.doesNotMatch(game, /window\.setTimeout\(resize, 360\)/);
});
