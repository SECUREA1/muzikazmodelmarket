import test from 'node:test';
import assert from 'node:assert/strict';
import {isBasketball} from '../public/js/basketball.js';
import {
  BASKETBALL_BALL_ID,
  BASKETBALL_COURT,
  assignBasketballTeam,
  basketballHoopForTeam,
  basketballShotPoints,
  configureBasketballGame,
  ensureBasketballGame,
  registerBasketballRelease,
  setBasketballSettings,
  shootBasketball,
  startBasketballGame,
  stepBasketballGame,
  touchBasketball,
  watchBasketballGame,
} from '../public/js/basketball-rules.js';

const arena = {id: 'basketball-arena'};

function fixture(count = 2) {
  let now = 100000;
  const sim = {players: {}, actors: {}, events: []};
  const match = ensureBasketballGame(sim, arena, now);
  const players = Array.from({length: count}, (_, index) => {
    const player = {
      actorId: `player-${index}`,
      username: `Player ${index}`,
      position: {x: 0, y: 0, z: 0},
      health: 100,
      lastSeen: now,
      heldId: null,
    };
    sim.players[player.actorId] = player;
    return player;
  });
  return {
    sim, match, players,
    ball: sim.actors[BASKETBALL_BALL_ID],
    get now() { return now; },
    start() { return startBasketballGame(sim, now); },
    advance(milliseconds, physicsSeconds = 0) {
      now += milliseconds;
      for (const player of players) player.lastSeen = now;
      stepBasketballGame(sim, now, physicsSeconds);
    },
    hold(player, position = player.position) {
      const ball = sim.actors[BASKETBALL_BALL_ID];
      for (const candidate of players) candidate.heldId = null;
      player.position = {...position};
      player.heldId = ball.id;
      ball.holderId = player.actorId;
      ball.position = {...position, y: position.y + 1};
      delete ball.ballVelocity;
      touchBasketball(sim, ball, player, now);
      return ball;
    },
  };
}

test('only basketball environments seed one reusable match ball and six spectator seats', () => {
  const sim = {players: {}, actors: {}, events: []};
  assert.equal(ensureBasketballGame(sim, {id: 'ordinary-room'}, 1), null);
  assert.deepEqual(sim, {players: {}, actors: {}, events: []});

  const match = ensureBasketballGame(sim, arena, 2);
  const ball = sim.actors[BASKETBALL_BALL_ID];
  assert.equal(match.state, 'ready');
  assert.equal(match.clockMs, 12 * 60 * 1000);
  assert.deepEqual(match.settings, {quarterMinutes: 12, quarters: 4, shotClockSeconds: 24, scoreLimit: 0, winBy: 1, allowLateJoin: false});
  assert.equal(ball.modelId, 'basketball');
  assert.equal(ball.basketballMatchBall, true);
  assert.equal(Object.values(sim.actors).filter(isBasketball).length, 1);
  const seats = Object.values(sim.actors).filter(actor => actor.basketballSpectatorSeat);
  assert.equal(seats.length, 6);
  ball.position.x = 2;
  seats[0].holderId = 'spectator';
  const seatState = seats.map(seat => structuredClone(seat));
  assert.equal(ensureBasketballGame(sim, arena, 3), match);
  assert.equal(sim.actors[BASKETBALL_BALL_ID], ball);
  assert.equal(ball.position.x, 2);
  assert.equal(Object.values(sim.actors).filter(isBasketball).length, 1);
  assert.equal(Object.values(sim.actors).filter(actor => actor.basketballSpectatorSeat).length, 6);
  for (const [index, seat] of seats.entries()) {
    assert.equal(sim.actors[seat.id], seat);
    assert.deepEqual(seat, seatState[index]);
  }
});

test('team assignment balances active players and equips the matching jersey', () => {
  const f = fixture(6);
  const teams = f.players.map(player => assignBasketballTeam(f.sim, player, f.now));
  assert.deepEqual(teams, ['home', 'away', 'home', 'away', 'home', 'away']);
  for (const player of f.players) {
    assert.equal(player.basketballJersey, player.basketballTeam);
    assert.equal(player.basketballRole, 'player');
  }

  f.players[1].lastSeen -= 15001;
  f.players[3].health = 0;
  f.players[5].replacedByRoom = 'another-room';
  const newcomer = {actorId: 'new', health: 100, lastSeen: f.now};
  f.sim.players.new = newcomer;
  assert.equal(assignBasketballTeam(f.sim, newcomer, f.now), 'away');
  assert.throws(() => assignBasketballTeam(f.sim, newcomer, f.now, 'spectators'), /Home or Away/);
});

test('starting a shared game resets scores, player points and any held match ball', () => {
  const f = fixture(4);
  f.match.homeScore = 20;
  f.match.awayScore = 15;
  f.players[0].basketballPoints = 20;
  f.hold(f.players[0]);
  const match = f.start();
  assert.equal(match.state, 'live');
  assert.equal(match.homeScore, 0);
  assert.equal(match.awayScore, 0);
  assert.equal(match.quarter, 1);
  assert.equal(match.clockMs, BASKETBALL_COURT.quarterMs);
  assert.equal(f.players[0].basketballPoints, 0);
  assert.equal(f.ball.holderId, null);
  assert.ok(f.players.every(player => player.heldId === null));
  assert.equal(new Set(f.players.map(player => `${player.position.x},${player.position.z}`)).size, 4);
  assert.equal(f.sim.events.at(-1).action, 'basketball-start');
  assert.throws(() => f.start(), /already running/);
});

test('live games keep existing players on their teams and exclude late arrivals', () => {
  const f = fixture();
  f.start();
  const home = f.players.find(player => player.basketballTeam === 'home');
  assert.throws(() => assignBasketballTeam(f.sim, home, f.now, 'away'), /Change teams before/);
  assert.equal(assignBasketballTeam(f.sim, home, f.now, 'home'), 'home');
  const newcomer = {actorId: 'new', health: 100, lastSeen: f.now, basketballRole: 'spectator'};
  f.sim.players.new = newcomer;
  assert.throws(() => assignBasketballTeam(f.sim, newcomer, f.now), /join|spectat|start|live|running/i);
  assert.equal(newcomer.basketballRole, 'spectator');
  assert.ok(!newcomer.basketballTeam);
  f.match.state = 'finished';
  assert.equal(assignBasketballTeam(f.sim, home, f.now, 'away'), 'away');
});

test('watching a game opts out, releases the held ball, and preserves spectators at tip-off', () => {
  const f = fixture(3);
  const spectator = f.players[2];
  assignBasketballTeam(f.sim, spectator, f.now, 'home');
  f.hold(spectator, {x: 20, y: 0, z: 3});
  watchBasketballGame(f.sim, spectator, f.now);
  assert.equal(spectator.basketballRole, 'spectator');
  assert.ok(!spectator.basketballTeam);
  assert.equal(spectator.basketballJersey, 'home');
  assert.equal(spectator.heldId, null);
  assert.equal(f.ball.holderId, null);
  const watchingPosition = {...spectator.position};
  f.start();
  assert.equal(spectator.basketballRole, 'spectator');
  assert.ok(!spectator.basketballTeam);
  assert.deepEqual(spectator.position, watchingPosition);
  assert.ok(f.players.slice(0, 2).every(player => player.basketballRole === 'player'));
});

test('players can watch a live game and spectators do not keep its clocks running', () => {
  const f = fixture();
  f.start();
  f.hold(f.players[0]);
  for (const player of f.players) watchBasketballGame(f.sim, player, f.now);
  const clock = f.match.clockMs;
  const shotClock = f.match.shotClockMs;
  f.advance(30000);
  assert.equal(f.match.state, 'live');
  assert.equal(f.match.clockMs, clock);
  assert.equal(f.match.shotClockMs, shotClock);
  assert.equal(f.ball.holderId, null);
});

test('a game needs an active participant and spectators can opt into a team before starting', () => {
  const empty = fixture(0);
  assert.throws(() => empty.start(), /player|team|join/i);
  assert.equal(empty.match.state, 'ready');
  const f = fixture(1);
  watchBasketballGame(f.sim, f.players[0], f.now);
  assert.throws(() => f.start(), /player|team|join/i);
  assert.equal(f.match.state, 'ready');
  assignBasketballTeam(f.sim, f.players[0], f.now, 'away');
  f.start();
  assert.equal(f.match.state, 'live');
  assert.equal(f.players[0].basketballRole, 'player');
  assert.equal(f.players[0].basketballTeam, 'away');
});

test('a player who opts out of a live game waits until the next game to rejoin', () => {
  const f = fixture();
  f.start();
  const formerPlayer = f.players[0];
  const team = formerPlayer.basketballTeam;
  watchBasketballGame(f.sim, formerPlayer, f.now);
  assert.throws(() => assignBasketballTeam(f.sim, formerPlayer, f.now, team), /spectat|before|tip-off/i);
  assert.equal(formerPlayer.basketballRole, 'spectator');
  f.match.state = 'finished';
  assert.equal(assignBasketballTeam(f.sim, formerPlayer, f.now, team), team);
  assert.equal(formerPlayer.basketballRole, 'player');
});

test('spectators are excluded from team balancing and inbound possession', () => {
  const f = fixture(3);
  f.players[0].basketballRole = 'spectator';
  f.players[0].basketballTeam = 'away';
  assert.equal(assignBasketballTeam(f.sim, f.players[1], f.now), 'home');
  assert.equal(assignBasketballTeam(f.sim, f.players[2], f.now), 'away');
  f.start();
  f.hold(f.players[1]);
  f.advance(24000);
  assert.equal(f.match.possession, 'away');
  assert.equal(f.players[0].heldId, null);
  assert.equal(f.players[2].heldId, BASKETBALL_BALL_ID);
});

test('settings updates are partial, configure the ready clocks and stay fixed during a live game', () => {
  const f = fixture();
  setBasketballSettings(f.sim, {quarterMinutes: 3, quarters: 2, shotClockSeconds: 12, scoreLimit: 21, winBy: 2}, f.now);
  configureBasketballGame(f.sim, {allowLateJoin: false}, f.now);
  assert.deepEqual(f.match.settings, {quarterMinutes: 3, quarters: 2, shotClockSeconds: 12, scoreLimit: 21, winBy: 2, allowLateJoin: false});
  assert.equal(f.match.clockMs, 180000);
  assert.equal(f.match.shotClockMs, 12000);
  f.start();
  assert.equal(f.match.clockMs, 180000);
  assert.equal(f.match.shotClockMs, 12000);
  assert.throws(() => setBasketballSettings(f.sim, {quarterMinutes: 1}, f.now), /before|live|running|finish/i);
  assert.equal(f.match.settings.quarterMinutes, 3);
});

test('settings accept their supported integer boundaries and reject invalid or unknown input atomically', () => {
  const f = fixture();
  setBasketballSettings(f.sim, {quarterMinutes: 1, quarters: 1, shotClockSeconds: 5, scoreLimit: 0, winBy: 1, allowLateJoin: false}, f.now);
  setBasketballSettings(f.sim, {quarterMinutes: 12, quarters: 4, shotClockSeconds: 60, scoreLimit: 200, winBy: 10, allowLateJoin: false}, f.now);
  const configured = {...f.match.settings};
  for (const invalid of [
    null, [], 'settings', 5,
    {quarterMinutes: 0}, {quarterMinutes: 13}, {quarterMinutes: 1.5}, {quarterMinutes: '3'},
    {quarters: 0}, {quarters: 5}, {quarters: 2.5},
    {shotClockSeconds: 4}, {shotClockSeconds: 61}, {shotClockSeconds: 5.5},
    {scoreLimit: -1}, {scoreLimit: 201}, {scoreLimit: 5.5},
    {winBy: 0}, {winBy: 11}, {winBy: 1.5},
    {allowLateJoin: true}, {allowLateJoin: 1}, {allowLateJoin: 'true'},
    {quarterMinutes: 2, unsupported: true},
  ]) {
    assert.throws(() => setBasketballSettings(f.sim, invalid, f.now), error => error.statusCode === 422, JSON.stringify(invalid));
    assert.deepEqual(f.match.settings, configured, JSON.stringify(invalid));
  }
  assert.throws(() => setBasketballSettings({players: {}, actors: {}}, {}, f.now), /Enter Basketball Arena/);
});

test('custom quarter and shot clocks govern turnovers and the regulation buzzer', () => {
  const f = fixture();
  setBasketballSettings(f.sim, {quarterMinutes: 1, quarters: 2, shotClockSeconds: 5}, f.now);
  f.start();
  f.hold(f.players.find(player => player.basketballTeam === 'home'));
  f.advance(5000);
  assert.equal(f.match.clockMs, 55000);
  assert.equal(f.match.shotClockMs, 5000);
  assert.equal(f.match.possession, 'away');
  f.advance(55000);
  assert.equal(f.match.quarter, 2);
  assert.equal(f.match.clockMs, 60000);
  assert.equal(f.match.state, 'live');
  f.match.homeScore = 3;
  f.advance(60000);
  assert.equal(f.match.state, 'finished');
  assert.equal(f.match.winner, 'home');
});

test('a tied short game starts overtime after its configured final quarter', () => {
  const f = fixture();
  setBasketballSettings(f.sim, {quarterMinutes: 1, quarters: 1}, f.now);
  f.start();
  f.advance(60000);
  assert.equal(f.match.state, 'live');
  assert.equal(f.match.quarter, 2);
  assert.equal(f.match.clockMs, BASKETBALL_COURT.overtimeMs);
  assert.match(f.match.lastPlay, /Overtime 1/);
});

test('score limits wait for the configured winning margin and finish on the decisive basket', () => {
  const f = fixture();
  setBasketballSettings(f.sim, {scoreLimit: 5, winBy: 2}, f.now);
  f.start();
  f.match.homeScore = 3;
  f.match.awayScore = 4;
  const home = f.players.find(player => player.basketballTeam === 'home');
  const scoreHomeBasket = () => {
    f.hold(home, {x: 0, y: 0, z: -9});
    shootBasketball(f.sim, home, f.now);
    for (let elapsed = 0; elapsed < 4; elapsed += .1) f.advance(100, .1);
  };
  scoreHomeBasket();
  assert.equal(f.match.homeScore, 5);
  assert.equal(f.match.state, 'live');
  scoreHomeBasket();
  assert.equal(f.match.homeScore, 7);
  assert.equal(f.match.awayScore, 4);
  assert.equal(f.match.state, 'finished');
  assert.equal(f.match.winner, 'home');
  assert.equal(f.match.shotClockMs, 0);
  assert.equal(f.ball.holderId, null);
  assert.equal(f.ball.ballVelocity, undefined);
  assert.equal(f.sim.events.filter(event => event.action === 'basketball-finish').length, 1);
  f.advance(1000, 1);
  assert.equal(f.match.homeScore, 7);
});

test('two and three point classification follows both the arc and corner lines', () => {
  const hoop = basketballHoopForTeam('home');
  assert.equal(basketballShotPoints({x: 0, z: hoop.z + 5}, hoop), 2);
  assert.equal(basketballShotPoints({x: 0, z: hoop.z + BASKETBALL_COURT.threePointRadius}, hoop), 3);
  assert.equal(basketballShotPoints({x: BASKETBALL_COURT.cornerThreeX, z: hoop.z}, hoop), 3);
  assert.equal(basketballShotPoints({x: -BASKETBALL_COURT.cornerThreeX, z: hoop.z}, hoop), 3);
  assert.equal(basketballShotPoints({x: BASKETBALL_COURT.cornerThreeX - .01, z: hoop.z}, hoop), 2);
});

for (const [team, z, points, step] of [
  ['home', -9, 2, 1 / 60],
  ['home', 0, 3, .25],
  ['away', 9, 2, .25],
  ['away', 0, 3, 1 / 60],
]) {
  test(`an actual ${team} assisted shot scores ${points} points at ${Math.round(1 / step)} Hz exactly once`, () => {
    const f = fixture();
    f.start();
    const shooter = f.players.find(player => player.basketballTeam === team);
    f.hold(shooter, {x: 0, y: 0, z});
    shooter.yaw = team === 'away' ? Math.PI : 0;
    const ball = shootBasketball(f.sim, shooter, f.now);
    const shot = ball.basketballShot;
    assert.equal(shooter.heldId, null);
    assert.equal(ball.holderId, null);
    assert.ok(ball.ballVelocity.y > 0);
    for (let elapsed = 0; elapsed < 4; elapsed += step) f.advance(step * 1000, step);

    assert.equal(f.match[`${team}Score`], points);
    assert.equal(f.match[`${team === 'home' ? 'away' : 'home'}Score`], 0);
    assert.equal(shooter.basketballPoints, points);
    assert.equal(shot.scored, true);
    assert.equal(f.match.lastScore.playerId, shooter.actorId);
    assert.equal(f.match.possession, team === 'home' ? 'away' : 'home');
    assert.equal(f.sim.events.filter(event => event.action === 'basketball-score').length, 1);
    assert.equal(ball.ballVelocity, undefined);
    const receiver = f.players.find(player => player.basketballTeam === f.match.possession);
    assert.equal(receiver.heldId, BASKETBALL_BALL_ID);
    assert.equal(ball.holderId, receiver.actorId);
  });
}

test('crossing above or beside a rim, or using another basketball, cannot score', () => {
  for (const [x, y, velocityY, matchBall] of [
    [0, 2.8, 5, true],
    [.3, 3.2, -2, true],
    [0, 3.2, -2, false],
  ]) {
    const f = fixture();
    f.start();
    const shooter = f.players[0];
    const ball = matchBall ? f.ball : {id: 'practice', modelId: 'basketball', position: {}};
    if (!matchBall) f.sim.actors.practice = ball;
    ball.position = {x, y, z: basketballHoopForTeam('home').z};
    ball.ballVelocity = {x: 0, y: velocityY, z: 0};
    registerBasketballRelease(f.sim, ball, shooter, f.now);
    f.advance(100, .1);
    assert.equal(f.match.homeScore, 0);
    assert.equal(f.match.awayScore, 0);
  }
});

test('a registered own basket awards two to the team attacking that hoop', () => {
  const f = fixture();
  f.start();
  const shooter = f.players.find(player => player.basketballTeam === 'home');
  shooter.position = {x: 0, y: 0, z: 0};
  f.ball.position = {x: 0, y: 3.2, z: basketballHoopForTeam('away').z};
  f.ball.ballVelocity = {x: 0, y: -2, z: 0};
  registerBasketballRelease(f.sim, f.ball, shooter, f.now);
  f.advance(150, .15);
  assert.equal(f.match.awayScore, 2);
  assert.equal(f.match.homeScore, 0);
  assert.equal(shooter.basketballPoints, 0);
});

test('catching an opposing possession resets its shot clock and cancels an old shot', () => {
  const f = fixture();
  f.start();
  const home = f.players.find(player => player.basketballTeam === 'home');
  const away = f.players.find(player => player.basketballTeam === 'away');
  f.match.shotClockMs = 3000;
  registerBasketballRelease(f.sim, f.ball, home, f.now);
  touchBasketball(f.sim, f.ball, away, f.now);
  assert.equal(f.match.possession, 'away');
  assert.equal(f.match.shotClockMs, BASKETBALL_COURT.shotClockMs);
  assert.equal(f.ball.basketballShot, undefined);
  assert.equal(f.ball.lastBasketballTouch.playerId, away.actorId);
  f.match.shotClockMs = 7000;
  touchBasketball(f.sim, f.ball, away, f.now);
  assert.equal(f.match.shotClockMs, 7000);
});

test('a loose ball leaving the sideline turns over to its last toucher’s opponent', () => {
  const f = fixture();
  f.start();
  const home = f.players.find(player => player.basketballTeam === 'home');
  registerBasketballRelease(f.sim, f.ball, home, f.now);
  f.ball.position = {x: BASKETBALL_COURT.width / 2 + .2, y: 1, z: 0};
  f.ball.ballVelocity = {x: 1, y: 0, z: 0};
  f.advance(20, .02);
  assert.equal(f.match.possession, 'away');
  assert.equal(f.match.shotClockMs, BASKETBALL_COURT.shotClockMs);
  assert.equal(f.ball.basketballShot, undefined);
  assert.equal(f.sim.events.at(-1).reason, 'out-of-bounds');
});

test('carrying a ball beyond the baseline transfers it to the other team', () => {
  const f = fixture();
  f.start();
  const home = f.players.find(player => player.basketballTeam === 'home');
  const away = f.players.find(player => player.basketballTeam === 'away');
  f.hold(home, {x: 0, y: 0, z: BASKETBALL_COURT.length / 2 + .1});
  f.advance(20, .02);
  assert.equal(f.match.possession, 'away');
  assert.equal(home.heldId, null);
  assert.equal(away.heldId, BASKETBALL_BALL_ID);
  assert.equal(f.ball.holderId, away.actorId);
});

test('a 24 second violation changes possession and releases the previous holder', () => {
  const f = fixture();
  f.start();
  const home = f.players.find(player => player.basketballTeam === 'home');
  const away = f.players.find(player => player.basketballTeam === 'away');
  f.hold(home);
  f.advance(24000);
  assert.equal(f.match.clockMs, BASKETBALL_COURT.quarterMs - 24000);
  assert.equal(f.match.possession, 'away');
  assert.equal(f.match.shotClockMs, 24000);
  assert.equal(home.heldId, null);
  assert.equal(away.heldId, BASKETBALL_BALL_ID);
  assert.equal(f.sim.events.at(-1).reason, 'shot-clock');
});

test('regulation quarters advance and a tied fourth quarter starts five minute overtime', () => {
  const f = fixture();
  f.start();
  for (let quarter = 2; quarter <= 4; quarter++) {
    f.advance(BASKETBALL_COURT.quarterMs);
    assert.equal(f.match.quarter, quarter);
    assert.equal(f.match.clockMs, BASKETBALL_COURT.quarterMs);
    assert.equal(f.match.state, 'live');
  }
  f.advance(BASKETBALL_COURT.quarterMs);
  assert.equal(f.match.quarter, 5);
  assert.equal(f.match.clockMs, 5 * 60 * 1000);
  assert.equal(f.match.state, 'live');
  assert.match(f.match.lastPlay, /Overtime 1/);
  f.advance(BASKETBALL_COURT.overtimeMs);
  assert.equal(f.match.quarter, 6);
  assert.equal(f.match.clockMs, BASKETBALL_COURT.overtimeMs);
  assert.match(f.match.lastPlay, /Overtime 2/);
});

test('the final buzzer ends a non-tied fourth quarter and prevents late scores', () => {
  const f = fixture();
  f.start();
  f.match.quarter = 4;
  f.match.clockMs = 100;
  f.match.homeScore = 3;
  const shooter = f.players.find(player => player.basketballTeam === 'away');
  registerBasketballRelease(f.sim, f.ball, shooter, f.now);
  f.ball.position = {x: 0, y: 3.2, z: basketballHoopForTeam('away').z};
  f.ball.ballVelocity = {x: 0, y: -2, z: 0};
  f.advance(100, .1);
  assert.equal(f.match.state, 'finished');
  assert.equal(f.match.winner, 'home');
  assert.equal(f.match.clockMs, 0);
  assert.equal(f.match.shotClockMs, 0);
  assert.equal(f.match.awayScore, 0);
  assert.equal(f.ball.ballVelocity, undefined);
  assert.equal(f.sim.events.at(-1).action, 'basketball-finish');
  assert.throws(() => {
    f.hold(shooter);
    shootBasketball(f.sim, shooter, f.now);
  }, /Start a new game/);
});

test('clocks pause when no active players remain', () => {
  const f = fixture();
  f.start();
  for (const player of f.players) player.health = 0;
  f.advance(30000);
  assert.equal(f.match.clockMs, BASKETBALL_COURT.quarterMs);
  assert.equal(f.match.shotClockMs, BASKETBALL_COURT.shotClockMs);
});

test('shooting requires a caught ball, a basketball game and an on-court origin', () => {
  const f = fixture();
  f.start();
  const player = f.players[0];
  assert.throws(() => shootBasketball(f.sim, player, f.now), /Catch a basketball/);
  f.hold(player, {x: BASKETBALL_COURT.width, y: 0, z: 0});
  assert.throws(() => shootBasketball(f.sim, player, f.now), /Step onto the court/);
  delete f.sim.basketball;
  assert.throws(() => shootBasketball(f.sim, player, f.now), /Enter Basketball Arena/);
  assert.throws(() => startBasketballGame(f.sim, f.now), /Enter Basketball Arena/);
});
