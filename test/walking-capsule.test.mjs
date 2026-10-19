import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
import {triangleHeightAt, triangleNormalY, triangleWallSegments} from '../public/js/walking-triangles.js';

class Capsule {
  constructor(x = 0, y = .02, z = 0) { this.radius = .3; this.start = new THREE.Vector3(x, y + this.radius, z); this.end = new THREE.Vector3(x, y + 1.65, z); }
  clone() { const result = new Capsule(); result.radius = this.radius; result.start.copy(this.start); result.end.copy(this.end); return result; }
}
const point = (x, y, z) => new THREE.Vector3(x, y, z);
const floor = (y = 0, min = -20, max = 20) => [new THREE.Triangle(point(min, y, min), point(min, y, max), point(max, y, min)), new THREE.Triangle(point(max, y, min), point(min, y, max), point(max, y, max))];
const box = (x1, y1, z1, x2, y2, z2) => new THREE.Box3(point(x1, y1, z1), point(x2, y2, z2));
const trianglesForBox = bounds => {
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z).toNonIndexed();
  const positions = geometry.attributes.position, triangles = [];
  for (let index = 0; index < positions.count; index += 3) triangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, index + offset).add(center))));
  geometry.dispose();
  return triangles;
};
function world(triangles) {
  // Broad-phase selection is supplied by THREE.Octree in the game. These
  // fixtures return all triangles and independently calculate cap contacts
  // from the closest points on the tested ceiling/floor triangles.
  return {
    queries: 0,
    getCapsuleTriangles(capsule, result) { this.queries++; result.push(...triangles); },
    triangleCapsuleIntersect(capsule, triangle) {
      let best = null;
      for (const center of [capsule.start, capsule.end]) {
        const closest = triangle.closestPointToPoint(center, new THREE.Vector3());
        const direction = center.clone().sub(closest), distance = direction.length();
        if (distance < capsule.radius && (!best || distance < best.distance)) best = {distance, depth: capsule.radius - distance, normal: distance ? direction.divideScalar(distance) : triangle.getNormal(new THREE.Vector3()), point: closest};
      }
      return best;
    }
  };
}
const foot = capsule => capsule.start.y - capsule.radius;
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const move = (capsule, motion, options = {}) => moveWalkingCapsule(capsule, motion, {grounded: true, ...options});

test('triangle helpers respect walkable seams, vertical slabs, and winding', () => {
  const ground = floor()[0];
  near(triangleHeightAt(0, 0, ground), 0); near(triangleNormalY(ground), 1);
  assert.equal(triangleHeightAt(100, 0, ground), null);
  assert.deepEqual(triangleWallSegments(ground, -.1, 2), []);
  const wall = new THREE.Triangle(point(1, 0, -2), point(1, 3, -2), point(1, 0, 2));
  assert.ok(triangleWallSegments(wall, .02, 1.95).length);
  assert.deepEqual(triangleWallSegments(wall, 4, 5), []);
  assert.deepEqual(triangleWallSegments(wall, -2, -1), []);
});

test('idle capsule never drifts or depenetrates against walls and low bumps', () => {
  const capsule = new Capsule(.74), octree = world([...floor(), ...trianglesForBox(box(1, 0, -2, 1.2, 3, 2))]);
  const bump = box(.6, 0, -.4, .9, .24, .4), initial = capsule.start.clone();
  for (let frame = 0; frame < 300; frame++) {
    const result = move(capsule, {x: 0, y: 0, z: 0}, {octree, boxes: [bump]});
    assert.equal(result.onGround, true);
    assert.deepEqual(capsule.start.toArray(), initial.toArray());
  }
});

test('diagonal controls slide along GLB walls without moving away or losing tangent motion', () => {
  const capsule = new Capsule(), octree = world([...floor(), ...trianglesForBox(box(1, 0, -10, 1.2, 3, 10))]);
  for (let frame = 0; frame < 100; frame++) {
    const previous = capsule.start.clone();
    move(capsule, {x: .07, y: 0, z: .04}, {octree});
    assert.ok(capsule.start.x >= previous.x - 1e-8);
    near(capsule.start.z - previous.z, .04);
    near(foot(capsule), .02);
  }
  near(capsule.start.x, .698);
  move(capsule, {x: -.2, y: 0, z: 0}, {octree});
  near(capsule.start.x, .498);
});

test('continuous sweeps block thin walls and intersecting corners at large requested distances', () => {
  const capsule = new Capsule(), octree = world([...floor(), ...trianglesForBox(box(1, 0, -10, 1.001, 3, 10)), ...trianglesForBox(box(-10, 0, 1, 10, 3, 1.001))]);
  move(capsule, {x: 9, y: 0, z: 9}, {octree});
  near(capsule.start.x, .698); near(capsule.start.z, .698);
  const initial = capsule.start.clone();
  for (let frame = 0; frame < 60; frame++) move(capsule, {x: .1, y: 0, z: .1}, {octree});
  assert.deepEqual(capsule.start.toArray(), initial.toArray());
});

test('a .24m aisle stair rises only after deliberate movement reaches supported center', () => {
  const capsule = new Capsule(), octree = world([...floor(), ...trianglesForBox(box(.5, 0, -2, 1.5, .24, 2))]);
  for (let frame = 0; frame < 9; frame++) {
    move(capsule, {x: .05, y: 0, z: 0}, {octree});
    near(foot(capsule), .02);
  }
  move(capsule, {x: .06, y: 0, z: 0}, {octree});
  near(capsule.start.x, .51); near(foot(capsule), .26);
  const resting = capsule.start.clone();
  move(capsule, {x: 0, y: 0, z: 0}, {octree});
  assert.deepEqual(capsule.start.toArray(), resting.toArray());
});

test('tall bumps and low headroom block a step without raising the capsule', () => {
  for (const ceiling of [false, true]) {
    const obstacle = box(.5, 0, -2, 1.5, ceiling ? .24 : .4, 2);
    const triangles = [...floor(), ...trianglesForBox(obstacle)];
    if (ceiling) triangles.push(...trianglesForBox(box(-2, 2.08, -2, 2, 2.2, 2)));
    const capsule = new Capsule(), octree = world(triangles);
    move(capsule, {x: .6, y: 0, z: 0}, {octree});
    near(capsule.start.x, .198); near(foot(capsule), .02);
  }
});

test('descending supported stairs follows input while a ledge preserves falling and jumping', () => {
  const octree = world([...floor(), ...trianglesForBox(box(-1, 0, -2, .5, .24, 2))]);
  const capsule = new Capsule(.4, .26);
  move(capsule, {x: .2, y: 0, z: 0}, {octree});
  near(foot(capsule), .02);
  const airborne = new Capsule(0, 2);
  const falling = move(airborne, {x: .1, y: -.2, z: 0}, {octree: world([]), grounded: false, verticalVelocity: -4});
  near(foot(airborne), 1.8); assert.equal(falling.onGround, false); assert.equal(falling.velocityY, -4);
  const jump = move(airborne, {x: 0, y: .1, z: 0}, {octree: world(floor()), grounded: false, verticalVelocity: 6});
  near(foot(airborne), 1.9); assert.equal(jump.onGround, false); assert.equal(jump.velocityY, 6);
});

test('downward sweeps land exactly on the surface without tunnelling or radius edge lift', () => {
  const capsule = new Capsule(0, 2), octree = world(floor());
  const result = move(capsule, {x: .2, y: -3, z: 0}, {octree, grounded: false, verticalVelocity: -20});
  near(foot(capsule), .02); assert.equal(result.onGround, true); assert.equal(result.velocityY, 0);
  const edge = new Capsule(.3), platform = box(.5, 0, -1, 1, .24, 1);
  move(edge, {x: 0, y: 0, z: 0}, {octree, boxes: [platform]});
  near(foot(edge), .02);
});

test('overhangs allow horizontal walking and ceilings clip jump motion with bounded work', () => {
  const octree = world([...floor(), ...trianglesForBox(box(-10, 2.08, -10, 10, 2.2, 10))]);
  const capsule = new Capsule();
  move(capsule, {x: 1, y: 0, z: 0}, {octree}); near(capsule.start.x, 1); near(foot(capsule), .02);
  const result = move(capsule, {x: 0, y: 1000, z: 0}, {octree, grounded: false, verticalVelocity: 100});
  assert.ok(capsule.end.y + capsule.radius <= 2.08);
  assert.ok(capsule.end.y + capsule.radius > 2.07);
  assert.equal(result.velocityY, 0); assert.equal(result.onGround, false); assert.equal(octree.queries, 2);
});

test('newly edited boxes permit controlled escape from their interior without an idle push', () => {
  const capsule = new Capsule(1.05), octree = world(floor()), obstacle = box(1, 0, -.5, 1.1, 3, .5);
  move(capsule, {}, {octree, boxes: [obstacle]}); near(capsule.start.x, 1.05);
  move(capsule, {x: -.2, y: 0, z: 0}, {octree, boxes: [obstacle]}); near(capsule.start.x, .85);
});

test('dynamic mesh triangles preserve door openings and broad-cull distant geometry', () => {
  const doorway = [box(-3, 0, -.1, -.7, 3, .1), box(.7, 0, -.1, 3, 3, .1), box(-.7, 2.2, -.1, .7, 3, .1)];
  const group = {bounds: box(-3, 0, -.1, 3, 3, .1), triangles: doorway.flatMap(trianglesForBox)};
  const far = {bounds: box(100, 0, 100, 101, 3, 101), triangles: {[Symbol.iterator]() { throw Error('distant geometry should not be inspected'); }}};
  const octree = world(floor()), options = {octree, triangleGroups: [group, far]};
  const centered = new Capsule(0, .02, 2);
  move(centered, {x: 0, y: 0, z: -4}, options);
  near(centered.start.z, -2); near(centered.start.x, 0);
  const blocked = new Capsule(1.5, .02, 2);
  move(blocked, {x: 0, y: 0, z: -4}, options);
  near(blocked.start.z, .402); near(blocked.start.x, 1.5);
});


test('reversed and mirrored single-face floor winding still supports the capsule without raising an idle pose', () => {
 const reversed=floor().map(triangle=>new THREE.Triangle(triangle.a.clone(),triangle.c.clone(),triangle.b.clone()));
 const capsule=new Capsule(0,2),octree=world(reversed);
 const landed=move(capsule,{x:0,y:-3,z:0},{octree,grounded:false,verticalVelocity:-20});
 near(foot(capsule),.02);assert.equal(landed.onGround,true);
 const accepted=capsule.start.clone();move(capsule,{}, {octree});assert.deepEqual(capsule.start.toArray(),accepted.toArray());
});

test('one-sided Octree ceiling contacts also stop the back face of an authored floor panel', () => {
 const floorTriangles=floor(),ceiling=floor(2.08),native=world([...floorTriangles,...ceiling]);
 // Emulate Octree front-face contacts: the authored upper face is otherwise
 // invisible to an upward head moving beneath the zero-thickness panel.
 const octree={getCapsuleTriangles:native.getCapsuleTriangles.bind(native),triangleCapsuleIntersect(capsule,triangle){
  const normal=triangle.getNormal(new THREE.Vector3()),distance=normal.dot(capsule.end.clone().sub(triangle.a));
  if(distance<0)return null;return native.triangleCapsuleIntersect(capsule,triangle);
 }};
 const capsule=new Capsule(),result=move(capsule,{x:0,y:1,z:0},{octree,grounded:false,verticalVelocity:8});
 assert.ok(capsule.end.y+capsule.radius<=2.08);assert.ok(capsule.end.y+capsule.radius>2.07);assert.equal(result.velocityY,0);
});
