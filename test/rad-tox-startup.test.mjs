import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RAD-TOX startup is bounded and can be retried after a failure', async () => {
  const [launcher, game] = await Promise.all([
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);

  assert.match(launcher, /engineReady/, 'retries reuse an engine that has already loaded');
  assert.match(launcher, /button\.disabled = false/, 'a failed start restores the launch control');
  assert.doesNotMatch(launcher, /addEventListener\('click',[\s\S]{0,100}\{ once: true \}/, 'the launch control remains usable for retries');
  assert.match(launcher, /setTimeout\(showStall, 30000\)/, 'a stalled module load reports its state without starting a duplicate engine');
  assert.match(launcher, /if \(wasPlaying\(\)\) window\.setTimeout\(begin, 0\)/, 'an interrupted active tab automatically relaunches without another Begin click');
  assert.match(launcher, /retryAutomatically\(\)/, 'a native startup failure schedules an automatic retry');
  assert.match(game, /settleWithin\(refreshLibrary\(\), 5000/, 'optional startup catalog work cannot hold the engine indefinitely');
  assert.match(game, /gameInitializationPromise = null/, 'a failed game initialization can be started again');
  assert.match(game, /sessionStorage\.setItem\(recoveryStateKey/, 'active gameplay state is checkpointed for crash recovery');
  assert.match(game, /restoreRecoveryState\(\)/, 'the automatically relaunched game restores its checkpoint');
  assert.match(game, /addEventListener\('muzikaz:rad-tox-request', startRadToxGame\);/, 'the loaded engine accepts a retry request');
  assert.match(
    game,
    /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(activeWorldSpawn\.position, activeWorldSpawn\.rotationY\);[\s\S]{0,100}await toxicBubbleSystem\.begin\(\);/,
    'a launch passes the loaded world spawn to the player reset before gameplay and multiplayer presence start'
  );
  assert.match(game, /activeWorldSpawn=\{position:spawn\.position\.clone\(\),rotationY:Number\(spawn\.rotationY\)\|\|0\};resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\)/, 'map loading preserves the resolved GLB or Builder spawn for game start');
  assert.doesNotMatch(game, /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(\);/, 'game start never resets the spawn without an explicit map argument');
});
