import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
test('admin master download and restore enforce authentication, validate first, replace state and clear live caches',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-master-')),oldEnv={...process.env};
 Object.assign(process.env,{ADMIN_PUBLISH_TOKEN:'master-test-secret',MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'payments.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(dir,'avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(dir,'assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(dir,'environment-files'),UPLOAD_STORAGE_PATH:join(dir,'models')});
 let fixture;
 try{
 const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,sharedRooms,worldAtlas}; export async function stopFixture(){masterMaintenance=true;await drainServerState();}');const file=join(dir,'handler.mjs');await writeFile(file,source);fixture=await import(pathToFileURL(file).href);const {server,sharedRooms,worldAtlas}=fixture,handler=server.listeners('request')[0];
 async function call(url,{body,headers={},method=body?'POST':'GET'}={}){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,values){result.status=status;for(const [key,value]of Object.entries(values))this.setHeader(key,value);this.headersSent=true;},end(bytes){if(bytes)result.body=JSON.parse(bytes);}};await handler(req,res);return result;}
 assert.equal((await call('/api/admin/master-state')).status,403);const preflight=await call('/api/admin/master-state/restore',{method:'OPTIONS'});assert.equal(preflight.status,204);assert.match(preflight.headers['access-control-allow-headers'],/X-Master-Restore/);
 assert.equal((await call('/api/admin/master-state/restore',{body:{}})).status,403);
 const auth={'x-admin-token':'master-test-secret'},login=await call('/api/access/free-play',{body:{username:'BackupPlayer',password:'member-backup-password'}});assert.equal(login.status,200);
 let release;sharedRooms.queue=new Promise(resolve=>{release=resolve;});const pendingExport=call('/api/admin/master-state',{headers:auth});await new Promise(resolve=>setTimeout(resolve,10));assert.equal((await call('/api/health')).status,503,'maintenance blocks other handlers while queues drain');release();const exported=await pendingExport;assert.equal(exported.status,200);assert.match(exported.headers['content-disposition'],/attachment/);assert.equal(exported.body.summary.members,1);assert.equal(exported.headers['cache-control'],'no-store');const bundle=exported.body;
 const portable=join(dir,'portable.json'),fresh=join(dir,'redeployed');await writeFile(portable,JSON.stringify(bundle));const deployed=spawnSync(process.execPath,['scripts/restore-master-state.mjs',portable,fresh],{encoding:'utf8'});assert.equal(deployed.status,0,deployed.stderr);assert.equal(JSON.parse(await readFile(join(fresh,'accounts.json'))).accounts.length,1);
 const users=bundle.files.find(file=>file.root==='users').data,wallet=Object.keys(users.users)[0];users.users[wallet].tokens.MZK=777;
 const validated=await call('/api/admin/master-state/validate',{headers:auth,body:bundle});assert.equal(validated.status,200);assert.equal((await call('/api/admin/master-state/restore',{headers:auth,body:bundle})).status,400);
 sharedRooms.data={stale:{}};worldAtlas.data={stale:true};
 const restored=await call('/api/admin/master-state/restore',{headers:{...auth,'x-master-restore':'replace-server-state'},body:bundle});assert.equal(restored.status,200,JSON.stringify(restored.body));assert.ok(restored.body.data.rollbackFile);assert.equal(sharedRooms.data,null);assert.equal(worldAtlas.data,null);
 assert.equal(JSON.parse(await readFile(join(dir,'users.json'))).users[wallet].tokens.MZK,777);
 const relogin=await call('/api/access/free-play',{body:{username:'BackupPlayer',password:'member-backup-password'}});assert.equal(relogin.status,200);assert.equal(relogin.body.data.account.accountId,login.body.data.account.accountId);
 const overview=await call('/api/admin/data',{headers:auth});assert.equal(overview.status,200);assert.equal(overview.body.data.members.length,1);assert.ok(Array.isArray(overview.body.data.land));
 const invalid=structuredClone(bundle);invalid.files.push(invalid.files[0]);assert.equal((await call('/api/admin/master-state/restore',{headers:{...auth,'x-master-restore':'replace-server-state'},body:invalid})).status,400);
 }finally{await fixture?.stopFixture();for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);await rm(dir,{recursive:true,force:true});}
});
