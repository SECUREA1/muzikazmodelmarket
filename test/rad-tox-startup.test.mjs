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
  assert.match(launcher, /new URLSearchParams\(window\.location\.search\)\.get\('autoplay'\) === '1'\) begin\(\)/, 'autoplay routes load the deferred engine without waiting for a second click');
  assert.match(game, /signal: AbortSignal.timeout\(5000\)/, 'bundled startup maps have a bounded request');
  assert.match(game, /let startEnvironment = selectedWorldId\(registry,params\)/, 'normal launches start in the house');
  assert.match(game, /#house-outside-button/, 'the game wires the outside map control');
  assert.match(game, /if \(!envLoader.world\) throw new Error/, 'a missing world cannot be reported as a successful launch');
  assert.match(game, /gameInitializationPromise = null/, 'a failed game initialization can be started again');
  assert.match(game, /addEventListener\('muzikaz:rad-tox-request', startRadToxGame\);/, 'the loaded engine accepts a retry request');
  assert.match(
    game,
    /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(activeWorldSpawn\.position, activeWorldSpawn\.rotationY\);[\s\S]{0,150}await toxicBubbleSystem\.begin\(\);/,
    'a launch passes the loaded world spawn to the player reset before gameplay and multiplayer presence start'
  );
  assert.match(game, /activeWorldSpawn=\{position:spawn\.position\.clone\(\),rotationY:Number\(spawn\.rotationY\)\|\|0\};resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\)/, 'map loading preserves the resolved GLB or Builder spawn for game start');
  assert.doesNotMatch(game, /await openHouseMap\(\);[\s\S]{0,700}resetPlayer\(\);/, 'game start never resets the spawn without an explicit map argument');
  assert.match(game, /if\(localSandbox\|\|multiplayerWorldLoading\|\|serverHostedRoom\)return/, 'legacy avatar polling stays off in authoritative multiplayer to avoid duplicate bodies');
  assert.match(game, /resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\);[\s\S]{0,500}roomId:env\.id,position:/, 'the new room is announced only after its spawn is loaded and applied');
  assert.match(game, /if\(previousRoom!==env\.id\)window\.dispatchEvent/, 'multiplayer reconnects only after a successful world transition');
  assert.match(game, /seatedBuilderObject=null;builderGameplay\.player\.seatedObjectId=null/, 'a seat from the previous world cannot pin the player during loading');
});


test('shared gameplay is confirmed before dismissing startup, with explicit solo and guest access', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(game, /await connectingClient\.whenReady\(\)/);
  assert.match(game, /await startRoomGameplay\(\);\s+await toxicBubbleSystem\.begin\(\);\s+gameplayStarted=true;\s+gameStartScreen\?\.classList\.add\('is-hidden'\)/);
  assert.match(game, /await ensurePlayAccess\(sharedInventory\)/);
  assert.match(game, /if\(guestSolo\)\{serverHostedRoom=false/);
  assert.match(game, /await choosePlayAccess\(sharedInventory\)/);
  assert.doesNotMatch(game, /Shared room loaded\. Connecting to authoritative gameplay/);
});

test('multiplayer Begin starts a rendered RAD-TOX encounter instead of stopping at a loaded map',async()=>{
 const game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const blocked=game.match(/const legacyGameplayMethods=\[([^\]]+)\]/)?.[1]||'';
 assert.doesNotMatch(blocked,/'begin'/,'the multiplayer Begin action must not be replaced with a no-op');
 assert.match(game,/authoritativeClient\.send\('start-rad-tox'\)/);
 assert.match(game,/renderServerRadTox\(snapshot\);/);
 assert.match(game,/!snapshot\.radTox\)throw new Error/,'an old server cannot be mistaken for an active encounter');
});

test('a stalled startup offers a working reload while the original engine can still finish',async()=>{
 const {runInNewContext}=await import('node:vm');const source=await readFile(new URL('../public/js/rad-tox-launcher.js',import.meta.url),'utf8');
 const handlers=new Map(),timers=[];let click,reloads=0;
 const button={disabled:false,addEventListener:(_,callback)=>{click=callback;}},status={},overlay={classList:{add(){},remove(){}}};
 const document={querySelector:()=>button,getElementById:id=>id==='house-game-start'?overlay:status,body:{dataset:{},appendChild(){}},createElement:()=>({}),addEventListener:(name,callback)=>handlers.set(name,callback),dispatchEvent(){}};
 const window={location:{search:'',reload:()=>reloads++},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){}};
 runInNewContext(source,{document,window,URLSearchParams,CustomEvent:class {constructor(name){this.type=name;}}});
 click({preventDefault(){}});assert.equal(button.disabled,true);timers[0]();assert.equal(button.disabled,false);assert.equal(button.textContent,'Reload game');
 click({preventDefault(){}});assert.equal(reloads,1);
 handlers.get('muzikaz:rad-tox-engine-ready')();assert.equal(button.textContent,'Connecting…');assert.equal(button.disabled,true);
});
