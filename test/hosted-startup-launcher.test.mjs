import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository=fileURLToPath(new URL('../',import.meta.url));
async function freePort(){return new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});}
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'hosted-launcher-'));
  const children=[];
  t.after(async()=>{for(const {child,exit}of children)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exit;}await rm(root,{recursive:true,force:true});});
  for(const directory of ['scripts','public/js','dist/public/js','data'])await mkdir(join(root,directory),{recursive:true});
  for(const file of ['start-hosted.mjs','check-browser-modules.mjs'])await copyFile(join(repository,'scripts',file),join(root,'scripts',file));
  await symlink(join(repository,'server.mjs'),join(root,'server.mjs'));
  for(const file of ['public/js/hockey-game.js','public/js/arcade-game.js','environment-builder.js'])await writeFile(join(root,file),'export const ready=true;');
  await writeFile(join(root,'public/js/house-explorer-glb.js'),"import './graphics.js';");
  await writeFile(join(root,'public/js/graphics.js'),'export const release="current-checkout";');
  await writeFile(join(root,'dist/public/js/graphics.js'),'export const release="stale-dist";');
  await writeFile(join(root,'scene.html'),'current-checkout-page');
  await writeFile(join(root,'dist/scene.html'),'stale-dist-page');
  const port=await freePort(),data=join(root,'data');
  const env={...process.env,NODE_ENV:'production',PORT:String(port),MUZIKAZ_DATA_DIR:data,MUZIKAZ_USER_DATABASE_FILE:join(data,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(data,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(data,'orders.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(data,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(data,'game-sessions.json'),MUZIKAZ_DEPLOY_COMMIT:'current-checkout'};
  return {root,env,base:'http://127.0.0.1:'+port,children};
}
async function runServer(t,setup,command,args){
  let output='';const child=spawn(command,args,{cwd:setup.root,env:setup.env});
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  setup.children.push({child,exit});
  let ready=false;
  for(let attempt=0;attempt<120;attempt++){
    if(child.exitCode!==null||child.signalCode!==null)throw Error('Hosted startup failed: '+output);
    try{const response=await fetch(setup.base+'/api/health',{headers:{Connection:'close'}});if(response.ok){assert.equal((await response.json()).commit,'current-checkout');ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready,'The real member API did not bind PORT: '+output);
  assert.match(output,/Verified 5 repository browser modules/);
  assert.equal(await(await fetch(setup.base+'/public/js/graphics.js',{headers:{Connection:'close'}})).text(),'export const release="current-checkout";');
  assert.equal(await(await fetch(setup.base+'/scene',{headers:{Connection:'close'}})).text(),'current-checkout-page');
  return {child,exit};
}

test('compatibility bootstrap serves one validated checkout despite a retained dist directory',{timeout:15000},async t=>{
  const setup=await fixture(t);
  await runServer(t,setup,process.execPath,[join(setup.root,'scripts/start-hosted.mjs')]);
});

test('a missing current graphics import fails before starting the server instead of using stale dist files',{timeout:15000},async t=>{
  const setup=await fixture(t);
  await writeFile(join(setup.root,'public/js/house-explorer-glb.js'),"import './missing-upgrade.js';");
  await writeFile(join(setup.root,'dist/public/js/missing-upgrade.js'),'export const stale=true;');
  const result=spawnSync(process.execPath,[join(setup.root,'scripts/start-hosted.mjs')],{cwd:setup.root,env:setup.env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/missing-upgrade\.js.*house-explorer-glb\.js.*is missing/);
  assert.doesNotMatch(result.stdout,/shared house server running/);
});

test('compiled Rust command preserves the hosted port, current graphics and Unix process identity',{timeout:60000},async t=>{
  if(process.platform==='win32'){t.skip('The hosted Unix exec contract does not apply to Windows.');return;}
  const cargo=process.env.MUZIKAZ_TEST_CARGO||'cargo';
  const available=spawnSync(cargo,['--version'],{encoding:'utf8'});
  if(available.error?.code==='ENOENT'){t.skip('Cargo is unavailable; Node bootstrap integration remains covered.');return;}
  assert.equal(available.status,0,available.stderr);
  const target=await mkdtemp(join(tmpdir(),'hosted-rust-build-'));t.after(()=>rm(target,{recursive:true,force:true}));
  const built=spawnSync(cargo,['build','--release','--offline','--target-dir',target],{cwd:repository,encoding:'utf8',timeout:45000});
  assert.equal(built.status,0,built.stderr);
  const setup=await fixture(t),binary=join(target,'release','muzikazmodelmarket'+(process.platform==='win32'?'.exe':''));
  const {child,exit}=await runServer(t,setup,binary,[]);
  if(process.platform==='linux'){
    const command=(await readFile('/proc/'+child.pid+'/cmdline','utf8')).split('\0');
    assert.match(command[0],/(?:^|\/)node$/,'Unix exec keeps Node at the original hosted PID rather than leaving a Rust parent behind');
    assert.equal(command[1],join(setup.root,'scripts/start-hosted.mjs'));
  }
  child.kill('SIGTERM');const stopped=await exit;
  assert.ok(stopped.signal==='SIGTERM'||stopped.code===0,'SIGTERM terminates the canonical Node process without leaving a child server behind');
});
