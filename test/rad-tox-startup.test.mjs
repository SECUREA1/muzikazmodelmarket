import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RAD-TOX startup is bounded and can be retried after a failure', async () => {
  const [launcher, game, members] = await Promise.all([
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../members.html', import.meta.url), 'utf8')
  ]);

  assert.match(launcher, /engineReady/, 'retries reuse an engine that has already loaded');
  assert.match(launcher, /button\.disabled = false/, 'a failed start restores the launch control');
  assert.doesNotMatch(launcher, /addEventListener\('click',[\s\S]{0,100}\{ once: true \}/, 'the launch control remains usable for retries');
  assert.match(launcher, /setTimeout\(showStall, 30000\)/, 'a stalled module load reports its state without starting a duplicate engine');
  assert.match(launcher, /moduleElement = moduleElement \|\| document\.createElement\('script'\)/, 'repeat taps reuse one game-engine module and one WebGL renderer');
  assert.match(launcher, /requestAnimationFrame[\s\S]*requestAnimationFrame/, 'the loading surface receives a paint before the engine starts heavy work');
  assert.match(game, /settleWithin\(startupCatalogPromise, 5000/, 'optional startup catalog work cannot hold the engine bootstrap indefinitely');
  assert.match(game, /settleWithin\(startupCatalogPromise, 5000, 'Map catalog refresh'\)/, 'the first direct start bounds a slow catalog instead of freezing on an empty map list');
  assert.match(game, /settleWithin\(envLoader\.load\(env\), 30000/, 'a stalled GLB request cannot hold game startup forever');
  assert.match(game, /envLoader\.cancelPendingLoad\(\)/, 'a timed-out loader cannot install its stale world later');
  assert.match(game, /settleWithin\(toxicBubbleSystem\.begin\(\), 15000/, 'encounter asset preparation is bounded');
  assert.match(game, /cancelActivation\(\)/, 'timed-out encounter work is invalidated before a retry');
  assert.match(game, /gameStartButton\) gameStartButton\.disabled = false/, 'native startup failures restore the retry button');
  assert.match(game, /const startEnvironment = resolveStartEnvironment\(\)/, 'direct starts resolve their world at interaction time like map-list entries');
  assert.match(game, /gameInitializationPromise = null/, 'a failed game initialization can be started again');
  assert.match(game, /addEventListener\('muzikaz:rad-tox-request', startRadToxGame\);/, 'the loaded engine accepts a retry request');
  assert.match(game, /webglcontextlost[\s\S]*event\.preventDefault\(\)/, 'temporary mobile GPU loss is recoverable instead of resetting the page');
  assert.match(game, /webglcontextrestored/, 'rendering resumes after the mobile browser restores WebGL');
  assert.match(game, /await afterNextPaint\(\)/, 'the game loading state paints before synchronous GLB processing');
  assert.doesNotMatch(game, /params\.get\('autoplay'\) === '1'\) startRadToxGame/, 'the loaded module does not issue a duplicate autoplay start');
  assert.match(members, /model-explorer\.html\?environment=muzikaz-main&amp;house=muzikaz-main#house-explorer/, 'the member Vibe Crib launcher uses the main map route explicitly');
});
