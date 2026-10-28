import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFile, mkdir, mkdtemp, readFile, rename, rm, writeFile, utimes} from 'node:fs/promises';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';

async function fixture(t, options) {
  const directory = await mkdtemp(join(tmpdir(), 'room-journal-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const file = join(directory, 'rooms.json'), store = new SharedRoomStore(file, options);
  await store.save({active: {revision: 0, objects: {}, counter: 0}, sleeping: {revision: 0, objects: {}, counter: 0}});
  return {directory, file, store, journal: file + '.journal'};
}
const change = (store, counter, options = {}) => store.update('active', room => {room.counter = counter;}, {roomOnly: true, ...options});

test('durable room updates replay without encoding the full checkpoint; flush exports plain JSON', async t => {
  const {file, store, journal} = await fixture(t), checkpoint = await readFile(file, 'utf8');
  await change(store, 1);
  assert.equal(await readFile(file, 'utf8'), checkpoint, 'a room command does not rewrite inactive worlds');
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 1, 'acknowledged command survives restart before a full checkpoint');
  const record = JSON.parse((await readFile(journal, 'utf8')).trim());
  assert.deepEqual(Object.keys(record.rooms), ['active']);
  await store.flush();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).active.counter, 1);
  assert.equal(await readFile(journal, 'utf8'), '');
});

test('a durable update includes earlier dirty rooms and survives callback reference mutations', async t => {
  const {file, store} = await fixture(t);
  await store.update('sleeping', room => {room.counter = 41;}, {persist: false, roomOnly: true});
  let retained;
  const returned = await store.update('active', room => {retained = room; room.counter = 7; return room;}, {roomOnly: true});
  retained.counter = 999; returned.counter = 888;
  assert.equal((await store.get('active')).counter, 7);
  const reopened = new SharedRoomStore(file);
  assert.equal((await reopened.get('active')).counter, 7);
  assert.equal((await reopened.get('sleeping')).counter, 41);
  assert.equal(store.dirty, false);
});

test('periodic journal flush persists transient state without replacing the canonical checkpoint', async t => {
  const {file, store} = await fixture(t), original = await readFile(file, 'utf8');
  await change(store, 12, {persist: false});
  await store.flush({checkpoint: false});
  assert.equal(await readFile(file, 'utf8'), original);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 12);
  assert.equal(store.dirty, false);
});

test('crash between checkpoint replacement and old-journal removal cannot roll state backwards', async t => {
  const {file, store, journal} = await fixture(t);
  await change(store, 1);
  const priorJournal = await readFile(journal);
  await change(store, 2, {persist: false});
  await store.flush();
  await writeFile(journal, priorJournal); // The old log survived a crash after checkpoint rename.
  const reopened = new SharedRoomStore(file);
  assert.equal((await reopened.get('active')).counter, 2);
  await change(reopened, 3);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 3);
});

test('byte-identical replacement checkpoints also supersede old journal generations', async t => {
  const {file, store, journal} = await fixture(t), initial = JSON.parse(await readFile(file, 'utf8'));
  await change(store, 1);
  const priorJournal = await readFile(journal);
  await store.save(initial);
  await writeFile(journal, priorJournal);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 0, 'a content hash alone would replay the old counter');
});

test('a partial unacknowledged final append is ignored and repaired before subsequent writes', async t => {
  const {file, store, journal} = await fixture(t);
  await change(store, 1);
  await appendFile(journal, '{"version":1,"checkpoint":');
  const reopened = new SharedRoomStore(file);
  assert.equal((await reopened.get('active')).counter, 1);
  await change(reopened, 2);
  const lines = (await readFile(journal, 'utf8')).trim().split('\n');
  assert.ok(lines.every(line => JSON.parse(line).version === 1));
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 2);
});

test('corrupt complete records and missing checkpoints fail closed', async t => {
  const {file, store, journal} = await fixture(t);
  await change(store, 1);
  const record = JSON.parse((await readFile(journal, 'utf8')).trim());
  record.rooms.active.counter = 999;
  await writeFile(journal, JSON.stringify(record) + '\n');
  await assert.rejects(new SharedRoomStore(file).get('active'), /checksum/);
  await writeFile(journal, '{corrupt complete record}\n');
  await assert.rejects(new SharedRoomStore(file).get('active'), /Corrupt complete/);
  await store.save({active: {revision: 0, objects: {}, counter: 0}});
  await change(store, 2);
  await rm(file);
  await assert.rejects(new SharedRoomStore(file).get('active'), /without its checkpoint/);
});

test('callback and storage failures leave memory unchanged and do not poison later requests', async t => {
  const {file, store, journal} = await fixture(t);
  await assert.rejects(store.update('active', room => {room.counter = 99; throw Error('callback rejected');}, {roomOnly: true}), /callback rejected/);
  assert.equal((await store.get('active')).counter, 0);
  await rm(journal); await mkdir(journal);
  await assert.rejects(change(store, 88));
  assert.equal((await store.get('active')).counter, 0, 'publish follows durable append');
  await rm(journal, {recursive: true}); await writeFile(journal, '');
  await change(store, 3);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 3);
});

test('an external restore is not overwritten by a stale writer, and cache invalidation reloads it', async t => {
  const {file, store} = await fixture(t);
  await change(store, 1);
  await writeFile(file + '.restore', JSON.stringify({active: {revision: 0, objects: {}, counter: 100}}));
  await rename(file + '.restore', file);
  await assert.rejects(change(store, 2), /replaced outside this writer/);
  store.data = null; store.dirty = false;
  assert.equal((await store.get('active')).counter, 100);
  await change(store, 101);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 101);
});

test('bounded journal compaction keeps the JSON checkpoint current and the log small', async t => {
  const {file, store, journal} = await fixture(t, {maxJournalBytes: 1024});
  await store.update('active', room => {room.content = 'large-room '.repeat(512);}, {roomOnly: true});
  assert.ok((await readFile(journal)).length > 1024);
  await store.flush({checkpoint: false});
  assert.equal(await readFile(journal, 'utf8'), '');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).active.content.length, 5632);
});

test('unscoped callbacks keep multi-room updates and deletions transactional', async t => {
  const {file, store} = await fixture(t);
  await store.update('active', (room, rooms) => {room.counter = 4; delete rooms.sleeping; rooms.newRoom = {revision: 0, objects: {}, counter: 9};});
  const reopened = await new SharedRoomStore(file).read();
  assert.deepEqual(Object.keys(reopened).sort(), ['active', 'newRoom']);
  assert.equal(reopened.active.counter, 4); assert.equal(reopened.newRoom.counter, 9);
});

test('scoped building commands do not traverse unrelated in-memory room records', async t => {
  const {file, store} = await fixture(t);
  Object.defineProperty(store.data.sleeping, 'unrelatedGeometry', {enumerable: true, get() {throw Error('inactive room traversed');}});
  const object = {materialId: 'wood', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]};
  await store.mutate('active', 'alice', {id: 'block', revision: 0, object});
  assert.equal((await store.get('active')).objects.block.ownerId, 'alice');
  assert.equal((await new SharedRoomStore(file).get('active')).objects.block.ownerId, 'alice');
});

test('invalid bulk checkpoints cannot replace the last valid state', async t => {
  const {file, store} = await fixture(t), original = await readFile(file, 'utf8');
  await assert.rejects(store.save([]), /Invalid room checkpoint/);
  assert.equal(await readFile(file, 'utf8'), original);
  await change(store, 4);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 4);
});

test('a checkpoint committed before journal cleanup failure blocks stale memory writes until reload', async t => {
  const {file, store, journal} = await fixture(t);
  await change(store, 1);
  const priorJournal = await readFile(journal);
  await rm(journal); await mkdir(journal);
  await assert.rejects(store.save({active: {revision: 0, objects: {}, counter: 20}}));
  assert.equal(JSON.parse(await readFile(file, 'utf8')).active.counter, 20, 'canonical replacement already committed');
  await assert.rejects(change(store, 2), /Reload the store/);
  await assert.rejects(store.save({active: {revision: 0, objects: {}, counter: 3}}), /Reload the store/);
  await rm(journal, {recursive: true}); await writeFile(journal, priorJournal);
  store.data = null;
  assert.equal((await store.get('active')).counter, 20);
  await change(store, 21);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 21);
});

test('two preloaded store instances cannot acknowledge conflicting room increments', async t => {
  const {file, store} = await fixture(t), other = new SharedRoomStore(file);
  await other.get('active');
  const increment = candidate => candidate.update('active', value => {value.counter++;}, {roomOnly: true});
  const results = await Promise.allSettled([increment(store), increment(other)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /journal changed/);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 1);
  other.data = null; await increment(other);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 2);
});

test('fresh readers wait for another instance transaction before reading its journal', async t => {
  const {file, store} = await fixture(t);
  let enter, release;
  const entered = new Promise(resolve => {enter = resolve;}), blocked = new Promise(resolve => {release = resolve;});
  const writing = store.update('active', async value => {enter(); await blocked; value.counter = 7;}, {roomOnly: true});
  await entered;
  const reading = new SharedRoomStore(file).get('active');
  release(); await writing;
  assert.equal((await reading).counter, 7);
});

test('async validators can read committed room state without waiting on their own transaction', {timeout: 5000}, async t => {
  const {store} = await fixture(t);
  const object = {materialId: 'wood', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]};
  await store.mutate('active', 'alice', {id: 'block', revision: 0, object}, async () => {
    const before = await store.get('active'), all = await store.read();
    assert.equal(before.objects.block, undefined);
    assert.equal(all.active.objects.block, undefined, 'validation reads cannot see the detached uncommitted working copy');
    all.active.counter = 999;
  });
  await store.update('active', async current => {
    current.counter = 5;
    assert.equal((await store.get('active')).counter, 0);
    assert.equal((await store.read()).active.counter, 0);
  }, {roomOnly: true});
  assert.equal((await store.get('active')).counter, 5);
  assert.equal((await store.get('active')).objects.block.ownerId, 'alice');
});

test('a stale instance cannot checkpoint over another acknowledged journal write', async t => {
  const {file, store} = await fixture(t), other = new SharedRoomStore(file);
  await other.get('active');
  await change(other, 100, {persist: false});
  await change(store, 1);
  await assert.rejects(other.flush(), /journal changed/);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 1);
});

test('a stale repair cannot truncate a subsequently repaired and acknowledged journal', async t => {
  const {file, store, journal} = await fixture(t);
  await change(store, 1); await appendFile(journal, '{partial');
  const stale = new SharedRoomStore(file); await stale.get('active');
  const recovered = new SharedRoomStore(file); await change(recovered, 2);
  await assert.rejects(change(stale, 3), /journal changed/);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 2);
});

test('append close failure latches the writer until committed disk state is reloaded', async t => {
  const {file, store, journal} = await fixture(t);
  const fs = createRequire(import.meta.url)('node:fs/promises'), originalOpen = fs.open;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === journal && args[1] === 'a') {
      const close = handle.close.bind(handle);
      handle.close = async () => {await close(); throw Error('injected journal close failure');};
    }
    return handle;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(change(store, 1), /injected journal close failure/); }
  finally { fs.open = originalOpen; syncBuiltinESMExports(); }
  assert.equal((await store.get('active')).counter, 0, 'memory was not published after a rejected append');
  await assert.rejects(change(store, 2), /Reload the store/);
  store.data = null;
  assert.equal((await store.get('active')).counter, 1, 'the synced record is the authoritative recovery state');
  await change(store, 2);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 2);
});

test('same-size in-place checkpoint edits with preserved mtime invalidate old journals and writers', async t => {
  const {file, store} = await fixture(t);
  const timestamp = new Date('2026-01-01T00:00:00Z');
  await utimes(file, timestamp, timestamp);
  store.data = null; await store.get('active');
  await change(store, 1);
  const changed = JSON.parse(await readFile(file, 'utf8')); changed.active.counter = 9;
  await writeFile(file, JSON.stringify(changed)); await utimes(file, timestamp, timestamp);
  await assert.rejects(change(store, 2), /replaced outside this writer/);
  assert.equal((await new SharedRoomStore(file).get('active')).counter, 9);
});

test('room and building IDs use own properties without mutating object prototypes', async t => {
  const {file, store} = await fixture(t);
  const object = {materialId: 'wood', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]};
  for (const id of ['__proto__', 'constructor', 'toString']) {
    assert.deepEqual((await store.get(id)).objects, {});
    await store.update(id, value => {value.counter = 4;}, {roomOnly: true});
    await store.mutate('active', 'alice', {id, revision: 0, object});
  }
  assert.equal(Object.getPrototypeOf(store.data), Object.prototype);
  const reopened = new SharedRoomStore(file);
  for (const id of ['__proto__', 'constructor', 'toString']) {
    assert.equal((await reopened.get(id)).counter, 4);
    assert.equal((await reopened.get('active')).objects[id].ownerId, 'alice');
  }
  assert.equal(Object.prototype.ownerId, undefined);
});
