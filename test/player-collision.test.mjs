import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3, Box3} from '../public/vendor/three/three.module.min.js';
import {capsuleBoxContact, movePlayerCapsule, PLAYER_BODY_HEIGHT, PLAYER_BODY_RADIUS, PLAYER_EYE_HEIGHT} from '../public/js/player-collision.js';

class Capsule {
  constructor(x = 0, y = 0, z = 0) { this.radius = PLAYER_BODY_RADIUS; this.start = new Vector3(x, y + this.radius, z); this.end = new Vector3(x, y + PLAYER_BODY_HEIGHT-this.radius, z); }
  translate(offset) { this.start.add(offset); this.end.add(offset); return this; }
  clone() { const clone = new Capsule(); clone.start.copy(this.start); clone.end.copy(this.end); return clone; }
}
const box = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
const foot = capsule => capsule.start.y - capsule.radius;
const ground = ({fromY, toY}) => fromY >= 0 && toY <= 0 ? {y: 0, normalY: 1} : null;
const plane = (x, y, z, constant = 0) => ({normal: new Vector3(x, y, z).normalize(), constant});
function planes(...surfaces) {
  return {
    getCapsuleTriangles(capsule, triangles) { triangles.push(...surfaces); },
    triangleCapsuleIntersect(capsule, surface) {
      const distance = Math.min(capsule.start.dot(surface.normal), capsule.end.dot(surface.normal)) - surface.constant;
      return distance < capsule.radius ? {normal: surface.normal, depth: capsule.radius - distance} : null;
    },
    capsuleIntersect() { throw Error('Movement must use individual contacts rather than an aggregate floor/wall normal.'); }
  };
}
function walk(capsule, options = {}) {
  const velocity = options.velocity || new Vector3();
  let grounded = options.grounded ?? true;
  const heights = [];
  for (let i = 0; i < (options.frames || 1); i++) {
    const result = movePlayerCapsule(capsule, {movement: new Vector3(), delta: 1 / 60, findFloor: ground, ...options, velocity, grounded});
    grounded = result.grounded;
    heights.push(foot(capsule));
  }
  return {velocity, grounded, heights};
}

test('wall contact preserves tangential movement and stays grounded without floor jitter', () => {
  const capsule = new Capsule(.34, .002, 0);
  const result = walk(capsule, {octree: planes(plane(1, 0, 0), plane(0, 1, 0)), movement: new Vector3(-.06, 0, .04), frames: 240});
  assert.ok(Math.abs(capsule.start.x - .302) < 1e-6);
  assert.ok(Math.abs(capsule.start.z - 9.6) < 1e-6, 'the full movement parallel to the wall is retained');
  assert.ok(result.grounded);
  assert.ok(Math.max(...result.heights) - Math.min(...result.heights) < 1e-6);
  assert.equal(result.velocity.y, 0);
});

test('an upward sliver in a steep wall normal cannot suspend a falling player', () => {
  const capsule = new Capsule(.2, 2, 0);
  const velocity = new Vector3(0, -1, 0);
  const result = walk(capsule, {octree: planes(plane(1, .01, 0)), movement: new Vector3(-.04, 0, .04), velocity, grounded: false, findFloor: null, frames: 30});
  assert.equal(result.grounded, false);
  assert.ok(velocity.y < -9);
  assert.ok(foot(capsule) < 0, 'gravity continues while touching a wall');
  assert.ok(capsule.start.z > 1.19);
});

test('walking into a two-wall corner remains stable and the player can move away', () => {
  const capsule = new Capsule(.5, .002, .5);
  const octree = planes(plane(1, 0, 0), plane(0, 0, 1), plane(0, 1, 0));
  walk(capsule, {octree, movement: new Vector3(-.05, 0, -.05), frames: 90});
  assert.ok(Math.abs(capsule.start.x - .302) < 1e-6);
  assert.ok(Math.abs(capsule.start.z - .302) < 1e-6);
  walk(capsule, {octree, movement: new Vector3(.05, 0, .03), frames: 20});
  assert.ok(capsule.start.x > 1.3 && capsule.start.z > .9);
});

test('ceiling contact stops jump thrust so the capsule falls away instead of sticking', () => {
  const capsule = new Capsule(0, 0, 0);
  const velocity = new Vector3(0, 9.9, 0);
  const octree = planes(plane(0, -1, 0, -2.1));
  walk(capsule, {octree, velocity, grounded: false, findFloor: null, frames: 4});
  assert.ok(capsule.end.y + capsule.radius <= 2.1 + 1e-6);
  assert.ok(velocity.y <= 0, 'upward velocity is cleared on the first ceiling hit');
  const peak = foot(capsule);
  walk(capsule, {octree, velocity, grounded: false, findFloor: null, frames: 10});
  assert.ok(foot(capsule) < peak - .1);
});

test('bounded substeps cannot cross a thin solid during a long movement frame', () => {
  const capsule = new Capsule(-2, .002, 0);
  const wall = box([0, -1, -5], [.02, 4, 5]);
  walk(capsule, {boxes: [{box: wall}], movement: new Vector3(5, 0, 1), delta: .1});
  assert.ok(capsule.start.x <= -.3);
  assert.ok(capsule.start.z > .99, 'the unobstructed sliding axis still progresses');
});

test('rounded box corners leave real diagonal clearance instead of a phantom square', () => {
  const furniture = box([0, 0, 0], [1, 1, 1]);
  assert.equal(capsuleBoxContact(new Capsule(-.25, 0, -.25), furniture), null, 'the diagonal distance is larger than the radius');
  const touching = new Capsule(-.2, 0, -.2);
  const contact = capsuleBoxContact(touching, furniture);
  assert.ok(contact.depth > 0);
  assert.ok(contact.normal.x < -.7 && contact.normal.z < -.7);
  walk(touching, {boxes: [furniture], movement: new Vector3(-.05, 0, -.05)});
  assert.ok(touching.start.x < -.24 && touching.start.z < -.24, 'moving away never teleports to a box side');
});

test('high furniture blocks the body without stepping the player onto its top', () => {
  const capsule = new Capsule(-.4, .002, .5);
  walk(capsule, {boxes: [{box: box([0, .85, 0], [1, 1, 1]), stepHeight: .32}], movement: new Vector3(.08, 0, 0), frames: 40});
  assert.ok(capsule.start.x <= -.3);
  assert.ok(Math.abs(foot(capsule) - .002) < 1e-6);
});

test('structure steps remain climbable and a low ceiling prevents an unsafe step', () => {
  const step = {box: box([0, -.1, -1], [1, .2, 1]), stepHeight: .32};
  const capsule = new Capsule(-.4, .002, 0);
  walk(capsule, {boxes: [step], movement: new Vector3(.08, 0, 0), frames: 8});
  assert.ok(capsule.start.x > .2);
  assert.ok(Math.abs(foot(capsule) - .202) < 1e-6);
  const crouched = new Capsule(-.4, .002, 0);
  const ceiling = {box: box([-.2, 1.85, -1], [1, 2.3, 1])};
  walk(crouched, {boxes: [step, ceiling], movement: new Vector3(.08, 0, 0), frames: 8});
  assert.ok(crouched.start.x < 0, 'the player cannot step into overhead geometry');
  assert.ok(crouched.end.y + crouched.radius <= 1.85 + 1e-6);
});

test('a fast downward sweep lands on a thin floor without falling through', () => {
  const capsule = new Capsule(0, 3, 0);
  const velocity = new Vector3(0, -40, 0);
  const result = walk(capsule, {velocity, grounded: false, delta: .1});
  assert.ok(result.grounded);
  assert.ok(Math.abs(foot(capsule) - .002) < 1e-6);
  assert.equal(velocity.y, 0);
});

test('small support probes keep 120 Hz floor contact stable but do not bridge a ledge', () => {
  const capsule = new Capsule(0, .002, 0);
  const result = walk(capsule, {delta: 1 / 120, frames: 120});
  assert.ok(result.grounded);
  assert.ok(result.heights.every(y => Math.abs(y - .002) < 1e-6));
  const falling = walk(capsule, {movement: new Vector3(.02, 0, 0), delta: 1 / 120, frames: 60, findFloor: location => location.x < .1 ? ground(location) : null});
  assert.equal(falling.grounded, false);
  assert.ok(foot(capsule) < -1, 'the probe has no support once the player leaves the floor');
});

test('walkable slopes support uphill movement while steep faces do not count as ground', () => {
  const ramp = planes(plane(-.4, 1, 0));
  const capsule = new Capsule(0, .03, 0);
  const result = walk(capsule, {octree: ramp, movement: new Vector3(.04, 0, 0), findFloor: null, frames: 60});
  assert.ok(result.grounded);
  assert.ok(capsule.start.x > 2, 'the player keeps moving up the ramp');
  assert.ok(foot(capsule) > .8);
  const steep = new Capsule(.2, 3, 0);
  const falling = walk(steep, {octree: planes(plane(1, .3, 0)), movement: new Vector3(-.04, 0, 0), findFloor: null, grounded: false, frames: 30});
  assert.equal(falling.grounded, false);
  assert.ok(foot(steep) < 1);
});

test('flying retains vertical thrust until a real ceiling contact', () => {
  const capsule = new Capsule(0, .002, 0);
  const velocity = new Vector3(0, 4, 0);
  walk(capsule, {velocity, flying: true, frames: 30});
  assert.ok(Math.abs(foot(capsule) - 2.002) < 1e-6);
  assert.equal(velocity.y, 4);
  walk(capsule, {velocity, flying: true, octree: planes(plane(0, -1, 0, -4.2)), frames: 30});
  assert.ok(capsule.end.y + capsule.radius <= 4.2 + 1e-6);
  assert.equal(velocity.y, 0);
});

test('the 1.7m physical body fits a normal doorway while the eye stays at 1.65m', () => {
  const capsule = new Capsule(-1, .02, 0);
  assert.ok(Math.abs(capsule.end.y + capsule.radius - foot(capsule) - 1.7) < 1e-8);
  assert.equal(PLAYER_EYE_HEIGHT, 1.65);
  const doorway = [
    {box: box([0, 2, -1], [.2, 2.3, 1])},
    {box: box([0, 0, -1], [.2, 2, -.5])},
    {box: box([0, 0, .5], [.2, 2, 1])}
  ];
  const result = walk(capsule, {boxes: doorway, movement: new Vector3(.05, 0, 0), frames: 40});
  assert.ok(capsule.start.x > .99, 'the head and shoulder capsule clears the doorway');
  assert.ok(result.grounded);
});

test('standing on a placed platform stays stable at 120 Hz and walking off falls normally', () => {
  const capsule = new Capsule(0, 1.002, 0);
  const platform = {box: box([-.5, .8, -.5], [.5, 1, .5])};
  const standing = walk(capsule, {boxes: [platform], findFloor: null, delta: 1 / 120, frames: 120});
  assert.ok(standing.grounded);
  assert.ok(standing.heights.every(y => Math.abs(y - 1.002) < 1e-6));
  const falling = walk(capsule, {boxes: [platform], findFloor: null, movement: new Vector3(.03, 0, 0), delta: 1 / 120, frames: 70});
  assert.equal(falling.grounded, false);
  assert.ok(foot(capsule) < .1);
});
