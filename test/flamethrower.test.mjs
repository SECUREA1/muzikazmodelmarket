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

test('airborne spray starts along the aim, arcs under gravity, and fades without a surface', () => {
  for (const direction of [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
    const { system } = setup();
    system.fuel = 1;
    assert.equal(system.fire(new THREE.Vector3(0, 1.7, 0), direction), true);
    const flame = system.flames[0], initialVelocity = flame.velocity.clone();
    assert.ok(initialVelocity.clone().normalize().dot(direction) > .997);
    system.update(.25, .25);
    assert.ok(Math.abs(flame.velocity.y - initialVelocity.y + FLAME_CONFIG.gravity * .25) < 1e-9);
    assert.ok(flame.root.position.distanceTo(new THREE.Vector3(0, 1.7, 0)) > 1.4);
    system.update(.85, 1.1);
    assert.ok(flame.root.children[0].material.opacity > 0);
    assert.ok(flame.root.children[0].material.opacity < 1);
    system.update(1, 2.1);
    assert.equal(system.flames.length, 0);
    assert.equal(flame.root.parent, null);
    assert.equal(system.fire(new THREE.Vector3(), direction), false);
    system.dispose();
  }
});

test('level spray lands 3–4 metres ahead across fuel levels, spread and frame rates', () => {
  for (const step of [1 / 120, 1 / 30, .25, 1]) {
    for (const fuel of [100, 1]) {
      for (let shot = 0; shot < 8; shot++) {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(30, .2, 30), new THREE.MeshBasicMaterial());
        floor.position.y = -.1;
        const { scene, system } = setup(() => [{ root: floor }]);
        scene.add(floor);
        system.fuel = fuel;
        system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
        const flame = system.flames[0];
        for (let time = 0; time < 1.2 && !flame.landed; time += step) system.update(step, time + step);
        assert.equal(flame.landed, true);
        assert.ok(-flame.root.position.z >= 3 && -flame.root.position.z <= 4, `landing ${-flame.root.position.z}`);
        assert.ok(flame.root.position.y < .2);
        assert.equal(flame.anchor, floor);
        assert.ok(flame.root.quaternion.angleTo(new THREE.Quaternion()) < 1e-9);
        system.dispose();
        floor.geometry.dispose();
        floor.material.dispose();
      }
    }
  }
});

test('an item in front ignites on a swept hit and continues burning before expiring', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 1.5, -3.5);
  let hits = 0;
  const { scene, system } = setup(() => [{ root: target }], (object, amount) => {
    assert.equal(object, target);
    hits += amount;
  });
  scene.add(target);
  system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
  system.update(.5, .5);
  const flame = system.flames[0];
  assert.equal(flame.landed, true);
  assert.equal(flame.anchor, target);
  assert.ok(flame.root.position.z < -3);
  for (let i = 0; i < 11; i++) system.update(1, i + 1.5);
  assert.equal(hits, 10);
  assert.equal(system.flames.length, 0);
  system.dispose();
  target.geometry.dispose();
  target.material.dispose();
});

test('long frames expire missed spray without hitting objects beyond its lifetime', () => {
  const { scene, system } = setup();
  const target = new THREE.Mesh(new THREE.BoxGeometry(3, 20, .5), new THREE.MeshBasicMaterial());
  target.position.set(0, 0, -15);
  scene.add(target);
  system.colliders = () => [{ root: target }];
  system.impact = () => assert.fail('hit beyond range');
  system.fire(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
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
