import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const storageSource = await readFile(new URL('../public/js/game-storage.js', import.meta.url), 'utf8');
const launcherSource = await readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8');
const engineSource = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');

function cachedGame(value, blocked = false) {
  const context = {
    localStorage: {getItem() { if (blocked) throw new Error('Storage blocked'); return value; }}
  };
  return runInNewContext(storageSource.replace(/export /g, '') +
    '\n({readStoredGameArray,readStoredGameObject})', context);
}

test('malformed and wrongly shaped browser caches cannot abort game startup', () => {
  for (const value of [null, '', 'undefined', '<html>offline</html>', '[', 'null', '{}', '42', '"old-format"']) {
    const storage = cachedGame(value);
    assert.equal(storage.readStoredGameArray('muzikazRadToxHiddenRows').length, 0);
    assert.equal(storage.readStoredGameArray('muzikazRadToxBackpack').length, 0);
    assert.equal(new Set(storage.readStoredGameArray('muzikazActiveBackpackItems')).size, 0);
  }
  for (const value of [null, '', 'undefined', '<html>', 'null', '[]', 'true', '"avatar"']) {
    const storage = cachedGame(value);
    assert.equal(storage.readStoredGameObject('muzikazDesignatedAvatar', null), null);
    assert.deepEqual(Object.keys(storage.readStoredGameObject('muzikazLandClaims')), []);
  }
  const blocked = cachedGame(null, true);
  assert.equal(blocked.readStoredGameArray('backpack').length, 0);
  assert.equal(blocked.readStoredGameObject('avatar', null), null);
  const denied = runInNewContext(storageSource.replace(/export /g, '') +
    ';Object.defineProperty(globalThis,"localStorage",{get(){throw Error("Denied")}});readStoredGameArray("hud")');
  assert.equal(denied.length, 0);
});

test('valid game preferences, rewards and avatar records survive unchanged', () => {
  const rows = cachedGame('["weapons","backpack"]');
  assert.equal(Array.from(rows.readStoredGameArray('hud')).join(','), 'weapons,backpack');
  const rewards = cachedGame('[{"id":"reward-1","name":"Cache","level":4}]').readStoredGameArray('rewards');
  assert.equal(rewards[0].id, 'reward-1');
  assert.equal(rewards[0].level, 4);
  const avatar = cachedGame('{"id":"avatar-1","modelUrl":"/avatar.glb"}').readStoredGameObject('avatar', null);
  assert.equal(avatar.modelUrl, '/avatar.glb');
});

test('engine cache consumers use typed reads before constructing sets or appending rewards', () => {
  assert.ok(engineSource.includes("from './game-storage.js'"));
  assert.match(engineSource, /new Set\(readStoredGameArray\(rowStorageKey\)\)/);
  assert.ok(engineSource.includes("this.backpackRewards=readStoredGameArray('muzikazRadToxBackpack')"));
  assert.ok(engineSource.includes("readStoredGameArray('muzikazCustomGamePlacements')"));
  assert.ok(engineSource.includes("readStoredGameObject('muzikazDesignatedAvatar',null)"));
  assert.doesNotMatch(engineSource, /JSON\.parse\(localStorage\.getItem/);
});

function launcherHarness(href = 'https://game.test/model-explorer.html?environment=casino&mode=solo#play') {
  const handlers = new Map(), emitted = [], replacements = [], timers = new Map();
  const button = {disabled:false, textContent:'Begin Game', addEventListener(type, fn) { this.click = fn; }};
  const overlay = {classList:{add(){},remove(){}}}, status = {textContent:''};
  const document = {
    body:{dataset:{}},
    querySelector:()=>button,
    getElementById:id=>id === 'house-game-start' ? overlay : status,
    addEventListener(type, fn) {handlers.set(type, fn);},
    dispatchEvent(event) {emitted.push(event.type);handlers.get(event.type)?.(event);}
  };
  let rejectImport, imports = 0;
  const window = {
    location:{href, search:new URL(href).search, replace(url) {replacements.push(url);}},
    setTimeout(fn) {timers.set(timers.size + 1, fn); return timers.size;},
    clearTimeout(id) {timers.delete(id);}
  };
  const context = {
    window, document, URL, URLSearchParams,
    CustomEvent:class {constructor(type, options) {this.type=type;this.detail=options.detail;}},
    loadEngine() {imports++;return new Promise((resolve,reject)=>{rejectImport=reject;});}
  };
  // Inject only the async module transport; execute the actual launcher logic.
  runInNewContext(launcherSource.replace(/import\('[^']+'\)/, 'loadEngine()'), context);
  return {
    click:()=>button.click({preventDefault(){}}),
    emit:(type,detail={})=>document.dispatchEvent({type,detail}),
    fail:async()=>{rejectImport(new SyntaxError('JSON.parse: unexpected character'));await Promise.resolve();},
    get imports(){return imports;},
    button,status,document,emitted,replacements,timers
  };
}

test('failed module retry restarts one clean document and preserves the selected world', async () => {
  const game = launcherHarness();
  game.click(); game.click();
  assert.equal(game.imports, 1);
  await game.fail();
  assert.equal(game.button.disabled, false);
  assert.equal(game.button.textContent, 'Try again');
  assert.match(game.status.textContent, /JSON.parse/);
  assert.equal(game.timers.size, 0);
  game.click(); game.click();
  assert.equal(game.imports, 1, 'never reuse a failed module evaluation');
  assert.equal(game.replacements.length, 1);
  const restart = new URL(game.replacements[0]);
  assert.equal(restart.searchParams.get('environment'), 'casino');
  assert.equal(restart.searchParams.get('mode'), 'solo');
  assert.equal(restart.searchParams.get('autoplay'), '1');
  assert.equal(restart.hash, '#play');
  const restarted = launcherHarness(restart.href);
  assert.equal(restarted.imports, 1, 'clean document automatically starts the selected game');
});

test('world initialization failure retries the ready engine without a page restart', () => {
  const game = launcherHarness();
  game.click();
  game.emit('muzikaz:rad-tox-engine-ready');
  game.emit('muzikaz:rad-tox-native-error', {message:'World connection unavailable'});
  game.click();
  assert.equal(game.imports, 1);
  assert.equal(game.replacements.length, 0);
  assert.equal(game.emitted.filter(type=>type === 'muzikaz:rad-tox-request').length, 2);
  game.emit('muzikaz:gameplay-ready');
  assert.equal(game.document.body.dataset.gameControls, 'ready');
});

test('a module that throws after announcing readiness still needs a clean document', async () => {
  const game = launcherHarness();
  game.click();
  game.emit('muzikaz:rad-tox-engine-ready');
  await game.fail();
  game.click();
  assert.equal(game.imports, 1);
  assert.equal(game.replacements.length, 1);
});
