import {mkdir, open, readFile, rename, rm, stat} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const failure = message => Object.assign(new Error(message), {code: 'ROOM_STORE_FAILED'});
// Atomic replacement creates a new generation even when JSON values repeat.
const identity = info => [info.dev, info.ino, info.birthtimeNs, info.mtimeNs, info.ctimeNs, info.size].join(':');

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicWrite(file, contents) {
  await mkdir(dirname(file), {recursive: true});
  const temporary = file + '.' + randomUUID() + '.tmp';
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(contents); await handle.sync();
    await handle.close(); handle = null;
    await rename(temporary, file); await syncDirectory(dirname(file));
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, {force: true}).catch(() => {});
  }
}

/** One-writer local persistence; callers serialize all reads and writes. */
export class RoomStoreJournal {
  constructor(file, {maxJournalBytes = 16 * 1024 * 1024} = {}) {
    this.file = file; this.journalFile = file + '.journal';
    this.maxBytes = Math.max(1024, Number(maxJournalBytes) || 16 * 1024 * 1024);
    this.generation = null; this.bytes = 0; this.repair = null; this.fault = null;
  }

  async read() {
    let data = {}, generation = null, handle;
    try {
      handle = await open(this.file, 'r');
      const before = identity(await handle.stat({bigint: true}));
      data = JSON.parse(await handle.readFile('utf8'));
      generation = identity(await handle.stat({bigint: true}));
      if (before !== generation || identity(await stat(this.file, {bigint: true})) !== generation) {
        throw failure('Room checkpoint changed while loading. Stop the other writer and retry.');
      }
    } catch (error) { if (error.code !== 'ENOENT' || handle) throw error; }
    finally { if (handle) await handle.close(); }
    if (!object(data)) throw failure('Invalid room checkpoint.');
    let journal = Buffer.alloc(0);
    try { journal = await readFile(this.journalFile); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const matching = []; let offset = 0, stale = false;
    while (offset < journal.length) {
      const end = journal.indexOf(10, offset);
      if (end < 0) break; // Only an incomplete final record is uncommitted.
      let record;
      try { record = JSON.parse(journal.subarray(offset, end).toString('utf8')); }
      catch { throw failure('Corrupt complete room journal record. Restore a verified checkpoint.'); }
      const {version, checkpoint, rooms, checksum} = record || {};
      if (version !== 1 || typeof checkpoint !== 'string' || !object(rooms) || typeof checksum !== 'string' ||
          checksum !== digest(JSON.stringify({version, checkpoint, rooms}))) {
        throw failure('Invalid room journal checksum or record. Restore a verified checkpoint.');
      }
      if (!generation) throw failure('Room journal exists without its checkpoint.');
      if (checkpoint === generation) {
        for (const [id, room] of Object.entries(rooms)) {
          if (room === null) delete data[id];
          else if (object(room)) Object.defineProperty(data, id, {value: room, enumerable: true, writable: true, configurable: true});
          else throw failure('Invalid room journal value.');
        }
        matching.push(journal.subarray(offset, end + 1));
      } else stale = true;
      offset = end + 1;
    }
    this.generation = generation; this.bytes = journal.length;
    this.repair = stale || offset !== journal.length ? Buffer.concat(matching) : null;
    this.fault = null;
    return data;
  }

  async assertCurrent() {
    let current = null;
    try { current = identity(await stat(this.file, {bigint: true})); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current !== this.generation) throw failure('Room checkpoint was replaced outside this writer. Reload before writing.');
  }

  async assertJournalCurrent() {
    let size = 0;
    try { size = (await stat(this.journalFile)).size; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (size !== this.bytes) throw failure('Room journal changed outside this writer. Reload before writing.');
  }

  async checkpoint(data) {
    if (this.fault) throw this.fault;
    if (!object(data)) throw failure('Invalid room checkpoint.');
    try {
      await atomicWrite(this.file, JSON.stringify(data));
      this.generation = identity(await stat(this.file, {bigint: true}));
      // An interruption before clearing the journal is safe: old records bind to
      // the old checkpoint identity and cannot overwrite this newer checkpoint.
      this.repair = Buffer.alloc(0);
      await atomicWrite(this.journalFile, '');
      this.bytes = 0; this.repair = null;
    } catch (error) {
      // The rename might have committed while clearing or syncing the log failed.
      // Never allow cached pre-save memory to write against that new generation.
      this.fault = failure('Room checkpoint write failed. Reload the store before writing.');
      this.fault.cause = error;
      throw error;
    }
  }

  async append(rooms, baseline) {
    if (this.fault) throw this.fault;
    await this.assertCurrent();
    await this.assertJournalCurrent();
    if (!this.generation) await this.checkpoint(baseline);
    if (this.repair !== null) {
      await atomicWrite(this.journalFile, this.repair);
      this.bytes = this.repair.length; this.repair = null;
    }
    if (!Object.keys(rooms).length) return;
    const payload = {version: 1, checkpoint: this.generation, rooms};
    const encoded = JSON.stringify({...payload, checksum: digest(JSON.stringify(payload))}) + '\n';
    const handle = await open(this.journalFile, 'a', 0o600);
    let before;
    try {
      before = (await handle.stat()).size;
      if (before !== this.bytes) throw failure('Room journal changed outside this writer. Reload before writing.');
      await handle.writeFile(encoded); await handle.sync();
      if (before === 0) await syncDirectory(dirname(this.journalFile));
      this.bytes = before + Buffer.byteLength(encoded);
    } catch (error) {
      if (before === this.bytes) {
        try { await handle.truncate(before); await handle.sync(); }
        catch (rollbackError) {
          this.fault = failure('Room journal could not roll back a failed append. Reopen the store before writing.');
          this.fault.cause = rollbackError;
        }
      }
      throw error;
    } finally {
      try { await handle.close(); }
      catch (error) {
        this.fault = failure('Room journal close failed after append. Reload the store before writing.');
        this.fault.cause = error;
        throw error;
      }
    }
  }
}
