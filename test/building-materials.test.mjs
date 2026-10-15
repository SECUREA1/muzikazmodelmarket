import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { BUILDING_MATERIALS, buildingMaterial, createBuildingBlock } from '../public/js/building-materials.js';

const dispose = root => root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

test('all building materials create usable grid-sized meshes with unique identifiers', () => {
  assert.equal(new Set(BUILDING_MATERIALS.map(m => m.id)).size, BUILDING_MATERIALS.length);
  for (const id of ['water', 'rock', 'dirt', 'brick', 'cement', 'wood', 'metal', 'glass', 'grass', 'sand']) assert.ok(BUILDING_MATERIALS.some(m => m.id === id));
  for (const material of BUILDING_MATERIALS) {
    const root = createBuildingBlock(THREE, material.id);
    assert.equal(root.userData.materialId, material.id);
    const body = root.children[0];
    assert.deepEqual([body.geometry.parameters.width, body.geometry.parameters.height, body.geometry.parameters.depth], [1.2, .4, .6]);
    assert.equal(body.material.color.getHex(), material.color);
    assert.equal(root.userData.solid, material.id !== 'water');
    dispose(root);
  }
  assert.equal(buildingMaterial('unknown').id, 'studs');
});

test('water and glass use transparency; metal and wood have different finishes', () => {
  for (const id of ['water', 'glass']) {
    const root = createBuildingBlock(THREE, id);
    assert.equal(root.children[0].material.transparent, true);
    assert.ok(root.children[0].material.opacity < 1);
    assert.equal(root.children[0].material.depthWrite, false);
    dispose(root);
  }
  assert.ok(buildingMaterial('metal').metalness > buildingMaterial('wood').metalness);
});

test('painting a newly created block preserves its material and previously placed blocks', () => {
  const placed = createBuildingBlock(THREE, 'cement');
  const painted = createBuildingBlock(THREE, 'cement', { tint: 0xff0000 });
  assert.equal(painted.children[0].material.color.getHex(), 0xff0000);
  assert.equal(painted.children[0].material.roughness, buildingMaterial('cement').roughness);
  assert.equal(placed.children[0].material.color.getHex(), buildingMaterial('cement').color);
  dispose(placed); dispose(painted);
});
