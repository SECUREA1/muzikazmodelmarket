import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the in-game sandbox can publish and switch to a live RAD-TOX multiplayer map', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');

  assert.match(game, /data-publish-sandbox/);
  assert.match(game, /Publish map live/);
  assert.match(game, /gameMode: 'rad-tox'/);
  assert.match(game, /multiplayer: true/);
  assert.match(game, /compileBuilderScene\(scene\)/);
  assert.match(game, /'\/api\/custom-maps'/);
  assert.match(game, /liveUrl\.searchParams\.delete\('sandbox'\)/);
  assert.match(game, /liveUrl\.searchParams\.delete\('localFallback'\)/);
  assert.match(game, /location\.assign\(liveUrl\.href\)/);
});
