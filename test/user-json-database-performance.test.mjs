import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rename, rm, stat, utimes, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {worldSupplyIsCurrent} from '../world-supply.mjs';

class ObservedDatabase extends UserJsonDatabase {
  writes = 0;
  async write(data) { this.writes++; return super.write(data); }
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-user-transaction-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const database = new ObservedDatabase(join(directory, 'users.json'));
  await database.put('account:owner', {tokens: {MZK: 100}, items: [{id: 'kept-item'}], memory: {nested: {count: 1}}});
  database.writes = 0;
  return database;
}
const spend = (database, requestId, amountMzk = 1) => database.spendGameplay('account:owner', {requestId, amountMzk, gameId: 'test'});

test('queued economic operations share one durable commit and capture distinct response balances', async t => {
  const database = await fixture(t);
  const outcomes = await Promise.all([spend(database, 'first'), spend(database, 'second'), spend(database, 'first')]);
  assert.equal(database.writes, 1);
  assert.deepEqual(outcomes.map(outcome => outcome.balanceAfterMzk), [99, 98, 99]);
  assert.equal(outcomes[0].id, outcomes[2].id);
  const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
  assert.equal(data.users['account:owner'].tokens.MZK, 98);
  assert.equal(data.transactions.filter(entry => entry.type === 'GAMEPLAY_SPEND').length, 2);
});

test('the fixed microbatch window collects neighboring arrivals without extending its original deadline', async t => {
  const database = await fixture(t);
  await database.queue;
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.enable({apis: ['setTimeout']});
  const first = spend(database, 'window-first');
  t.mock.timers.tick(1);
  const second = spend(database, 'window-second');
  assert.equal(database.writes, 0);
  t.mock.timers.tick(1);
  const results = await Promise.all([first, second]);
  assert.equal(database.writes, 1);
  assert.deepEqual(results.map(result => result.balanceAfterMzk), [99, 98]);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).tokens.MZK, 98);
});

test('failed callbacks roll back nested changes, deletes and array edits without cancelling neighboring operations', async t => {
  const database = await fixture(t);
  const first = spend(database, 'before-failure');
  const rejected = database.transaction(data => {
    const user = data.users['account:owner'];
    user.tokens.MZK = 999;
    user.items.splice(0, 1, {id: 'forged'});
    user.memory.nested.count = 999;
    delete data.users['account:owner'];
    data.transactions.length = 0;
    throw new Error('intentional rollback');
  });
  const last = spend(database, 'after-failure');
  const results = await Promise.allSettled([first, rejected, last]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected', 'fulfilled']);
  const user = await new UserJsonDatabase(database.file).get('account:owner');
  assert.equal(user.tokens.MZK, 98);
  assert.deepEqual(user.items, [{id: 'kept-item'}]);
  assert.equal(user.memory.nested.count, 1);
  assert.equal(database.writes, 1);
});

test('batch callbacks retain ordinary JSON and structuredClone compatibility', async t => {
  const database = await fixture(t);
  const result = await database.transaction(data => {
    const user = structuredClone(data.users['account:owner']);
    user.memory.nested.count++;
    data.users['account:owner'] = user;
    return structuredClone(user);
  });
  result.memory.nested.count = 500;
  assert.equal((await database.get('account:owner')).memory.nested.count, 2);
});

test('callbacks with no response commit successfully without reporting an error after persistence', async t => {
  const database = await fixture(t);
  const result = await database.transaction(data => { data.users['account:owner'].memory.nested.count = 2; });
  assert.equal(result, undefined);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).memory.nested.count, 2);
});

test('results remain pending and reads retain committed state until the durable write completes', async t => {
  const database = await fixture(t), originalWrite = database.write.bind(database);
  let release, entered;
  const enteredWrite = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  database.write = async data => { entered(); await gate; return originalWrite(data); };
  let settled = false;
  const pending = spend(database, 'gated-write').then(result => { settled = true; return result; });
  await enteredWrite;
  assert.equal(settled, false);
  assert.equal((await database.get('account:owner')).tokens.MZK, 100);
  release();
  assert.equal((await pending).balanceAfterMzk, 99);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).tokens.MZK, 99);
});

test('failed writes reject the whole durable batch and leave cached and on-disk balances untouched', async t => {
  const database = await fixture(t), originalWrite = database.write.bind(database);
  database.write = async () => { throw Object.assign(new Error('disk unavailable'), {code: 'EIO'}); };
  const results = await Promise.allSettled([spend(database, 'failed-one'), spend(database, 'failed-two')]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'EIO'));
  assert.equal((await database.get('account:owner')).tokens.MZK, 100);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).tokens.MZK, 100);
  database.write = originalWrite;
  await spend(database, 'failed-one');
  assert.equal((await database.get('account:owner')).tokens.MZK, 99);
});

test('a captured queue waits for its durable prefix without waiting for later traffic', async t => {
  const database = await fixture(t), originalWrite = database.write.bind(database);
  let releaseFirst, releaseSecond, enteredFirst, enteredSecond, writes = 0;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  const firstStarted = new Promise(resolve => { enteredFirst = resolve; });
  const secondStarted = new Promise(resolve => { enteredSecond = resolve; });
  database.write = async data => {
    if (++writes === 1) { enteredFirst(); await firstGate; }
    else { enteredSecond(); await secondGate; }
    return originalWrite(data);
  };
  const first = spend(database, 'prefix-first'), prefix = database.queue;
  let prefixCompleted = false;
  void prefix.then(() => { prefixCompleted = true; });
  await firstStarted;
  const second = spend(database, 'prefix-second');
  releaseFirst();
  await secondStarted;
  assert.equal(prefixCompleted, true);
  assert.equal((await database.get('account:owner')).tokens.MZK, 99);
  releaseSecond();
  await Promise.all([first, second]);
});

test('a trailing rejected callback cannot release the queue before preceding accepted writes commit', async t => {
  const database = await fixture(t), originalWrite = database.write.bind(database);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  database.write = async data => { entered(); await gate; return originalWrite(data); };
  const accepted = spend(database, 'before-trailing-rejection');
  const rejected = database.transaction(() => { throw new Error('trailing rejection'); });
  const expectedRejection = assert.rejects(rejected, /trailing rejection/);
  const captured = database.queue;
  let barrierCompleted = false;
  void captured.then(() => { barrierCompleted = true; });
  await started;
  await expectedRejection;
  assert.equal(barrierCompleted, false);
  assert.equal((await database.get('account:owner')).tokens.MZK, 100);
  release();
  await Promise.all([accepted, captured]);
  assert.equal(barrierCompleted, true);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).tokens.MZK, 99);
});

test('cached read results and RPG state cannot mutate subsequent requests', async t => {
  const database = await fixture(t);
  await database.transaction(data => {
    data.transactions.push({type: 'RPG_USE', walletId: 'account:owner', detail: {value: 1}});
    data.users['account:owner'].memory.ioncoreRpg = {history: [{health: 99}]};
    return {};
  });
  const read = await database.read(), user = await database.get('account:owner'), rpg = await database.rpgState('account:owner');
  read.users['account:owner'].tokens.MZK = 999;
  user.memory.nested.count = 999;
  rpg.recentCare[0].detail.value = 999;
  rpg.history[0].health = 0;
  assert.equal((await database.get('account:owner')).tokens.MZK, 100);
  assert.equal((await database.get('account:owner')).memory.nested.count, 1);
  assert.equal((await database.rpgState('account:owner')).recentCare[0].detail.value, 1);
  assert.equal((await database.rpgState('account:owner')).history[0].health, 99);
});

test('cached readers immediately observe independent store commits and replaced files', async t => {
  const database = await fixture(t), other = new UserJsonDatabase(database.file);
  await other.put('account:owner', {tokens: {MZK: 200}});
  assert.equal((await database.get('account:owner')).tokens.MZK, 200);
  const metadata = await stat(database.file), contents = await readFile(database.file, 'utf8');
  const replacement = database.file + '.replacement';
  await writeFile(replacement, contents.replace('"MZK": 200', '"MZK": 300'));
  await utimes(replacement, metadata.atime, metadata.mtime);
  await rename(replacement, database.file);
  assert.equal((await database.get('account:owner')).tokens.MZK, 300);
});

test('same-size in-place edits invalidate the snapshot even when mtime is preserved', async t => {
  const database = await fixture(t), metadata = await stat(database.file);
  const contents = await readFile(database.file, 'utf8');
  await writeFile(database.file, contents.replace('"MZK": 100', '"MZK": 900'));
  await utimes(database.file, metadata.atime, metadata.mtime);
  assert.equal((await database.get('account:owner')).tokens.MZK, 900);
});

test('malformed or removed stores fail closed instead of serving stale balances', async t => {
  const database = await fixture(t), original = await readFile(database.file, 'utf8');
  await writeFile(database.file, '{invalid');
  await assert.rejects(database.get('account:owner'), SyntaxError);
  await writeFile(database.file, original);
  assert.equal((await database.get('account:owner')).tokens.MZK, 100);
  await unlink(database.file);
  await assert.rejects(database.get('account:owner'), {code: 'ENOENT'});
  await assert.rejects(stat(database.file), {code: 'ENOENT'});
});

test('unchanged account synchronization does not rewrite or revise the account but upgrades and changes still apply', async t => {
  const database = await fixture(t);
  const account = {accountId: 'owner', backpackId: 'pack-owner', username: 'Owner', gameAccess: true, creatorVaultAccess: true,
    mzkBalance: 100, gameAssets: ['Starter Avatar'], landAssets: [], bottleClaims: []};
  const initial = await database.ensureAccount(account), metadata = await stat(database.file);
  database.writes = 0;
  const repeated = await Promise.all(Array.from({length: 8}, () => database.ensureAccount(account)));
  assert.equal(database.writes, 0);
  assert.ok(repeated.every(result => result.revision === initial.revision && result.updatedAt === initial.updatedAt));
  assert.equal((await stat(database.file)).mtimeMs, metadata.mtimeMs);
  repeated[0].tokens.MZK = 999;
  assert.equal((await database.get('account:owner')).tokens.MZK, 200);
  const updated = await database.ensureAccount({...account, mzkBalance: 150, selectedAvatarId: 'new-avatar', creatorVaultAccess: false});
  assert.equal(updated.tokens.MZK, 250);
  assert.equal(updated.memory.account.creatorVaultAccess, false);
  assert.equal(updated.memory.account.selectedAvatarId, 'new-avatar');
  assert.equal(database.writes, 1);
});

test('account sync preserves traded entitlements and queued grant-before-spend order', async t => {
  const database = await fixture(t);
  const account = {accountId: 'new-player', mzkBalance: 10, gameAssets: ['Starter Avatar'], landAssets: [], bottleClaims: []};
  const created = database.ensureAccount(account);
  const debit = database.spendGameplay('account:new-player', {requestId: 'after-grant', amountMzk: 1, gameId: 'test'});
  await Promise.all([created, debit]);
  await database.transaction(data => { data.users['account:new-player'].items = []; return {}; });
  database.writes = 0;
  const result = await database.ensureAccount(account);
  assert.equal(result.tokens.MZK, 9);
  assert.deepEqual(result.items, []);
  assert.equal(database.writes, 0);
});

test('scoped wallet updates preserve unrelated wallets, prior receipts and all telemetry samples', async t => {
  const database = await fixture(t);
  await database.put('account:other', {tokens: {MZK: 200}, items: [{id: 'other-item'}], memory: {marker: 'untouched'}});
  const before = await database.read();
  const coinId = 'coin:' + randomUUID();
  const outcomes = await Promise.all([
    spend(database, 'scoped-spend'),
    database.recordRpgTelemetry('account:owner', {health: 90, world: 'test'}),
    database.grantMzkCoin('account:owner', coinId),
    database.recordRpgTelemetry('account:owner', {health: 80, world: 'test'})
  ]);
  outcomes[0].balanceAfterMzk = 999;
  outcomes[2].amountMzk = 999;
  const after = await database.read();
  assert.deepEqual(after.users['account:other'], before.users['account:other']);
  assert.deepEqual(after.transactions.slice(0, before.transactions.length), before.transactions);
  assert.equal(after.users['account:owner'].tokens.MZK, 100);
  assert.deepEqual(after.users['account:owner'].memory.ioncoreRpg.history.map(item => item.health), [90, 80]);
  assert.deepEqual(after.transactions.slice(before.transactions.length).map(item => item.amountMzk), [-1, 1]);
  assert.equal((await new UserJsonDatabase(database.file).get('account:owner')).tokens.MZK, 100);
});

test('scoped wallet failures roll back supply migrations and valid writes preserve depleted stock', async t => {
  const database = await fixture(t);
  const initial = await database.read(), supplyId = Object.keys(initial.worldSupply.worldStock)[0];
  await database.transaction(data => {
    data.worldSupply = {schemaVersion: 1, catalogRevision: 'old-catalog', worldStock: {[supplyId]: 0}};
    return {};
  });
  const before = await database.read();
  await assert.rejects(spend(database, 'rejected-migration', 1000), /enough MZK/);
  assert.deepEqual((await database.read()).worldSupply, before.worldSupply);
  await spend(database, 'accepted-migration');
  const persisted = await new UserJsonDatabase(database.file).read();
  assert.notEqual(persisted.worldSupply.catalogRevision, 'old-catalog');
  assert.equal(persisted.worldSupply.worldStock[supplyId], 0);
  assert.equal(persisted.users['account:owner'].tokens.MZK, 99);
});

test('borrowing a current supply ledger preserves it across rejected public callbacks and failed scoped writes', async t => {
  const database = await fixture(t), initial = await database.read();
  assert.equal(worldSupplyIsCurrent(initial), true);
  const supplyId = Object.keys(initial.worldSupply.worldStock)[0];
  await assert.rejects(database.transaction(data => {
    data.worldSupply.worldStock[supplyId] = -999;
    data.worldSupply.catalog = {};
    throw new Error('public callback rollback');
  }), /public callback rollback/);
  assert.deepEqual((await database.read()).worldSupply, initial.worldSupply);
  const originalWrite = database.write.bind(database);
  database.write = async candidate => {
    assert.equal(worldSupplyIsCurrent(candidate), true);
    assert.deepEqual(candidate.worldSupply, initial.worldSupply);
    throw Object.assign(new Error('injected scoped write failure'), {code: 'EIO'});
  };
  const results = await Promise.allSettled([
    spend(database, 'borrowed-spend'),
    database.recordRpgTelemetry('account:owner', {health: 75, world: 'test'}),
    database.grantMzkCoin('account:owner', 'coin:' + randomUUID())
  ]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'EIO'));
  assert.deepEqual(await database.read(), initial);
  assert.deepEqual(await new UserJsonDatabase(database.file).read(), initial);
  database.write = originalWrite;
  await spend(database, 'borrowed-spend');
  assert.deepEqual((await database.read()).worldSupply, initial.worldSupply);
  assert.equal((await database.get('account:owner')).tokens.MZK, 99);
});

test('scoped coin claims remain globally unique when competing wallets submit the same receipt', async t => {
  const database = await fixture(t);
  await database.put('account:other', {tokens: {MZK: 200}, items: []});
  const receiptId = 'coin:' + randomUUID();
  const [first, second] = await Promise.all([
    database.grantMzkCoin('account:owner', receiptId),
    database.grantMzkCoin('account:other', receiptId)
  ]);
  assert.equal(first.amountMzk, 1);
  assert.deepEqual(second, {claimedByOther: true});
  const reopened = new UserJsonDatabase(database.file), state = await reopened.read();
  assert.equal(state.users['account:owner'].tokens.MZK, 101);
  assert.equal(state.users['account:other'].tokens.MZK, 200);
  assert.equal(state.transactions.filter(item => item.type === 'MZK_COIN' && item.requestId === receiptId).length, 1);
});

test('independent store instances serialize concurrent registrations and spends for the same file', async t => {
  const database = await fixture(t), stores = [database, new UserJsonDatabase(database.file)];
  await Promise.all(Array.from({length: 50}, (_, index) =>
    stores[index % stores.length].put('member-' + index, {tokens: {MZK: index}, items: []})));
  await Promise.all(Array.from({length: 50}, (_, index) =>
    spend(stores[index % stores.length], 'multi-instance-' + index)));
  const reopened = new UserJsonDatabase(database.file), data = await reopened.read();
  assert.equal(Object.keys(data.users).length, 51);
  for (let index = 0; index < 50; index++) assert.equal(data.users['member-' + index].tokens.MZK, index);
  assert.equal(data.users['account:owner'].tokens.MZK, 50);
  assert.equal(data.transactions.filter(item => item.type === 'GAMEPLAY_SPEND').length, 50);
});

test('competing store instances cannot overdraw one wallet and recover their queues after rejection', async t => {
  const database = await fixture(t), other = new UserJsonDatabase(database.file);
  await database.put('account:owner', {tokens: {MZK: 3}});
  const results = await Promise.allSettled(Array.from({length: 20}, (_, index) =>
    spend(index % 2 ? database : other, 'last-funds-' + index)));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 3);
  assert.equal(results.filter(item => item.status === 'rejected').length, 17);
  const data = await new UserJsonDatabase(database.file).read();
  assert.equal(data.users['account:owner'].tokens.MZK, 0);
  assert.equal(data.transactions.filter(item => item.type === 'GAMEPLAY_SPEND').length, 3);
  await other.put('account:owner', {tokens: {MZK: 1}});
  await spend(database, 'after-rejection');
  assert.equal((await other.get('account:owner')).tokens.MZK, 0);
});
