import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {Octree} from '../public/js/environments/collision-tree.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';

test('coincident GLB triangles occupy bounded leaves without exponential replication', () => {
  const tree = new Octree(), count = 65536;
  for (let index = 0; index < count; index++) tree.addTriangle(new THREE.Triangle(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(-10, 0, 10), new THREE.Vector3(10, 0, 10)));
  tree.build();
  let stored = 0, deepest = 0;
  const inspect = (node, depth = 0) => {
    stored += node.triangles.length;
    deepest = Math.max(deepest, depth);
    assert.ok(node.triangles.length <= 32);
    for (const child of node.subTrees) inspect(child, depth + 1);
  };
  inspect(tree);
  assert.equal(stored, count, 'each authored triangle remains present exactly once');
  assert.ok(deepest <= 11, 'coincident centroids still split into a balanced hierarchy');
  const triangles = tree.getRayTriangles(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0)), []);
  assert.equal(triangles.length, count);
  assert.equal(new Set(triangles).size, count);
});

test('bounded collision trees retain wall, floor, capsule and sphere query behavior', () => {
  const root = new THREE.Group(), floor = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 20)), wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 3, 10));
  floor.position.y = -.1; wall.position.set(1, 1.5, 0); root.add(floor, wall);
  const tree = new Octree().fromGraphNode(root);
  const hit = tree.rayIntersect(new THREE.Ray(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0)));
  assert.ok(Math.abs(hit.position.y) < 1e-8);
  assert.equal(tree.rayIntersect(new THREE.Ray(new THREE.Vector3(20, 3, 0), new THREE.Vector3(0, -1, 0))), false);
  const overlap = new Capsule(new THREE.Vector3(.8, .36, 0), new THREE.Vector3(.8, 1.33, 0), .34);
  assert.ok(tree.capsuleIntersect(overlap));
  assert.ok(tree.sphereIntersect(new THREE.Sphere(new THREE.Vector3(.8, 1, 0), .34)));
  const capsule = new Capsule(new THREE.Vector3(0, .36, 0), new THREE.Vector3(0, 1.33, 0), .34);
  moveWalkingCapsule(capsule, {x: 2, y: -.1, z: .5}, {octree: tree, grounded: true});
  assert.ok(capsule.start.x > .55 && capsule.start.x < .561, 'solid walls clip the capsule');
  assert.ok(Math.abs(capsule.start.z - .5) < 1e-8, 'free movement along a wall remains smooth');
  assert.ok(Math.abs(capsule.start.y - .36) < 1e-8, 'the visible floor still supports the feet');
});

test('dense hosted GLB maps keep local walking collision through refresh and scaling', () => {
  const scene = new THREE.Scene(), loader = new EnvironmentLoader({scene, renderer: {extensions: {has: () => false}, capabilities: {isWebGL2: true}}, serverAuthoritative: () => true, localCollision: true});
  const root = new THREE.Group(), floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 180, 180)), wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 3, 10));
  floor.name = 'GROUND'; floor.rotation.x = -Math.PI / 2; wall.name = 'WALL'; wall.position.set(1, 1.5, 0); root.add(floor, wall); scene.add(root);
  loader.world = root; loader.activeEnvironment = {id: 'dense-hosted-glb', modelUrl: 'fixture.glb'};
  for (const refresh of [() => loader.setSpaceScale(1), () => loader.setSupplementalCollisionRoots([]), () => loader.setSpaceScale(2)]) {
    const result = refresh(), collision = result.collision || result;
    assert.ok(collision.triangleCount > 60000, 'the fixture exceeds the former hosted-map collision cutoff');
    assert.equal(loader.localCollisionReady, true, 'network-independent walking remains available');
    assert.ok(loader.octree.rayIntersect(new THREE.Ray(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0))));
    const capsule = new Capsule(new THREE.Vector3(0, .36, 0), new THREE.Vector3(0, 1.33, 0), .34);
    moveWalkingCapsule(capsule, {x: .15, y: -.01, z: .15}, {octree: loader.octree, grounded: true});
    assert.ok(capsule.start.x > .149 && capsule.start.z > .149, 'fresh controls move before a server response');
    assert.ok(Math.abs(capsule.start.y - .36) < 1e-6);
  }
  loader.unload();
});
