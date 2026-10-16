import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('marketplace bundle API authenticates purchases, validates prices, and updates shared ownership once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bundle-api-')),previous={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server}=await import(pathToFileURL(modulePath).href),handler=server.listeners('request')[0];
  async function call(url,headers={},body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const guest=await call('/api/economy');assert.equal(guest.status,200);assert.ok(guest.body.data.bundles.length>0);
  const login=await call('/api/access/free-play',{}, {username:'BundleAPIPlayer',password:'test-bundle-api-password'});assert.equal(login.status,200);
  const cookie=login.headers['set-cookie'].split(';')[0],session=await call('/api/market/session',{cookie}),headers={cookie,'x-csrf-token':session.body.data.csrfToken};
  const before=(await call('/api/economy',headers)).body.data,bundle=before.bundles.find(item=>item.category==='Builder furniture');
  const body={bundleId:bundle.id,expectedPriceMzk:bundle.priceMzk,requestId:'api-bundle-buy'};
  assert.equal((await call('/api/economy/bundles/buy',{},body)).status,401);
  assert.equal((await call('/api/economy/bundles/buy',{cookie},body)).body.code,'CSRF_INVALID');
  assert.equal((await call('/api/economy/bundles/buy',headers,{...body,expectedPriceMzk:1})).status,409);
  const purchase=await call('/api/economy/bundles/buy',headers,body);assert.equal(purchase.status,200);
  const replay=await call('/api/economy/bundles/buy',headers,body);assert.equal(replay.body.data.id,purchase.body.data.id);
  const after=(await call('/api/economy',headers)).body.data;assert.equal(after.balance,before.balance-bundle.priceMzk);assert.equal(after.bundles.find(item=>item.id===bundle.id).owned,true);
  for(const item of bundle.entries)assert.equal(after.items.find(owned=>owned.sku===item.sku).owned,true);
  const bulkLogin=await call('/api/access/free-play',{}, {username:'BulkAPIPlayer',password:'test-bulk-api-password'}),bulkCookie=bulkLogin.headers['set-cookie'].split(';')[0],bulkSession=await call('/api/market/session',{cookie:bulkCookie}),bulkHeaders={cookie:bulkCookie,'x-csrf-token':bulkSession.body.data.csrfToken};
  const bulkBefore=(await call('/api/economy',bulkHeaders)).body.data,order={sku:'material:wall',quantity:100,expectedPriceMzk:400,requestId:'bulk-api-buy'};
  assert.equal((await call('/api/economy/materials/buy',{},order)).status,401);assert.equal((await call('/api/economy/materials/buy',{cookie:bulkCookie},order)).body.code,'CSRF_INVALID');
  assert.equal((await call('/api/economy/materials/buy',bulkHeaders,{...order,expectedPriceMzk:1})).status,409);
  const bulk=await call('/api/economy/materials/buy',bulkHeaders,order);assert.equal(bulk.status,200);assert.equal((await call('/api/economy/materials/buy',bulkHeaders,order)).body.data.id,bulk.body.data.id);
  const bulkAfter=(await call('/api/economy',bulkHeaders)).body.data;assert.equal(bulkAfter.balance,bulkBefore.balance-400);assert.equal(bulkAfter.items.find(item=>item.sku==='material:wall').stock,100);
  const catalog=(await call('/api/market/catalog')).body.data;assert.ok(catalog.some(item=>item.id===bundle.id&&item.source==='bundle'));assert.equal(catalog.find(item=>item.worldId==='pixel-peaks').priceMzk,10000);assert.equal(catalog.find(item=>item.worldId==='skyline-deck').priceMzk,1000);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});}
});
