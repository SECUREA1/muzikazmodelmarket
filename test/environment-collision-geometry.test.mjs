import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';

const three = new URL('../public/vendor/three/three.module.min.js', import.meta.url).href;
const source = (await readFile(new URL('../public/js/environments/environment-collision.js', import.meta.url), 'utf8'))
  .replace("'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm'", JSON.stringify(three))
  .replace(/import \{ Octree \} from [^;]+;/, 'class Octree { fromGraphNode(root) { root.updateMatrixWorld(true); this.source = root; } }');
const {buildCollision} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function mesh(name, material = new THREE.MeshBasicMaterial()) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), material);
  object.name = name;
  return object;
}

function dispose(...roots) {
  const resources = new Set();
  roots.forEach((root) => root?.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    [].concat(object.material || []).forEach((material) => resources.add(material));
  }));
  resources.forEach((resource) => resource.dispose());
}

test('local colliders match transformed map geometry exactly, including scaled and rotated parents', () => {
  const root = new THREE.Group();
  root.position.set(12, 3, -7);
  root.scale.set(2, 1.5, 0.5);
  root.rotation.y = 0.4;
  const group = new THREE.Group();
  group.position.set(-3, 2, 6);
  group.rotation.set(0.2, 0.6, 0.1);
  const wall = mesh('WALL');
  wall.position.set(5, 1, -2);
  wall.rotation.set(0.1, -0.25, 0.2);
  wall.scale.set(0.5, 3, 1.2);
  group.add(wall);
  root.add(group);

  const collision = buildCollision(root);
  const collider = collision.octree.source.getObjectByName(wall.name);
  assert.ok(collider);
  collider.matrixWorld.elements.forEach((value, index) => {
    assert.ok(Math.abs(value - wall.matrixWorld.elements[index]) < 1e-10, `world transform component ${index} stays aligned`);
  });
  const visibleBounds = new THREE.Box3().setFromObject(wall);
  const colliderBounds = new THREE.Box3().setFromObject(collider);
  assert.ok(visibleBounds.min.distanceTo(colliderBounds.min) < 1e-10);
  assert.ok(visibleBounds.max.distanceTo(colliderBounds.max) < 1e-10);
  assert.ok(collision.containment.bounds.min.distanceTo(visibleBounds.min) < 1e-10, 'containment also uses the updated map transform');
  dispose(root, collision.containment.root);
});

test('overlapping supplemental roots register each physical mesh only once', () => {
  const root = new THREE.Group();
  const group = new THREE.Group();
  const floor = mesh('GROUND');
  group.add(floor);
  root.add(group);
  const collision = buildCollision(root, 'auto', [root, group, group, floor]);
  assert.deepEqual(collision.collisionMeshes, [floor]);
  assert.deepEqual(collision.visibleMeshes, [floor]);
  assert.equal(collision.octree.source.children.filter((object) => object.name === 'GROUND').length, 1);
  assert.equal(collision.floorMeshes.filter((object) => object === floor).length, 1);
  dispose(root, collision.containment.root);
});

test('implicit scenery follows ancestor visibility and all materials while explicit hidden colliders remain solid', () => {
  const root = new THREE.Group();
  const hidden = new THREE.Group();
  hidden.visible = false;
  const ghost = mesh('HIDDEN_WALL');
  const explicit = mesh('COLLIDER_WALL');
  hidden.add(ghost, explicit);
  const multi = mesh('VISIBLE_WALL', [new THREE.MeshBasicMaterial({visible: false}), new THREE.MeshBasicMaterial()]);
  const disabled = mesh('DISABLED_WALL');
  disabled.userData.collider = true;
  const disabledParent = new THREE.Group();
  disabledParent.userData.collisionDisabled = true;
  disabledParent.add(disabled);
  root.add(hidden, multi, disabledParent);

  const collision = buildCollision(root, 'auto', [], {buildOctree: false});
  assert.deepEqual(collision.visibleMeshes, [multi]);
  assert.deepEqual(collision.collisionMeshes, [explicit, multi]);
  assert.ok(!collision.collisionMeshes.includes(ghost), 'an invisible ordinary mesh cannot form a ghost wall');
  assert.ok(!collision.collisionMeshes.includes(disabled), 'authored collision disabling wins over explicit collider metadata');
  dispose(root, collision.containment.root);
});
