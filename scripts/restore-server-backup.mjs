import { restoreBackup } from '../server-backups.mjs';
const [snapshot,destination] = process.argv.slice(2);
if (!snapshot || !destination) throw Error('Usage: node scripts/restore-server-backup.mjs SNAPSHOT_DIRECTORY EMPTY_RESTORE_DIRECTORY');
console.log(`Verified and restored ${await restoreBackup(snapshot,destination)} files. Review the restored paths before configuring the stopped server to use them.`);
