import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRIORITY_WORLD_IDS, sortWorlds} from '../public/js/world-map-catalog.js';
import {mapSectorKind, mapWheelSvg} from '../public/js/map-wheel-svg.js';

const records = JSON.parse(await readFile(new URL('../public/models/environments/environments.json', import.meta.url), 'utf8'));

test('the first map pie keeps the complete house and priority games ahead of live community worlds', () => {
  const worlds = [
    {env:{id:'busy-community-world'}, count:300},
    ...[...records].reverse().map(env => ({env, count:env.id === 'jail-cells' ? 100 : 0}))
  ];
  const original = [...worlds];
  const sorted = sortWorlds(worlds);
  assert.deepEqual(sorted.slice(0, 6).map(({env}) => env.id), PRIORITY_WORLD_IDS);
  assert.deepEqual(worlds, original, 'polling must not mutate the source world directory');
  assert.equal(sorted[6].env.id, 'busy-community-world');
  assert.equal(sorted[7].env.id, 'jail-cells');
});

test('all later map pies retain every repository GLB and published world with its original metadata', () => {
  const shared = {env:{id:'published-plaza', builderScene:{layout:'grand-floor', objects:[{id:'placed-model'}]}}, count:0};
  const worlds = [...records.map(env => ({env, count:0})), shared];
  const sorted = sortWorlds(worlds);
  const pages = Array.from({length:Math.ceil(sorted.length / 6)}, (_, index) => sorted.slice(index * 6, index * 6 + 6));
  const all = pages.flat();
  assert.equal(all.length, worlds.length);
  assert.deepEqual(new Set(all.map(({env}) => env.id)), new Set(worlds.map(({env}) => env.id)));
  for (const world of worlds) assert.ok(all.includes(world));
  assert.ok(pages.slice(1).flat().some(({env}) => env.id === 'muzikaz-main'));
  assert.ok(pages.slice(1).flat().some(({env}) => env.id === 'muzikaz-upper'));
  assert.equal(all.find(({env}) => env.id === 'muzikaz-full-house').env.modelUrls.length, 2);
});

test('missing priority maps do not create empty destinations or remove custom maps', () => {
  const worlds = [
    {env:{id:'quiet'},count:0},
    {env:{id:'force-training-range'},count:0},
    {env:{id:'permanent-world',permanent:true},count:0},
    {env:{id:'busy'},count:4}
  ];
  assert.deepEqual(sortWorlds(worlds).map(({env}) => env.id), ['force-training-range','busy','permanent-world','quiet']);
  assert.deepEqual(sortWorlds([]), []);
});

test('priority wheel labels distinguish both firing ranges and retain all six destination IDs', () => {
  const worlds = sortWorlds(records.map(env => ({env, count:0}))).slice(0, 6);
  const svg = mapWheelSvg(worlds, 'force-training-range');
  const labels = [...svg.matchAll(/class="world-sector-title"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['MUZIKAZ House','Basketball','Ice Hockey','Firing Range','Force Training','Neon Junction']);
  assert.deepEqual([...svg.matchAll(/data-world-id="([^"]+)"/g)].map(match => match[1]), PRIORITY_WORLD_IDS);
  assert.match(svg, /data-world-id="force-training-range"[^>]*aria-pressed="true"/);
});

test('lightweight and authored range and arcade records use their game artwork without hiding their own names', () => {
  assert.equal(mapSectorKind({id:'force-training-range'}), 'range');
  assert.equal(mapSectorKind({id:'shared-range',firingRange:true}), 'range');
  assert.equal(mapSectorKind({id:'custom-park',builderScene:{layout:'arcade-park'}}), 'arcade');
  const svg = mapWheelSvg([
    {env:{id:'north-rink',name:'North Rink',builderScene:{layout:'hockey-arena'}},count:0},
    {env:{id:'south-rink',name:'South Rink',builderScene:{layout:'hockey-arena'}},count:0}
  ]);
  assert.match(svg, />North Rink<\/text>/);
  assert.match(svg, />South Rink<\/text>/);
});
