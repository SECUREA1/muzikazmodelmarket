import { mkdir, readdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export class ServerBackups {
  constructor(directory, sources, { retain = 3 } = {}) { this.directory = resolve(directory); this.sources = sources; this.retain = Math.max(1, Number(retain) || 3); this.queue = Promise.resolve(); this.lastError = null; }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const snapshots = [];
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('snapshot-')) continue;
      try { const manifest = JSON.parse(await readFile(join(this.directory, entry.name, 'manifest.json'), 'utf8')); snapshots.push({ id: entry.name, createdAt: manifest.createdAt, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) }); } catch {}
    }
    return snapshots.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  snapshot() {
    const operation = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const id = 'snapshot-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0,8);
      const temporary = join(this.directory, '.' + id), destination = join(this.directory, id);
      await mkdir(temporary, { mode: 0o700 });
      const manifest = { version:1, createdAt:new Date().toISOString(), files:[] }; let total = 0;
      const capture = async (path, label) => {
        const absolute = resolve(path);
        if (absolute === this.directory || absolute.startsWith(this.directory + '/')) return;
        const info = await stat(absolute).catch(error => { if (error.code !== 'ENOENT') throw error; }); if (!info) return;
        if (info.isDirectory()) { for (const entry of await readdir(absolute, { withFileTypes:true })) if (!entry.isSymbolicLink() && !entry.name.endsWith('.tmp')) await capture(join(absolute, entry.name), label + '/' + entry.name); return; }
        if (!info.isFile() || absolute.endsWith('.tmp')) return;
        const bytes = await readFile(absolute); if (absolute.endsWith('.json')) JSON.parse(bytes.toString('utf8')); total += bytes.length;
        if (total > 256 * 1024 * 1024) throw Error('Backup exceeds 256 MB. Configure external backup storage for larger deployments.');
        const file = String(manifest.files.length) + '.bin';
        await writeFile(join(temporary,file),bytes,{mode:0o600}); manifest.files.push({file,label,bytes:bytes.length,sha256:hash(bytes)});
      };
      try {
        for (const [label,path] of Object.entries(this.sources)) if (path) await capture(path,label);
        await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600}); await rename(temporary,destination);
        const snapshots = await this.list(); for (const old of snapshots.slice(this.retain)) await rm(join(this.directory,old.id),{recursive:true,force:true});
        this.lastError = null; return snapshots.find(item=>item.id===id);
      } catch(error) { this.lastError = error.message; await rm(temporary,{recursive:true,force:true}); throw error; }
    });
    this.queue = operation.catch(()=>{}); return operation;
  }
}
// Offline restore verifies every file before writing anything. Destination must be empty.
export async function restoreBackup(snapshot, destination) {
  const manifest = JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
  const root = resolve(destination), files = [];
  for (const record of manifest.files) {
    if (!/^\d+\.bin$/.test(record.file)) throw Error('Invalid backup entry.');
    const target = resolve(root,record.label), path = relative(root,target);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw Error('Invalid restore path.');
    const bytes = await readFile(join(snapshot,record.file)); if (hash(bytes)!==record.sha256 || bytes.length!==record.bytes) throw Error('Backup checksum mismatch.');
    files.push({target,bytes});
  }
  await mkdir(root,{recursive:true,mode:0o700}); if ((await readdir(root)).length) throw Error('Restore requires an empty destination. Stop the server and restore into a new directory.');
  for (const {target,bytes} of files) { await mkdir(resolve(target,'..'),{recursive:true,mode:0o700}); await writeFile(target,bytes,{mode:0o600}); }
  return files.length;
}
