#!/usr/bin/env node
// Synthetic, isolated pressure tests for the production JSON persistence classes.
// Example: node scripts/pressure-test-storage.mjs --suite=all --scales=1,100,1000 \
//   --operations=100 --concurrency=25 --output=/tmp/muzikaz-storage-pressure.json
// Use --suite=correctness for a small check without the growth timing workloads.
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir, cpus, totalmem} from 'node:os';
import {join, resolve} from 'node:path';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const HELP = `Usage: node scripts/pressure-test-storage.mjs [options]
  --suite=all|correctness|growth  Default: all
  --scales=1,100,1000           Synthetic users and rooms per growth step
  --operations=100             Operations per workload, per growth step
  --concurrency=25             Maximum outstanding operations
  --objects-per-room=20        Existing building objects in each synthetic room
  --items-per-user=8           Inventory items in each synthetic user
  --history-per-user=2         Existing transaction records per synthetic user
  --active-rooms=4             Rooms advanced in each tick; bounded by scale
  --output=/absolute/file.json Write the same report emitted to stdout
  --help                      Print this help

Stores are always created in a new temporary directory and removed afterward.
No live server is started or contacted. No production records are read.
This measures one store instance in one process, matching the current server.
Fixture setup is outside workload timings. Queue delay is observed by waiting
for the store's preceding queue promise; service includes read/clone/write work.
Exit code 1 means an invariant failed; exit code 2 means invalid arguments.
`;

const round = value => Number.isFinite(value) ? Number(value.toFixed(3)) : null;
const errorInfo = error => ({name: error?.name || 'Error', message: String(error?.message || error),
  ...(error?.code ? {code: error.code} : {}), ...(error?.statusCode ? {statusCode: error.statusCode} : {})});

function optionsFrom(args) {
  const options = {suite: 'all', scales: [1, 100, 1000], operations: 100, concurrency: 25,
    objectsPerRoom: 20, itemsPerUser: 8, historyPerUser: 2, activeRooms: 4, output: null};
  const integers = new Map([['operations', 'operations'], ['concurrency', 'concurrency'],
    ['objects-per-room', 'objectsPerRoom'], ['items-per-user', 'itemsPerUser'],
    ['history-per-user', 'historyPerUser'], ['active-rooms', 'activeRooms']]);
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') return {help: true};
    const match = /^--([\w-]+)=(.+)$/.exec(arg);
    if (!match) throw Error('Use --name=value for options. Unknown argument: ' + arg);
    const [, name, value] = match;
    if (name === 'suite') options.suite = value;
    else if (name === 'scales') options.scales = value.split(',').map(Number);
    else if (name === 'output') options.output = resolve(value);
    else if (integers.has(name)) options[integers.get(name)] = Number(value);
    else throw Error('Unknown option: --' + name);
  }
  assert.ok(['all', 'correctness', 'growth'].includes(options.suite), 'Invalid --suite');
  assert.ok(options.scales.length && options.scales.every(n => Number.isSafeInteger(n) && n > 0),
    '--scales must contain positive integers');
  for (const key of integers.values()) {
    const minimum = ['objectsPerRoom', 'itemsPerUser', 'historyPerUser'].includes(key) ? 0 : 1;
    assert.ok(Number.isSafeInteger(options[key]) && options[key] >= minimum, key + ' has an invalid value');
  }
  assert.ok(options.objectsPerRoom <= 1900, '--objects-per-room must be <=1900 (room limit is 2000)');
  assert.ok(options.itemsPerUser <= 10000, '--items-per-user must be <=10000');
  options.scales = [...new Set(options.scales)].sort((a, b) => a - b);
  return options;
}

function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = ratio => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
  return {count: sorted.length, min: round(sorted[0]),
    mean: sorted.length ? round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : null,
    p50: round(quantile(.5)), p95: round(quantile(.95)), p99: round(quantile(.99)), max: round(sorted.at(-1))};
}

async function workload({name, operations, concurrency, store, operation}) {
  let cursor = 0, outstanding = 0, maxOutstanding = 0, completed = 0;
  const latency = [], queueWait = [], service = [], failures = [];
  // A group-commit store exposes a finite commit barrier, not an individual
  // operation start. End-to-end latency/throughput remain comparable; that
  // barrier cannot honestly decompose each operation's queue and service time.
  const observeQueue = !(store instanceof UserJsonDatabase);
  const lag = monitorEventLoopDelay({resolution: 10});
  const rssBefore = process.memoryUsage().rss, cpuBefore = process.cpuUsage(), start = performance.now();
  lag.enable();
  async function worker() {
    while (cursor < operations) {
      const index = cursor++, issuedAt = performance.now();
      outstanding++; maxOutstanding = Math.max(maxOutstanding, outstanding);
      let beganAt = issuedAt;
      // Register before operation() appends work to the queue. This is an
      // observation only: it neither replaces nor changes the production queue.
      const markStarted = () => { beganAt = performance.now(); };
      const prior = observeQueue ? store.queue.then(markStarted, markStarted) : Promise.resolve();
      try { await operation(index); completed++; }
      catch (error) { if (failures.length < 20) failures.push({index, ...errorInfo(error)}); }
      finally {
        const finishedAt = performance.now(); await prior;
        latency.push(finishedAt - issuedAt);
        if (observeQueue) {
          queueWait.push(Math.max(0, beganAt - issuedAt));
          service.push(Math.max(0, finishedAt - beganAt));
        }
        outstanding--;
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, operations)}, worker));
  const elapsedMs = performance.now() - start, cpu = process.cpuUsage(cpuBefore);
  lag.disable();
  return {name, status: completed === operations ? 'passed' : 'failed', requested: operations,
    completed, failed: operations - completed, concurrency, maxOutstanding,
    elapsedMs: round(elapsedMs), operationsPerSecond: round(completed / (elapsedMs / 1000)),
    latencyMs: distribution(latency), queueWaitMs: distribution(queueWait), serviceMs: distribution(service),
    queueMeasurement: observeQueue ? 'Observed preceding serialized operation barrier.' : 'Not measured: user-store group commits expose commit barriers, not per-operation service starts.',
    eventLoopDelayMs: {samples: lag.count, mean: lag.count ? round(lag.mean / 1e6) : null,
      p95: lag.count ? round(lag.percentile(95) / 1e6) : null, max: lag.count ? round(lag.max / 1e6) : null},
    cpuMs: {user: round(cpu.user / 1000), system: round(cpu.system / 1000)},
    memory: {rssBeforeBytes: rssBefore, rssAfterBytes: process.memoryUsage().rss}, failures};
}

const buildingObject = (index = 0) => ({materialId: 'wood', position: [index % 50, 0, Math.floor(index / 50)],
  rotation: [0, 0, 0], scale: [1, 1, 1], paint: [123, 456], open: false});

async function correctness(directory) {
  const checks = [];
  async function check(name, run) {
    const started = performance.now();
    try { checks.push({name, status: 'passed', ...await run(), elapsedMs: round(performance.now() - started)}); }
    catch (error) { checks.push({name, status: 'failed', error: errorInfo(error), elapsedMs: round(performance.now() - started)}); }
  }

  await check('concurrent_economic_requests_are_exactly_once_after_reopen', async () => {
    const database = new UserJsonDatabase(join(directory, 'correctness-economy.json'));
    await database.put('pressure-wallet', {tokens: {MZK: 1000}, items: [], memory: {synthetic: true}});
    const calls = Array.from({length: 24}, (_, index) => ({amountMzk: 7, requestId: 'spend-' + index % 6,
      gameId: 'synthetic-pressure', reason: 'isolated correctness check'}));
    const receipts = await Promise.all(calls.map(input => database.spendGameplay('pressure-wallet', input)));
    assert.equal(new Set(receipts.map(receipt => receipt.id)).size, 6);
    const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
    assert.equal((await reopened.get('pressure-wallet')).tokens.MZK, 958);
    assert.equal(data.transactions.filter(row => row.type === 'GAMEPLAY_SPEND').length, 6);
    assert.equal((await reopened.spendGameplay('pressure-wallet', calls[0])).id, receipts[0].id);
    assert.equal((await reopened.get('pressure-wallet')).tokens.MZK, 958);
    return {submitted: 24, distinctRequests: 6, chargedMzk: 42, reopenedRetryChargedAgain: false};
  });

  await check('concurrent_wallet_creation_preserves_all_members', async () => {
    const database = new UserJsonDatabase(join(directory, 'correctness-users.json'));
    await Promise.all(Array.from({length: 16}, (_, index) => database.put('pressure-user-' + index,
      {tokens: {MZK: index + 1}, items: [{id: 'synthetic-' + index}], memory: {fixture: index}})));
    const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
    assert.equal(Object.keys(data.users).length, 16);
    for (let index = 0; index < 16; index++) assert.equal(data.users['pressure-user-' + index].tokens.MZK, index + 1);
    return {concurrentWrites: 16, durableMembers: 16};
  });

  await check('competing_spends_cannot_overdraw_and_rejections_do_not_poison_queue', async () => {
    const database = new UserJsonDatabase(join(directory, 'correctness-overdraft.json'));
    await database.put('pressure-wallet', {tokens: {MZK: 20}, items: []});
    const attempts = await Promise.allSettled(Array.from({length: 12}, (_, index) =>
      database.spendGameplay('pressure-wallet', {amountMzk: 7, requestId: 'limited-spend-' + index,
        gameId: 'synthetic-pressure'})));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 2);
    assert.ok(attempts.filter(row => row.status === 'rejected').every(row => /enough MZK/.test(row.reason.message)));
    await database.spendGameplay('pressure-wallet', {amountMzk: 1, requestId: 'after-rejection',
      gameId: 'synthetic-pressure'});
    const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
    assert.equal(data.users['pressure-wallet'].tokens.MZK, 5);
    assert.equal(data.transactions.filter(row => row.type === 'GAMEPLAY_SPEND').length, 3);
    return {competingSpends: 12, committed: 2, expectedInsufficientFundsRejections: 10,
      subsequentValidSpendCommitted: true, recoveredBalanceMzk: 5};
  });

  await check('one_listed_asset_has_one_winner_under_competing_purchases', async () => {
    const database = new UserJsonDatabase(join(directory, 'correctness-trades.json'));
    await database.put('pressure-seller', {tokens: {MZK: 0}, items: [{id: 'one-piece', name: 'Synthetic prop'}]});
    await Promise.all(Array.from({length: 8}, (_, index) => database.put('pressure-buyer-' + index,
      {tokens: {MZK: 100}, items: []})));
    await database.listItem('pressure-seller', 'one-piece', 40);
    const attempts = await Promise.allSettled(Array.from({length: 8}, (_, index) => database.trade({
      buyerId: 'pressure-buyer-' + index, sellerId: 'pressure-seller', itemId: 'one-piece',
      requestId: 'purchase-' + index, expectedPriceMzk: 40})));
    const winners = attempts.filter(row => row.status === 'fulfilled');
    assert.equal(winners.length, 1);
    const loserErrors = attempts.filter(row => row.status === 'rejected');
    assert.ok(loserErrors.every(row => /no longer listed/.test(row.reason.message)));
    const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
    assert.equal(data.trades.length, 1);
    assert.equal(Object.values(data.users).flatMap(user => user.items).filter(item => item.id === 'one-piece').length, 1);
    assert.equal(Object.values(data.users).reduce((sum, user) => sum + user.tokens.MZK, 0), 800);
    assert.equal(data.users['pressure-seller'].tokens.MZK, 40);
    return {competitors: 8, winners: 1, expectedRejections: 7, conservedTotalMzk: 800};
  });

  await check('stale_revision_and_foreign_owner_mutations_do_not_commit', async () => {
    const store = new SharedRoomStore(join(directory, 'correctness-objects.json'));
    await store.mutate('pressure-room', 'pressure-owner', {id: 'piece', revision: 0, object: buildingObject()});
    const attempts = await Promise.allSettled(Array.from({length: 16}, () => store.mutate('pressure-room',
      'pressure-owner', {id: 'piece', revision: 1, object: buildingObject(1)})));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
    assert.ok(attempts.filter(row => row.status === 'rejected').every(row => row.reason.statusCode === 409));
    await assert.rejects(store.mutate('pressure-room', 'foreign-owner', {
      id: 'piece', revision: 2, object: buildingObject()}), {statusCode: 403});
    const reopened = new SharedRoomStore(store.file), room = await reopened.get('pressure-room');
    assert.equal(room.revision, 2);
    assert.equal(room.objects.piece.ownerId, 'pressure-owner');
    assert.deepEqual(room.objects.piece.position, buildingObject(1).position);
    return {competingMutations: 16, committed: 1, expectedRevisionConflicts: 15, foreignOwnerRejected: true};
  });

  await check('queued_ticks_checkpoint_and_failure_isolation_survive_reopen', async () => {
    const store = new SharedRoomStore(join(directory, 'correctness-checkpoint.json'));
    await store.update('pressure-room', room => {room.counter = 0;});
    await store.update('pressure-sleeping', room => {room.marker = 'must-survive';});
    await Promise.all(Array.from({length: 20}, () => store.updateMany(['pressure-room'], room => {room.counter++;})));
    const failed = await store.updateMany(['pressure-room'], room => {room.counter = -999; throw Error('synthetic rollback');});
    assert.equal(failed[0].error.message, 'synthetic rollback');
    assert.equal((await store.get('pressure-room')).counter, 20);
    // An unopened reader must see the preceding checkpoint until flush commits.
    assert.equal((await new SharedRoomStore(store.file).get('pressure-room')).counter, 0);
    await store.updateMany([], () => assert.fail('empty batch must not run'), {persist: true});
    const reopened = new SharedRoomStore(store.file);
    assert.equal((await reopened.get('pressure-room')).counter, 20);
    assert.equal((await reopened.get('pressure-sleeping')).marker, 'must-survive');
    assert.equal(store.dirty, false);
    return {queuedTicks: 20, failedTicksRolledBack: 1, recoveredCounter: 20, inactiveRoomPreserved: true};
  });
  return checks;
}

async function seedUsers(database, count, options) {
  const balance = options.operations + 1000, now = '2026-01-01T00:00:00.000Z';
  await database.transaction(data => {
    for (let index = 0; index < count; index++) {
      const walletId = 'pressure-member-' + index;
      data.users[walletId] = {walletId, tokens: {MZK: balance}, revision: 1, createdAt: now, updatedAt: now,
        items: Array.from({length: options.itemsPerUser}, (_, item) => ({id: 'synthetic-item-' + item,
          type: 'prop', name: 'Synthetic pressure fixture', source: 'pressure-test', configuration: {color: '#abcdef'}})),
        memory: {profile: {displayName: 'Pressure member ' + index}, world: {visits: 10, note: 'synthetic '.repeat(24)}}};
      for (let item = 0; item < options.historyPerUser; item++) data.transactions.push({
        id: 'fixture-' + index + '-' + item, type: 'WALLET_STATE_ADJUSTMENT', walletId,
        amountMzk: 0, balanceAfterMzk: balance, requestId: 'fixture-' + index + '-' + item, createdAt: now});
    }
    return {syntheticUsers: count};
  });
  return balance;
}

async function seedRooms(store, count, options) {
  const rooms = {};
  for (let index = 0; index < count; index++) rooms['pressure-map-' + index] = {revision: 1, fixtureIndex: index,
    objects: Object.fromEntries(Array.from({length: options.objectsPerRoom}, (_, item) => ['fixture-' + item,
      {id: 'fixture-' + item, ownerId: 'pressure-owner', revision: 1, ...buildingObject(item)}])),
    simulation: {counter: 0, players: {synthetic: {position: {x: 0, y: 0, z: 0}, health: 100}},
      actors: {}, events: [], sequence: 0}};
  await store.save(rooms);
}

async function growth(directory, count, options) {
  const result = {scale: {users: count, storedRooms: count, activeRooms: Math.min(count, options.activeRooms),
    objectsPerRoom: options.objectsPerRoom, itemsPerUser: options.itemsPerUser, historyPerUser: options.historyPerUser},
    status: 'passed', workloads: [], invariants: []};
  const database = new UserJsonDatabase(join(directory, 'growth-users-' + count + '.json'));
  const rooms = new SharedRoomStore(join(directory, 'growth-rooms-' + count + '.json'));
  try {
    const initialBalance = await seedUsers(database, count, options);
    await seedRooms(rooms, count, options);
    result.fixtureBytes = {users: (await stat(database.file)).size, rooms: (await stat(rooms.file)).size};
    result.workloads.push(await workload({name: 'economic_spends', store: database, ...options,
      operation: index => database.spendGameplay('pressure-member-' + index % count, {
        amountMzk: 1, requestId: 'growth-' + count + '-' + index, gameId: 'synthetic-pressure'})}));
    const persisted = await new UserJsonDatabase(database.file).read();
    assert.equal(Object.keys(persisted.users).length, count);
    assert.equal(persisted.transactions.filter(row => row.type === 'GAMEPLAY_SPEND').length, options.operations);
    assert.equal(Object.values(persisted.users).reduce((sum, user) => sum + user.tokens.MZK, 0),
      count * initialBalance - options.operations);
    for (let index = 0; index < count; index++) {
      const spent = Math.floor(options.operations / count) + (index < options.operations % count ? 1 : 0);
      assert.equal(persisted.users['pressure-member-' + index].tokens.MZK, initialBalance - spent);
    }
    result.invariants.push({name: 'economic_balances_and_ledger_survive_reopen', status: 'passed'});

    const active = Array.from({length: result.scale.activeRooms}, (_, index) => 'pressure-map-' + index);
    result.workloads.push(await workload({name: 'active_room_ticks_without_disk_writes', store: rooms, ...options,
      operation: async () => {
        const rows = await rooms.updateMany(active, room => {room.simulation.counter++; room.simulation.sequence++;});
        for (const row of rows) if (row.error) throw row.error;
      }}));
    const checkpointStart = performance.now(); await rooms.flush();
    result.checkpointMs = round(performance.now() - checkpointStart);
    const checkpoint = new SharedRoomStore(rooms.file);
    for (let index = 0; index < count; index++) assert.equal((await checkpoint.get('pressure-map-' + index)).simulation.counter,
      index < active.length ? options.operations : 0);
    result.invariants.push({name: 'tick_checkpoint_preserves_active_and_inactive_rooms', status: 'passed'});

    // Unique mutations avoid intended revision conflicts, so failure here is an
    // actual workload failure rather than a counted contention rejection.
    const headroom = (2000 - options.objectsPerRoom) * active.length;
    const mutationOperations = Math.min(options.operations, headroom);
    result.workloads.push(await workload({name: 'durable_building_mutations', store: rooms, ...options,
      operations: mutationOperations,
      operation: index => rooms.mutate(active[index % active.length], 'pressure-owner',
        {id: 'pressure-piece-' + index, revision: 0, object: buildingObject(index)})}));
    result.mutationOperationsLimitedByRoomCapacity = mutationOperations < options.operations;
    const reopened = new SharedRoomStore(rooms.file), data = await reopened.read();
    assert.equal(Object.keys(data).length, count);
    assert.equal(Object.values(data).reduce((sum, room) => sum + Object.keys(room.objects).length, 0),
      count * options.objectsPerRoom + mutationOperations);
    for (const room of Object.values(data)) assert.equal(room.simulation.counter,
      room.fixtureIndex < active.length ? options.operations : 0);
    result.invariants.push({name: 'building_mutations_and_ticks_survive_reopen', status: 'passed'});
    result.finalBytes = {users: (await stat(database.file)).size, rooms: (await stat(rooms.file)).size};
  } catch (error) {
    result.status = 'failed'; result.invariants.push({name: 'growth_invariants', status: 'failed', error: errorInfo(error)});
  }
  if (result.workloads.some(row => row.status === 'failed')) result.status = 'failed';
  return result;
}

async function main(options) {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-storage-pressure-'));
  const started = performance.now();
  const report = {schemaVersion: 1, harness: 'muzikaz-storage-pressure', startedAt: new Date().toISOString(),
    status: 'passed', options, environment: {node: process.version, platform: process.platform, arch: process.arch,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem()},
    scope: {syntheticDataOnly: true, storage: 'new temporary directory', productionDataRead: false,
      liveServerContacted: false, concurrencyModel: 'one process and one instance per store',
      reopenModel: 'new production store instance reading persisted JSON',
      timing: 'bounded closed-loop concurrency; fixture setup excluded; filesystem cache is not flushed'},
    correctness: [], growth: [], failures: [], limitations: [
      'Configured user/room counts are synthetic record counts, not concurrent connected players.',
      'Room ticks exercise the production store clone/queue/checkpoint path, not gameplay physics or HTTP.',
      'The harness does not establish multi-process safety, power-loss durability, or distributed scale.',
      'Event-loop timing for very short workloads may have no sampling interval (null mean).',
    ]};
  try {
    if (options.suite !== 'growth') report.correctness = await correctness(directory);
    if (options.suite !== 'correctness') for (const scale of options.scales) report.growth.push(await growth(directory, scale, options));
  } catch (error) { report.failures.push(errorInfo(error)); }
  finally {
    try { await rm(directory, {recursive: true, force: true}); report.temporaryDataRemoved = true; }
    catch (error) { report.temporaryDataRemoved = false; report.failures.push(errorInfo(error)); }
  }
  if (report.failures.length || [...report.correctness, ...report.growth].some(row => row.status === 'failed')) report.status = 'failed';
  report.elapsedMs = round(performance.now() - started);
  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) await writeFile(options.output, json, {mode: 0o600});
  process.stdout.write(json);
  if (report.status === 'failed') process.exitCode = 1;
}

try {
  const options = optionsFrom(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP);
  else await main(options);
} catch (error) {
  process.stdout.write(JSON.stringify({status: 'failed', phase: 'arguments-or-report-output', error: errorInfo(error)}) + '\n');
  process.exitCode = 2;
}
