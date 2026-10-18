import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {loadArcadeBuilderObjects} from '../public/js/arcade-builder-runtime.js';
import {getArcadePartRuntime} from '../public/js/arcade-park.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';

test('saved duplicate stations retain separate interactions and authored transforms', async () => {
  const objects = [
    {id: 'court-a', modelId: 'arcade-part-basketball', position: {x: -5, y: 2, z: 6}, rotation: {y: Math.PI / 2}, scale: {x: 1.3, y: 1.3, z: 1.3}, arcadeSettings: {roundSeconds: 30}},
    {id: 'court-b', modelId: 'arcade-part-basketball', position: {x: 8, z: -6}, arcadeSettings: {roundSeconds: 60}}
  ];
  const saved = await loadArcadeBuilderObjects({objects});
  assert.equal(saved.root.children.length, 2);
  assert.equal(saved.diagnostics.length, 0);
  const courts = [...new Map([...saved.interactions.values()].map(value => [value.objectId, value])).values()];
  assert.deepEqual(courts.map(court => court.objectId).sort(), ['court-a', 'court-b']);
  assert.deepEqual(courts.find(court => court.objectId === 'court-a').instance.getWorldPosition(new THREE.Vector3()).toArray(), [-5, 2, 6]);
  assert.equal(courts.find(court => court.objectId === 'court-b').config.roundSeconds, 60);
  assert.ok(saved.clickMeshes.every(mesh => saved.interactions.get(mesh)?.index === 2));
});

test('saved transformed ride curves match their geometry and retain custom dimensions', async () => {
  const saved = await loadArcadeBuilderObjects({objects: [{id: 'ride', modelId: 'arcade-part-train', position: {x: 7, y: 3, z: -4}, rotation: {y: Math.PI / 2}, scale: {x: 1.5, y: 1.5, z: 1.5}, animationState: {enabled: true, speed: 2}, arcadeSettings: {trainRadiusX: 30, trainRadiusZ: 20, trainLapSeconds: 25}}]});
  assert.equal(saved.rideParts.length, 1);
  assert.equal(saved.diagnostics.length, 0);
  const runtime = getArcadePartRuntime(saved.rideParts[0]);
  const point = runtime.trainCurve.getPointAt(0);
  assert.ok(point.distanceTo(new THREE.Vector3(7, 3.6, -49)) < 1e-7);
  assert.equal(runtime.config.trainLapSeconds, 25);
  assert.equal(saved.rideParts[0].userData.arcadeAnimationSpeed, 2);
  assert.equal([...saved.interactions.values()][0].rideRuntime.animationSpeed, 2);
  assert.ok(runtime.trainCurve.getPointAt(0).distanceTo(runtime.trainCurve.getPointAt(1)) < 1e-7);
});

test('saved ordinary props load independently and report unsupported objects without blocking play', async () => {
  const saved = await loadArcadeBuilderObjects({objects: [
    {id: 'tree', modelId: 'pine-tree', position: {x: 4, y: 1, z: 3}},
    {id: 'table', modelId: 'coffee-table', position: {x: 2, z: 2}},
    {id: 'unsupported', modelId: 'not-a-model'},
    {id: 'station', modelId: 'arcade-part-air-hockey'}
  ]});
  assert.equal(saved.root.children.length, 3);
  assert.deepEqual(saved.diagnostics.map(value => value.objectId), ['unsupported']);
  assert.ok([...saved.interactions.values()].some(value => value.objectId === 'station'));
  assert.deepEqual(saved.root.children.find(child => child.userData.builderObjectId === 'tree').position.toArray(), [4, 1, 3]);
});

test('compiled Builder actors retain extracted ride configuration', () => {
  const manifest = compileBuilderScene({objects: [{id: 'ride', modelId: 'arcade-part-coaster', arcadeSettings: {coasterPeak: 19, coasterWidth: 50}, functionalSettings: {behavior: 'interact', action: 'arcade', value: 'coaster'}}]});
  assert.equal(manifest.actors[0].arcadeSettings.coasterPeak, 19);
  assert.equal(manifest.actors[0].gameplay.action, 'arcade');
});
