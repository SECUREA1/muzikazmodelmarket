import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';

const vendor = new URL('../public/vendor/three/three.module.min.js', import.meta.url).href;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const pendingLoads = new Map();
globalThis.__radBossTestLoad = path => {
  const pending = pendingLoads.get(path);
  if (!pending) throw new Error('Unexpected test asset: ' + path);
  pending.calls++;
  return pending.promise;
};
const loader = moduleUrl('export class GLTFLoader { loadAsync(path) { return globalThis.__radBossTestLoad(path); } }');
const source = (await readFile(new URL('../public/js/enemies/airborne-honey-bee.js', import.meta.url), 'utf8'))
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/+esm', vendor)
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm', loader);
const { AirborneHoneyBee, BEE_CONFIG, AAPE_BOSS_CONFIG, BEEDUCK_BOSS_CONFIG } = await import(moduleUrl(source));
let assetCounter = 0;
function deferred(config = BEE_CONFIG) {
  const path = 'test-boss-' + (++assetCounter), entry = { calls: 0 };
  entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
  pendingLoads.set(path, entry);
  return { entry, config: { ...config, modelPath: path } };
}
function fixture(config = BEE_CONFIG, overrides = {}) {
  const scene = new THREE.Scene(), player = new THREE.Vector3(0, 0, 5), damage = [], defeats = [];
  const boss = new AirborneHoneyBee({ scene, config, spawn: new THREE.Vector3(), environmentMeshes: () => [],
    getPlayerPosition: () => player, damagePlayer: (...args) => damage.push(args), onDefeated: () => defeats.push(true), ...overrides });
  return { scene, player, damage, defeats, boss };
}
function visibleMeshes(root) { const meshes = []; root.traverse(object => { if (object.isMesh && object.visible) meshes.push(object); }); return meshes; }

test('every boss is visible, animated, interactive and attacking before its GLB resolves', async () => {
  for (const config of [BEE_CONFIG, AAPE_BOSS_CONFIG, BEEDUCK_BOSS_CONFIG]) {
    const asset = deferred(config), f = fixture(asset.config), pending = f.boss.load();
    try {
      assert.equal(f.boss.ready, true); assert.ok(visibleMeshes(f.boss.root).length >= 3);
      assert.equal(f.scene.children.includes(f.boss.root), true);
      if (!config.airborne) f.player.z = 1.5;
      const before = config.airborne ? f.boss.wings[0].rotation.z : f.boss.sword.rotation.z;
      f.boss.update(1 / 60, 1);
      if (config.airborne) { assert.equal(f.boss.projectiles.length, config.sprayCount); assert.notEqual(f.boss.wings[0].rotation.z, before); }
      else assert.equal(f.damage.length, 1);
      assert.equal(f.boss.takeDamage(NaN), false); assert.equal(f.boss.takeDamage(-1), false);
      for (let hit = 0; hit < config.maxHealth; hit++) f.boss.takeDamage(1);
      assert.equal(f.boss.state, 'DEFEATED'); assert.equal(f.defeats.length, 1);
      assert.equal(f.boss.takeDamage(1), false); assert.equal(f.defeats.length, 1);
      asset.entry.resolve({ scene: new THREE.Group(), animations: [] });
      assert.equal(await pending, false, 'a late asset cannot resurrect a defeated boss');
    } finally { f.boss.dispose(); }
  }
});

test('a late boss model replaces only visuals and preserves live combat and clearance', async () => {
  const asset = deferred(), f = fixture(asset.config), pending = f.boss.load();
  try {
    f.player.z = 11; for (let frame = 0; frame < 30; frame++) f.boss.update(1 / 60, frame / 60);
    f.boss.takeDamage(4);
    const before = f.boss.root.position.clone(), floor = before.y + f.boss.modelBottom;
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    asset.entry.resolve({ scene, animations: [] });
    assert.equal(await pending, true); assert.equal(f.boss.health, 16);
    assert.equal(f.boss.root.position.x, before.x); assert.equal(f.boss.root.position.z, before.z);
    assert.ok(Math.abs(f.boss.root.position.y + f.boss.modelBottom - floor) < 1e-9);
    assert.equal(f.boss.visual.children.filter(object => object.name.endsWith(' GLB')).length, 1);
    await f.boss.load(); assert.equal(asset.entry.calls, 1); assert.equal(f.boss.health, 16);
  } finally { f.boss.dispose(); }
});

test('failed or cancelled boss loads retain active fallback without leaks and can retry next level', async () => {
  const asset = deferred(), f = fixture(asset.config), pending = f.boss.load();
  f.boss.dispose(); asset.entry.reject(new Error('offline'));
  assert.equal(await pending, false); assert.equal(f.scene.children.length, 0);
  const next = fixture(asset.config), retry = deferred();
  pendingLoads.set(asset.config.modelPath, retry.entry);
  const nextLoad = next.boss.load();
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  retry.entry.resolve({ scene, animations: [] });
  try { assert.equal(await nextLoad, true); assert.equal(retry.entry.calls, 1); } finally { next.boss.dispose(); }
});

test('cached GLB bosses receive independent skeletons and animation bones', async () => {
  const asset = deferred(), a = fixture(asset.config), b = fixture(asset.config);
  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'boss-root-bone';
  const geometry = new THREE.BoxGeometry(), count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let index = 0; index < count; index++) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); skin.add(bone); skin.bind(new THREE.Skeleton([bone])); scene.add(skin);
  const loads = [a.boss.load(), b.boss.load()]; asset.entry.resolve({ scene, animations: [] });
  try {
    assert.deepEqual(await Promise.all(loads), [true, true]); assert.equal(asset.entry.calls, 1);
    const left = visibleMeshes(a.boss.root).find(mesh => mesh.isSkinnedMesh), right = visibleMeshes(b.boss.root).find(mesh => mesh.isSkinnedMesh);
    assert.notEqual(left.skeleton, right.skeleton); assert.notEqual(left.skeleton.bones[0], bone); assert.notEqual(left.skeleton.bones[0], right.skeleton.bones[0]);
    left.skeleton.bones[0].position.x = 7; assert.equal(right.skeleton.bones[0].position.x, 0); assert.equal(bone.position.x, 0);
  } finally { a.boss.dispose(); b.boss.dispose(); geometry.dispose(); skin.material.dispose(); }
});

test('honey flight reuses geometry and meshes and throttles ground queries independently of FPS', () => {
  const f = fixture(BEEDUCK_BOSS_CONFIG); f.player.set(100, 100, 100);
  let queries = 0; f.boss.groundAt = () => { queries++; return null; };
  try {
    f.boss.fireHoney(f.player); const firstMeshes = f.boss.projectiles.map(projectile => projectile.mesh);
    for (let frame = 0; frame < 60; frame++) f.boss.updateProjectiles(1 / 60, frame / 60, f.player);
    assert.ok(queries <= 40, `${queries} queries should be below the previous 300 queries/second`);
    assert.equal(new Set(firstMeshes.map(mesh => mesh.geometry)).size, 1);
    while (f.boss.projectiles.length) f.boss.removeProjectile(f.boss.projectiles.at(-1));
    f.boss.fireHoney(f.player); assert.ok(f.boss.projectiles.every(projectile => firstMeshes.includes(projectile.mesh)));
    const trajectories = [];
    for (const fps of [30, 60, 120]) {
      while (f.boss.projectiles.length) f.boss.removeProjectile(f.boss.projectiles.at(-1));
      f.boss.fireHoney(f.player);
      for (let frame = 0; frame < fps; frame++) f.boss.updateProjectiles(1 / fps, frame / fps, f.player);
      trajectories.push(f.boss.projectiles[0].mesh.position.clone());
    }
    for (const position of trajectories) assert.ok(position.distanceTo(trajectories[0]) < 1e-10);
  } finally { f.boss.dispose(); }
});

test('ground samples stay on the current floor and their spatial cache remains bounded', () => {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2; floor.updateMatrixWorld(true);
  const upper = floor.clone(); upper.position.y = 4; upper.updateMatrixWorld(true);
  const f = fixture(BEE_CONFIG, { environmentMeshes: () => [upper, floor] });
  try {
    const hit = f.boss.groundAt(new THREE.Vector3(0, .1, 0)); assert.ok(hit); assert.ok(Math.abs(hit.point.y) < 1e-9);
    assert.equal(f.boss.groundAt(new THREE.Vector3(.1, .1, .1)), hit, 'nearby floor samples reuse the raycast');
    for (let index = 0; index < 180; index++) f.boss.groundAt(new THREE.Vector3(index - 90, .1, 0));
    assert.ok(f.boss.groundCache.size <= 128);
  } finally { f.boss.dispose(); floor.geometry.dispose(); floor.material.dispose(); }
});
