import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const entry=fileURLToPath(new URL('../server.mjs',import.meta.url));
async function freePort(){return new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});}

test('production server recovers ancillary history and serves only registered authorized advanced model resources', {timeout:30000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'hosted-model-resources-'));
  const data=join(root,'persistent'),assets=join(data,'uploads','assets'),models=join(data,'uploads','models');
  for(const directory of [assets,models,join(root,'public'),join(root,'dist','public'),join(root,'Uploads','assets')])await mkdir(directory,{recursive:true});
  await writeFile(join(root,'public','graphics.js'),'current graphics');
  await writeFile(join(root,'dist','public','graphics.js'),'stale graphics');
  await writeFile(join(root,'public','scene.html'),'current scene');
  await writeFile(join(root,'dist','public','scene.html'),'stale scene');
  const damaged='{"chatMessages":[{"id":"partial"';
  await writeFile(join(data,'server-runtime.json'),damaged,{mode:0o600});
  const geometry=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),texture=Buffer.from('registered-ktx2-fixture');
  const definitions=[
    {id:'advanced-model',storedFilename:'advanced.gltf',status:'published',visibility:'public'},
    {id:'geometry',storedFilename:'geometry.bin',status:'published',visibility:'public'},
    {id:'texture',storedFilename:'texture.ktx2',status:'published',visibility:'public'},
    {id:'private-buffer',storedFilename:'private.bin',status:'published',visibility:'private',ownerId:'account:pending'},
    {id:'symlink',storedFilename:'linked.bin',status:'published',visibility:'public'}
  ];
  await writeFile(join(assets,'advanced.gltf'),JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'geometry.bin',byteLength:geometry.length}]}));
  for(const name of ['geometry.bin','private.bin','unregistered.bin'])await writeFile(join(assets,name),geometry);
  await writeFile(join(assets,'texture.ktx2'),texture);
  await writeFile(join(root,'public','internal.bin'),'never public');
  await writeFile(join(root,'Uploads','assets','internal.bin'),'never public');
  await symlink(join(root,'public','internal.bin'),join(assets,'linked.bin'));
  await writeFile(join(data,'asset-library.json'),JSON.stringify(definitions));
  await writeFile(join(models,'legacy.bin'),geometry);
  await writeFile(join(data,'published-models.json'),JSON.stringify([{id:'legacy-buffer',status:'published',visibility:'public',modelUrl:'/uploads/models/legacy.bin'}]));
  const port=await freePort(),base='http://127.0.0.1:'+port;
  let output='';
  const child=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(port),MUZIKAZ_STATIC_SOURCE:'repository',MUZIKAZ_DATA_DIR:data,MUZIKAZ_USER_DATABASE_FILE:join(data,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(data,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(data,'payment-orders.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(data,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(data,'game-sessions.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(data,'uploads','avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:assets,MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(data,'uploads','environments'),UPLOAD_STORAGE_PATH:models,MUZIKAZ_DEPLOY_COMMIT:'hosted-startup-fixture'}});
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}await rm(root,{recursive:true,force:true});});
  let health;
  for(let index=0;index<120;index++){
    if(child.exitCode!==null)throw Error('Server failed to boot: '+output);
    try{health=await fetch(base+'/api/health');if(health.ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(health?.ok,output);assert.equal((await health.json()).commit,'hosted-startup-fixture');
  const quarantined=(await readdir(data)).find(name=>name.startsWith('server-runtime.json.corrupt-'));
  assert.ok(quarantined,'damaged chat history is preserved rather than stopping the hosted server');
  assert.equal(await readFile(join(data,quarantined),'utf8'),damaged);
  assert.match(output,/Damaged conversation history was preserved/);
  assert.equal(await (await fetch(base+'/public/graphics.js')).text(),'current graphics','repository mode never mixes stale graphics from dist');
  assert.equal(await (await fetch(base+'/public/scene')).text(),'current scene','extensionless pages use the same source selection');
  for(const path of ['/public/','/public','/uploads/','/Uploads/assets/']){
    const response=await fetch(base+path);assert.equal(response.status,404,path);await response.arrayBuffer();
  }
  assert.equal((await fetch(base+'/api/health')).status,200,'directory requests cannot crash the process while graphics load');
  assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
  async function resource(path,headers={}){return fetch(base+path,{headers:{Origin:'https://muzikaz.com',...headers}});}
  for(const [path,bytes,type] of [['/uploads/assets/geometry.bin',geometry,'application/octet-stream'],['/uploads/assets/texture.ktx2',texture,'image/ktx2'],['/uploads/models/legacy.bin',geometry,'application/octet-stream']]){
    const response=await resource(path);
    assert.equal(response.status,200,path);assert.equal(response.headers.get('content-type'),type);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://muzikaz.com');
    assert.equal(response.headers.get('access-control-allow-credentials'),'true');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  }
  for(const path of ['/uploads/assets/private.bin','/uploads/assets/unregistered.bin','/uploads/assets/linked.bin','/public/internal.bin','/Uploads/assets/internal.bin','/uploads/avatars/geometry.bin','/uploads/assets/../assets/unregistered.bin'])assert.equal((await resource(path)).status,404,path);
  const deniedOrigin=await resource('/uploads/assets/geometry.bin',{Origin:'https://example.invalid'});
  assert.equal(deniedOrigin.headers.get('access-control-allow-origin'),null);
  const login=await fetch(base+'/api/access/free-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ResourceOwner',password:'resource-owner-fixture'})});
  assert.equal(login.status,200);const member=(await login.json()).data;
  definitions.find(item=>item.id==='private-buffer').ownerId='account:'+member.account.accountId;
  await writeFile(join(data,'asset-library.json'),JSON.stringify(definitions));
  const owned=await resource('/uploads/assets/private.bin',{Authorization:'Bearer '+member.sessionToken});
  assert.equal(owned.status,200);assert.match(owned.headers.get('cache-control'),/private/);
  assert.deepEqual(Buffer.from(await owned.arrayBuffer()),geometry);
  assert.equal((await resource('/uploads/assets/private.bin')).status,404,'owner access never makes the private sidecar public');
});
