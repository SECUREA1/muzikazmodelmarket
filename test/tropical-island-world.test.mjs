import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createTropicalIslandWorld, animateTropicalIslandWorld} from '../public/js/tropical-island-world.js';

function fixture(run) {
  const world = createTropicalIslandWorld();
  try {run(world);} finally {world.dispose();}
}

test('every island experience can be reached on foot from the arrival beach', () => fixture(world => {
  const blocked = (x, z) => world.colliders.some(b => x > b.minX - .28 && x < b.maxX + .28 && z > b.minZ - .28 && z < b.maxZ + .28);
  const walkable = (x, z) => world.isLand(x, z) && !blocked(x, z);
  assert.ok(walkable(world.spawn.x, world.spawn.z), 'arrival spawns on an unobstructed floor');
  assert.equal(world.interactionPoints.length, 8);
  assert.equal(new Set(world.interactionPoints.map(p => p.id)).size, 8);
  for (const point of world.interactionPoints) {
    assert.ok(walkable(point.x, point.z), point.label + ' has a walkable interaction anchor');
    assert.ok(Number.isFinite(world.groundHeight(point.x, point.z)), point.label + ' has a floor');
  }

  // Follow the same land and body-clearance contract as the walking game. Four
  // neighbours avoid allowing a diagonal step to cut through a building corner.
  const step = .75, key = (x, z) => x + ':' + z;
  const pending = [[world.spawn.x, world.spawn.z]], seen = new Set([key(...pending[0])]);
  for (let index = 0; index < pending.length; index++) {
    const [x, z] = pending[index];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz, id = key(nx, nz);
      if (seen.has(id) || !walkable(nx, nz)) continue;
      seen.add(id); pending.push([nx, nz]);
    }
  }
  for (const point of world.interactionPoints) {
    assert.ok(pending.some(([x, z]) => Math.hypot(x - point.x, z - point.z) < point.radius), point.label + ' is reachable without crossing water or resort walls');
  }
}));

test('both paddle boats start afloat and the entire pontoon circuit clears the shore', () => fixture(world => {
  assert.equal(world.boats.filter(boat => boat.kind === 'paddle').length, 2);
  assert.ok(world.boats.some(boat => boat.kind === 'pontoon'));
  for (const boat of world.boats) {
    assert.ok(!world.isLand(boat.home.x, boat.home.z), boat.id + ' starts on open water');
    assert.ok(world.root.getObjectById(boat.root.id), boat.id + ' belongs to the visible map');
  }
  for (let i = 0; i < 720; i++) {
    const angle = i / 720 * Math.PI * 2;
    assert.ok(!world.isLand(Math.cos(angle) * 55, Math.sin(angle) * 43), 'the cruise does not pass through beaches or docks');
  }
}));

test('batched boats and beach balls remain independently movable during scenery animation', () => fixture(world => {
  for (const boat of world.boats) {
    world.root.updateMatrixWorld(true);
    const before = new T.Box3().setFromObject(boat.root).getCenter(new T.Vector3());
    assert.ok(Number.isFinite(before.x) && Number.isFinite(before.z), boat.id + ' has rendered geometry');
    boat.root.position.x += 5; boat.root.position.z -= 7; boat.root.rotation.y = .67;
    // Measure after the requested heading change, before testing translation.
    world.root.updateMatrixWorld(true);
    const positioned = new T.Box3().setFromObject(boat.root).getCenter(new T.Vector3());
    const heading = boat.root.rotation.y;
    animateTropicalIslandWorld(world, 7, .016); world.root.updateMatrixWorld(true);
    const animated = new T.Box3().setFromObject(boat.root).getCenter(new T.Vector3());
    assert.ok(Math.abs(animated.x - positioned.x) < .03 && Math.abs(animated.z - positioned.z) < .03, boat.id + ' keeps its controlled route while bobbing');
    assert.equal(boat.root.position.x, boat.home.x + 5);
    assert.equal(boat.root.position.z, boat.home.z - 7);
    assert.equal(boat.root.rotation.y, heading);
  }
  for (const ball of world.balls) {
    ball.root.position.x += 4; ball.root.position.z -= 3; ball.root.position.y += 1.5;
    ball.root.rotation.set(.4, .2, .8);
    const position = ball.root.position.clone(), rotation = ball.root.quaternion.clone();
    animateTropicalIslandWorld(world, 12, .016);
    assert.ok(ball.root.position.equals(position), 'scenery animation does not reset a kicked ball');
    assert.ok(ball.root.quaternion.equals(rotation), 'scenery animation preserves ball spin');
    assert.ok(new T.Box3().setFromObject(ball.root).getSize(new T.Vector3()).length() > 0, 'the movable ball still contains its visible geometry');
  }
}));
