import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {raycastSolidSurfaces} from '../public/js/collision-surfaces.js';

const source = readFileSync(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
const classSource = source.slice(source.indexOf('  class ToxicBubbleSystem {'), source.indexOf('  let viewActive'));
const builderDecor = new THREE.Group(), playerRig = new THREE.Group();
const config = {batSwingDuration: .4, batReach: 3, batDamage: 50, toxinRange: 8.5, toxinDamage: 50};
const System = new Function('THREE', 'raycastSolidSurfaces', 'builderDecor', 'playerRig', 'TOXIC_BUBBLE_CONFIG', classSource + ';return ToxicBubbleSystem;')(THREE, raycastSolidSurfaces, builderDecor, playerRig, config);

function setup() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
  wall.position.z = -1;
  wall.rotation.y = Math.PI; // A GLB wall whose authored front faces away from the player.
  const group = new THREE.Group(), target = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshBasicMaterial());
  target.position.z = -2;
  target.userData = {toxicBubble: true, health: 100};
  group.add(target);
  scene.add(wall, group, camera);
  scene.updateMatrixWorld(true);
  const system = Object.create(System.prototype);
  Object.assign(system, {
    scene, camera, group, loader: {meshes: [wall]}, bricks: [], drawingStrokes: [],
    bubbles: [target], endBoss: null, batHitIds: new Set(),
    raycaster: new THREE.Raycaster(), surfaceRaycaster: new THREE.Raycaster(),
    getPlayerPosition: () => new THREE.Vector3(), tone() {}, setState() {},
  });
  return {system, wall, target};
}

test('reticle targeting stops at the rear face of a GLB wall and works through an opening', () => {
  const {system, wall, target} = setup();
  assert.equal(system.targetAt(new THREE.Vector2()), null);
  wall.position.x = 5;
  assert.equal(system.targetAt(new THREE.Vector2()), target);
});

test('bat hits require an unobstructed target and honor authored pass-through surfaces', () => {
  const {system, wall, target} = setup();
  const damaged = [];
  system.damageTarget = enemy => damaged.push(enemy);
  system.startBatSwing();
  assert.deepEqual(damaged, []);
  wall.userData.collision = false;
  system.startBatSwing();
  assert.deepEqual(damaged, [target]);
});

test('line-of-sight queries retain caller range and ignore the target itself', () => {
  const {system, wall, target} = setup();
  system.surfaceRaycaster.far = 20;
  assert.equal(system.toolLineOfSight(new THREE.Vector3(), target), false);
  assert.equal(system.surfaceRaycaster.far, 20);
  wall.userData.solid = false;
  system.bricks.push(target);
  assert.equal(system.toolLineOfSight(new THREE.Vector3(), target), true);
});

test('fast thrown projectiles cannot tunnel through a thin back-facing wall', () => {
  const {system} = setup();
  const projectile = {position: new THREE.Vector3(), userData: {velocity: new THREE.Vector3(0, 0, -20), bounces: 0}};
  assert.ok(system.moveThrownProjectile(projectile, .2, .12, true));
  assert.ok(projectile.position.z > -.9, 'projectile stays on the launch side of the wall');
  assert.ok(projectile.userData.velocity.z > 0, 'collision reflects its velocity');
  assert.equal(projectile.userData.bounces, 1);
});

test('toxin damage stops at cover while legal visible targets still take damage', async () => {
  const {system, wall, target} = setup();
  Object.assign(system, {toxinCooldown: 0, toxinGlobs: [], motionReduced: true, spendToxinBurst: async () => 1, popBubble() {throw Error('unexpected lethal hit');}});
  await system.fireToxin(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  assert.equal(target.userData.health, 100);
  system.toxinCooldown = 0;
  wall.userData.solid = false;
  await system.fireToxin(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  assert.equal(target.userData.health, 50);
});
