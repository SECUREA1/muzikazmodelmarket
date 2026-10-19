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
    assert.equal(camera.nextGameCameraMode(camera.nextGameCameraMode('top-down')), 'top-down');
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

test('broadcast preference survives travel while V returns to a player view', () => {
  assert.equal(camera.normalizeGameCameraMode('broadcast'), 'broadcast');
  assert.equal(camera.writeGameCameraMode('broadcast'), 'broadcast');
  assert.equal(camera.nextGameCameraMode('broadcast'), 'first-person');
});

test('each view saves independent bounded zoom and tolerates corrupt or blocked storage', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
  try {
    assert.deepEqual(camera.readGameCameraScales(), {'first-person':1,'top-down':1,broadcast:1});
    camera.writeGameCameraScale('first-person',1.3);camera.writeGameCameraScale('top-down',99);camera.writeGameCameraScale('broadcast',-10);
    assert.deepEqual(camera.readGameCameraScales(), {'first-person':1.3,'top-down':1.6,broadcast:.6});
    camera.writeGameCameraScale('unknown',1.5);
    assert.equal(Object.keys(JSON.parse(values.get(camera.GAME_CAMERA_SCALES_KEY))).length,3);
    values.set(camera.GAME_CAMERA_SCALES_KEY,'invalid json');
    assert.equal(camera.readGameCameraScales().broadcast,1);
    values.set(camera.GAME_CAMERA_SCALES_KEY,'{"broadcast":"broken","top-down":null}');
    assert.equal(camera.readGameCameraScales().broadcast,1);assert.equal(camera.readGameCameraScales()['top-down'],1);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage blocked');}});
    assert.equal(camera.writeGameCameraScale('broadcast',1.4),1.4);assert.equal(camera.readGameCameraScales().broadcast,1);
  } finally {
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
  }
});

test('camera scale magnifies the lens consistently including narrow firing range scopes', () => {
  for(const fov of [4,11,48,76]){
    assert.equal(camera.scaleGameCameraFov(fov,1),fov);
    const close=camera.scaleGameCameraFov(fov,1.6),wide=camera.scaleGameCameraFov(fov,.6);
    assert.ok(close<fov&&wide>fov);
    assert.ok(Math.abs(Math.tan(fov*Math.PI/360)/Math.tan(close*Math.PI/360)-1.6)<1e-10);
  }
  for(const value of [NaN,Infinity,'broken',null])assert.ok(Number.isFinite(camera.scaleGameCameraFov(value,value)));
});
