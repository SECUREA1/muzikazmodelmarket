import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const collisionPath = new URL('../public/js/environments/environment-collision.js', import.meta.url);
const explorerPath = new URL('../public/js/house-explorer-glb.js', import.meta.url);

test('all loaded worlds receive an invisible floor and perimeter collision shell', async () => {
  const source = await readFile(collisionPath, 'utf8');
  assert.match(source, /createMapContainment\(collisionMeshes\)/);
  assert.match(source, /COLLIDER_MAP_SAFETY_FLOOR/);
  assert.match(source, /COLLIDER_MAP_BOUNDARY/);
  assert.match(source, /source\.add\(containment\.root\)/);
  assert.match(source, /floorMeshes\.push\(containment\.floor\)/);
});

test('builder item collision follows visibility, pickup, drop, and door state', async () => {
  const source = await readFile(explorerPath, 'utf8');
  assert.match(source, /setActive:active=>\{object\.visible=active;object\.traverse\(child=>\{if\(child\.isMesh\)child\.userData\.collisionDisabled=!active;/);
  assert.match(source, /setHeld:held=>\{if\(held\)[\s\S]{0,350}collisionDisabled=true;[\s\S]{0,350}else\{object\.traverse\(child=>\{if\(child\.isMesh\)child\.userData\.collisionDisabled=false;/);
  assert.match(source, /setDoorOpen:open=>[\s\S]{0,220}collisionDisabled=open;[\s\S]{0,80}refreshBuilderCollision/);
});
