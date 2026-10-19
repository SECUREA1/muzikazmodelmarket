import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {raycastSolidSurfaces} from '../public/js/collision-surfaces.js';

function plane(z = -2) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({side: THREE.FrontSide}));
  mesh.position.z = z;
  return mesh;
}

test('a world or room name cannot disable its solid child walls', () => {
  const world = new THREE.Group();
  world.name = 'WORLD_Sky_Water_District';
  const wall = plane();
  wall.name = 'Wall';
  world.add(wall);
  world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  assert.ok(raycastSolidSurfaces(ray, world).length);
  wall.name = 'SKY';
  assert.equal(raycastSolidSurfaces(ray, world).length, 0, 'the actual nonphysical sky mesh remains excluded');
});

test('thin GLB walls block rays from both faces without changing shared rendering materials', () => {
  const wall = plane();
  const front = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 3);
  const rear = new THREE.Raycaster(new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 1), 0, 3);
  assert.equal(raycastSolidSurfaces(front, [wall])[0].object, wall);
  assert.equal(raycastSolidSurfaces(rear, [wall])[0].distance, 1);
  assert.equal(wall.material.side, THREE.FrontSide);
  assert.equal(raycastSolidSurfaces(new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 1), [wall]).length, 0);
});

test('actual mesh openings stay open while transformed instances remain solid', () => {
  const geometry = new THREE.PlaneGeometry(1, 4), material = new THREE.MeshBasicMaterial();
  const wall = new THREE.InstancedMesh(geometry, material, 2);
  wall.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 0, -2));
  wall.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, -2));
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 5);
  assert.equal(raycastSolidSurfaces(ray, [wall]).length, 0, 'a doorway is not filled by a whole-model box');
  ray.set(new THREE.Vector3(2, 0, -3), new THREE.Vector3(0, 0, 1));
  const hit = raycastSolidSurfaces(ray, [wall])[0];
  assert.equal(hit.object, wall);
  assert.equal(hit.instanceId, 1);
  assert.equal(hit.distance, 1);
});

test('explicit hidden collider ancestors stay solid and inherited disabling wins', () => {
  const hidden = new THREE.Group();
  hidden.visible = false;
  const wall = plane();
  hidden.add(wall);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  assert.equal(raycastSolidSurfaces(ray, [hidden]).length, 0);
  hidden.userData.collider = true;
  assert.ok(raycastSolidSurfaces(ray, [hidden]).length);
  hidden.userData.solid = false;
  assert.equal(raycastSolidSurfaces(ray, [hidden]).length, 0);
  hidden.userData.solid = true;
  hidden.userData.collisionDisabled = true;
  assert.equal(raycastSolidSurfaces(ray, [hidden]).length, 0);
});

test('surface queries deduplicate roots, preserve nearest-hit order and honor draw ranges', () => {
  const group = new THREE.Group(), near = plane(-2), far = plane(-4);
  group.add(far, near);
  const ray = new THREE.Raycaster(new THREE.Vector3(.2, .1, 0), new THREE.Vector3(0, 0, -1));
  const hits = raycastSolidSurfaces(ray, [group, near]);
  assert.deepEqual(hits.map(hit => hit.object), [near, far]);
  near.geometry.setDrawRange(0, 0);
  assert.equal(raycastSolidSurfaces(ray, [group])[0].object, far);
});

test('physical normals include instance rotation and nonuniform GLB parent scale', () => {
  const wall = new THREE.InstancedMesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial(), 1);
  const rotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  rotation.setPosition(-2, 0, 0);
  wall.setMatrixAt(0, rotation);
  wall.scale.set(2, 1, .5);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(-1, 0, 0));
  const hit = raycastSolidSurfaces(ray, [wall])[0];
  assert.ok(hit.solidNormal.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-8);
  assert.equal(hit.distance, 4);
});
