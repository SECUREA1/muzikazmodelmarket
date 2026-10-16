// Restore only while the target server is stopped. Live restores use the admin panel.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {MasterServerState} from '../master-server-state.mjs';
const [filename,destination]=process.argv.slice(2);
if(!filename||!destination)throw Error('Usage: node scripts/restore-master-state.mjs MASTER_FILE.json NEW_DATA_DIRECTORY (target server must be stopped)');
const data=resolve(destination),file=name=>({path:join(data,name),type:'file'}),directory=name=>({path:join(data,name),type:'directory'});
const storage=new MasterServerState({data:{path:data,type:'directory'},accounts:file('accounts.json'),users:file('users.json'),payments:file('payment-orders.json'),accountSessions:file('account-sessions.json'),gameSessions:file('game-sessions.json'),environments:file('environments.json'),customMaps:file('custom-maps.json'),atlas:file('world-atlas.json'),rooms:file('shared-rooms.json'),runtime:file('server-runtime.json'),avatarUploads:directory('uploads/avatars'),assetUploads:directory('uploads/assets'),environmentUploads:directory('uploads/environments'),modelUploads:directory('uploads/models')},{backupDirectory:join(data,'backups')});
const result=await storage.restore(JSON.parse(await readFile(resolve(filename),'utf8')));
console.log(JSON.stringify({destination:data,...result,configuration:{MUZIKAZ_DATA_DIR:data,MUZIKAZ_AVATAR_UPLOAD_DIR:join(data,'uploads/avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(data,'uploads/assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(data,'uploads/environments'),UPLOAD_STORAGE_PATH:join(data,'uploads/models')}},null,2));
