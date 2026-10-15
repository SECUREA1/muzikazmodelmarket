import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerBackups, restoreBackup } from '../server-backups.mjs';
test('backups retain snapshots, exclude themselves, and verify checksums before offline restore',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'server-backup-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const data=join(dir,'data');await mkdir(data);await writeFile(join(data,'users.json'),'{"balance":25}');
 const service=new ServerBackups(join(data,'backups'),{data},{retain:2});
 await service.snapshot();await service.snapshot();const latest=await service.snapshot();
 assert.equal((await service.list()).length,2);assert.equal(latest.files,1);
 const snapshot=join(data,'backups',latest.id),restore=join(dir,'restored');
 assert.equal(await restoreBackup(snapshot,restore),1);assert.equal(await readFile(join(restore,'data','users.json'),'utf8'),'{"balance":25}');
 await assert.rejects(restoreBackup(snapshot,restore),/empty destination/);
 await writeFile(join(snapshot,'0.bin'),'tampered');const untouched=join(dir,'untouched');await mkdir(untouched);
 await assert.rejects(restoreBackup(snapshot,untouched),/checksum/);assert.deepEqual(await readdir(untouched),[]);
});
