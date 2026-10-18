import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BASKETBALL_ASSIST_TOLERANCE, basketballShotSolution, stepBasketball, tossBasketball} from '../public/js/basketball.js';
import {
  BASKETBALL_BALL_ID,
  BASKETBALL_COURT,
  basketballHoopForTeam,
  ensureBasketballGame,
  registerBasketballRelease,
  shootBasketball,
  startBasketballGame,
  stepBasketballGame,
  touchBasketball,
} from '../public/js/basketball-rules.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
const controls = {power: .7, angle: 55, mode: 'assisted'};

test('hoop assistance includes the exact 13 percent boundary from either side and any court bearing', () => {
  assert.equal(BASKETBALL_ASSIST_TOLERANCE, .13);
  const origin = {x: 1.1, y: 1.8, z: 2.5};
  for (const forward of [{x: 0, z: -1}, {x: 0, z: 1}, {x: .6, z: -.8}, {x: -.8, z: -.6}]) {
    const target = {x: origin.x + 12 * forward.x, y: 2.93, z: origin.z + 12 * forward.z};
    for (const offset of [0, -.13, .13]) {
      const direction = {x: forward.x - offset * forward.z, y: 123, z: forward.z + offset * forward.x};
      const solution = basketballShotSolution(origin, target, direction, controls);
      assert.equal(solution.aimAligned, true);
      assert.equal(solution.assistApplied, true);
      near(solution.aimError, Math.abs(offset));
      near(solution.position.x + solution.velocity.x * solution.flightTime, target.x);
      near(solution.position.z + solution.velocity.z * solution.flightTime, target.z);
      near(solution.position.y + solution.velocity.y * solution.flightTime - 4.9 * solution.flightTime ** 2, target.y);
    }
  }
});

test('aim just outside 13 percent retains the actual heading and selected power without snapping', () => {
  const origin = {x: 0, y: 1.8, z: 0};
  for (const forward of [{x: 0, z: -1}, {x: .6, z: .8}]) {
    const target = {x: 12 * forward.x, y: 2.93, z: 12 * forward.z};
    for (const offset of [-.130001, .130001]) {
      const direction = {x: forward.x - offset * forward.z, y: -999, z: forward.z + offset * forward.x};
      for (const scale of [1, 100]) {
        const solution = basketballShotSolution(origin, target, {x: direction.x * scale, y: direction.y, z: direction.z * scale}, controls);
        assert.equal(solution.aimAligned, false);
        assert.equal(solution.assistApplied, false);
        near(solution.aimError, Math.abs(offset));
        near(Math.hypot(solution.velocity.x, solution.velocity.y, solution.velocity.z), 4 + 14 * controls.power);
        const launchLength = Math.hypot(solution.velocity.x, solution.velocity.z), aimLength = Math.hypot(direction.x, direction.z);
        near(solution.velocity.x / launchLength, direction.x / aimLength);
        near(solution.velocity.z / launchLength, direction.z / aimLength);
      }
    }
  }
});

test('backward, sideways and vertical-only directions cannot obtain hoop assistance', () => {
  const origin = {x: 0, y: 1.8, z: 0}, target = {x: 0, y: 2.93, z: -12};
  for (const direction of [{x: 0, z: 1}, {x: 1, z: 0}, [0, 1, 0], [0, 0, 0]]) {
    const solution = basketballShotSolution(origin, target, direction, controls);
    assert.equal(solution.aimAligned, false);
    assert.equal(solution.assistApplied, false);
    near(solution.speed, 4 + 14 * controls.power);
    assert.ok(Object.values(solution.velocity).every(Number.isFinite));
  }
});

test('derived alignment cannot be supplied through launch options and manual shots remain unrestricted', () => {
  const origin = {x: 0, y: 1.8, z: 0}, target = {x: 0, y: 2.93, z: -12};
  const forged = {aimAligned: true, assistApplied: true, aimError: 0, aimMiss: false};
  const missed = basketballShotSolution(origin, target, {x: .4, z: -1}, {...controls, ...forged});
  assert.equal(missed.aimAligned, false);
  assert.equal(missed.assistApplied, false);
  near(missed.aimError, .4);
  const manual = basketballShotSolution(origin, null, {x: .4, z: -1}, {...controls, ...forged, mode: 'manual'});
  assert.equal(manual.aimAligned, null);
  assert.equal(manual.aimError, null);
  assert.equal(manual.assistApplied, false);
});

function gameFixture() {
  let now = 100000;
  const sim = {players: {}, actors: {}, events: []};
  const match = ensureBasketballGame(sim, {id: 'basketball-arena'}, now);
  const players = ['home', 'away'].map((team, index) => {
    const player = {actorId: `alignment-${index}`, username: team, health: 100, lastSeen: now, position: {x: 0, y: 0, z: 0}};
    sim.players[player.actorId] = player;
    return player;
  });
  startBasketballGame(sim, now);
  const ball = sim.actors[BASKETBALL_BALL_ID];
  return {
    sim, match, players, ball,
    get now() { return now; },
    hold(player, position) {
      for (const candidate of players) candidate.heldId = null;
      player.position = {...position}; player.heldId = ball.id;
      ball.holderId = player.actorId; ball.position = {...position, y: position.y + 1};
      delete ball.ballVelocity;
      touchBasketball(sim, ball, player, now);
    },
    advance(seconds) {
      for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 120) {
        now += 1000 / 120;
        for (const player of players) player.lastSeen = now;
        stepBasketballGame(sim, now, 1 / 120);
      }
    },
  };
}

// Construct a close shot whose actual descending rim crossing fits inside the
// rim despite a 14% heading error. This distinguishes the eligibility rule
// from a distant shot that would naturally miss by several metres.
function releaseCloseAimMiss(f) {
  const shooter = f.players[0], hoop = basketballHoopForTeam('home');
  const angle = 80 * Math.PI / 180, speed = 4 + 14 * .1;
  const verticalSpeed = speed * Math.sin(angle), height = hoop.y - BASKETBALL_COURT.ballRadius - 1.8;
  const time = (verticalSpeed + Math.sqrt(verticalSpeed ** 2 - 19.6 * height)) / 9.8;
  const forwardRange = speed * Math.cos(angle) * time / Math.hypot(1, .14);
  f.hold(shooter, {x: 0, y: 0, z: hoop.z + forwardRange});
  return shootBasketball(f.sim, shooter, f.now, {power: .1, angle: 80, mode: 'assisted', direction: {x: .14, z: -1}});
}

test('an assisted aim miss cannot score even when its physical close-range path fits through the rim', () => {
  const f = gameFixture(), ball = releaseCloseAimMiss(f), hoop = basketballHoopForTeam('home');
  assert.equal(ball.ballLaunch.aimAligned, false);
  assert.equal(ball.ballLaunch.assistApplied, false);
  assert.equal(ball.basketballShot.aimMiss, true);
  const physical = {modelId: 'basketball', position: {...ball.position}, ballVelocity: {...ball.ballVelocity}};
  let crossing;
  for (let frame = 0; frame < 180 && !crossing; frame++) {
    stepBasketball(physical, 1 / 120, 0, (previous, next) => {
      const rim = hoop.y - BASKETBALL_COURT.ballRadius;
      if (previous.y <= rim || next.y > rim || next.y >= previous.y) return;
      const t = (previous.y - rim) / (previous.y - next.y);
      crossing = {x: previous.x + (next.x - previous.x) * t, z: previous.z + (next.z - previous.z) * t};
    });
  }
  assert.ok(crossing, 'the independent physical flight descends through rim height');
  assert.ok(Math.hypot(crossing.x - hoop.x, crossing.z - hoop.z) < BASKETBALL_COURT.rimRadius - BASKETBALL_COURT.ballRadius,
    'the ball would physically fit inside the rim without the aim eligibility rule');
  f.advance(1.1);
  assert.equal(f.match.homeScore, 0);
  assert.equal(f.match.awayScore, 0);
  assert.equal(f.sim.events.filter(event => event.action === 'basketball-score').length, 0);
});

for (const release of ['manual shot', 'pass']) {
  test(`catching a missed release clears its eligibility restriction before a valid ${release}`, () => {
    const f = gameFixture(), shooter = f.players[0];
    releaseCloseAimMiss(f);
    assert.equal(f.ball.basketballShot.aimMiss, true);
    f.hold(shooter, {x: 0, y: 0, z: 0});
    assert.equal(f.ball.basketballShot, undefined);
    const hoop = basketballHoopForTeam('home'), target = {...hoop, y: hoop.y - BASKETBALL_COURT.ballRadius};
    const origin = {x: 0, y: release === 'pass' ? 1.2 : 1.8, z: 0};
    const calibrated = basketballShotSolution(origin, target, {x: 0, z: -1}, controls);
    const manual = {power: (calibrated.speed - 4) / 14, angle: 55, mode: 'manual', direction: {x: 0, z: -1}};
    assert.ok(manual.power >= 0 && manual.power <= 1);
    if (release === 'pass') {
      tossBasketball(f.ball, shooter.position, manual.direction, manual);
      shooter.heldId = null;
      registerBasketballRelease(f.sim, f.ball, shooter, f.now);
    } else shootBasketball(f.sim, shooter, f.now, manual);
    assert.notEqual(f.ball.basketballShot.aimMiss, true);
    f.advance(4);
    assert.equal(f.match.homeScore, 3);
    assert.equal(f.match.awayScore, 0);
  });
}

async function roomFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'basketball-alignment-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  let now = 100000, sequence = 0;
  const map = {id: 'basketball-alignment', basketballCourt: true, spawn: {x: 0, y: 0, z: 0}, builderScene: {layout: 'grand-floor', mapSize: 96, objects: []}};
  const store = new SharedRoomStore(join(directory, 'rooms.json'));
  const runtime = new AuthoritativeRooms({store, now: () => now});
  const send = (who, action, fields = {}) => runtime.command(map.id, map,
    {accountId: who, username: who, walletId: who, stats: {health: 100}},
    {action, requestId: `alignment-${++sequence}`, ...fields});
  await send('alice', 'join'); await send('bob', 'join'); await send('alice', 'basketball-start');
  return {
    send,
    async catchAt(who, position) {
      await store.update(map.id, room => {
        const sim = room.simulation, ball = sim.actors[BASKETBALL_BALL_ID];
        for (const player of Object.values(sim.players)) player.heldId = null;
        Object.assign(sim.players[`account:${who}`], {position: {...position}, floor: position.y, grounded: true, velocityY: 0, input: {}});
        ball.holderId = null; ball.position = {...position}; delete ball.ballVelocity;
      });
      return send(who, 'catch');
    },
    async advance(milliseconds) {
      let state;
      for (let elapsed = 0; elapsed < milliseconds; elapsed += 33) {
        now += 33;
        state = await runtime.snapshot(map.id, map);
      }
      return state;
    },
  };
}

test('the shared server derives missed-shot eligibility despite forged client alignment and scoring flags', async t => {
  const f = await roomFixture(t);
  await f.catchAt('alice', {x: 0, y: 0, z: 0});
  let state = await f.send('alice', 'basketball-shoot', {
    ...controls, direction: [.3, 0, -1], aimAligned: true, assistApplied: true, aimError: 0, aimMiss: false,
    basketballShot: {aimMiss: false}, homeScore: 999,
  });
  const ball = state.actors[BASKETBALL_BALL_ID];
  assert.equal(ball.ballLaunch.aimAligned, false);
  assert.equal(ball.ballLaunch.assistApplied, false);
  near(ball.ballLaunch.aimError, .3);
  assert.equal(ball.basketballShot.aimMiss, true);
  state = await f.advance(5000);
  assert.equal(state.basketball.homeScore, 0);
  assert.equal(state.basketball.awayScore, 0);
  assert.equal(state.events.filter(event => event.action === 'basketball-score').length, 0);
});

test('aligned server shots still score for both teams with opposite hoop bearings', async t => {
  const f = await roomFixture(t);
  for (const [who, team, direction] of [['alice', 'home', [0, 0, -1]], ['bob', 'away', [0, 0, 1]]]) {
    await f.catchAt(who, {x: 0, y: 0, z: 0});
    let state = await f.send(who, 'basketball-shoot', {...controls, direction});
    const ball = state.actors[BASKETBALL_BALL_ID];
    assert.equal(ball.ballLaunch.aimAligned, true);
    assert.equal(ball.ballLaunch.assistApplied, true);
    assert.equal(ball.basketballShot.aimMiss, false);
    state = await f.advance(4000);
    assert.equal(state.basketball[`${team}Score`], 3);
    assert.equal(state.basketball.lastScore.playerId, `account:${who}`);
  }
});
