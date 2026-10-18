import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

test('production responses protect private uploads, throttle admin guesses, retain CORS and serve security contact',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'security-server-')),assets=join(dir,'assets');await mkdir(assets);
 await writeFile(join(assets,'private.png'),'private fixture');await writeFile(join(assets,'public.png'),'public fixture');
 await writeFile(join(dir,'asset-library.json'),JSON.stringify([
  {id:'private',storedFilename:'private.png',visibility:'private',status:'published',ownerId:'account:owner'},
  {id:'public',storedFilename:'public.png',visibility:'public',status:'published'}
 ]));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',PORT:String(port),MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'payments.json'),MUZIKAZ_ASSET_UPLOAD_DIR:assets,ADMIN_PUBLISH_TOKEN:'security-test-proof',MUZIKAZ_ADMIN_USERNAME:'security-admin',MUZIKAZ_ADMIN_PASSWORD:'security-test-password'},stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(child.exitCode!==null)throw Error('Security server stopped');await pause(50);}
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');assert.match(page.headers.get('Strict-Transport-Security'),/max-age=/);assert.match(page.headers.get('Content-Security-Policy'),/object-src 'none'/);
  const health=await fetch(base+'/api/health',{headers:{Origin:'https://www.muzikaz.com'}});assert.equal(health.headers.get('Access-Control-Allow-Origin'),'https://www.muzikaz.com');assert.match(health.headers.get('Cache-Control'),/no-store/);assert.match(health.headers.get('X-Robots-Tag'),/noindex/);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://untrusted.example'}})).status,403);
  async function upgrade(origin){return new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port,path:'/ws/support',headers:{Origin:origin,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ=='}},response=>{response.resume();resolve(response.statusCode);});req.on('upgrade',(response,socket)=>{socket.destroy();resolve(response.statusCode);});req.on('error',error=>error.code==='ECONNRESET'?resolve(0):reject(error));req.setTimeout(2000,()=>req.destroy(Error('Upgrade timeout')));req.end();});}
  assert.equal(await upgrade('https://untrusted.example'),0);assert.equal(await upgrade('https://www.muzikaz.com'),101);

  assert.equal((await fetch(base+'/uploads/assets/private.png')).status,404,'explicit private visibility wins over published status');
  const privateFile=await fetch(base+'/uploads/assets/private.png',{headers:{'X-Admin-Token':'security-test-proof'}});assert.equal(privateFile.status,200);assert.equal(privateFile.headers.get('Cache-Control'),'private, no-store');assert.match(privateFile.headers.get('X-Robots-Tag'),/noindex/);assert.equal(await privateFile.text(),'private fixture');
  const publicFile=await fetch(base+'/uploads/assets/public.png');assert.equal(publicFile.status,200);assert.match(publicFile.headers.get('Cache-Control'),/public/);
  const contact=await fetch(base+'/.well-known/security.txt');assert.equal(contact.status,200);assert.match(contact.headers.get('Content-Type'),/text\/plain/);assert.match(await contact.text(),/Contact: mailto:/);
  for(const path of ['/data/users.json','/.env','/server.mjs','/.well-known/.env'])assert.equal((await fetch(base+path)).status,404,path);
  const malformed=await new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port,path:'http://[',headers:{Host:'['}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);req.end();});assert.equal(malformed,400);assert.equal((await fetch(base+'/api/health')).status,200);
  for(let i=0;i<9;i++){
   const response=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`203.0.113.${i}`},body:JSON.stringify({username:'security-admin',password:'wrong-password'})});assert.equal(response.status,i<8?401:429);
  }
  const guest=await fetch(base+'/api/access/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(guest.status,201,'admin lockout does not lock member access');assert.match(guest.headers.get('Set-Cookie'),/HttpOnly/);assert.match(guest.headers.get('Set-Cookie'),/Secure/);
 }finally{
  if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}await rm(dir,{recursive:true,force:true});
 }
});
