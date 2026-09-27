import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RAD-TOX startup is bounded and can be retried after a failure', async () => {
  const [launcher, game, multiplayer] = await Promise.all([
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/crib-multiplayer.js', import.meta.url), 'utf8')
  ]);

  assert.match(launcher, /engineReady/, 'retries reuse an engine that has already loaded');
  assert.match(launcher, /button\.disabled = false/, 'a failed start restores the launch control');
  assert.doesNotMatch(launcher, /addEventListener\('click',[\s\S]{0,100}\{ once: true \}/, 'the launch control remains usable for retries');
  assert.match(launcher, /setTimeout\(showStall, 30000\)/, 'a stalled module load reports its state without starting a duplicate engine');
  assert.match(game, /settleWithin\(refreshLibrary\(\), 5000/, 'optional startup catalog work cannot hold the engine indefinitely');
  assert.match(game, /gameInitializationPromise = null/, 'a failed game initialization can be started again');
  assert.match(game, /addEventListener\('muzikaz:rad-tox-request', startRadToxGame\);/, 'the loaded engine accepts a retry request');
  assert.match(
    game,
    /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(activeWorldSpawn\.position, activeWorldSpawn\.rotationY\);[\s\S]{0,100}await toxicBubbleSystem\.begin\(\);/,
    'a launch passes the loaded world spawn to the player reset before gameplay and multiplayer presence start'
  );
  assert.match(game, /activeWorldSpawn=\{position:spawn\.position\.clone\(\),rotationY:Number\(spawn\.rotationY\)\|\|0\};resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\)/, 'map loading preserves the resolved GLB or Builder spawn for game start');
  assert.doesNotMatch(game, /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(\);/, 'game start never resets the spawn without an explicit map argument');
  assert.match(game, /window\.MUZIKAZ_GAMEPLAY_READY = true;[\s\S]{0,100}dispatchEvent\(new CustomEvent\('muzikaz:gameplay-ready'\)\)/, 'the engine marks the resolved first load ready before multiplayer is notified');
  assert.match(multiplayer, /params\.get\('house'\) \|\| params\.get\('environment'\)/, 'the first presence join uses the room requested by the page URL');
  assert.match(multiplayer, /if \(!window\.MUZIKAZ_GAMEPLAY_READY\) \{ presenceStartPending = true; return; \}/, 'presence cannot publish a stale position before the first game load finishes');
});
