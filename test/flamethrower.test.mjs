import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { FlameContactClock, Flamethrower, flamePressure, FLAME_CONFIG } from '../public/js/flamethrower.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

function setup(colliders = () => [], damage = () => {}) {
  const scene = new THREE.Scene();
  const system = new Flamethrower({ THREE, scene, colliders, damage });
  return { scene, system };
}

test('a click immediately ignites the aimed item and creates only a short muzzle flash', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 1.7, -8);
  let hits = 0, impacts = 0;
  const { scene, system } = setup(() => [{ root: target }], (_, amount) => hits += amount);
  system.impact = () => impacts++;
  scene.add(target);
  system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
  const flame = system.flames[0];
  assert.equal(flame.landed, true);
  assert.equal(flame.anchor, target);
  assert.ok(flame.root.position.z < -7);
  assert.equal(flame.velocity, undefined);
  assert.equal(impacts, 1);
  assert.ok(system.flash);
  system.update(FLAME_CONFIG.flashSeconds, 1);
  assert.equal(system.flash, null);
  target.position.x = 2;
  target.updateWorldMatrix(true, false);
  system.update(.1, 1.1);
  assert.ok(flame.root.position.x > 1.9, 'fire follows a moving target');
  for (let i = 0; i < 11; i++) system.update(1, i + 2);
  assert.equal(hits, 10);
  assert.equal(system.flames.length, 0);
  system.dispose(); target.geometry.dispose(); target.material.dispose();
});

test('misses and out-of-range targets produce only a flash, even at low fuel', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 1.7, -15);
  const { scene, system } = setup(() => [{ root: target }]);
  scene.add(target);
  system.fuel = 1;
  assert.equal(flamePressure(1).range, FLAME_CONFIG.range);
  assert.equal(system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1)), true);
  assert.equal(system.flames.length, 0);
  assert.ok(system.flash);
  system.update(.1, .1);
  assert.equal(system.flash, null);
  assert.equal(system.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), false);
  system.dispose(); target.geometry.dispose(); target.material.dispose();
});

test('enclosing room interiors do not ignite; the first wall blocks targets behind it', () => {
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 20), new THREE.MeshBasicMaterial());
  room.position.y = 3;
  const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 1.7, -11);
  const { scene, system } = setup(() => [{ root: room, surfaceOnly: true }, { root: target }]);
  scene.add(room, target);
  system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
  assert.equal(system.flames[0].anchor, room);
  assert.ok(system.flames[0].root.position.z < -9.7);
  system.dispose(); room.geometry.dispose(); room.material.dispose(); target.geometry.dispose(); target.material.dispose();
});

test('reset removes the flash and target fires, while cooldown prevents repeated clicks', () => {
  const { system } = setup();
  const origin = new THREE.Vector3(), aim = new THREE.Vector3(0, 0, -1);
  assert.equal(system.fire(origin, aim), true);
  assert.equal(system.fire(origin, aim), false);
  assert.equal(system.fuel, 99);
  const flash = system.flash.root;
  system.clear();
  assert.equal(flash.parent, null);
  assert.equal(system.flash, null);
  assert.equal(system.fire(origin, aim), true);
  system.dispose();
});

test('game colliders exclude carried gear from spray hits and mark room meshes as surfaces', () => {
  const source = readFileSync(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('    flameColliders(){') + '    flameColliders(){'.length,
    source.indexOf('    damageFlameTarget('));
  const playerRig = new THREE.Group(), builderDecor = new THREE.Group(), surface = new THREE.Mesh();
  const gear = new THREE.Group(), enemy = new THREE.Group();
  gear.userData.pinnedToPlayer = { socket: 'hand' };
  builderDecor.add(gear);
  const colliders = new Function('playerRig', 'builderDecor', 'playerCollider', 'THREE', 'FLAME_CONFIG',
    'return function(){' + body)(playerRig, builderDecor, {}, THREE, FLAME_CONFIG).call({
      bubbles: [enemy], avatarTargets: () => [], bricks: [], lootBlocks: [], drawingStrokes: [],
      environmentSurfaces: () => [surface], loader: { collisionMeshes: [surface] },
    });
  assert.equal(colliders.find(t => t.root === gear).projectiles, false);
  assert.equal(colliders.find(t => t.root === playerRig).projectiles, false);
  assert.equal(colliders.find(t => t.root === enemy).projectiles, true);
  assert.equal(colliders.find(t => t.root === surface).surfaceOnly, true);
});

test('a flame applies exactly ten damage ticks then expires, independent of frame rate', () => {
  for (const step of [1 / 60, .1, .7, 3]) {
    const clock = new FlameContactClock(), target = {}, hits = [];
    for (let elapsed = 0; elapsed < 12; elapsed += step) clock.update(step, [target], (object, damage) => hits.push(damage));
    assert.equal(hits.reduce((sum, damage) => sum + damage, 0), 10);
    assert.equal(clock.update(1, [target], () => assert.fail('expired fire damaged target')), 0);
  }
});

test('burning fades during the last second and contact stops when a character leaves', () => {
  const clock = new FlameContactClock(), target = {}, hits = [];
  const damage = (_, amount) => hits.push(amount);
  clock.update(.8, [target], damage);
  clock.update(.2, [], damage);
  clock.update(.4, [target], damage);
  assert.deepEqual(hits, []);
  clock.update(.6, [target], damage);
  assert.deepEqual(hits, [1]);
  clock.update(7, [], damage);
  assert.equal(clock.update(.5, [], damage), .5);
  assert.equal(clock.update(.5, [], damage), 0);
});

test('separate flame connections stack, while duplicate meshes of one target do not', () => {
  const target = {}, other = {}, damage = new Map();
  const apply = (object, amount) => damage.set(object, (damage.get(object) || 0) + amount);
  new FlameContactClock().update(1, [target, target, other], apply);
  new FlameContactClock().update(1, [target], apply);
  assert.equal(damage.get(target), 2);
  assert.equal(damage.get(other), 1);
});
