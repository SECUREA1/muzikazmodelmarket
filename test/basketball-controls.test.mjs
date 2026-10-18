import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  basketballShotSolution,
  basketballCatchPosition,
  predictBasketballTrajectory,
  stepBasketball,
  tossBasketball,
} from '../public/js/basketball.js';
import {
  BASKETBALL_BALL_ID,
  basketballSpectatorRestricted,
  constrainBasketballSpectator,
  predictBasketballShotPath,
  stepBasketballGame,
} from '../public/js/basketball-rules.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
const copyVector = vector => ({x: vector.x, y: vector.y, z: vector.z});

// Inspect the flight by integrating the real ball physics and sweeping the
// target's vertical plane, independently of a solver's reported flight time.
function crossingAtTarget(solution, target) {
  const ball = {modelId: 'basketball', position: copyVector(solution.position), ballVelocity: copyVector(solution.velocity)};
  const axis = Math.abs(target.x - ball.position.x) > Math.abs(target.z - ball.position.z) ? 'x' : 'z';
  let crossing;
  for (let frame = 0; frame < 1200 && !crossing; frame++) {
    stepBasketball(ball, 1 / 120, -100, (previous, next) => {
      if ((previous[axis] - target[axis]) * (next[axis] - target[axis]) > 0) return;
      const alpha = (target[axis] - previous[axis]) / (next[axis] - previous[axis]);
      crossing = Object.fromEntries(['x', 'y', 'z'].map(key => [key, previous[key] + (next[key] - previous[key]) * alpha]));
      crossing.descending = ball.ballVelocity.y < 0;
      return false;
    });
  }
  assert.ok(crossing, 'the launched ball reaches the target plane');
  return crossing;
}

for (const angle of [20, 55, 75]) {
  test(`assisted ${angle} degree shots reach the rim on descending physical arcs at different distances`, () => {
    for (const distance of [8, 14, 20]) {
      const origin = {x: 1.25, y: 1.8, z: 3};
      const target = {x: origin.x + distance * .6, y: 3.05 - .12, z: origin.z - distance * .8};
      const solution = basketballShotSolution(origin, target, {x: .6, y: 0, z: -.8}, {power: .7, angle, mode: 'assisted'});
      const crossing = crossingAtTarget(solution, target);
      near(crossing.x, target.x, .001);
      near(crossing.y, target.y, .001);
      near(crossing.z, target.z, .001);
      assert.equal(crossing.descending, true);
      near(solution.position.x + solution.velocity.x * solution.flightTime, target.x);
      near(solution.position.y + solution.velocity.y * solution.flightTime - 4.9 * solution.flightTime ** 2, target.y);
      near(solution.position.z + solution.velocity.z * solution.flightTime, target.z);
      near(Math.atan2(solution.velocity.y, Math.hypot(solution.velocity.x, solution.velocity.z)) * 180 / Math.PI, angle);
      near(Math.hypot(solution.velocity.x, solution.velocity.y, solution.velocity.z), solution.calibratedSpeed);
    }
  });
}

test('power changes the real assisted arc instead of guaranteeing every shot scores', () => {
  const origin = {x: 0, y: 1.8, z: 0}, target = {x: 0, y: 2.93, z: -12};
  const shot = power => basketballShotSolution(origin, target, {x: 0, y: 0, z: -1}, {power, angle: 55, mode: 'assisted'});
  const low = crossingAtTarget(shot(.4), target);
  const ideal = crossingAtTarget(shot(.7), target);
  const high = crossingAtTarget(shot(.95), target);
  assert.ok(low.y < target.y - .25);
  near(ideal.y, target.y, .001);
  assert.ok(high.y > target.y + .25);
});

test('manual shooting normalizes horizontal aim, honors angle and uses the selected power', () => {
  const origin = {x: 2, y: 1.8, z: 3}, target = {x: -100, y: 2.93, z: 200};
  const inputs = structuredClone({origin, target});
  for (const power of [0, .4, 1]) {
    const options = {power, angle: 40, mode: 'manual'};
    const first = basketballShotSolution(origin, target, {x: 2, y: 99, z: -3}, options);
    const scaled = basketballShotSolution(origin, target, {x: 20, y: -4, z: -30}, options);
    near(Math.hypot(first.velocity.x, first.velocity.y, first.velocity.z), 4 + 14 * power);
    near(Math.atan2(first.velocity.y, Math.hypot(first.velocity.x, first.velocity.z)) * 180 / Math.PI, 40);
    near(first.velocity.x, scaled.velocity.x);
    near(first.velocity.y, scaled.velocity.y);
    near(first.velocity.z, scaled.velocity.z);
    assert.ok(first.velocity.x > 0 && first.velocity.z < 0, 'manual aim does not turn toward the hoop');
  }
  assert.deepEqual({origin, target}, inputs);
});

test('trajectory preview samples match the real gravity integration before the floor', () => {
  const solution = basketballShotSolution({x: 1, y: 1.8, z: 2}, {x: 0, y: 2.93, z: -12.75}, {x: .25, y: 0, z: -1}, {power: .55, angle: 55, mode: 'manual'});
  const before = structuredClone(solution);
  const step = 1 / 30;
  const preview = predictBasketballTrajectory(solution, {duration: .6, step, floor: 0});
  assert.ok(preview.length >= 18);
  for (const axis of ['x', 'y', 'z']) near(preview[0][axis], solution.position[axis]);
  assert.equal(preview[0].t, 0);
  const ball = {modelId: 'basketball', position: copyVector(solution.position), ballVelocity: copyVector(solution.velocity)};
  for (let index = 1; index < preview.length; index++) {
    stepBasketball(ball, step, 0);
    for (const axis of ['x', 'y', 'z']) near(preview[index][axis], ball.position[axis], .000001);
  }
  assert.deepEqual(solution, before, 'preview does not mutate the pending shot');
  const grounded = predictBasketballTrajectory(solution, {duration: 5, step, floor: 0});
  assert.ok(grounded.every(position => position.y >= 0), 'the preview never draws below the floor');
  const bouncing = {modelId: 'basketball', position: copyVector(solution.position), ballVelocity: copyVector(solution.velocity)};
  let bounced = false;
  for (let index = 1; index < grounded.length; index++) {
    const previousY = bouncing.ballVelocity?.y;
    stepBasketball(bouncing, grounded[index].t - grounded[index - 1].t, 0);
    if (previousY < 0 && bouncing.ballVelocity?.y > 0) bounced = true;
    for (const axis of ['x', 'y', 'z']) near(grounded[index][axis], bouncing.position[axis], .000001);
  }
  assert.equal(bounced, true, 'preview and live physics include the same floor bounces');
});

test('the arena preview reflects off the backboard at the same positions as shared ball physics', () => {
  const solution = {position: {x: 0, y: 3.3, z: 11.5}, velocity: {x: 0, y: 3, z: 7}};
  const preview = predictBasketballShotPath(solution, {duration: .4, step: 1 / 60});
  const ball = {id: 'bank-shot', modelId: 'basketball', position: {...solution.position}, ballVelocity: {...solution.velocity}};
  const sim = {basketball: {state: 'ready', updatedAt: 0}, actors: {[ball.id]: ball}, players: {}, events: []};
  for (let index = 1; index < preview.length; index++) {
    stepBasketballGame(sim, preview[index].t * 1000, preview[index].t - preview[index - 1].t);
    for (const axis of ['x', 'y', 'z']) near(preview[index][axis], ball.position[axis], .000001);
  }
  assert.ok(ball.ballVelocity.z < 0, 'the regulation backboard reflects the incoming shot');
  assert.ok(preview.some((point, index) => index > 0 && point.z < preview[index - 1].z));
  assert.ok(Math.max(...preview.map(point => point.z)) <= 13.131);
  const unbanked = predictBasketballTrajectory(solution, {duration: .4, step: 1 / 60});
  assert.ok(unbanked.at(-1).z > 13.131, 'the arena path includes its backboard collision');
});

test('toss without tuning keeps its existing launch and optional manual tuning changes the arc', () => {
  const legacy = {modelId: 'basketball'};
  assert.equal(tossBasketball(legacy, {x: 1, y: 0, z: 2}, {x: 0, y: 0, z: -1}), true);
  assert.deepEqual(legacy.position, {x: 1, y: 1.2, z: 2});
  assert.deepEqual(legacy.ballVelocity, {x: 0, y: 4, z: -7});
  const tuned = {modelId: 'basketball'};
  assert.equal(tossBasketball(tuned, {x: 1, y: 0, z: 2}, {x: 0, y: 0, z: -1}, {power: .6, angle: 40, mode: 'manual'}), true);
  near(Math.hypot(tuned.ballVelocity.x, tuned.ballVelocity.y, tuned.ballVelocity.z), 4 + 14 * .6);
  near(Math.atan2(tuned.ballVelocity.y, Math.hypot(tuned.ballVelocity.x, tuned.ballVelocity.z)) * 180 / Math.PI, 40);
});

test('catching uses a recent swept pass near the chest and expires its latency allowance', () => {
  const ball = {
    modelId: 'basketball', active: true, position: {x: 3.5, y: .88, z: 0},
    ballCatchSegment: {from: {x: -3.5, y: .88, z: 0}, to: {x: 3.5, y: .88, z: 0}, at: 100000},
  };
  const before = structuredClone(ball);
  const caught = basketballCatchPosition(ball, {x: 0, y: 0, z: 0}, {now: 100180});
  assert.equal(caught.rewound, true);
  near(caught.distance, 0);
  assert.deepEqual(caught.position, {x: 0, y: .88, z: 0});
  assert.equal(basketballCatchPosition(ball, {x: 0, y: 0, z: 0}, {now: 100181}), null);
  assert.equal(basketballCatchPosition(ball, {x: 0, y: 0, z: 0}, {now: 99999}), null);
  assert.equal(basketballCatchPosition(ball, {x: 0, y: 0, z: 4}, {now: 100000}), null);
  assert.deepEqual(ball, before, 'checking catch reach does not alter the server ball');
});

test('catching excludes held, inactive and implausibly distant balls without expanding normal reach', () => {
  const ball = {modelId: 'basketball', active: true, position: {x: 2, y: .88, z: 0}};
  const caught = basketballCatchPosition(ball, {x: 0, y: 0, z: 0}, {now: 100000});
  assert.equal(caught.rewound, false);
  near(caught.distance, 2);
  assert.equal(basketballCatchPosition({...ball, holderId: 'someone'}, {x: 0, y: 0, z: 0}, {now: 100000}), null);
  assert.equal(basketballCatchPosition({...ball, active: false}, {x: 0, y: 0, z: 0}, {now: 100000}), null);
  assert.equal(basketballCatchPosition({...ball, position: {x: 3.01, y: .88, z: 0}}, {x: 0, y: 0, z: 0}, {now: 100000}), null);
  const implausible = {...ball, position: {x: 50, y: .88, z: 0}, ballCatchSegment: {from: {x: -50, y: .88, z: 0}, to: {x: 50, y: .88, z: 0}, at: 100000}};
  assert.equal(basketballCatchPosition(implausible, {x: 0, y: 0, z: 0}, {now: 100000}), null);
});

test('spectator court exclusion covers elevated positions while leaving sidelines and benches accessible', () => {
  const sim = {basketball: {state: 'live'}};
  for (const position of [{x: 0, y: 0, z: 0}, {x: 8, y: 100, z: 14.7}, {x: -8, y: 0, z: -14.7}]) {
    assert.equal(basketballSpectatorRestricted(position, sim), true);
  }
  for (const position of [{x: 10.5, y: 0, z: 0}, {x: -10.5, y: 0, z: 0}, {x: 0, y: 0, z: 16}, {x: 8.12, y: 0, z: 0}, {x: 0, y: 0, z: 14.825}]) {
    assert.equal(basketballSpectatorRestricted(position, sim), false);
  }
  assert.equal(basketballSpectatorRestricted({x: 0, y: 0, z: 0}, {}), false);
  assert.equal(basketballSpectatorRestricted({x: 0, y: 0, z: 0}, {basketball: {state: 'ready'}}), false);
});

test('spectators cannot cross through the court in one move even when both endpoints are outside', () => {
  const sim = {basketball: {state: 'live'}};
  const spectator = {basketballRole: 'spectator'};
  for (const [previous, next] of [
    [{x: -10, y: 0, z: 0}, {x: 10, y: 0, z: 0}],
    [{x: 0, y: 0, z: -17}, {x: 0, y: 0, z: 17}],
    [{x: -10, y: 0, z: -17}, {x: 10, y: 0, z: 17}],
  ]) {
    const constrained = constrainBasketballSpectator(previous, next, sim, spectator);
    assert.equal(basketballSpectatorRestricted(constrained, sim), false);
    assert.notDeepEqual(constrained, next);
  }
  const previous = {x: -9, y: 0, z: 14}, next = {x: -8, y: 0, z: 16};
  assert.deepEqual(constrainBasketballSpectator(previous, next, sim, spectator), next, 'a path beside the corner stays accessible');
  assert.deepEqual(constrainBasketballSpectator({x: -10, y: 0, z: 0}, {x: 10, y: 0, z: 0}, {}, spectator), {x: 10, y: 0, z: 0});
  assert.deepEqual(constrainBasketballSpectator({x: -10, y: 0, z: 0}, {x: 10, y: 0, z: 0}, sim, {basketballRole: 'player'}), {x: 10, y: 0, z: 0});
  const recovered = constrainBasketballSpectator({x: 0, y: 0, z: 0}, {x: .1, y: 0, z: .1}, sim, spectator);
  assert.equal(basketballSpectatorRestricted(recovered, sim), false, 'a stale spectator inside the court is moved out');
});

async function roomFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'basketball-controls-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  let now = 100000, sequence = 0;
  const objects = [
    {id: 'court-seat', modelId: 'seat', position: {x: 7, y: 0, z: 0}, functionalSettings: {behavior: 'seat', interactionDistance: 5}},
    {id: 'bench-seat', modelId: 'seat', position: {x: 10.5, y: 0, z: 2}, functionalSettings: {behavior: 'seat', interactionDistance: 5}},
    {id: 'court-vehicle', modelId: 'vehicle', position: {x: 7, y: 0, z: -1}, functionalSettings: {behavior: 'vehicle', interactionDistance: 5}},
  ];
  const map = {id: 'basketball-controls', basketballCourt: true, spawn: {x: 0, y: 0, z: 0}, builderScene: {layout: 'grand-floor', mapSize: 96, objects}};
  const store = new SharedRoomStore(join(dir, 'rooms.json'));
  const runtime = new AuthoritativeRooms({store, now: () => now});
  return {
    store, runtime, map,
    advance(milliseconds) { now += milliseconds; },
    send(who, action, fields = {}) {
      return runtime.command(map.id, map, {accountId: who, username: who, walletId: who, stats: {health: 100}}, {action, requestId: `controls-${++sequence}`, ...fields});
    },
    place(who, position, ball = false, extra = {}) {
      return store.update(map.id, room => {
        Object.assign(room.simulation.players[`account:${who}`], {position: {...position}, floor: position.y, grounded: true, velocityY: 0, input: {}, ...extra});
        if (ball) room.simulation.actors[BASKETBALL_BALL_ID].position = {...position};
      });
    },
  };
}

for (const angle of [20, 55, 75]) {
  test(`shared shooting honors the ${angle} degree ideal trajectory and scores once`, async t => {
    const f = await roomFixture(t);
    await f.send('alice', 'join'); await f.send('bob', 'join'); await f.send('alice', 'basketball-start');
    await f.place('alice', {x: 0, y: 0, z: -4}, true);
    await f.send('alice', 'catch');
    let state = await f.send('alice', 'basketball-shoot', {power: .7, angle, mode: 'assisted'});
    const velocity = state.actors[BASKETBALL_BALL_ID].ballVelocity;
    near(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * 180 / Math.PI, angle);
    for (let frame = 0; frame < 150 && !state.basketball.lastScore; frame++) {
      f.advance(33);
      state = await f.runtime.snapshot(f.map.id, f.map);
    }
    assert.equal(state.basketball.homeScore, 3);
    assert.equal(state.basketball.awayScore, 0);
    assert.equal(state.players['account:bob'].heldId, BASKETBALL_BALL_ID);
    assert.equal(state.events.filter(event => event.action === 'basketball-score').length, 1);
  });
}

test('server rejects invalid shot controls before releasing a held ball', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join'); await f.send('alice', 'basketball-start');
  await f.place('alice', {x: 0, y: 0, z: -4}, true);
  await f.send('alice', 'catch');
  for (const options of [{power: -.1}, {power: 1.1}, {power: NaN}, {power: '0.7'}, {angle: 19}, {angle: 81}, {angle: Infinity}, {mode: 'guaranteed'}, {direction: [NaN, 0, -1]}, {direction: [0, 0, Infinity]}]) {
    await assert.rejects(f.send('alice', 'basketball-shoot', options), /power|angle|mode|control|shot|option|aim|direction/i);
    const state = await f.runtime.snapshot(f.map.id, f.map);
    assert.equal(state.players['account:alice'].heldId, BASKETBALL_BALL_ID);
    assert.equal(state.actors[BASKETBALL_BALL_ID].ballVelocity, undefined);
  }
  let state = await f.send('alice', 'basketball-shoot', {power: .4, angle: 35, mode: 'manual', direction: [1, 0, -1]});
  const velocity = state.actors[BASKETBALL_BALL_ID].ballVelocity;
  near(Math.hypot(velocity.x, velocity.y, velocity.z), 4 + 14 * .4);
  near(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * 180 / Math.PI, 35);
  assert.ok(velocity.x > 0 && velocity.z < 0);
  await f.send('alice', 'catch');
  state = await f.send('alice', 'toss', {power: .25, angle: 25, mode: 'manual', direction: [-1, 0, 0]});
  const tossed = state.actors[BASKETBALL_BALL_ID].ballVelocity;
  near(Math.hypot(tossed.x, tossed.y, tossed.z), 4 + 14 * .25);
  near(Math.atan2(tossed.y, Math.hypot(tossed.x, tossed.z)) * 180 / Math.PI, 25);
  assert.ok(tossed.x < 0);
  near(tossed.z, 0);
});

test('spectators may explore before a game and are moved off the court at tip-off', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join'); await f.send('viewer', 'join');
  await f.send('viewer', 'basketball-watch');
  await f.place('viewer', {x: 0, y: 0, z: 0});
  f.advance(50);
  let state = await f.runtime.snapshot(f.map.id, f.map);
  assert.equal(state.basketball.state, 'ready');
  assert.equal(state.players['account:viewer'].position.x, 0);
  assert.equal(state.players['account:viewer'].position.z, 0);
  state = await f.send('alice', 'basketball-start');
  assert.equal(state.players['account:viewer'].basketballRole, 'spectator');
  assert.equal(basketballSpectatorRestricted(state.players['account:viewer'].position, {basketball: state.basketball}), false);
});

test('server movement keeps spectators outside while players can enter the playing court', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join'); await f.send('alice', 'basketball-start');
  await f.send('viewer', 'join');
  await f.send('viewer', 'input', {input: {side: -1, yaw: 0}});
  let state;
  for (let tick = 0; tick < 5; tick++) {
    f.advance(250);
    state = await f.send('viewer', 'input', {input: {side: -1, yaw: 0}});
    assert.equal(basketballSpectatorRestricted(state.players['account:viewer'].position, {basketball: state.basketball}), false);
  }
  assert.ok(state.players['account:viewer'].position.x >= 8.12);
  await f.place('alice', {x: 8.5, y: 0, z: 5});
  await f.send('alice', 'input', {input: {side: -1, yaw: 0}});
  f.advance(250);
  state = await f.runtime.snapshot(f.map.id, f.map);
  assert.ok(state.players['account:alice'].position.x < 8.12);
});

test('spectators cannot teleport or use court seats and vehicles to bypass the boundary', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join'); await f.send('alice', 'basketball-start');
  await f.send('viewer', 'join');
  await assert.rejects(f.send('viewer', 'teleport-floor', {position: {x: 0, y: 0, z: 0}}), /spectat|court|sideline|stand|bench/i);
  await assert.rejects(f.send('viewer', 'interact', {entityId: 'court-seat'}), /spectat|court|sideline|stand|bench/i);
  await assert.rejects(f.send('viewer', 'interact', {entityId: 'court-vehicle'}), /spectat|court|sideline|stand|bench/i);
  let state = await f.send('viewer', 'interact', {entityId: 'bench-seat'});
  assert.equal(state.players['account:viewer'].seatedId, 'bench-seat');
  assert.equal(basketballSpectatorRestricted(state.players['account:viewer'].position, {basketball: state.basketball}), false);
  assert.equal(state.players['account:viewer'].basketballRole, 'spectator');
  await f.send('viewer', 'interact');
  await f.place('viewer', {x: 0, y: 0, z: 0}, false, {vehicleId: 'court-vehicle', seatedId: 'court-seat'});
  f.advance(50);
  state = await f.runtime.snapshot(f.map.id, f.map);
  assert.equal(basketballSpectatorRestricted(state.players['account:viewer'].position, {basketball: state.basketball}), false);
  assert.equal(state.players['account:viewer'].vehicleId ?? null, null);
  assert.equal(state.players['account:viewer'].seatedId ?? null, null);
});

test('a fast shared pass can be caught after crossing a player and only one contested catch wins', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join'); await f.send('bob', 'join'); await f.send('alice', 'basketball-start');
  await f.place('alice', {x: 0, y: 0, z: 5});
  await f.place('bob', {x: 0, y: 0, z: 5.25});
  await f.store.update(f.map.id, room => {
    const ball = room.simulation.actors[BASKETBALL_BALL_ID];
    ball.position = {x: -3.5, y: .88, z: 5};
    ball.ballVelocity = {x: 28, y: 0, z: 0};
    ball.holderId = null;
  });
  f.advance(250);
  let state = await f.runtime.snapshot(f.map.id, f.map);
  assert.ok(state.actors[BASKETBALL_BALL_ID].position.x > 3, 'the ball has already left direct catch reach');
  const results = await Promise.allSettled([
    f.send('alice', 'catch', {entityId: BASKETBALL_BALL_ID}),
    f.send('bob', 'catch', {entityId: BASKETBALL_BALL_ID}),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const success = results.find(result => result.status === 'fulfilled').value;
  assert.equal(success.result.rewound, true);
  assert.equal(success.result.caughtId, BASKETBALL_BALL_ID);
  state = await f.runtime.snapshot(f.map.id, f.map);
  const holders = Object.values(state.players).filter(player => player.heldId === BASKETBALL_BALL_ID);
  assert.equal(holders.length, 1);
  assert.equal(state.actors[BASKETBALL_BALL_ID].holderId, holders[0].id);
  assert.equal(state.actors[BASKETBALL_BALL_ID].ballVelocity, undefined);
  assert.equal(state.actors[BASKETBALL_BALL_ID].ballCatchSegment, undefined);
});

test('catching a nearby shared ball requires a clear view through authored geometry', async t => {
  const f = await roomFixture(t);
  f.map.builderScene.objects.push({id: 'catch-wall', modelId: 'modular-wall', position: {x: 0, y: 0, z: 0}, functionalSettings: {behavior: 'decor'}});
  await f.send('alice', 'join'); await f.send('alice', 'basketball-start');
  await f.place('alice', {x: 0, y: 0, z: 1});
  await f.store.update(f.map.id, room => { room.simulation.actors[BASKETBALL_BALL_ID].position = {x: 0, y: .88, z: -1}; });
  await assert.rejects(f.send('alice', 'catch', {entityId: BASKETBALL_BALL_ID}), /visible|view|reach/i);
  let state = await f.runtime.snapshot(f.map.id, f.map);
  assert.equal(state.actors[BASKETBALL_BALL_ID].holderId ?? null, null);
  await f.place('alice', {x: 0, y: 0, z: -2});
  state = await f.send('alice', 'catch', {entityId: BASKETBALL_BALL_ID});
  assert.equal(state.players['account:alice'].heldId, BASKETBALL_BALL_ID);
});

test('virtual benches keep spectators seated and release participants and their held ball at tip-off', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join');
  let state = await f.send('bob', 'join');
  const seat = Object.values(state.actors).find(actor => actor.basketballSpectatorSeat);
  assert.ok(seat, 'the shared court provides a usable spectator bench');

  await f.place('alice', {x: 0, y: 0, z: 0}, true);
  await f.send('alice', 'catch');
  await f.place('alice', seat.position);
  state = await f.send('alice', 'interact', {entityId: seat.id});
  assert.equal(state.players['account:alice'].seatedId, seat.id);
  assert.equal(state.players['account:alice'].heldId, BASKETBALL_BALL_ID);
  state = await f.send('bob', 'basketball-start');
  assert.equal(state.players['account:alice'].seatedId ?? null, null);
  assert.equal(state.players['account:alice'].vehicleId ?? null, null);
  assert.equal(state.players['account:alice'].heldId, null);
  assert.equal(state.actors[seat.id].holderId ?? null, null);
  assert.equal(state.actors[BASKETBALL_BALL_ID].holderId, null);
  assert.ok(Math.abs(state.players['account:alice'].position.x) < 8.12);
  assert.ok(Math.abs(state.players['account:alice'].position.z) < 14.825);

  await f.send('bob', 'basketball-watch');
  await f.place('bob', seat.position);
  state = await f.send('bob', 'interact', {entityId: seat.id});
  assert.equal(state.players['account:bob'].seatedId, seat.id);
  assert.equal(state.actors[seat.id].holderId, 'account:bob');
  await f.send('bob', 'input', {input: {forward: 1, jump: true}});
  for (let tick = 0; tick < 4; tick++) {
    f.advance(125);
    state = await f.runtime.snapshot(f.map.id, f.map);
    assert.equal(state.players['account:bob'].seatedId, seat.id);
    for (const axis of ['x', 'y', 'z']) near(state.players['account:bob'].position[axis], seat.position[axis]);
  }
  state = await f.send('bob', 'interact');
  assert.equal(state.players['account:bob'].seatedId, null);
  assert.equal(state.actors[seat.id].holderId, null);
  assert.equal(state.players['account:bob'].basketballRole, 'spectator');
});

test('untargeted bench interaction seats adjacent spectators without selecting an occupied place', async t => {
  const f = await roomFixture(t);
  await f.send('alice', 'join');await f.send('bob', 'join');await f.send('charlie', 'join');
  await f.send('alice', 'basketball-start');await f.send('bob', 'basketball-watch');
  let state=await f.send('charlie', 'basketball-watch');
  const seat=Object.values(state.actors).find(actor=>actor.basketballSpectatorSeat);
  await f.place('bob',seat.position);
  state=await f.send('bob','interact');
  const occupied=state.players['account:bob'].seatedId;
  assert.equal(occupied,seat.id);
  await f.place('charlie',seat.position);
  await assert.rejects(f.send('charlie','interact',{entityId:occupied}),/another player|using this item/i);
  state=await f.send('charlie','interact');
  const adjacent=state.players['account:charlie'].seatedId;
  assert.ok(adjacent,'the second spectator receives a nearby free seat');
  assert.notEqual(adjacent,occupied);
  assert.equal(state.actors[occupied].holderId,'account:bob');
  assert.equal(state.actors[adjacent].holderId,'account:charlie');
  assert.equal(state.players['account:bob'].basketballRole,'spectator');
  assert.equal(state.players['account:charlie'].basketballRole,'spectator');
});
