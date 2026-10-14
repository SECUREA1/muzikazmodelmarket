import test from 'node:test';
import assert from 'node:assert/strict';
import { FlameContactClock, Flamethrower, flamePressure, FLAME_CONFIG } from '../public/js/flamethrower.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('low fuel keeps full throw distance and speed; empty fuel cannot launch', () => {
  for (const fuel of [100, 20, 10, 1]) {
    assert.equal(flamePressure(fuel).range, FLAME_CONFIG.range);
    assert.equal(flamePressure(fuel).speed, FLAME_CONFIG.speed);
  }
  assert.equal(flamePressure(-10).range, flamePressure(0).range);
});

function setup(colliders = () => [], damage = () => {}) {
  const scene = new THREE.Scene();
  const system = new Flamethrower({ THREE, scene, colliders, damage });
  return { scene, system };
}

test('spray travels toward horizontal, upward and downward aim without dropping, then fades', () => {
  for (const direction of [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
    const { system } = setup();
    system.fuel = 1;
    assert.equal(system.fire(new THREE.Vector3(0, 2, 0), direction), true);
    const flame = system.flames[0], velocity = flame.velocity.clone();
    assert.ok(velocity.clone().normalize().dot(direction) > .998);
    system.update(.25, .25);
    assert.ok(flame.root.position.distanceTo(new THREE.Vector3(0, 2, 0)) > 5.9);
    assert.deepEqual(flame.velocity, velocity);
    system.update(.2, .45);
    assert.ok(flame.root.children[0].material.opacity > 0);
    assert.ok(flame.root.children[0].material.opacity < 1);
    system.update(1, 1.45);
    assert.equal(system.flames.length, 0);
    assert.equal(flame.root.parent, null);
    assert.equal(system.fire(new THREE.Vector3(), direction), false);
    system.dispose();
  }
});

test('a distant item ignites on a swept hit and continues burning before expiring', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 2, -8);
  let hits = 0;
  const { scene, system } = setup(() => [{ root: target }], (object, amount) => {
    assert.equal(object, target);
    hits += amount;
  });
  scene.add(target);
  system.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1));
  system.update(.5, .5);
  const flame = system.flames[0];
  assert.equal(flame.landed, true);
  assert.equal(flame.anchor, target);
  assert.ok(flame.root.position.z < -7);
  for (let i = 0; i < 11; i++) system.update(1, i + 1.5);
  assert.equal(hits, 10);
  assert.equal(system.flames.length, 0);
  system.dispose();
  target.geometry.dispose();
  target.material.dispose();
});

test('a long frame cannot ignite an object beyond maximum spray range', () => {
  const { scene, system } = setup();
  const target = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 2, -15);
  scene.add(target);
  system.colliders = () => [{ root: target }];
  system.impact = () => assert.fail('hit beyond range');
  system.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1));
  system.update(2, 2);
  assert.equal(system.flames.length, 0);
  system.dispose();
  target.geometry.dispose();
  target.material.dispose();
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
