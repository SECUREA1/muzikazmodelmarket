import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../public/js/game-camera.js', import.meta.url), 'utf8');
const camera = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('camera preference survives runtime travel and rejects stale modes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)}});
  try {
    assert.equal(camera.readGameCameraMode(), 'first-person');
    camera.writeGameCameraMode('top-down');
    assert.equal(camera.readGameCameraMode(), 'top-down');
    assert.equal(values.get(camera.GAME_CAMERA_STORAGE_KEY), 'top-down');
    values.set(camera.GAME_CAMERA_STORAGE_KEY, 'invalid');
    assert.equal(camera.readGameCameraMode('top-down'), 'top-down');
    assert.equal(camera.writeGameCameraMode('invalid'), 'first-person');
    assert.equal(camera.nextGameCameraMode('top-down'), 'broadcast');
    assert.equal(camera.nextGameCameraMode('broadcast'), 'first-person');
    camera.writeGameCameraMode('broadcast');
    assert.equal(camera.readGameCameraMode(), 'broadcast');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('blocked browser storage still allows camera switching', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() { throw new Error('Storage blocked'); }});
  try {
    assert.equal(camera.readGameCameraMode('top-down'), 'top-down');
    assert.equal(camera.writeGameCameraMode('top-down'), 'top-down');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('V changes view without consuming chat, settings, held keys, or browser shortcuts', () => {
  assert.equal(camera.isGameCameraToggleKey({key: 'v'}), true);
  assert.equal(camera.isGameCameraToggleKey({key: 'V', shiftKey: true}), false);
  for (const flag of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
    assert.equal(camera.isGameCameraToggleKey({key: 'v', [flag]: true}), false, flag);
  }
  assert.equal(camera.isGameCameraToggleKey({key: 'v', target: {isContentEditable: true}}), false);
  assert.equal(camera.isGameCameraToggleKey({key: 'v', target: {closest: () => ({tagName: 'INPUT'})}}), false);
  assert.equal(camera.isGameCameraToggleKey({key: 'b'}), false);
});

test('shared camera controls identify every view with a distinct icon and next-view label',()=>{
 const icons=new Set();for(const mode of camera.GAME_CAMERA_MODES){const view=camera.gameCameraPresentation(mode);assert.equal(view.mode,mode);assert.equal(view.next,camera.nextGameCameraMode(mode));assert.ok(view.title.includes(view.label));icons.add(view.icon);}assert.equal(icons.size,3);
});
test('all game entry pages connect to the shared camera engines',async()=>{
 for(const page of ['index.html','model-market.html','model-explorer.html']){const html=await readFile(new URL('../'+page,import.meta.url),'utf8');assert.ok(html.includes('public/js/rad-tox-launcher.js'),page);}
 for(const engine of ['house-explorer-glb.js','hockey-game.js','arcade-game.js']){const js=await readFile(new URL('../public/js/'+engine,import.meta.url),'utf8');assert.ok(js.includes('gameCameraPresentation'));assert.ok(js.includes('nextGameCameraMode'));}
});
