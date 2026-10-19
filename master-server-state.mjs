import {mkdir,readdir,readFile,writeFile,rename,rm,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateJsonInput} from './request-validation.mjs';
export const MASTER_STATE_LIMIT=256*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{statusCode:400});};
const inside=(parent,path)=>path===parent||path.startsWith(parent+'/');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function masterInventory(files){
 const get=root=>files.find(file=>file.root===root&&file.encoding==='json')?.data;
 const users=get('users')||{},accounts=get('accounts')||{},maps=get('customMaps')||[],rooms=get('rooms')||{};
 const members=(accounts.accounts||[]).map(account=>{const walletId=String(account.primaryEthereumWallet||'account:'+account.accountId).toLowerCase(),user=users.users?.[walletId];return {accountId:account.accountId,username:account.username,walletId,gameAccess:account.gameAccess,mzk:user?.tokens?.MZK??account.mzkBalance??0,items:user?.items?.length||0,updatedAt:user?.updatedAt||account.updatedAt};});
 const land=Object.entries(users.landDeeds||{}).map(([id,deed])=>({id,...deed}));
 const builds=maps.map(map=>({id:map.id,name:map.name||map.title,ownerId:map.ownerId,status:map.status,objects:map.scene?.objects?.length||map.builderScene?.objects?.length||0}));
 const matches=Object.entries(rooms).filter(([,room])=>room.simulation?.match||room.simulation?.radTox).map(([id,room])=>({id,match:room.simulation.match,campaign:room.simulation.radTox,players:room.simulation.players}));
 return {members,land,builds,summary:{members:members.length,wallets:Object.keys(users.users||{}).length,land:land.length,builds:builds.length,items:Object.values(users.users||{}).reduce((n,user)=>n+(user.items?.length||0),0),mzkTransactions:users.transactions?.length||0,payments:get('payments')?.length||0,savedMatches:matches.length,files:files.length},matches};
}

// Roots come only from server configuration. Uploaded files never choose disk paths.
export class MasterServerState {
 constructor(roots,{backupDirectory,maxBytes=MASTER_STATE_LIMIT}={}){
  this.roots=Object.fromEntries(Object.entries(roots).map(([label,entry])=>[label,{...entry,path:resolve(entry.path)}]));
  this.backupDirectory=resolve(backupDirectory);this.maxBytes=maxBytes;
 }
 owner(path){return Object.entries(this.roots).filter(([,root])=>root.type==='file'?root.path===path:inside(root.path,path)).sort((a,b)=>b[1].path.length-a[1].path.length)[0]?.[0];}
 excluded(path){return inside(this.backupDirectory,path)||path.split('/').some(part=>part.includes('.master-')||part.endsWith('.tmp'));}
 async safe(path){
  for(let current=path;;current=dirname(current)){
   const info=await lstat(current).catch(error=>{if(error.code!=='ENOENT')throw error;});
   if(info?.isSymbolicLink())fail('Symbolic links cannot be backed up or restored.');
   if(current===dirname(current))break;
  }
 }
 target(file){
  if(!object(file)||typeof file.root!=='string')fail('Invalid master file entry.');
  const root=Object.hasOwn(this.roots,file.root)&&this.roots[file.root];if(!root)fail('Unknown storage root: '+file.root);
  if(typeof file.path!=='string'||file.path.includes('\\')||file.path.includes('\0')||isAbsolute(file.path)||file.path.split('/').some(part=>part==='..'||part==='.')||(root.type==='file'&&file.path!==''))fail('Invalid master file path.');
  const target=root.type==='file'?root.path:resolve(root.path,file.path);
  if((root.type==='directory'&&(!file.path||!inside(root.path,target)))||this.owner(target)!==file.root||this.excluded(target))fail('Master file path is outside its storage root.');
  return target;
 }
 async capture(metadata={}){
  const files=[];let total=0;
  const walk=async(path,label)=>{
   if(this.excluded(path))return;await this.safe(path);
   const info=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;});if(!info)return;
   if(info.isDirectory()){for(const name of (await readdir(path)).sort())await walk(join(path,name),label);return;}
   if(!info.isFile()||this.owner(path)!==label)return;
   if(info.size+total>this.maxBytes)fail('Master backup exceeds the configured size limit.');
   const bytes=await readFile(path);total+=bytes.length;
   const root=this.roots[label],record={root:label,path:root.type==='file'?'':relative(root.path,path)};
   if(path.endsWith('.json')){record.encoding='json';record.data=JSON.parse(bytes.toString('utf8'));validateJsonInput(record.data);}
   else{record.encoding='base64';record.data=bytes.toString('base64');record.sha256=digest(bytes);}
   files.push(record);
  };
  for(const [label,root]of Object.entries(this.roots))await walk(root.path,label);
  const inventory=masterInventory(files);
  return {format:'muzikaz-master-state',version:1,id:randomUUID(),createdAt:new Date().toISOString(),application:metadata,roots:Object.keys(this.roots),files,summary:inventory.summary,limitations:['Server records and locally uploaded assets only; externally hosted assets remain URLs.','Blockchain transactions are historical records and are never replayed by restore.','Browser-only or unsaved tournaments and builds are not server records.','Server code, deployment secrets, and external services are not included.']};
 }
 validate(bundle){
  if(bundle?.format!=='muzikaz-master-state'||bundle.version!==1||!Array.isArray(bundle.files)||!Array.isArray(bundle.roots))fail('Choose a MUZIKAZ version 1 master state file.');
  if(bundle.files.length>100000)fail('Too many master files.');
  if(bundle.roots.length!==Object.keys(this.roots).length||new Set(bundle.roots).size!==bundle.roots.length||bundle.roots.some(label=>typeof label!=='string'||!Object.hasOwn(this.roots,label)))fail('Storage roots do not match this server.');
  validateJsonInput(bundle);
  const seen=new Set(),records=[];let total=0;
  for(const file of bundle.files){
   if(!object(file)||!Object.hasOwn(file,'data'))fail('Master file content is missing.');
   const target=this.target(file);if(seen.has(target))fail('Duplicate master file target.');seen.add(target);
   let bytes;
   if(file.encoding==='json'){if(!target.endsWith('.json'))fail('JSON content requires a JSON file.');bytes=Buffer.from(JSON.stringify(file.data,null,2)+'\n');}
   else if(file.encoding==='base64'){
    if(typeof file.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data))fail('Invalid binary asset encoding.');
    bytes=Buffer.from(file.data,'base64');if(digest(bytes)!==file.sha256)fail('Asset checksum mismatch.');
    if(target.endsWith('.json'))fail('State JSON must use editable JSON encoding.');
   }else fail('Unsupported master file encoding.');
   total+=bytes.length;if(total>this.maxBytes)fail('Master state exceeds the configured size limit.');records.push({target,bytes});
  }
  const json=root=>bundle.files.find(file=>file.root===root&&file.path===''&&file.encoding==='json')?.data;
  if(this.roots.users){const users=json('users');if(!object(users)||![1,2,3].includes(users.schemaVersion)||!object(users.users)||!object(users.landDeeds||{}))fail('Invalid or missing user database.');for(const key of ['transactions','trades','messages'])if(users[key]!==undefined&&!Array.isArray(users[key]))fail('Invalid user '+key+' records.');for(const key of ['builderAssets','builderOwnership','builderListings','builderPlacements'])if(users[key]!==undefined&&!object(users[key]))fail('Invalid builder '+key+' records.');for(const user of Object.values(users.users)){if(!object(user)||!Array.isArray(user.items)||!Number.isFinite(user.tokens?.MZK)||user.tokens.MZK<0)fail('Invalid member inventory or MZK balance.');}}
  if(this.roots.accounts){const accounts=json('accounts');if(!object(accounts)||!Array.isArray(accounts.accounts)||!Array.isArray(accounts.credentials))fail('Invalid or missing account database.');const ids=accounts.accounts.map(account=>account.accountId);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('Invalid or duplicate member account.');}
  for(const label of ['payments','customMaps','environments'])if(json(label)!==undefined&&!Array.isArray(json(label)))fail('Invalid '+label+' database.');
  if(json('runtime')!==undefined&&(!object(json('runtime'))||!Array.isArray(json('runtime').chatMessages)||!Array.isArray(json('runtime').supportMessages)))fail('Invalid runtime message database.');
  for(const label of ['accountSessions','gameSessions'])if(json(label)!==undefined&&(!object(json(label))||!Array.isArray(json(label).sessions)))fail('Invalid '+label+' database.');
  for(const file of bundle.files)if(file.root==='data'&&['asset-library.json','published-models.json','avatar-profiles.json','shared-house-avatars.json'].includes(file.path)&&!Array.isArray(file.data))fail('Invalid '+file.path+' database.');
  if(json('rooms')!==undefined&&!object(json('rooms')))fail('Invalid shared world database.');
  if(json('atlas')!==undefined&&(!object(json('atlas'))||!object(json('atlas').cells)))fail('Invalid atlas database.');
  return {records,inventory:masterInventory(bundle.files),bytes:total};
 }
 async restore(bundle){
  const checked=this.validate(bundle);
  // Verify all destinations before taking the recovery copy or touching live files.
  for(const record of checked.records)await this.safe(record.target);
  const before=await this.capture({reason:'Automatic recovery copy before master restore'});
  await mkdir(this.backupDirectory,{recursive:true,mode:0o700});
  const rollbackFile='master-rollback-'+Date.now()+'-'+randomUUID()+'.json';
  await writeFile(join(this.backupDirectory,rollbackFile),JSON.stringify(before),{mode:0o600});
  const wanted=new Map(checked.records.map(record=>[record.target,record]));
  const targets=new Set([...checked.records.map(record=>record.target),...before.files.map(file=>this.target(file))]);
  const journal=[],tag='.master-'+randomUUID();
  try{
   // Prepare every replacement before switching any live file.
   for(const target of targets){await this.safe(target);await mkdir(dirname(target),{recursive:true});const staged=target+tag+'.tmp',old=target+tag+'.old';const record=wanted.get(target);journal.push({target,staged,old,record,moved:false,installed:false});if(record)await writeFile(staged,record.bytes,{mode:0o600});}
   for(const step of journal){const info=await lstat(step.target).catch(error=>{if(error.code!=='ENOENT')throw error;});if(info){if(!info.isFile()||info.isSymbolicLink())fail('Restore target is not a regular file.');await rename(step.target,step.old);step.moved=true;}if(step.record){await rename(step.staged,step.target);step.installed=true;}}
  }catch(error){
   for(const step of journal.slice().reverse()){if(step.installed)await rm(step.target,{force:true});if(step.moved)await rename(step.old,step.target);await rm(step.staged,{force:true});}
   throw error;
  }
  for(const step of journal){await rm(step.old,{force:true}).catch(()=>{});await rm(step.staged,{force:true}).catch(()=>{});}
  return {summary:checked.inventory.summary,rollbackFile,restoredAt:new Date().toISOString()};
 }
}
