import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {BASKETBALL_BUILDER_ITEMS, BASKETBALL_COURT, createBasketballBuilderItem, createBasketballStadium} from '../public/js/basketball-stadium.js';
import {BUILDER_MODEL_INFO, createBuilderModel, updateBuilderModels} from '../public/js/builder-models-3d.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .0001, `${message || 'dimension'}: ${actual} ≈ ${expected}`);

test('every listed arena component has a real model at the advertised metre scale', () => {
  assert.equal(new Set(BASKETBALL_BUILDER_ITEMS.map(item => item.id)).size, BASKETBALL_BUILDER_ITEMS.length);
  assert.ok(BASKETBALL_BUILDER_ITEMS.length >= 21);
  for (const item of BASKETBALL_BUILDER_ITEMS) {
    assert.equal(item.buildAssetId, item.id);
    assert.equal(item.category, 'basketball');
    assert.equal(item.priceMzk, 0);
    assert.equal(item.procedural, true);
    assert.deepEqual(BUILDER_MODEL_INFO[item.id], [item.name, item.description, item.dimensions]);
    const model = createBuilderModel(item.id);
    assert.ok(model, item.id);
    assert.equal(model.userData.modelId, item.id);
    assert.equal(model.userData.builderObject, true);
    assert.ok(model.children.length, `${item.id} includes authored geometry`);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3()).toArray();
    size.forEach((value, axis) => near(value, item.dimensions[axis], `${item.id} axis ${axis}`));
    if (!['basketball-stadium', 'basketball-court', 'basketball-court-floor'].includes(item.id)) near(bounds.min.y, 0, `${item.id} rests on local ground`);
  }
  assert.equal(createBasketballBuilderItem(THREE, 'unknown-arena-part'), null);
});

test('full stadium and standalone court preserve the same floor and regulation baskets', () => {
  for (const id of ['basketball-stadium', 'basketball-court', 'basketball-court-floor']) {
    const model = createBuilderModel(id); model.updateMatrixWorld(true);
    assert.equal(model.userData.preservePlacementOrigin, true, 'the editor must retain the physical court origin');
    const surfaces = [], rims = [];
    model.traverse(object => {
      if (object.userData.basketballSurface) surfaces.push(object);
      if (object.name === 'BASKETBALL_RIM') rims.push(object.getWorldPosition(new THREE.Vector3()));
    });
    const court = surfaces.find(object => object.userData.basketballSurface === 'court');
    assert.ok(court);
    const bounds = new THREE.Box3().setFromObject(court);
    near(bounds.max.y, 0, 'the hardwood top is the rules floor');
    near(bounds.getSize(new THREE.Vector3()).x, BASKETBALL_COURT.width);
    near(bounds.getSize(new THREE.Vector3()).z, BASKETBALL_COURT.length);
    assert.equal(rims.length, id === 'basketball-court-floor' ? 0 : 2);
    for (const rim of rims) { near(rim.y, BASKETBALL_COURT.rimHeight); near(Math.abs(rim.z), BASKETBALL_COURT.hoopDistance); }
    assert.equal(surfaces.length, id === 'basketball-stadium' ? 9 : id === 'basketball-court' ? 5 : 1);
    if (id !== 'basketball-stadium') {
      assert.equal(model.getObjectByName('SPAWN_PLAYER'), undefined, 'dropping a court does not introduce another map spawn');
      assert.equal(model.getObjectByName('ARENA_ROOF_CEILING'), undefined, 'a standalone court stays open');
    }
  }
});

test('standalone stadium parts reuse the arena recipes without constructing unrelated pieces', () => {
  const arena = createBasketballStadium(THREE), canonical = new Map();
  arena.traverse(object => { if (object.isMesh) { const list = canonical.get(object.name) || []; list.push(object.geometry); canonical.set(object.name, list); } });
  for (const item of BASKETBALL_BUILDER_ITEMS.filter(item => !['basketball-stadium', 'basketball-court', 'basketball-shot-clock'].includes(item.id))) {
    const part = createBuilderModel(item.id);
    assert.equal(part.getObjectByName('BASKETBALL_RIM'), undefined);
    part.traverse(object => {
      if (!object.isMesh) return;
      const sources = canonical.get(object.name);
      assert.ok(sources, `${item.id}: ${object.name} is an authored arena component`);
      assert.ok(sources.some(source => source.type === object.geometry.type && JSON.stringify(source.parameters) === JSON.stringify(object.geometry.parameters)), `${item.id}: the same arena geometry recipe is used for ${object.name}`);
    });
  }
  const bleachers = createBuilderModel('basketball-bleachers');
  const steps = []; bleachers.traverse(object => { if (object.name === 'ARENA_SPECTATOR_AISLE_STEP') steps.push(object); });
  assert.equal(steps.length, 69, 'sideline stands include three climbable aisles');
  for (const object of bleachers.children.filter(object => object.isInstancedMesh)) assert.equal(object.userData.collisionDisabled, true, 'decorative chairs cannot snag a walking spectator');
});

test('placeable scoreboard, shot clock and court expose independent live match hooks', () => {
  const display = createBuilderModel('basketball-scoreboard');
  const otherDisplay = createBuilderModel('basketball-scoreboard');
  const clock = createBuilderModel('basketball-shot-clock');
  const court = createBuilderModel('basketball-court');
  const state = {state: 'live', homeScore: 74, awayScore: 72, quarter: 5, clockMs: 31500, shotClockMs: 6500, lastScore: {at: 12}};
  display.userData.setBasketballState(state);
  clock.userData.setBasketballState(state);
  court.userData.setBasketballState(state);
  const scoreboard = display.getObjectByName('ARENA_LIVE_JUMBOTRON');
  assert.equal(scoreboard.userData.scoreboardState.homeScore, 74);
  assert.equal(scoreboard.userData.scoreboardState.quarter, 5);
  assert.equal(otherDisplay.getObjectByName('ARENA_LIVE_JUMBOTRON').userData.scoreboardState.homeScore, 0, 'fresh parts do not share another display’s match state');
  assert.equal(clock.userData.shotClockSeconds, 7);
  clock.userData.setBasketballState({shotClockMs: 0});
  assert.equal(clock.userData.shotClockSeconds, 0);
  const group = new THREE.Group(); group.add(display, clock, court);
  updateBuilderModels(group, .05);
  assert.notEqual(court.getObjectByName('BASKETBALL_ANIMATED_NET').scale.y, 1, 'a deployed court retains its net animation');
});
