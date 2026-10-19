import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable,Writable} from 'node:stream';

test('live atlas lists built-in destinations, accurate roads and canonical entry URLs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-http-'));const oldEnv={...process.env};
 Object.assign(process.env,{MUZIKAZ_ADMIN_PASSWORD:'boots',MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(dir,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(dir,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(dir,'environment-uploads')});
 try{
  // Exercise the real HTTP handler without binding a TCP port in the sandbox.
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export { server, presence, paymentOrderStore, reconcileStorePayments };');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server,presence,paymentOrderStore,reconcileStorePayments}=await import(pathToFileURL(modulePath).href);const handler=server.listeners('request')[0];
  async function call(url,headers={},body,method=body?'POST':'GET'){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const[key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const atlas=await call('/api/world-atlas');assert.equal(atlas.status,200);
  for(const id of ['public-commons','basketball-arena','hockey-arena','firing-range','neon-junction']){
    const place=atlas.body.data.locations.find(place=>place.mapId===id);assert.ok(place,id+' is indexed');
    const target=new URL(place.playUrl,'http://localhost');assert.equal(target.searchParams.get('environment'),id);
    assert.equal(target.pathname,id==='hockey-arena'?'/hockey.html':id==='neon-junction'?'/arcade.html':'/model-explorer.html');
    const environment=(await call('/api/environments/'+id)).body.data;assert.deepEqual(place.streets,environment.streets);
  }
  const login=await call('/api/access/free-play',{}, {username:'AtlasPlayer',password:'atlas-test-password'});assert.equal(login.status,200);
  const headers={authorization:'Bearer '+login.body.data.sessionToken};
  for(const id of ['hockey-arena','neon-junction','public-commons']){
    const place=atlas.body.data.locations.find(place=>place.mapId===id);
    const resolved=await call('/api/world-atlas/resolve',headers,{x:place.column*256,z:place.row*256});assert.equal(resolved.status,200);
    const target=new URL(resolved.body.data.playUrl,'http://localhost');assert.equal(target.pathname,new URL(place.playUrl,'http://localhost').pathname);assert.equal(target.searchParams.get('environment'),id);assert.ok(target.searchParams.get('meet'));
    if(id==='public-commons'){
      const arrival=await call('/api/rooms/'+id+'/gameplay',headers,{action:'join',requestId:'atlas-entry',meetingId:target.searchParams.get('meet')});assert.equal(arrival.status,200);assert.ok(arrival.body.data.players['account:'+login.body.data.account.accountId]);
    }
  }
  }finally{for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
