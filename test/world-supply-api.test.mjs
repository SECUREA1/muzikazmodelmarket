import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('world supply API protects paid production, validates destinations, and exposes no client delivery completion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'world-supply-api-')),previous={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);
  const {server}=await import(pathToFileURL(modulePath).href),handler=server.listeners('request')[0];
  async function call(url,headers={},body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const guest=await call('/api/world-supply');assert.equal(guest.status,200);
  const directory=guest.body.data,item=directory.catalog.find(row=>row.sku==='material:wall');
  assert.ok(item);assert.equal(directory.worldStock[item.id],1000);assert.ok(directory.shippingMaps.some(map=>map.id==='hormuz-shipping'));
  assert.equal((await call('/api/world-supply?mapId=missing-supply-map')).status,404);
  const login=await call('/api/access/free-play',{}, {username:'WorldSupplyAPIPlayer',password:'test-world-supply-api-password'});assert.equal(login.status,200);
  const cookie=login.headers['set-cookie'].split(';')[0],session=await call('/api/market/session',{cookie}),headers={cookie,'x-csrf-token':session.body.data.csrfToken};
  const quoteInput={itemId:item.id,quantity:10};
  assert.equal((await call('/api/world-supply/quote',{},quoteInput)).status,401);
  assert.equal((await call('/api/world-supply/quote',{cookie},quoteInput)).body.code,'CSRF_INVALID');
  const quoted=await call('/api/world-supply/quote',headers,quoteInput);assert.equal(quoted.status,200);
  const quote=quoted.body.data;assert.equal(quote.discountPercent,20);assert.equal(quote.priceMzk,Math.floor(quote.subtotalMzk*.8));
  assert.equal((await call('/api/world-supply/quote',headers,{itemId:'invented-item',quantity:10})).status,404);
  assert.equal((await call('/api/world-supply/quote',headers,{...quoteInput,quantity:1.5})).status,422);
  const before=(await call('/api/economy',headers)).body.data,productionInput={...quoteInput,expectedPriceMzk:quote.priceMzk,requestId:'api-world-production'};
  assert.equal((await call('/api/world-supply/produce',headers,{...productionInput,expectedPriceMzk:0})).status,409);
  const production=await call('/api/world-supply/produce',headers,productionInput);assert.equal(production.status,200);
  assert.equal(production.body.data.phase,'building');assert.equal((await call('/api/world-supply/produce',headers,productionInput)).body.data.id,production.body.data.id);
  assert.equal((await call('/api/world-supply/produce',headers,{...productionInput,quantity:11})).status,409);
  const after=(await call('/api/economy',headers)).body.data;assert.equal(after.balance,before.balance-quote.priceMzk);
  let state=(await call('/api/world-supply',headers)).body.data;
  assert.equal(state.factoryStock[item.id]||0,0);assert.equal(state.worldStock[item.id],1000,'building does not immediately restock sale inventory');
  const shippingMapId=directory.shippingMaps[0].id,destinationMapId=directory.maps.find(map=>map.id!=='world').id,contractId=directory.routes[0].id;
  const dispatchInput={itemId:item.id,quantity:10,shippingMapId,destinationMapId,contractId,requestId:'api-world-dispatch'};
  assert.equal((await call('/api/world-supply/dispatch',headers,dispatchInput)).status,409,'unfinished production cannot ship');
  // Advance only the trusted persisted job timestamp; no public endpoint can
  // assert completion. The following GET runs the normal production scheduler.
  const persisted=JSON.parse(await readFile(join(dir,'users.json'),'utf8'));
  persisted.worldSupply.production[production.body.data.id].readyAt=Date.now()-1;
  await writeFile(join(dir,'users.json'),JSON.stringify(persisted));
  state=(await call('/api/world-supply',headers)).body.data;
  assert.equal(state.factoryStock[item.id],10);assert.equal(state.worldStock[item.id],1000);
  assert.equal((await call('/api/world-supply/dispatch',headers,{...dispatchInput,destinationMapId:'invented-map',requestId:'bad-map'})).status,404);
  assert.equal((await call('/api/world-supply/dispatch',headers,{...dispatchInput,shippingMapId:'invented-map',requestId:'bad-shipping-map'})).status,404);
  assert.equal((await call('/api/world-supply/dispatch',headers,{...dispatchInput,contractId:'dock-induction',requestId:'bad-lane'})).status,422);
  const dispatched=await call('/api/world-supply/dispatch',headers,dispatchInput);assert.equal(dispatched.status,200);assert.equal(dispatched.body.data.phase,'queued');
  assert.equal((await call('/api/world-supply/dispatch',headers,dispatchInput)).body.data.id,dispatched.body.data.id);
  state=(await call('/api/world-supply',headers)).body.data;
  assert.equal(state.factoryStock[item.id],0);assert.equal(state.worldStock[item.id],1000);
  const forged=await call('/api/world-supply/deliver',headers,{shipmentId:dispatched.body.data.id,delivered:true,quantity:100000});
  assert.equal(forged.status,404);assert.equal(forged.body.code,'API_ROUTE_NOT_FOUND');
  const cancellation={shipmentId:dispatched.body.data.id,requestId:'api-world-cancel'};
  const cancelled=await call('/api/world-supply/cancel',headers,cancellation);assert.equal(cancelled.status,200);assert.equal(cancelled.body.data.phase,'cancelled');
  await call('/api/world-supply/cancel',headers,cancellation);
  state=(await call('/api/world-supply',headers)).body.data;assert.equal(state.factoryStock[item.id],10);assert.equal(state.worldStock[item.id],1000);
  const localSeed=JSON.parse(await readFile(join(dir,'users.json'),'utf8'));
  localSeed.worldSupply.maps[destinationMapId].stock[item.id]=1;
  await writeFile(join(dir,'users.json'),JSON.stringify(localSeed));
  const sale={sku:item.id,mapId:destinationMapId,requestId:'local-warehouse-sale'};
  const localSale=await call('/api/economy/buy',headers,sale);assert.equal(localSale.status,200);
  assert.equal((await call('/api/economy/buy',headers,sale)).body.data.id,localSale.body.data.id);
  state=(await call('/api/world-supply',headers)).body.data;
  assert.equal(state.maps.find(map=>map.id===destinationMapId).stock[item.id],0);
  assert.equal(state.worldStock[item.id],1000,'map store purchases debit local inventory, not central reserve');
  const localEconomy=(await call('/api/economy?mapId='+encodeURIComponent(destinationMapId),headers)).body.data;
  assert.equal(localEconomy.items.find(row=>row.sku===item.id).availableStock,0);
  const use={sku:item.id,mapId:destinationMapId,requestId:'local-prepaid-use'};
  assert.equal((await call('/api/economy/use',headers,use)).status,200,'prepaid pieces already reserve supply');
  assert.equal((await call('/api/economy/use',headers,{...use,requestId:'local-out-of-stock-use'})).status,409,'depleted local stock blocks another unprepaid deployment');

 }finally{
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
  await rm(dir,{recursive:true,force:true});
 }
});
