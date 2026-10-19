import {replaceServerStreets} from '../public/js/environments/server-streets.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { BASKETBALL_COURT, BASKETBALL_SPECTATOR_AREA, BASKETBALL_SPECTATOR_SEATS, createBasketballStadium, createBasketballHoop } from '../public/js/basketball-stadium.js';
import { createBuilderLand } from '../public/js/environments/builder-land.js';
import { ServerBuilderCollision } from '../server-builder-collision.mjs';

const records = JSON.parse(await readFile(new URL('../public/models/environments/environments.json', import.meta.url)));
const environment = records.find(record => record.id === 'basketball-arena');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} is ${expected}`);

test('the basketball stadium is a free public multiplayer destination with one shared room', () => {
  assert.ok(environment?.playable && environment.publicDestination && environment.multiplayer);
  assert.equal(environment.visibility, 'public');
  assert.equal(environment.basketball, true);
  assert.equal(environment.builderScene.layout, 'basketball-stadium');
  assert.equal(environment.roomId, 'basketball-arena');
  assert.match(environment.playUrl, /environment=basketball-arena&house=basketball-arena/);
  assert.equal(environment.spaceScale, 1);
  assert.equal(environment.scale, 1);
  assert.equal(environment.permanent, true);
  assert.equal(environment.canDelete, false);
  assert.equal(environment.canEdit, false);
});

test('both arena baskets retain regulation rim height and position at world scale', () => {
  const arena = createBuilderLand(environment);
  arena.updateMatrixWorld(true);
  near(BASKETBALL_COURT.width, 15.24); near(BASKETBALL_COURT.length, 28.65);
  const rims = [];
  arena.traverse(object => { if (object.name === 'BASKETBALL_RIM') rims.push(object.getWorldPosition(new THREE.Vector3())); });
  assert.equal(rims.length, 2);
  rims.sort((a, b) => a.z - b.z);
  near(rims[0].x, 0); near(rims[1].x, 0);
  near(rims[0].y, 3.05); near(rims[1].y, 3.05);
  near(rims[0].z, -12.75); near(rims[1].z, 12.75);
  const bounds = new THREE.Box3().setFromObject(arena).getSize(new THREE.Vector3());
  near(bounds.x, 46); near(bounds.z, 62);
});

test('court, apron and concourse form one continuous floor without overlapping rendered faces', () => {
  const arena = createBasketballStadium(THREE,environment), surfaces = [];
  arena.traverse(object => { if (object.userData.basketballSurface) surfaces.push(object); });
  arena.updateMatrixWorld(true);
  assert.equal(surfaces.length,9);
  const court = surfaces.find(object => object.userData.basketballSurface === 'court');
  const bounds = new THREE.Box3().setFromObject(court), size = bounds.getSize(new THREE.Vector3());
  near(size.x,BASKETBALL_COURT.width); near(size.z,BASKETBALL_COURT.length); near(bounds.max.y,0);
  assert.notEqual(court.userData.collisionDisabled,true,'hardwood is the actual playing surface');
  // A second floor under the court can win the mobile depth test even when
  // it sits a few millimetres lower. No interior point should hit two slabs.
  const ray = new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  for (const x of [-22,-10,-9.05,-8.4,-7.7,-7.6,-2.3,.5,7.6,8.4,9.05,10,22]) {
    for (const z of [-30,-18,-16.4,-15,-14,-1,.4,14,15,16.4,18,30]) {
      ray.ray.origin.set(x,1,z);
      const hits = ray.intersectObjects(surfaces), objects = new Set(hits.map(hit => hit.object));
      assert.equal(objects.size,1,`exactly one floor section at ${x}, ${z}`);
      near(hits[0].point.y,0);
    }
  }
  const rectangles = surfaces.map(mesh => new THREE.Box3().setFromObject(mesh));
  for (let a=0;a<rectangles.length;a++) for (let b=a+1;b<rectangles.length;b++) {
    const overlapX = Math.min(rectangles[a].max.x,rectangles[b].max.x)-Math.max(rectangles[a].min.x,rectangles[b].min.x);
    const overlapZ = Math.min(rectangles[a].max.z,rectangles[b].max.z)-Math.max(rectangles[a].min.z,rectangles[b].min.z);
    assert.ok(overlapX < .00001 || overlapZ < .00001,'floor section interiors never overlap');
  }
});

test('Backpack baskets include an open rim and cord net that reacts to a score', () => {
  const hoop = createBasketballHoop(THREE, { team: 'away' });
  assert.deepEqual(hoop.userData.basketballHoop.rim, [0, 3.05, 0]);
  assert.equal(hoop.userData.basketballHoop.team, 'away');
  const net = hoop.getObjectByName('BASKETBALL_ANIMATED_NET');
  assert.ok(net.children.length >= 48);
  hoop.userData.swish(10); hoop.userData.updateBasketballEffects(10.05);
  assert.notEqual(net.scale.y, 1);
  hoop.userData.updateBasketballEffects(10.05, true);
  assert.equal(net.scale.y, 1);
});

test('the server spawns all players on hardwood and leaves the playing court unobstructed', () => {
  const collision = new ServerBuilderCollision();
  const spawn = collision.safeSpawn(environment, environment.spawn);
  near(spawn.x, BASKETBALL_SPECTATOR_AREA.arrival.x); near(spawn.y, .02); near(spawn.z, 0);
  for (const z of [-11, -8, 0, 8, 11]) {
    const floor = collision.groundAt(environment, { x: 0, y: .02, z }, { entry: true });
    near(floor.y, .02);
    const resolved = collision.resolve(environment, { x: 0, y: 0, z: z - .1 }, { x: 0, y: 0, z }, {});
    near(resolved.z, z); near(resolved.y, .02);
  }
  const physicalWorld = collision.world(environment);
  assert.ok(physicalWorld.floors.length < 300, 'only floors, actual stairs, benches and structural surfaces become player walls');
  assert.ok(!physicalWorld.floors.some(object => object.isInstancedMesh || object.name.includes('NET_CORD')));
});

test('spectator benches and climbable aisles remain outside the live court boundary', () => {
  const arena = createBasketballStadium(THREE, environment);
  assert.equal(arena.userData.basketball.spectatorSeats.length, 6);
  assert.equal(BASKETBALL_SPECTATOR_SEATS.length, 6);
  assert.equal(new Set(BASKETBALL_SPECTATOR_SEATS.map(seat => seat.id)).size, 6);
  for (const seat of BASKETBALL_SPECTATOR_SEATS) {
    assert.ok(Math.abs(seat.x) > BASKETBALL_COURT.width / 2 + .5);
    near(seat.y, .47);
  }
  const steps = []; arena.traverse(object => { if (object.name === 'ARENA_SPECTATOR_AISLE_STEP' && object.position.x > 0 && object.position.z === 0) steps.push(object); });
  assert.equal(steps.length, 23);
  for (let index = 1; index < steps.length; index++) assert.ok(steps[index].geometry.parameters.height - steps[index - 1].geometry.parameters.height <= .241);
  assert.ok(arena.getObjectByName('ARENA_SPECTATOR_BENCH_EAST'));
  const spawn = arena.getObjectByName('SPAWN_PLAYER'); near(spawn.position.x, BASKETBALL_SPECTATOR_AREA.arrival.x); near(spawn.rotation.y, Math.PI / 2);
  const collision = new ServerBuilderCollision();
  let spectator = { x: 8.8, y: .02, z: 0 };
  for (let step = 0; step < 160; step++) spectator = collision.resolve(environment, spectator, { ...spectator, x: spectator.x + .06 }, {});
  assert.ok(spectator.x > 18 && spectator.y > 4, 'walking spectators can reach the upper seating aisle without jumping');
  let bench = { x: 8.8, y: .02, z: -2.7 };
  for (let step = 0; step < 15; step++) bench = collision.resolve(environment, bench, { ...bench, x: bench.x + .06 }, {});
  assert.ok(bench.x > 9.4 && bench.y >= .47, 'the bench access step supports spectators standing on the bench');
});

test('live score and animated effects hooks work on the server without a canvas or document', () => {
  const arena = createBasketballStadium(THREE, environment);
  assert.equal(typeof arena.userData.setBasketballState, 'function');
  arena.userData.setBasketballState({ state: 'live', homeScore: 3, awayScore: 2, clockMs: 690000, lastScore: { at: 12 } });
  arena.userData.updateBasketballEffects(.05);
  assert.notEqual(arena.getObjectByName('BASKETBALL_ANIMATED_NET').scale.y, 1);
  arena.userData.updateBasketballEffects(.05, true);
  assert.equal(arena.getObjectByName('BASKETBALL_ANIMATED_NET').scale.y, 1);
});

test('atlas streets and signs never cover a basketball court, including after a live refresh',()=>{
 const arena=createBasketballStadium(THREE,environment),legacy=new THREE.Group();legacy.name='SERVER_STREETS';arena.add(legacy);
 const streets=[{id:'cross-court',name:'Willow Road',from:{x:-20,z:0},to:{x:20,z:0},width:5}];
 replaceServerStreets(arena,streets,{labels:true});assert.equal(arena.getObjectByName('SERVER_STREETS'),undefined);
 const world=new THREE.Group();world.add(arena);replaceServerStreets(world,streets,{labels:true});assert.equal(world.getObjectByName('SERVER_STREETS'),undefined);
});
