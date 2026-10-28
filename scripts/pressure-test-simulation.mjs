#!/usr/bin/env node
// Run real AuthoritativeRooms simulation separately from HTTP/auth/storage tests.
// Every scenario uses a fresh subprocess and a newly-created temporary store.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir, cpus, totalmem} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const SCRIPT = fileURLToPath(import.meta.url);
const HELP = `Usage: node scripts/pressure-test-simulation.mjs [options]
  --targets=1,15,128,1000,10000  Total synthetic players; defaults shown
  --ticks=20                    Complete measured ticks per scenario
  --warmup=3                    Unmeasured ticks before measurement
  --scenario-seconds=120        Hard wall deadline per subprocess, including setup
  --memory-mb=1536              V8 old-space cap per subprocess (not total RSS)
  --output=/absolute/file.json  Save the JSON report also printed to stdout
  --help                       Show this help

1/15/128 players use one room; 128 configures capacity128. Other targets use
15 players per room, with a smaller final room (1000/67 and10000/667).
Each simulated tick advances the controlled game clock50ms; no pacing/sleeps.
Production tickActive/store/collision methods run unchanged. Real joins/input
build a template before timing. The measured workload is in-memory simulation,
not connected users: no HTTP, sockets, auth, economy settlement or disk writes.
Use --targets=1 --ticks=2 --warmup=1 for a small correctness smoke check.
Exit1 means a scenario failed or hit a limit; exit2 means invalid arguments.
`;

const number = value => Number.isFinite(value) ? Number(value.toFixed(3)) : null;
const errorInfo = error => ({name: error?.name || 'Error', message: String(error?.message || error),
  ...(error?.code ? {code: error.code} : {})});
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = ratio => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
  return {count: sorted.length, min: number(sorted[0]),
    mean: sorted.length ? number(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : null,
    p50: number(quantile(.5)), p95: number(quantile(.95)), p99: number(quantile(.99)), max: number(sorted.at(-1))};
};

function readOptions(args) {
  const options = {targets: [1, 15, 128, 1000, 10000], ticks: 20, warmup: 3,
    scenarioSeconds: 120, memoryMb: 1536, output: null};
  const names = new Map([['ticks', 'ticks'], ['warmup', 'warmup'],
    ['scenario-seconds', 'scenarioSeconds'], ['memory-mb', 'memoryMb']]);
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') return {help: true};
    const match = /^--([\w-]+)=(.+)$/.exec(arg);
    if (!match) throw Error('Use --name=value. Invalid argument: ' + arg);
    const [, name, value] = match;
    if (name === 'targets') options.targets = value.split(',').map(Number);
    else if (name === 'output') options.output = resolve(value);
    else if (names.has(name)) options[names.get(name)] = Number(value);
    else throw Error('Unknown option: --' + name);
  }
  assert.ok(options.targets.length && options.targets.every(value => Number.isSafeInteger(value) && value > 0),
    '--targets requires positive integers');
  for (const name of names.values()) assert.ok(Number.isSafeInteger(options[name]) &&
    options[name] >= (name === 'warmup' ? 0 : 1), 'Invalid ' + name);
  assert.ok(options.memoryMb >= 128, '--memory-mb must be >=128');
  assert.ok(options.scenarioSeconds <= 3600, '--scenario-seconds must be <=3600');
  options.targets = [...new Set(options.targets)].sort((a, b) => a - b);
  return options;
}

function scenarioFor(players) {
  const playersPerRoom = players === 128 ? 128 : Math.min(15, players);
  return {players, playersPerRoom, roomCount: Math.ceil(players / playersPerRoom),
    admissionCapacity: players === 128 ? 128 : 15};
}

function makeEnvironment(id) {
  return {id, roomId: id, name: 'Synthetic courtyard ' + id, updatedAt: 'pressure-v1',
    spawn: {x: -12, y: 0, z: -12}, builderScene: {layout: 'community-park', mapSize: 160,
      layoutMeta: {locations: [{id: 'courtyard', name: 'Synthetic courtyard', x: 0, y: 0, z: 0, width: 24, depth: 24}]},
      objects: Array.from({length: 12}, (_, index) => ({id: 'bench-' + index, modelId: 'camp-log-bench',
        position: {x: index % 2 ? 18 : -18, y: 0, z: -15 + Math.floor(index / 2) * 6},
        rotation: {x: 0, y: index % 2 ? -Math.PI / 2 : Math.PI / 2, z: 0},
        scale: {x: 1, y: 1, z: 1}, functionalSettings: {behavior: 'seat', interactionDistance: 3}}))}};
}

function population(store, now) {
  let actualPlayers = 0, activePlayers = 0, finitePositions = 0, actors = 0, residents = 0, benches = 0;
  const ids = new Set();
  for (const room of Object.values(store.data || {})) {
    for (const [id, player] of Object.entries(room.simulation.players)) {
      if (player.basketballAI || player.isAI) continue;
      actualPlayers++; ids.add(id);
      if (!player.replacedByRoom && now - player.lastSeen < 15000 && player.health > 0) activePlayers++;
      if (['x', 'y', 'z'].every(axis => Number.isFinite(player.position?.[axis]))) finitePositions++;
    }
    for (const actor of Object.values(room.simulation.actors)) {
      actors++; if (actor.resident) residents++;
      if (actor.modelId === 'camp-log-bench') benches++;
    }
  }
  return {rooms: Object.keys(store.data || {}).length, actualPlayers, uniquePlayerIds: ids.size,
    activePlayers, finitePositions, actors, residents, authoredBenches: benches};
}

async function runWorker(config) {
  // Import production gameplay only in the isolated child. The controller stays
  // responsive enough to terminate a stalled or memory-limited simulation.
  const {SharedRoomStore} = await import('../shared-room-store.mjs');
  const {AuthoritativeRooms} = await import('../authoritative-room.mjs');
  const send = value => { if (process.connected) process.send(value); };
  const started = performance.now(), scenario = scenarioFor(config.target);
  let now = 1_800_000_000_000;
  const deadline = started + config.scenarioSeconds * 1000;
  send({type: 'phase', phase: 'template-joins'});
  const templateStore = new SharedRoomStore(join(config.directory, 'template.json'));
  const templateRuntime = new AuthoritativeRooms({store: templateStore, now: () => now,
    capacity: scenario.admissionCapacity});
  const environment = makeEnvironment('pressure-template');
  for (let index = 0; index < scenario.playersPerRoom; index++) {
    const identity = {accountId: 'template-player-' + index, username: 'Synthetic ' + index,
      walletId: 'pressure-wallet-' + index, stats: {health: 100}};
    await templateRuntime.command(environment.id, environment, identity,
      {action: 'join', requestId: 'join-' + index, radToxEnabled: false});
    const controls = {forward: .6, side: index % 2 ? .3 : -.3, yaw: (index % 4) * Math.PI / 2, sprint: index % 3 === 0};
    await templateRuntime.command(environment.id, environment, identity,
      {action: 'input', requestId: 'input-' + index, inputSequence: 0,
        inputEpoch: templateStore.data[environment.id].simulation.players['account:' + identity.accountId].inputEpoch,
        input: controls});
    if (performance.now() > deadline) throw Error('Scenario deadline reached while building joined template');
  }
  await templateStore.queue;
  const template = await templateStore.get(environment.id);
  assert.equal(Object.keys(template.simulation.players).length, scenario.playersPerRoom);
  // Geometry must exist: a successful join alone would not prove that the
  // fixture exercised the production procedural collision world.
  const geometry = templateRuntime.collision.world(environment);
  assert.ok(geometry.floors.length > 1, 'Expected floor and authored bench collision meshes');
  assert.equal(Object.values(template.simulation.actors).filter(actor => actor.modelId === 'camp-log-bench').length, 12);
  const store = new SharedRoomStore(join(config.directory, 'measured-never-written.json'));
  store.data = {};
  const runtime = new AuthoritativeRooms({store, now: () => now, capacity: scenario.admissionCapacity});
  const initialPositions = new Map();
  send({type: 'phase', phase: 'clone-fixture'});
  let remaining = scenario.players;
  for (let roomIndex = 0; roomIndex < scenario.roomCount; roomIndex++) {
    const id = 'pressure-map-' + roomIndex, room = structuredClone(template), count = Math.min(remaining, scenario.playersPerRoom);
    const sourcePlayers = Object.values(room.simulation.players).slice(0, count);
    room.simulation.players = {};
    for (let index = 0; index < count; index++) {
      const player = sourcePlayers[index], actorId = 'account:pressure-' + roomIndex + '-' + index;
      Object.assign(player, {actorId, username: 'Synthetic ' + roomIndex + '-' + index,
        walletId: 'pressure-wallet-' + roomIndex + '-' + index, lastSeen: now, replacedByRoom: null,
        heldId: null, seatedId: null, vehicleId: null, radToxEnabled: false});
      room.simulation.players[actorId] = player;
      initialPositions.set(actorId, {...player.position});
    }
    room.simulation.events = [];
    room.simulation.receipts = {};
    room.simulation.time = now;
    room.simulation.environmentUpdatedAt = id + ':pressure-v1:[]';
    if (room.building) room.building.hostId = Object.keys(room.simulation.players)[0];
    store.data[id] = room;
    runtime.activeWorlds.set(id, makeEnvironment(id));
    remaining -= count;
  }
  assert.equal(remaining, 0);
  const fixture = population(store, now);
  assert.equal(fixture.actualPlayers, scenario.players);
  assert.equal(fixture.uniquePlayerIds, scenario.players);
  assert.equal(fixture.activePlayers, scenario.players);
  assert.equal(fixture.rooms, scenario.roomCount);
  assert.equal(fixture.authoredBenches, 12 * scenario.roomCount);
  send({type: 'fixture', fixture, setupMs: number(performance.now() - started),
    collisionMeshesPerRoom: geometry.floors.length});
  // Release setup-only collision resources before the measured runtime creates
  // its own normal caches. No runtime methods or collision routines are stubbed.
  templateRuntime.collision.clearPlacedWorlds();
  templateRuntime.collision.cache.clear();
  templateRuntime.activeWorlds.clear();
  templateStore.data = null;

  const tickSamples = [], cpuSamples = [], rssSamples = [];
  let measuredCpuUser = 0, measuredCpuSystem = 0;
  async function tick(measured) {
    now += 50;
    // Model continuously active controls without timing HTTP/session/queueing
    // work. Input values originated from real command('input') validation.
    for (const room of Object.values(store.data)) for (const player of Object.values(room.simulation.players)) player.lastSeen = now;
    const cpuBefore = process.cpuUsage(), start = performance.now();
    await runtime.tickActive();
    const elapsedMs = performance.now() - start, cpu = process.cpuUsage(cpuBefore);
    assert.equal(runtime.tickRetryAt.size, 0, 'Production simulation recorded a failed room tick');
    assert.equal(runtime.activeWorlds.size, scenario.roomCount, 'A populated room stopped ticking');
    for (const room of Object.values(store.data)) assert.equal(room.simulation.time, now, 'A room did not advance to this tick');
    if (measured) {
      tickSamples.push(elapsedMs); measuredCpuUser += cpu.user; measuredCpuSystem += cpu.system;
      const rss = process.memoryUsage().rss; rssSamples.push(rss);
      cpuSamples.push((cpu.user + cpu.system) / 1000);
      send({type: 'tick', elapsedMs: number(elapsedMs), cpuUserMs: number(cpu.user / 1000),
        cpuSystemMs: number(cpu.system / 1000), rssBytes: rss, completedTicks: tickSamples.length});
    }
  }
  send({type: 'phase', phase: 'warmup'});
  for (let index = 0; index < config.warmup; index++) {
    await tick(false);
    if (performance.now() > deadline) throw Error('Scenario deadline reached during warmup');
  }
  const rssBefore = process.memoryUsage().rss, measurementStart = performance.now();
  send({type: 'phase', phase: 'measured-ticks'});
  let reachedDeadline = false;
  for (let index = 0; index < config.ticks; index++) {
    if (performance.now() >= deadline) {reachedDeadline = true; break;}
    await tick(true);
  }
  const measurementElapsedMs = performance.now() - measurementStart, after = population(store, now);
  assert.equal(after.actualPlayers, scenario.players);
  assert.equal(after.uniquePlayerIds, scenario.players);
  assert.equal(after.activePlayers, scenario.players);
  assert.equal(after.finitePositions, scenario.players);
  let movedPlayers = 0;
  for (const room of Object.values(store.data)) for (const [id, player] of Object.entries(room.simulation.players)) {
    const previous = initialPositions.get(id);
    if (Math.hypot(player.position.x - previous.x, player.position.z - previous.z) > .001) movedPlayers++;
  }
  assert.ok(movedPlayers > 0, 'Walking inputs did not move any players');
  assert.equal(store.dirty, true);
  const hits = tickSamples.filter(value => value <= 50).length;
  const result = {scenario, status: reachedDeadline ? 'deadline-reached' : 'completed',
    templateJoinedPlayers: scenario.playersPerRoom, fixture, validatedAfter: after, movedPlayers,
    requestedTicks: config.ticks, completedTicks: tickSamples.length, warmupTicks: config.warmup,
    tickWallMs: distribution(tickSamples), tickCpuMs: distribution(cpuSamples),
    deadline50ms: {hits, misses: tickSamples.length - hits, hitRatio: tickSamples.length ? number(hits / tickSamples.length) : null},
    cpuMs: {user: number(measuredCpuUser / 1000), system: number(measuredCpuSystem / 1000)},
    memory: {rssBeforeBytes: rssBefore, rssAfterBytes: process.memoryUsage().rss, peakSampledRssBytes: Math.max(rssBefore, ...rssSamples)},
    measurementElapsedMs: number(measurementElapsedMs),
    completeTickThroughputHz: tickSamples.length ? number(1000 * tickSamples.length / tickSamples.reduce((sum, value) => sum + value, 0)) : null,
    runtimeCacheEntries: {manifests: runtime.manifestCache.size, collisionWorlds: runtime.collision.cache.size,
      placedWorlds: runtime.collision.placedWorlds.size},
    inclusiveCosts: ['production SharedRoomStore queue and room clones', 'production AuthoritativeRooms.step',
      'real procedural collision', 'naturally spawned actor and resident simulation'],
    elapsedMs: number(performance.now() - started)};
  send({type: 'result', result});
}

async function runScenario(target, options) {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-simulation-pressure-'));
  const started = performance.now(), scenario = scenarioFor(target), samples = [];
  let lastPhase = 'starting', fixture = null, childResult = null, timedOut = false, stderr = '';
  const config = {target, ticks: options.ticks, warmup: options.warmup, scenarioSeconds: options.scenarioSeconds, directory};
  try {
    const outcome = await new Promise((done, reject) => {
      const child = fork(SCRIPT, ['--worker=' + Buffer.from(JSON.stringify(config)).toString('base64url')], {
        execArgv: ['--max-old-space-size=' + options.memoryMb], stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
      // This is independent of the busy child event loop. SIGKILL bounds a
      // pathological single tick that cannot observe its own deadline.
      const timer = setTimeout(() => {timedOut = true; child.kill('SIGKILL');}, options.scenarioSeconds * 1000);
      child.stderr.on('data', bytes => {stderr = (stderr + bytes.toString()).slice(-6000);});
      child.on('message', message => {
        if (message.type === 'phase') lastPhase = message.phase;
        else if (message.type === 'fixture') fixture = message;
        else if (message.type === 'tick') samples.push(message);
        else if (message.type === 'result') childResult = message.result;
        else if (message.type === 'failure') childResult = {scenario, status: 'failed', error: message.error};
      });
      child.once('error', error => {clearTimeout(timer); reject(error);});
      child.once('exit', (code, signal) => {clearTimeout(timer); done({code, signal});});
    });
    if (childResult && outcome.code === 0 && !timedOut) return {...childResult,
      process: outcome, hardWallLimitSeconds: options.scenarioSeconds, oldSpaceLimitMb: options.memoryMb};
    const hits = samples.filter(sample => sample.elapsedMs <= 50).length;
    return {scenario, status: timedOut ? 'hard-timeout' : childResult?.status || 'child-exited',
      requestedTicks: options.ticks, completedTicks: samples.length, lastPhase, fixture: fixture?.fixture || null,
      tickWallMs: distribution(samples.map(sample => sample.elapsedMs)),
      deadline50ms: {hits, misses: samples.length - hits, hitRatio: samples.length ? number(hits / samples.length) : null},
      peakSampledRssBytes: samples.length ? Math.max(...samples.map(sample => sample.rssBytes)) : null,
      hardWallLimitSeconds: options.scenarioSeconds, oldSpaceLimitMb: options.memoryMb,
      elapsedMs: number(performance.now() - started), process: outcome,
      ...(childResult?.error ? {error: childResult.error} : {}),
      ...(stderr ? {diagnosticTail: stderr} : {}),
      partialResult: true};
  } catch (error) {return {scenario, status: 'failed', error: errorInfo(error)};}
  finally {await rm(directory, {recursive: true, force: true});}
}

async function main(options) {
  const report = {schemaVersion: 1, harness: 'muzikaz-real-simulation-pressure', startedAt: new Date().toISOString(),
    options, environment: {node: process.version, platform: process.platform, arch: process.arch,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem()},
    scope: {productionTickActive: true, productionCollision: true, productionMethodsStubbed: false,
      templateCreatedByRealJoinAndInputCommands: true, fixtures: '160m flat procedural park with 12 native benches per room',
      uniqueSyntheticPlayers: true, diskWritesDuringMeasuredTicks: false, httpDuringMeasuredTicks: false,
      socketClients: false, authenticationLoad: false, snapshotsSerializedForNetwork: false,
      gameClockMillisecondsPerTick: 50, wallClockPacing: false, physicsAndStoreCloneCostCombined: true,
      childV8OldSpaceCapIsNotTotalProcessMemoryCap: true},
    scenarios: [], limitations: [
      'Synthetic active walking players in a light fixture do not establish full-city, combat, vehicle or browser performance.',
      'Large populations are cloned from a real joined room; they are not thousands of authenticated network connections.',
      'Template persistence and fixture construction are excluded from tick measurements and included in scenario wall deadlines.',
      'Refresh of player lastSeen and post-tick assertions occur outside the measured tick interval.',
      'Ticks include unchanged production cache limits, clone overhead and naturally spawned actors/NPCs.',
      'The 50ms target is a simulation budget; network, snapshots, disk, auth and economy also consume server resources.',
      'V8 heap limits bound old space, not all native allocations or RSS. Subprocess wall deadlines remain enforced.',
    ]};
  for (const target of options.targets) {
    report.scenarios.push(await runScenario(target, options));
    report.status = 'running';
    if (options.output) await writeFile(options.output, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.scenarios.every(result => result.status === 'completed') ? 'completed' : 'limits-or-failures';
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) await writeFile(options.output, json, {mode: 0o600});
  process.stdout.write(json);
  if (report.status !== 'completed') process.exitCode = 1;
}

try {
  const worker = process.argv.slice(2).find(arg => arg.startsWith('--worker='));
  if (worker) {
    try {await runWorker(JSON.parse(Buffer.from(worker.slice(9), 'base64url').toString('utf8')));}
    catch (error) {if (process.connected) process.send({type: 'failure', error: errorInfo(error)}); process.exitCode = 1;}
    finally {if (process.connected) process.disconnect();}
  } else {
    const options = readOptions(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else await main(options);
  }
} catch (error) {
  process.stdout.write(JSON.stringify({status: 'failed', phase: 'arguments-or-report-output', error: errorInfo(error)}) + '\n');
  process.exitCode = 2;
}
