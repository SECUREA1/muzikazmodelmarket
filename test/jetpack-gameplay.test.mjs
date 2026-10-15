import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('jetpack is a billed tool with vertical and forward flight controls', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');

  assert.match(game, /toolButton\('jetpack','Jetpack'/, 'Tools includes the jetpack');
  assert.match(game, /jetpackCostPerSecond: 1/, 'jetpack advertises a one MZK per second rate');
  assert.match(game, /gameEconomy\.use\('tool:jetpack'\)/, 'each powered second awaits the shared MZK wallet');
  assert.match(game, /jumpHeld[\s\S]{0,800}player\.velocity\.y = TOXIC_BUBBLE_CONFIG\.jetpackRiseSpeed/, 'jump thrust flies upward');
  assert.match(game, /jetpackThrust&&input\.y>0\?TOXIC_BUBBLE_CONFIG\.jetpackForwardSpeed/, 'forward input uses flight speed');
  assert.match(game, /if\(payment\.ok\)jetpackPaidSecondsRemaining=1/, 'flight is enabled only after payment');
});
