import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBuilderScene } from '../public/js/builder-gameplay-pipeline.js';

test('builder scenes compile into a gameplay manifest with an authored player spawn', () => {
  const manifest = compileBuilderScene({
    id: 'creator-arena',
    objects: [
      { id: 'start', modelId: 'hero-spawn', position: { x: 4, y: 0.5, z: -3 }, rotation: { y: 1.25 }, functionalSettings: { behavior: 'talk' } },
      { id: 'enemy', modelId: 'rad-tox', position: { x: 8, y: 0, z: 2 }, functionalSettings: { behavior: 'hostile' } },
      { id: 'tree', modelId: 'canopy-tree', position: { x: 0, y: 0, z: 0 }, functionalSettings: { behavior: 'decor' } }
    ]
  });

  assert.equal(manifest.sceneId, 'creator-arena');
  assert.equal(manifest.objectCount, 3);
  assert.equal(manifest.actorCount, 2);
  assert.deepEqual(manifest.spawn, { objectId: 'start', position: { x: 4, y: 0.5, z: -3 }, rotationY: 1.25 });
  assert.deepEqual(manifest.actors.map((actor) => actor.behavior), ['talk', 'hostile']);
});

test('invalid transform values cannot poison gameplay coordinates', () => {
  const manifest = compileBuilderScene({ objects: [{ id: 'start', modelId: 'hero-spawn', position: { x: 'bad', y: Infinity, z: null } }] });
  assert.deepEqual(manifest.spawn.position, { x: 0, y: 0, z: 0 });
});
