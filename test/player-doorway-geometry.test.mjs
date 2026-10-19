import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import {movePlayerCapsule,PLAYER_BODY_HEIGHT,PLAYER_BODY_RADIUS} from '../public/js/player-collision.js';

function doorway({threshold = .25, clearance = 2.1, width = 1} = {}) {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  function box(name, size, position) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name; mesh.position.set(...position); root.add(mesh);
  }
  box('FLOOR', [12,.2,12], [0,-.1,0]);
  box('DOOR_THRESHOLD', [.12,threshold,width], [0,threshold/2,0]);
  box('DOOR_LEFT', [.2,3,3], [0,1.5,-1.5-width/2]);
  box('DOOR_RIGHT', [.2,3,3], [0,1.5,1.5+width/2]);
  box('DOOR_LINTEL', [.2,.2,width], [0,clearance+.1,0]);
  root.updateMatrixWorld(true);
  const collision = buildCollision(root);
  return {...collision, root};
}
function player(x = -1, z = 0) {
  const radius = PLAYER_BODY_RADIUS;
  return new Capsule(new THREE.Vector3(x,radius+.002,z), new THREE.Vector3(x,PLAYER_BODY_HEIGHT-radius+.002,z), radius);
}
function walk(capsule, collision, {x=.035,z=0,frames=80} = {}) {
  const velocity = new THREE.Vector3(), trace = []; let grounded = true;
  for (let frame = 0; frame < frames; frame++) {
    const result = movePlayerCapsule(capsule, {movement:new THREE.Vector3(x,0,z), velocity,delta:1/60,octree:collision.octree,grounded});
    grounded = result.grounded;
    trace.push({x:capsule.start.x,y:capsule.start.y-capsule.radius,z:capsule.start.z});
    // Use the real geometry contact test, including rounded head/shoulders at
    // the lintel, rather than an AABB assertion that would close the opening.
    const triangles = [];
    collision.octree.getCapsuleTriangles(capsule, triangles);
    for (const triangle of triangles) {
      const hit = collision.octree.triangleCapsuleIntersect(capsule, triangle);
      assert.ok(!hit || hit.depth < .004, 'the body never advances through a solid door frame');
    }
  }
  return {trace,grounded};
}

test('real GLB triangle door sills can be crossed in both directions without sticking', () => {
  const collision = doorway(), capsule = player();
  const forward = walk(capsule, collision);
  assert.ok(capsule.start.x > 1.6, 'a 25cm sill no longer behaves like a full wall');
  assert.ok(forward.trace.some(point=>point.y>.24), 'the feet step onto the sill');
  assert.ok(Math.abs(forward.trace.at(-1).y-.002)<.001, 'the player lands after leaving the sill');
  walk(capsule, collision, {x:-.035,frames:95});
  assert.ok(capsule.start.x < -1.4, 'the same opening is traversable from the other side');
});

test('a low lintel prevents an unsafe step but the player can back away immediately', () => {
  const collision = doorway({clearance:1.85}), capsule = player();
  walk(capsule, collision);
  assert.ok(capsule.start.x < 0, 'insufficient overhead clearance keeps the body outside');
  walk(capsule, collision, {x:-.04,frames:40});
  assert.ok(capsule.start.x < -1.3, 'the blocked threshold does not trap the body');
  assert.ok(Math.abs(capsule.start.y-capsule.radius-.002)<.001);
});

test('door posts still stop shoulder collisions while tangential motion is retained', () => {
  const collision = doorway(), capsule = player(-1,.62);
  walk(capsule, collision, {x:.035,frames:60});
  assert.ok(capsule.start.x < -.3, 'the body cannot fit through a solid post');
  walk(capsule, collision, {x:.02,z:-.025,frames:60});
  assert.ok(capsule.start.x > .3, 'sliding away from the post opens the doorway');
  assert.ok(capsule.start.z < -.5);
});

test('high triangle furniture stays solid rather than becoming a climbable step', () => {
  const collision = doorway({threshold:.8,clearance:3}), capsule = player();
  walk(capsule, collision);
  assert.ok(capsule.start.x < -.35);
  assert.ok(Math.abs(capsule.start.y-capsule.radius-.002)<.001);
});
