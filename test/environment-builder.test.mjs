import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('environment builder exposes layout, placement and editing controls', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['library-grid', 'land-canvas', 'layout-select', 'rotation-control', 'scale-control', 'position-x', 'position-y', 'duplicate-object', 'remove-object', 'save-scene', 'play-scene']) assert.match(html, new RegExp(`id="${control}"`));
  for (const layout of ['grand-floor', 'loft', 'suite', 'courtyard']) assert.match(html, new RegExp(`value="${layout}"`));
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)',\d+\]/g) || []).length, 20);
  for (const behavior of ['pointermove', 'dragstart', 'drop', 'localStorage.setItem', 'LOCKED PROPORTIONS']) assert.match(`${html}\n${script}`, new RegExp(behavior));
  assert.match(script, /muzikaz\.builder\.buildTray/);
  assert.match(script, /multiplayer:true, enemies:true, weapons:true, pickups:true/);
  assert.match(script, /model-explorer\.html\?environment=/);
});

test('environment builder supports custom role-play actors and interactions', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['open-item-maker', 'item-maker', 'custom-item-name', 'custom-item-type', 'custom-item-color', 'custom-item-behavior', 'object-color', 'object-behavior']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const category of ['avatar', 'enemy', 'interactive']) assert.match(html, new RegExp(`data-library-filter="${category}"`));
  for (const behavior of ['talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal']) assert.match(html, new RegExp(`value="${behavior}"`));
  assert.match(script, /muzikaz\.environmentBuilder\.customItems\.v1/);
  assert.match(script, /data-delete-model/);
  assert.match(script, /customRoles:true/);
  assert.ok((script.match(/type:'enemy'/g) || []).length >= 4, 'includes several ready-made enemies');
  assert.ok((script.match(/type:'interactive'/g) || []).length >= 4, 'includes several interactive role-play objects');
});

test('in-game Builder Map menu opens the environment builder and restores playable maps', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(game, /class="rad-build-launch" href="environment-builder\.html\?from=game"/);
  assert.match(game, /addSavedBuilderWorld/);
  assert.match(game, /loadBuilderDecor/);
  assert.match(game, /roomId:env\.id/);
  assert.match(game, /toxicBubbleSystem\.handleEnvironmentReady\(env\)/);
});

test('Builder Pack layouts open as new environment maps', async () => {
  const script = await readFile(new URL('../builder-market.js', import.meta.url), 'utf8');
  assert.match(script, /environment-builder\.html\?layout=/);
  assert.match(script, /room\.dataset\.roomStyle/);
  assert.match(script, /dataset\.packTemplate/);
});
