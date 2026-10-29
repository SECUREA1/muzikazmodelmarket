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
  assert.match(launcher, /setTimeout\([\s\S]{0,100}30000\)/, 'a stalled module load reports its state without starting a duplicate engine');
  assert.match(launcher, /new URLSearchParams\(window\.location\.search\)\.get\('autoplay'\) === '1'\) begin\(\)/, 'autoplay routes load the deferred engine without waiting for a second click');
  assert.match(game, /signal: AbortSignal.timeout\(5000\)/, 'bundled startup maps have a bounded request');
  assert.match(game, /let startEnvironment = selectedWorldId\(registry,params\)/, 'normal launches start in the house');
  assert.match(game, /#house-outside-button/, 'the game wires the outside map control');
  assert.match(game, /if \(!envLoader.world\) throw new Error/, 'a missing world cannot be reported as a successful launch');
  assert.match(game, /gameInitializationPromise = null/, 'a failed game initialization can be started again');
  assert.match(game, /addEventListener\('muzikaz:rad-tox-request', startRadToxGame\);/, 'the loaded engine accepts a retry request');
  const startup=game.slice(game.indexOf('  function startRadToxGame()'),game.indexOf("  canvas.addEventListener('webglcontextlost'"));
  const startupSteps=['await openHouseMap()','resetPlayer(activeWorldSpawn.position, activeWorldSpawn.rotationY)','await warmGameDisplay()','await startRoomGameplay(initializationWorld)','await toxicBubbleSystem.begin()','gameplayStarted=true'];
  const stepOffsets=startupSteps.map(step=>startup.indexOf(step));
  assert.ok(stepOffsets.every((offset,index)=>offset>=0&&(!index||offset>stepOffsets[index-1])),'a launch uses the resolved spawn, prepares graphics, confirms the room and starts gameplay in that order');
  assert.match(game, /activeWorldSpawn=\{position:spawn\.position\.clone\(\),rotationY:Number\(spawn\.rotationY\)\|\|0\};resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\)/, 'map loading preserves the resolved GLB or Builder spawn for game start');
  assert.doesNotMatch(startup, /resetPlayer\(\);/, 'game start never resets the spawn without an explicit map argument');
  assert.match(game, /if\(guestSolo\|\|localSandbox\|\|multiplayerWorldLoading\|\|serverHostedRoom\)return/, 'legacy avatar polling stays off in authoritative multiplayer to avoid duplicate bodies');
  assert.match(game, /resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\);[\s\S]{0,500}roomId:env\.id,position:/, 'the new room is announced only after its spawn is loaded and applied');
  assert.match(game, /authoritativeClient\?\.stop\(\);authoritativeClient=null;[\s\S]{0,250}multiplayer-world-change/, 'every committed map selection detaches the old room, including a same-map refresh');
  assert.match(game, /seatedBuilderObject=null;builderGameplay\.player\.seatedObjectId=null/, 'a seat from the previous world cannot pin the player during loading');
});


test('shared gameplay is confirmed before dismissing startup, with explicit solo and guest access', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(game, /await connectingClient\.whenReady\(\)/);
  const startup=game.slice(game.indexOf('  function startRadToxGame()'),game.indexOf("  canvas.addEventListener('webglcontextlost'"));
  assert.match(startup, /if\(await startRoomGameplay\(initializationWorld\)===false\|\|!current\(\)\)return;/);
  assert.match(startup, /await toxicBubbleSystem\.begin\(\);\s+if\(!current\(\)\)return;\s+gameplayStarted=true;\s+setGameplayReadiness\(\);\s+gameStartScreen\?\.classList\.add\('is-hidden'\)/);
  assert.match(game, /await ensurePlayAccess\(sharedInventory\)/);
  assert.match(game, /if\(guestSolo\)\{\s*serverHostedRoom=false/);
  assert.match(game, /await choosePlayAccess\(sharedInventory\)/);
  assert.doesNotMatch(game, /Shared room loaded\. Connecting to authoritative gameplay/);
});

test('multiplayer Begin starts a rendered RAD-TOX encounter instead of stopping at a loaded map',async()=>{
 const game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const blocked=game.match(/const legacyGameplayMethods=\[([^\]]+)\]/)?.[1]||'';
 assert.doesNotMatch(blocked,/'begin'/,'the multiplayer Begin action must not be replaced with a no-op');
 assert.match(game,/authoritativeClient\.send\('start-rad-tox'\)/);
 assert.match(game,/renderServerRadTox\(snapshot,selfId\);/);
 assert.match(game,/!snapshot\.radTox\)throw new Error/,'an old server cannot be mistaken for an active encounter');
});

test('map changes do not reference the removed walking predictor',async()=>{
 const game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.doesNotMatch(game,/\bwalkingMotion\b/);
 assert.match(game,/serverMotion\.reset\(\)/);
});
