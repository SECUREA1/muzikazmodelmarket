import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createArcadePart} from '../public/js/arcade-park.js';
import {arcadeGamePoint, arcadeGamePointer, createArcadeGamePresentation} from '../public/js/arcade-3d-games.js';

const ids = ['hockey', 'shooting', 'basketball', 'air-hockey', 'billiards'];
const near = (actual, expected, message = '') => assert.ok(actual.distanceTo(expected) < 1e-7,
  `${message} ${actual.toArray()} / ${expected.toArray()}`);
function dispose(root) {
  root.traverse(node => {
    node.geometry?.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose();
  });
}
function fixture(id, config = {}) {
  const scene = new T.Scene(), station = createArcadePart(id), presenter = createArcadeGamePresentation({config});
  scene.add(station); assert.equal(presenter.activate(id, {anchor: station}), true);
  return {scene, station, presenter, close() {presenter.dispose(); dispose(station);}};
}

test('every spatial aim coordinate round trips through its logical game plane', () => {
  for (const [index, id] of ids.entries()) for (const [x, y] of [[20, 20], [400, 230], [615, 380], [780, 440]]) {
    const point = arcadeGamePoint(id, x, y), result = arcadeGamePointer(id, point);
    assert.ok(Math.abs(result.x - x) < 1e-8, id); assert.ok(Math.abs(result.y - y) < 1e-8, id);
    near(arcadeGamePoint(index, x, y), point);
  }
  assert.deepEqual(arcadeGamePoint('hockey', Infinity, NaN).toArray(), [0, .74, 0]);
  assert.deepEqual(arcadeGamePointer('billiards', {x: Infinity, z: NaN}), {x: 400, y: 230});
});

test('all five play modes attach real finite 3D equipment to the selected actual park station', () => {
  for (const id of ids) {
    const f = fixture(id);
    try {
      assert.equal(f.presenter.root.parent, f.station);
      const snapshot = f.presenter.snapshot(); assert.equal(snapshot.id, id); assert.equal(snapshot.active, true);
      let count = 0;
      f.presenter.root.traverse(node => {
        if (!node.isMesh) return; count++;
        assert.ok(node.material.isMeshStandardMaterial, id);
        assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite), id);
      });
      assert.ok(count >= 10, `${id} has volumetric equipment and player context`);
      assert.ok(snapshot.objects.some(node => node.name.startsWith('PLAYER_')), id);
      assert.ok(snapshot.objects.every(node => node.position.every(Number.isFinite)), id);
    } finally {f.close();}
  }
});

test('starting and leaving a game restores original builder equipment visibility', () => {
  const station = createArcadePart('hockey'), equipment = [...station.children];
  equipment[0].visible = false;
  const before = equipment.map(node => node.visible), presenter = createArcadeGamePresentation();
  try {
    assert.equal(presenter.activate(0, {anchor: station}), true);
    assert.ok(equipment.every(node => !node.visible));
    assert.equal(presenter.activate('not-a-game', {anchor: station}), false);
    assert.equal(presenter.snapshot().active, true, 'an invalid request does not tear down the running game');
    presenter.deactivate(); assert.deepEqual(equipment.map(node => node.visible), before);
    assert.equal(presenter.root, null); assert.deepEqual(presenter.snapshot(), {active: false});
  } finally {presenter.dispose(); dispose(station);}
});

test('hockey puck travels along the ice to the same aim as its scoring state and AI goalie moves', () => {
  const f = fixture('hockey');
  try {
    const puck = f.presenter.root.getObjectByName('LIVE_HOCKEY_PUCK');
    const goalie = f.presenter.root.getObjectByName('AI_GOALKEEPER');
    f.presenter.update({gameElapsed: .3, pointer: {x: 550}, shot: {p: .5, tx: 550}});
    const half = arcadeGamePoint('hockey', 475, 242.5); half.y += .04;
    near(puck.position, half); assert.ok(goalie.position.x > 0);
    f.presenter.update({gameElapsed: 1, shot: {p: 1, tx: 550}});
    const goal = arcadeGamePoint('hockey', 550, 85); goal.y += .04; near(puck.position, goal);
    assert.equal(f.presenter.root.getObjectByName('HOCKEY_AIM_LINE').visible, false);
    assert.ok(f.presenter.root.getObjectByName('PLAYER_SKATER_SKATE_BLADE_1'));
    assert.ok(f.presenter.root.getObjectByName('PLAYER_HOCKEY_STICK'));
  } finally {f.close();}
});

test('basketball follows a vertical flight arc to the physical hoop and animates the player release', () => {
  const f = fixture('basketball');
  try {
    const ball = f.presenter.root.getObjectByName('LIVE_BASKETBALL');
    const flight = [];
    for (const p of [0, .5, 1]) {
      f.presenter.update({gameElapsed: .1, shot: {p, x: 400, endX: 400, scored: true}});
      flight.push(ball.position.clone());
    }
    assert.ok(flight[1].y > flight[0].y + 2 && flight[1].y > flight[2].y + 2);
    assert.ok(flight[2].z < flight[0].z - 5);
    assert.equal(f.presenter.root.getObjectByName('BASKETBALL_ALIGNMENT').visible, false);
    assert.ok(f.presenter.root.getObjectByName('PLAYER_BASKETBALL_LEFT_GLOVE').position.y > 1.7);
    const actualBallCenter = ball.localToWorld(new T.Vector3());
    const rim = f.presenter.root.getObjectByName('LIVE_BASKETBALL_HOOP').getObjectByProperty('type', 'Mesh');
    assert.ok(rim, 'existing reusable builder hoop geometry is in the playing station');
    assert.ok(actualBallCenter.y > 3.3 && actualBallCenter.y < 3.5);
  } finally {f.close();}
});

test('shooting targets occupy the same aim plane as the logical target hitboxes', () => {
  const f = fixture('shooting');
  try {
    f.presenter.update({gameElapsed: .5, pointer: {x: 620, y: 130}, attempts: 1,
      targets: [{dx: 620, dy: 130, r: 24}, {x: 245, y: 240, phase: 1, r: 28}]});
    const target = f.presenter.root.getObjectByName('LIVE_TARGET_0');
    near(target.position, arcadeGamePoint('shooting', 620, 130));
    assert.ok(Math.abs(target.scale.x - .216) < 1e-8); assert.ok(Math.abs(target.scale.y - .168) < 1e-8);
    assert.equal(f.presenter.root.getObjectByName('LIVE_TARGET_2').visible, false);
    assert.equal(f.presenter.root.getObjectByName('ARCADE_SHOT_TRACER').visible, true);
    f.presenter.update({gameElapsed: .7, attempts: 1});
    assert.equal(f.presenter.root.getObjectByName('ARCADE_SHOT_TRACER').visible, false);
    assert.ok(f.presenter.root.getObjectByName('PLAYER_ARCADE_BLASTER'));
  } finally {f.close();}
});

test('air hockey mallets and AI remain in the physical table and puck follows collision physics', () => {
  const f = fixture('air-hockey', {difficulty: 'easy'});
  try {
    f.presenter.update({gameElapsed: 1, pointer: {x: 999, y: -999}, puck: {x: 500, y: 120}});
    const player = f.presenter.root.getObjectByName('PLAYER_AIR_MALLET'), ai = f.presenter.root.getObjectByName('AI_AIR_MALLET');
    const expectedPlayer = arcadeGamePoint('air-hockey', 685, 250); expectedPlayer.y = 1.53;
    near(player.position, expectedPlayer);
    near(f.presenter.root.getObjectByName('LIVE_AIR_PUCK').position, arcadeGamePoint('air-hockey', 500, 120));
    assert.ok(ai.position.z < 0); assert.ok(player.position.z > 0);
    assert.ok(f.presenter.root.getObjectByName('PLAYER_MALLET_HAND').position.y > player.position.y);
  } finally {f.close();}
});

test('billiards balls and pockets correspond to the physical table; sunk balls leave play and cue waits for rest', () => {
  const f = fixture('billiards');
  try {
    const balls = [{x: 220, y: 240, vx: 0, vy: 0}, {x: 500, y: 240, vx: 0, vy: 0, sunk: true}];
    f.presenter.update({balls, pointer: {x: 600, y: 250}});
    near(f.presenter.root.getObjectByName('LIVE_BILLIARD_BALL_0').position, arcadeGamePoint('billiards', 220, 240));
    assert.equal(f.presenter.root.getObjectByName('LIVE_BILLIARD_BALL_1').visible, false);
    assert.equal(f.presenter.root.getObjectByName('PLAYER_BILLIARD_CUE').visible, true);
    balls[0].vx = 10; f.presenter.update({balls});
    assert.equal(f.presenter.root.getObjectByName('PLAYER_BILLIARD_CUE').visible, false);
    assert.equal(f.presenter.root.getObjectByName('BILLIARD_AIM_LINE').visible, false);
    assert.equal(f.presenter.root.getObjectByName('BILLIARD_POCKET_5').position.y, 1.543);
  } finally {f.close();}
});

test('camera and ray input follow rotated nonuniformly scaled saved builder ancestors for every game', () => {
  for (const id of ids) {
    const f = fixture(id), ancestor = new T.Group();
    f.scene.add(ancestor); ancestor.add(f.station);
    ancestor.position.set(12, 3, -7); ancestor.rotation.set(.1, .7, -.08); ancestor.scale.set(1.25, .85, 1.45);
    f.station.position.set(-2, 0, 1); f.station.rotation.y = .3;
    try {
      const camera = new T.PerspectiveCamera(43, 1.6, .1, 250);
      assert.equal(f.presenter.setCamera(camera), true);
      const point = arcadeGamePoint(id, 525, 185), world = f.presenter.root.localToWorld(point.clone());
      const projected = world.project(camera), result = f.presenter.pointer(projected.x, projected.y, camera);
      assert.ok(Math.abs(result.x - 525) < 1e-7, id); assert.ok(Math.abs(result.y - 185) < 1e-7, id);
      near(camera.up, new T.Vector3(0, 1, 0).transformDirection(f.presenter.root.matrixWorld));
      const before = camera.position.clone(); ancestor.position.x += 5; f.presenter.setCamera(camera);
      assert.ok(Math.abs(camera.position.x - before.x - 5) < 1e-7, id);
      assert.equal(f.presenter.pointer(NaN, 0, camera), null);
    } finally {f.close();}
  }
});

test('repeated animation updates reuse their meshes and geometry instead of allocating scene objects', () => {
  for (const id of ids) {
    const f = fixture(id);
    try {
      const nodes = [], geometry = [];
      f.presenter.root.traverse(node => {nodes.push(node); if (node.geometry) geometry.push(node.geometry);});
      for (let i = 0; i < 120; i++) f.presenter.update({gameElapsed: i / 60, pointer: {x: 400 + i, y: 300}});
      const after = [], afterGeometry = [];
      f.presenter.root.traverse(node => {after.push(node); if (node.geometry) afterGeometry.push(node.geometry);});
      assert.deepEqual(after, nodes, id); assert.deepEqual(afterGeometry, geometry, id);
    } finally {f.close();}
  }
});

test('narrow foreground scenery clears the play corridor, preserves park backdrop and restores exact visibility', () => {
  for (const id of ['basketball', 'air-hockey']) {
    const scene = new T.Scene(), station = createArcadePart(id), presenter = createArcadeGamePresentation({scene});
    scene.add(station); station.position.set(3, 0, -4); station.rotation.y = .4; station.scale.setScalar(1.1);
    station.updateMatrixWorld(true);
    const frame = new T.Matrix4().makeRotationY(id === 'basketball' ? Math.PI / 2 : 0);
    const position = new T.Vector3(id === 'basketball' ? .55 : .125, 3.45, id === 'basketball' ? 4.25 : 2.65).applyMatrix4(frame);
    station.localToWorld(position);
    function pole(name, color = '#718c7a', transparent = false) {
      const mesh = new T.Mesh(new T.BoxGeometry(.18, 7, .18),
        new T.MeshStandardMaterial({color, transparent, opacity: transparent ? .2 : 1}));
      mesh.name = name; mesh.position.copy(position); scene.add(mesh); return mesh;
    }
    const foreground = pole('FOREIGN_COASTER_SUPPORT'), backdrop = pole('DISTANT_LAMP');
    backdrop.position.add(new T.Vector3(0, 0, -40).applyMatrix4(frame).transformDirection(station.matrixWorld).multiplyScalar(40));
    const glass = pole('TRANSPARENT_GLASS', '#a3e1e3', true), hidden = pole('ALREADY_HIDDEN_LAMP'); hidden.visible = false;
    const vehicle = new T.Group(); vehicle.name = 'ARCADE_COASTER_CAR'; scene.add(vehicle);
    const vehicleMesh = pole('MOVING_VEHICLE_BODY'); vehicle.attach(vehicleMesh);
    try {
      assert.equal(presenter.activate(id, {anchor: station}), true);
      const camera = new T.PerspectiveCamera(43, 1.6, .1, 250); presenter.setCamera(camera);
      assert.equal(foreground.visible, false, id + ' foreground support blocks the padded play corridor');
      assert.equal(backdrop.visible, true, id + ' backdrop remains part of the park');
      assert.equal(glass.visible, true); assert.equal(hidden.visible, false); assert.equal(vehicleMesh.visible, true);
      assert.ok(presenter.snapshot().occlusion.hidden >= 1);
      // Repeated normal frames reuse the cached view; a resize recalculates it.
      const bounds = presenter.snapshot().occlusion.candidates;
      presenter.setCamera(camera); assert.equal(presenter.snapshot().occlusion.candidates, bounds);
      camera.aspect = .5; camera.updateProjectionMatrix(); presenter.setCamera(camera);
      assert.equal(foreground.visible, false, 'mobile view remains clear');
      presenter.deactivate();
      assert.equal(foreground.visible, true); assert.equal(backdrop.visible, true);
      assert.equal(hidden.visible, false); assert.equal(vehicleMesh.visible, true);
    } finally {presenter.dispose(); dispose(scene);}
  }
});
